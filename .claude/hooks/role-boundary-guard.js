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
 * 【許可パス表（7.1.2節、版1.8時点）】
 *   - （未設定＝メインスレッド＝PM）: docs/00_プロジェクト管理・ガバナンス/**（decisions/**を除く）、.claude-state/**
 *   - consultant: docs/00_プロジェクト管理・ガバナンス/decisions/**
 *   - designer: prototypes/**、decisions/**（decide経由の起票）。Zone3ではdocs/03_**の画面設計配下も許可
 *   - app-architect: decisions/**。src_unlockedがfalseの間はdecisions/contracts/**まで、
 *     trueになった以降はsrc/**も許可（10.2.1節で`src_unlocked`参照に更新済み）
 *   - infra-architect: infra/**、decisions/**、Zone3のみdocs/04_**
 *   - coder: src/**, tests/**（Zone2以降）
 *   - qa: tests/**、docs/00_.../00-02〜00-03（台帳）、Zone3のみdocs/05_**
 *   - sre: infra/**、Zone3以降docs/07_**、docs/06_**
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
 * 3. 【designerのZone3画面設計配下パス】`docs/03_アプリケーション設計/`配下のうち
 *    「画面設計」を含むディレクトリ、という条件は02文書のどこにも正確なパスが
 *    与えられていない（03文書の項番が正本のはずだが02文書からは特定できない）。
 *    本実装は `docs/03_アプリケーション設計/**画面設計**` に相当するパスパターンで
 *    近似する。厳密なディレクトリ名は03文書の確認が必要であり、PMへの報告事項とする。
 * 4. 【判定不能時の挙動（7.4節が明記していない事項）】`agent_type`が空でも`agent_id`が
 *    存在する場合（設計が想定していない組合せ）は「メインスレッド」とはみなさず、
 *    既知の7ロールに一致しない`agent_type`と同様に「未知ロール」として扱い、7.1.2節の
 *    「全ロール拒否のホワイトリスト方式」という既定方針に従って拒否する
 *    （安全側に倒す判断。PMへの報告事項）。
 *
 * 【影響範囲】
 * docs/02_**〜docs/04_**, src/**, infra/**, tests/**, decisions/**, prototypes/** への
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

/** designerのZone3画面設計配下パスの近似判定（上部コメント#3参照、要報告の暫定実装）。 */
function isScreenDesignPath(relPath) {
  return /^docs\/03_アプリケーション設計\/.*画面設計.*$/.test(relPath);
}

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
    { predicate: (relPath, zoneState) => zoneState.zone === 3 && isScreenDesignPath(relPath) },
  ],
  'app-architect': [
    { pattern: DECISIONS_GLOB },
    { pattern: 'src/**', when: (zoneState) => zoneState.src_unlocked === true },
  ],
  'infra-architect': [
    { pattern: 'infra/**' },
    { pattern: DECISIONS_GLOB },
    { pattern: 'docs/04_インフラ設計/**', when: (zoneState) => zoneState.zone === 3 },
  ],
  coder: [
    // 上部コメント#1: 02文書7.1.2節の表記「Zone2以降」を`src_unlocked`で近似する（要報告）。
    { pattern: 'src/**', when: (zoneState) => zoneState.src_unlocked === true },
    { pattern: 'tests/**', when: (zoneState) => zoneState.src_unlocked === true },
  ],
  qa: [
    { pattern: 'tests/**' },
    { exactPathFns: [(cwd) => ledger0002Path(cwd), (cwd) => ledger0003Path(cwd)] },
    { pattern: 'docs/05_テスト/**', when: (zoneState) => zoneState.zone === 3 },
  ],
  sre: [
    { pattern: 'infra/**' },
    { pattern: 'docs/07_運用・保守/**', when: (zoneState) => zoneState.zone === 3 || zoneState.zone === 4 },
    { pattern: 'docs/06_移行・導入/**', when: (zoneState) => zoneState.zone === 3 || zoneState.zone === 4 },
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
