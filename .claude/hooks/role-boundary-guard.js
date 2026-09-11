#!/usr/bin/env node
'use strict';

/**
 * role-boundary-guard.js（M3本実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.1.2節・7.3節#2・7.4節・10.2.1節（版1.8）
 *
 * 【イベント】PreToolUse（Edit|Write）
 * 【検知内容】ロール境界違反。7.1.2節の許可パス表と `agent_type`（hook入力共通
 *   フィールド、版1.4でweb調査により確認済み）を突合する。既定は「全ロール拒否の
 *   ホワイトリスト方式」。
 * 【動作】exit 2（ブロック）
 *
 * 【許可パス表（7.1.2節、版1.8時点＋M4指摘によるZone3生成主体パスの追加）】
 *   - （未設定＝メインスレッド＝PM）: docs/00_プロジェクト管理・ガバナンス/**（decisions/**を除く）、.claude-state/**
 *   - consultant: docs/00_プロジェクト管理・ガバナンス/decisions/**
 *   - designer: prototypes/**、decisions/**（decide経由の起票）。Zone3では
 *     docs/03_アプリケーション設計/03-05_*（画面設計）・03-08_*（帳票設計）も許可
 *   - app-architect: decisions/**。src_unlockedがfalseの間はdecisions/contracts/**まで、
 *     trueになった以降はsrc/**も許可（10.2.1節で`src_unlocked`参照に更新済み）。
 *     Zone3では docs/02_要件定義/**、docs/03_アプリケーション設計/**（03-05・03-08を除く）も許可
 *   - infra-architect: infra/**、decisions/**、Zone3のみdocs/04_インフラ設計/**。
 *     Zone3のみdocs/02_要件定義/02-03_*（非機能要件一覧、App-Architectと共同生成）。
 *     Zone1またはZone3でdocs/06_移行・導入/06-01_*（移行計画書、SREと共同生成）
 *   - coder: src/**, tests/**（Zone2以降）
 *   - qa: tests/**、docs/00_.../00-02〜00-03（台帳）、Zone3のみdocs/05_テスト/**。
 *     Zone3のみdocs/02_要件定義/02-02_*（機能要件一覧、App-Architectと共同生成）。
 *     Zone1またはZone3でdocs/06_移行・導入/06-03_*（受入テスト結果報告書）
 *   - sre: infra/**、Zone3以降docs/07_運用・保守/**、Zone1またはZone3でdocs/06_移行・導入/**
 *
 * 【PMへの報告事項・判断の根拠】
 * 1. 【coderの`src_unlocked`適用】02文書7.1.2節は版1.8でapp-architectの行のみ
 *    `src_unlocked`参照に更新し、coderの行は「Zone2以降」という版1.7以前の文言のまま
 *    残っている（4.3節も app-architect のみ言及）。10.2.1節の確定で`zone`値は
 *    もはや`2`を取らないため、文言どおり`zone>=2`で判定するとcoderは永遠に`src/**`へ
 *    書けなくなる（`zone`は0/1/3/4のみ）。`src_unlocked`は本質的に「Zone1/Zone2の
 *    機能単位混在」を解決するために新設されたフラグであり、coderの`src/**`アクセスも
 *    全く同じ問題を抱えるため、本実装はcoderにも`src_unlocked`を適用する（表の更新漏れ
 *    と判断し、拡大解釈で埋めた。PMへの報告事項）。
 * 2. 【designer/infra-architect/qaの「Zone3のみ」】`zone===3`の完全一致で判定する
 *    （`zone`が3以外の値=0/1/4のときは対象外）。sreの「Zone3以降」は`zone===3 || zone===4`
 *    （Zone4/Mode Bでも運用ドキュメント書込を継続する、という文言の違いをそのまま反映）。
 * 3. 【M4指摘の是正・重要】02文書7.1.2節の許可パス表は、03文書3章のカタログが定める
 *    「生成主体」を欠落させたまま`docs/0X_**`という粗い粒度でしか各ロールに触れておらず、
 *    以下の欠落があった（M4実装者が`reverse-doc`実行時の実ブロックとして検出）。
 *    - app-architectに`docs/02_要件定義/**`・`docs/03_アプリケーション設計/**`への
 *      書込許可が一切無く、03文書3.4節・3.5節が定めるApp-Architect生成の02-01〜02-04・
 *      03-01〜03-04/03-06/03-07/03-09/03-10がZone3で`exit 2`によりブロックされていた
 *    - designerのZone3許可パスが「画面設計」という文言の部分一致正規表現
 *      （`.*画面設計.*`）になっており、03文書3.5節が定めるDesigner生成のもう一つの
 *      成果物である03-08（帳票設計）にマッチしなかった
 *    本実装は03文書3.4節〜3.9節のカタログの「生成主体」列を正本として、各ロールの
 *    Zone3書込先を1対1で追加した（憶測で広げない。上記許可パス表参照）。
 *    ファイル名パターンは03文書9.1節の命名規則（`{項番}_{文書名}.md`等、`{項番}_`が
 *    常に接頭辞になる）に基づく接頭辞globとした（`03-05_*`等）。厳密な`{文書名}`部分の
 *    日本語表記は03文書に明記が無いため接頭辞一致で吸収する。
 * 4. 【06番（移行・導入）のゾーン判定】03文書3.8節は06番の生成タイミングを
 *    「GZ2以前（Zone2の硬化完了に合わせて生成）」と明記しており、これは`zone===1`
 *    （`GZ0`GO後〜`GZ2`GO前の期間）に相当する。ところが02文書7.1.2節はsreの06番許可を
 *    「Zone3以降」とのみ記載しており、03文書のタイミング定義と矛盾する（同じ種類の
 *    欠落が再発しないよう、本実装はここも是正した）。本実装は`zone===1 || zone===3`
 *    を許可条件とした（`zone===1`が03文書の本来の生成窓、`zone===3`は生成後の訂正・
 *    再生成の余地を残すための安全側の追加。過度に狭めて再びブロック事故を起こさない
 *    ための判断）。この02文書7.1.2節・4.2.1節の記述是正はPM経由でApp-Architectへの
 *    報告事項とする（本実装では02文書に触れない）。
 * 5. 【designerのZone3画面設計配下パス、旧#3から解消】旧実装は`docs/03_アプリケーション
 *    設計/**画面設計**`という部分一致正規表現で近似していたが、上記#3のとおり03-08
 *    （帳票設計）にマッチしない欠陥があったため、03文書のファイル命名規則に基づく
 *    接頭辞glob（`03-05_*`・`03-08_*`）に置き換えた（解消済み）。
 * 6. 【判定不能時の挙動（7.4節が明記していない事項）】`agent_type`が空でも`agent_id`が
 *    存在する場合（設計が想定していない組合せ）は「メインスレッド」とはみなさず、
 *    既知の7ロールに一致しない`agent_type`と同様に「未知ロール」として扱い、7.1.2節の
 *    「全ロール拒否のホワイトリスト方式」という既定方針に従って拒否する
 *    （安全側に倒す判断。PMへの報告事項）。
 *
 * 【影響範囲】
 * docs/02_**〜docs/07_**, src/**, infra/**, tests/**, decisions/**, prototypes/** への
 * Write/Edit 全般。
 * 【前提条件・制約】
 * settings.json未登録のM3段階（`.claude/settings.json`は安全版のみ配置）では発火しない。
 * 動作確認は `echo '<JSON>' | node role-boundary-guard.js` で行う。
 */

const fs = require('fs');
const path = require('path');
const { matchGlob } = require('../lib/path-glob');
const { readZoneState } = require('../lib/zone-state');
const { ledger0002Path, ledger0003Path } = require('../lib/ledger-paths');

const KNOWN_ROLES = ['consultant', 'designer', 'app-architect', 'infra-architect', 'coder', 'qa', 'sre'];

const DECISIONS_GLOB = 'docs/00_プロジェクト管理・ガバナンス/decisions/**';
const GOV_GLOB = 'docs/00_プロジェクト管理・ガバナンス/**';

const APP_DESIGN_DIR = 'docs/03_アプリケーション設計';
/** 03文書3.5節: 03-05（画面設計）・03-08（帳票設計）はDesignerが生成主体。接頭辞globで判定する。 */
const DESIGNER_APP_DESIGN_GLOBS = [`${APP_DESIGN_DIR}/03-05_*`, `${APP_DESIGN_DIR}/03-08_*`];

/** Zone3判定（完全一致）・Zone1またはZone3判定（06番のGZ2以前生成タイミング用）の共通ヘルパー。 */
const isZone3 = (zoneState) => zoneState.zone === 3;
const isZone1or3 = (zoneState) => zoneState.zone === 1 || zoneState.zone === 3;
const isZone3or4 = (zoneState) => zoneState.zone === 3 || zoneState.zone === 4;

/**
 * ロールごとの許可ルール定義。各ルールは次のいずれかの形を取る:
 *  - { pattern, exclude? }              : globパターンにマッチすれば許可（excludeに一致すれば除外）
 *  - { pattern, when(zoneState) }       : whenがtrueの場合のみpatternを評価
 *  - { predicate(relPath, zoneState) }  : 任意の判定関数
 *  - { exactPathFns: [(cwd)=>path,...] }: cwd依存の厳密パス一致（台帳ファイル等）
 */
const ROLE_RULES = {
  __pm__: [
    { pattern: GOV_GLOB, exclude: [DECISIONS_GLOB] },
    { pattern: '.claude-state/**' },
  ],
  consultant: [{ pattern: DECISIONS_GLOB }],
  designer: [
    { pattern: 'prototypes/**' },
    { pattern: DECISIONS_GLOB },
    // 03文書3.5節: 03-05（画面設計）・03-08（帳票設計）の生成主体はDesigner（上部コメント#3・#5）。
    { predicate: (relPath, zoneState) => isZone3(zoneState) && DESIGNER_APP_DESIGN_GLOBS.some((g) => matchGlob(g, relPath)) },
  ],
  'app-architect': [
    { pattern: DECISIONS_GLOB },
    { pattern: 'src/**', when: (zoneState) => zoneState.src_unlocked === true },
    // 03文書3.4節: 02-01〜02-04（前倒し例外時の02-99含む）はApp-Architectが生成主体（上部コメント#3）。
    { pattern: 'docs/02_要件定義/**', when: isZone3 },
    // 03文書3.5節: 03-05・03-08（Designer生成）を除く03番全体がApp-Architect生成主体（上部コメント#3）。
    { pattern: `${APP_DESIGN_DIR}/**`, exclude: DESIGNER_APP_DESIGN_GLOBS, when: isZone3 },
  ],
  'infra-architect': [
    { pattern: 'infra/**' },
    { pattern: DECISIONS_GLOB },
    { pattern: 'docs/04_インフラ設計/**', when: isZone3 },
    // 03文書3.4節: 02-03（非機能要件一覧）はApp-Architect/Infra-Architectの共同生成主体（上部コメント#3）。
    { pattern: 'docs/02_要件定義/02-03_*', when: isZone3 },
    // 03文書3.8節: 06-01（移行計画書）はInfra-Architect/SREの共同生成主体、生成ゾーンはGZ2以前=zone1（上部コメント#4）。
    { pattern: 'docs/06_移行・導入/06-01_*', when: isZone1or3 },
  ],
  coder: [
    // 上部コメント#1: 02文書7.1.2節の表記「Zone2以降」を`src_unlocked`で近似する（要報告）。
    { pattern: 'src/**', when: (zoneState) => zoneState.src_unlocked === true },
    { pattern: 'tests/**', when: (zoneState) => zoneState.src_unlocked === true },
  ],
  qa: [
    { pattern: 'tests/**' },
    { exactPathFns: [(cwd) => ledger0002Path(cwd), (cwd) => ledger0003Path(cwd)] },
    { pattern: 'docs/05_テスト/**', when: isZone3 },
    // 03文書3.4節: 02-02（機能要件一覧）はQA/App-Architectの共同生成主体（上部コメント#3）。
    { pattern: 'docs/02_要件定義/02-02_*', when: isZone3 },
    // 03文書3.8節: 06-03（受入テスト結果報告書）はQAが生成主体、生成ゾーンはGZ2以前=zone1（上部コメント#4）。
    { pattern: 'docs/06_移行・導入/06-03_*', when: isZone1or3 },
  ],
  sre: [
    { pattern: 'infra/**' },
    { pattern: 'docs/07_運用・保守/**', when: isZone3or4 },
    // 03文書3.8節: 06番（移行・導入）はSREが主要な生成主体、生成ゾーンはGZ2以前=zone1（上部コメント#4）。
    { pattern: 'docs/06_移行・導入/**', when: isZone1or3 },
  ],
};

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

/**
 * agent_type/agent_idからロールキーを解決する。
 * 戻り値: '__pm__' | KNOWN_ROLESのいずれか | '__unknown__'
 */
function resolveRoleKey(agentType, agentId) {
  if (!agentType) {
    if (agentId) {
      // 7.4節が想定していない組合せ（agent_idはあるがagent_typeが無い）。
      // 安全側（default-deny）に倒し、PMとはみなさない（上部コメント#4）。
      return '__unknown__';
    }
    return '__pm__';
  }
  return KNOWN_ROLES.includes(agentType) ? agentType : '__unknown__';
}

function isAllowed(roleKey, relPath, cwd, zoneState) {
  const rules = ROLE_RULES[roleKey] || [];
  for (const rule of rules) {
    if (rule.when && !rule.when(zoneState)) continue;
    if (rule.predicate) {
      if (rule.predicate(relPath, zoneState)) return true;
      continue;
    }
    if (rule.exactPathFns) {
      const hit = rule.exactPathFns.some((fn) => {
        const p = path.relative(cwd, fn(cwd)).replace(/\\/g, '/');
        return p === relPath;
      });
      if (hit) return true;
      continue;
    }
    if (rule.pattern && matchGlob(rule.pattern, relPath)) {
      if (rule.exclude && rule.exclude.some((ex) => matchGlob(ex, relPath))) continue;
      return true;
    }
  }
  return false;
}

function main() {
  const payload = readHookPayload();
  const cwd = process.cwd();

  const filePath = payload && payload.tool_input && payload.tool_input.file_path;
  if (!filePath) {
    // 対象ファイルパスを特定できない場合（ツール仕様の変化等）。誤ブロックを避け許可する。
    process.exit(0);
  }
  const absTarget = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const relPath = path.relative(cwd, absTarget).replace(/\\/g, '/');

  const agentType = payload.agent_type;
  const agentId = payload.agent_id;
  const roleKey = resolveRoleKey(agentType, agentId);

  if (roleKey === '__unknown__') {
    console.error(
      `[role-boundary-guard] エージェント種別を判定できません（agent_type=${JSON.stringify(
        agentType
      )}, agent_id=${JSON.stringify(agentId)}）。7.1.2節の許可パス表に該当ロールが無いため、` +
        '既定（全ロール拒否のホワイトリスト方式）に従い拒否します。'
    );
    process.exit(2);
  }

  const zoneState = readZoneState(cwd);

  if (isAllowed(roleKey, relPath, cwd, zoneState)) {
    process.exit(0);
  }

  console.error(
    `[role-boundary-guard] role=${roleKey === '__pm__' ? '(PM/メインスレッド)' : roleKey} は ` +
      `${relPath} への書込を許可されていません（7.1.2節の許可パス表に無いパス、または現在の` +
      `zone=${zoneState.zone}/src_unlocked=${zoneState.src_unlocked}では未解放）。`
  );
  process.exit(2);
}

main();
