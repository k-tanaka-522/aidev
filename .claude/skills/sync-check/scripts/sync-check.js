#!/usr/bin/env node
'use strict';

/**
 * sync-check.js（sync-check Skill 同梱スクリプト）
 *
 * 【目的・理由】
 * レーンA（画面）とレーンB（契約モック、または契約モック未確定時は`mockup-extract`が
 * 出力する決定ログ内データモデルメモ）を機械的に突合し（02文書10.3節手順1〜3）、
 * 整合が確認できた時点で`HB-ID`を採番して`00-02`台帳へ登録し（手順4）、同一操作内で
 * `00-05`同期点記録台帳へ通過記録を追記する（手順5、MUST、02文書10.1.5節）。
 * バッチ版（`--kind=batch`）は`BAT-ID`を採番し`00-03`台帳へ登録する（10.1.4節）。
 *
 * 【影響範囲】
 * `docs/00_プロジェクト管理・ガバナンス/00-02_HBトレーサビリティ台帳.md`、
 * `00-03_バッチトレーサビリティ台帳.md`、`00-05_同期点記録台帳.md`への新規行追記。
 *
 * 【前提条件・制約】
 * - **整合が確認できるまでHB-ID/BAT-IDは採番しない**（02文書10.3節「整合が確認できた
 *   時点で」という文言を、差分ゼロ（または`--force`指定）を採番の前提条件として実装した。
 *   この解釈は設計書に明記が無いため、PMへ報告する設計上の判断事項として扱う）。
 * - 命名ゆらぎ（snake_case⇔camelCase）の正規化は`field-extract.js`の
 *   `canonicalizeFieldName`に委ねる。意味的対応までは検出できない（02文書10.3節の限界）。
 * - `--source=contract|impl`はZone2以降（`src/backend/`実装後）の切り替えパラメータ
 *   （10.3節）。M2時点では`--source=impl`の実装読み取りは`src/{layer}`配下の素朴な
 *   フィールド抽出に留める（本格的なORM静的解析は02文書9.1.1節がZone3向けに定める別機構）。
 *
 * 【使い方】
 *   # 通常モード（レーンA⇔B）
 *   node sync-check.js --screen=prototypes/login.html --contract=decisions/contracts/auth.openapi.yaml
 *   node sync-check.js --screen=prototypes/login.html   # 契約モック未確定時はscreen-dataメモを自動探索
 *   node sync-check.js --screen=... --contract=... --force   # 差分があっても強制的にHB-ID採番
 *
 *   # バッチ版
 *   node sync-check.js --kind=batch --job-name=nightly-batch --spec=decisions/DL-0010_batch-spec-nightly.md
 *
 * 【契約】
 * CT-0006（.claude/contracts/sync-check.registerRoute.contract.js）。対象:
 * runScreenMode / runBatchMode（HB-ID採番＝00-02、BAT-ID採番＝00-03）。本ファイルが
 * 採番・登録する`HB-ID`・`BAT-ID`は、01文書6.5節条件6「トレーサビリティが充足している
 * こと」の**分母そのもの**であり（`gate-check/scripts/gate-check.js`の`judge`が
 * `denominatorIds`として`HB-ID`全件を数える）、16.6節(a)「分母・分子集計への関与」に
 * 該当する。契約はapp-architectがcontract-first（16.4節）で作成し、本M-dup2修正で
 * PASSする（16.4節はcoder自身による契約作成を禁じるが、既存契約を満たす実装を行うことは
 * 禁じられない）。
 *
 * 【M-dup2修正（HB-ID/BAT-ID無条件再採番バグ、PMからの委譲）】
 * `runScreenMode`/`runBatchMode`は従来、同一`screen`（`scrId`）・同一バッチジョブに
 * 対して再実行されるたびに`nextIdFromFiles`で無条件に新規`HB-ID`/`BAT-ID`を採番し、
 * `00-02`/`00-03`へ追記していた（重複登録の実機確認済み）。`00-02`のHB-ID件数は
 * 01文書6.5節条件6のE2Eカバレッジ分母そのものであるため、重複するとゲート判定の分母が
 * 水増しされる。本節はこれをissue-ledger.js/cr-ledger.jsと同じ「既存行検出→再採番せず
 * 既存IDを返す」方針で是正する。
 *
 * 【同一性キーの設計】
 * - **HB-ID（00-02、3.2.1節・3.2.2節）**: `経路（SCR-ID/RPT-ID/BAT-ID/API-ID）`列の
 *   **先頭エントリ**を同一性キーとする。3.2.1節は当該列を「当該HB-ID採番時点で判明して
 *   いる経由ID一覧（初版）」と定義し、`runScreenMode`は常に`[scrId, ...apiIds]`の順で
 *   書き込む（先頭は必ず対象画面/帳票の`scrId`）ため、先頭エントリ＝そのHB登録を発生
 *   させた画面/帳票を一意に表す。同一画面への再実行は「同じHBの再確認」であり、新規の
 *   HBとして扱うべきではない。`状態`列が`廃止`を含む行は対象から除外する（廃止済みの
 *   HB-IDへ現在の同期点通過を紐づけるべきではないため。issue-ledger.jsの`解消済み`除外と
 *   同型の判断）。
 * - **BAT-ID（00-03、3.2.3節）**: `ジョブ名`列を同一性キーとする。3.2.3節は`BAT-ID`を
 *   「バッチジョブ1本の粒度のトレーサビリティ起点ID」と定義しており、ジョブ名がその
 *   1本のバッチジョブを識別する自然な業務キーである。HB-ID同様、`状態`が`廃止`を含む
 *   行は除外する。
 * - いずれも`appendRow`が対象とする本体行そのもの（`登録日時`等の実行毎に変わる値を
 *   除く）は照合に使わない。
 *
 * 【既存行の内容が変わっている場合の扱い（例: 経由APIが増えた／入出力仕様が変わった）】
 * `HB-ID`（00-02）と`BAT-ID`（00-03）で扱いが異なる（列定義上の許容範囲が異なるため）。
 * - **00-02（HB-ID）**: 3.2.1節・3.2.2節は「本体行は書き換えない（MUST NOT）」「経路の
 *   事後追加は追記専用の『経路追加ログ』へ記録する」と定めているため、「既存行の更新」は
 *   本体行の書き換えではなく、**新たに判明した経路ID（`apiIds`の差分）を経路追加ログへ
 *   追記する**形で実装する。既に経路追加ログへ記録済みの`additional_id`は再度追記しない
 *   （`collectKnownRouteIds`/`routeLogHasEntry`が二重追記を防止し、同一入力の2回目実行を
 *   完全に冪等にする）。
 * - **00-03（BAT-ID）**: 3.2.3節の列定義は「入出力仕様参照」列の記入・更新タイミングを
 *   「入出力仕様の変更時」としており、00-02のMUST NOTとは異なり列の更新を許容する設計と
 *   読める。ジョブ名（同一性キー）が同じまま入出力仕様参照が変わった場合は、新規BAT-IDを
 *   追記せず`upsertRow`で既存行を更新する（BAT-IDは不変）。この解釈はCT-0006
 *   （`.claude/contracts/sync-check.registerRoute.contract.js`、app-architectによる
 *   contract-first契約）が固定化している。ただし「重複採番防止」自体のMUSTは03文書に
 *   現状明記が無いため、3.2.1節・3.2.3節（またはCT-0006が言及する新設3.2.8節案）への
 *   MUST追記を設計側（app-architect）に提案する（PMへの報告、自らは03文書を編集しない）。
 */

const fs = require('fs');
const path = require('path');
const {
  extractHtmlFieldNames,
  extractSchemaPropertyNames,
  extractExistingApiIds,
  diffFieldNames,
} = require('../../../lib/field-extract');
const {
  readTableAsObjects,
  appendRow,
  appendRowUnderHeading,
  findTable,
  findNamedTable,
  upsertRow,
} = require('../../../lib/markdown-table');
const { nextIdFromFiles } = require('../../../lib/id-registry');
const {
  screenIndexPath,
  reportIndexPath,
  ledger0002Path,
  ledger0003Path,
  ledger0005Path,
  decisionsDir,
} = require('../../../lib/ledger-paths');
const { readZoneState, unlockSrc } = require('../../../lib/zone-state');
const { createDecisionFile } = require('../../../lib/decisions');

/** 00-02台帳「経路追加ログ」（03文書3.2.2節）の見出し。appendRowUnderHeadingが対象を探す鍵。 */
const ROUTE_LOG_HEADING = '## 経路追加ログ';

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
    else if (/^--[^=]+$/.test(raw)) args[raw.slice(2)] = true;
  }
  return args;
}

function findIdForFile(cwd, indexPath, relFile) {
  const rows = readTableAsObjects(indexPath);
  const idCol = Object.keys(rows[0] || {}).find((k) => /-ID$/.test(k)) || 'SCR-ID';
  const hit = rows.find((r) => r['ファイル'] === relFile);
  return hit ? hit[idCol] : null;
}

/** decisions/DL-xxxx_screen-data-{screen}.md から入力項目一覧テーブルのフィールド名を読む。 */
function readScreenDataFields(cwd, screenBase) {
  const dir = decisionsDir(cwd);
  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch (_err) {
    return null;
  }
  const match = entries.find((f) => f.includes(`screen-data-${screenBase}`));
  if (!match) return null;
  const filePath = path.join(dir, match);
  const { header, rows } = findTable(fs.readFileSync(filePath, 'utf-8'));
  if (!header) return { file: match, fields: [] };
  const nameIdx = header.findIndex((h) => h.includes('フィールド名'));
  const fields = rows.map((r) => r[nameIdx >= 0 ? nameIdx : 0]).filter(Boolean);
  return { file: match, fields };
}

function nowIso() {
  return new Date().toISOString();
}

/**
 * 00-05台帳への追記（03文書3.2.5節の列定義、版1.4）。`override`/`未解消差分の要約`は
 * `sync-check --force`（10.3節）による迂回時のみ値を持つ（既定`false`/空欄）。
 */
function appendSyncLedger(cwd, { kind, participants, confirmationSummary, relatedIds, override = false, diffSummary = '' }) {
  appendRow(
    ledger0005Path(cwd),
    [
      '通過日時',
      '同期点種別（A⇔B/B⇔C/A⇔C、バッチ版は`batch`）',
      '参加レーン（担当エージェント）',
      '確認項目',
      '関連ID（DL-/HB-/SCR-/RPT-/API-）',
      'override',
      '未解消差分の要約',
    ],
    [nowIso(), kind, participants, confirmationSummary, relatedIds.join(', '), override ? 'true' : 'false', diffSummary]
  );
}

/**
 * `sync-check --force`（02文書10.3節、版1.8）迂回時の記録（MUST、両方を記録する）。
 * (1) 呼び出し元で00-05へ`override:true`＋差分要約を記録する（appendSyncLedgerが担う）。
 * (2) 本関数が不可逆度「低」の決定ログを起票する（01文書4.7.2節「不可逆度『低』は
 *     記録のみ、承認不要」に該当する運用として位置づける）。
 */
function recordForceOverrideDecision(cwd, { hbId, diffSummary }) {
  return createDecisionFile(cwd, {
    category: 'sync-check迂回（--force）',
    title: `${hbId}: sync-check --force による差分未解消のままの同期点通過`,
    slug: `sync-check-force-${hbId}`,
    content: `${hbId}の同期点通過を、レーンA/B間の差分が残った状態で --force により強行した。`,
    rationale: `未解消差分: ${diffSummary}`,
    irreversibility: '低',
    irreversibilityReason: '02文書10.3節が定めるsync-check --force迂回であり、Zone2以降の軽微修正で追随可能なため不可逆度「低」とする。',
    disposition: '記録のみ。承認不要（01文書4.7.2節）。',
    roles: ['designer', 'app-architect', 'qa'],
    lanes: ['A', 'B'],
  });
}

/**
 * `00-02`「経路追加ログ」（3.2.2節）を読み取る（見出しが無い/テーブルが無い場合は
 * `header: null`）。`collectKnownRouteIds`・`routeLogHasEntry`が共有する内部ヘルパー。
 */
function readRouteLog(cwd) {
  let content = '';
  try {
    content = fs.readFileSync(ledger0002Path(cwd), 'utf-8');
  } catch (_err) {
    return { header: null, rows: [] };
  }
  const table = findNamedTable(content, ROUTE_LOG_HEADING);
  return { header: table.header, rows: table.rows };
}

/**
 * 00-02本体テーブルの`経路`列（3.2.1節）の先頭エントリ（sync-checkが画面/帳票に対して
 * 発行する主経路ID＝SCR-ID/RPT-ID）を同一性キーとして、既存のHB-ID登録を探す
 * （重複再採番防止、M-dup2。根拠はファイル冒頭コメント「同一性キーの設計」参照）。
 * 【前提条件・制約】`状態`列が`廃止`を含む行は対象から除外する。
 */
function findExistingHbRowByScrId(rows, scrId) {
  return rows.find((r) => {
    const routeCol = r['経路（SCR-ID/RPT-ID/BAT-ID/API-ID）'] || '';
    const primary = routeCol.split(',')[0].trim();
    const state = r['状態'] || '';
    return primary === scrId && !/廃止/.test(state);
  });
}

/**
 * 既存HB行について、初版の経路列＋既に経路追加ログへ記録済みの`additional_id`を
 * 合わせた「既知の経路ID集合」を返す。新規検出した経路IDのうちこの集合に無いものだけを
 * 経路追加ログへ追記することで、同一入力での再実行を冪等にする。
 */
function collectKnownRouteIds(cwd, hbRow) {
  const known = new Set(
    (hbRow['経路（SCR-ID/RPT-ID/BAT-ID/API-ID）'] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
  const { header, rows } = readRouteLog(cwd);
  if (!header) return known;
  const hbIdx = header.indexOf('HB-ID');
  const addIdx = header.indexOf('additional_id');
  if (hbIdx === -1 || addIdx === -1) return known;
  for (const r of rows) {
    if (r[hbIdx] === hbRow['HB-ID']) known.add((r[addIdx] || '').trim());
  }
  return known;
}

/** 経路追加ログに`{hbId, additionalId}`の組が既に存在するか（BAT側の二重追記防止）。 */
function routeLogHasEntry(cwd, hbId, additionalId) {
  const { header, rows } = readRouteLog(cwd);
  if (!header) return false;
  const hbIdx = header.indexOf('HB-ID');
  const addIdx = header.indexOf('additional_id');
  if (hbIdx === -1 || addIdx === -1) return false;
  return rows.some((r) => r[hbIdx] === hbId && r[addIdx] === additionalId);
}

/**
 * 00-03本体テーブルの`ジョブ名`列（3.2.3節）を同一性キーとして、既存のBAT-ID登録を
 * 探す（重複再採番防止、M-dup2）。`状態`列が`廃止`を含む行は対象から除外する。
 */
function findExistingBatRowByJobName(rows, jobName) {
  return rows.find((r) => r['ジョブ名'] === jobName && !/廃止/.test(r['状態'] || ''));
}

function runScreenMode(cwd, args) {
  if (!args.screen) {
    console.error('[sync-check] --screen は必須です（通常モード）');
    process.exit(1);
  }
  const absScreen = path.isAbsolute(args.screen) ? args.screen : path.resolve(cwd, args.screen);
  const relScreen = path.relative(cwd, absScreen).replace(/\\/g, '/');
  if (!fs.existsSync(absScreen)) {
    console.error(`[sync-check] 画面ファイルが存在しません: ${relScreen}`);
    process.exit(1);
  }
  const isReport = /^prototypes\/reports\//.test(relScreen);
  const indexPath = isReport ? reportIndexPath(cwd) : screenIndexPath(cwd);
  const scrId = findIdForFile(cwd, indexPath, relScreen);
  if (!scrId) {
    console.error(
      `[sync-check] ${relScreen} は台帳に未登録です。先に mockup-generate で登録すること。`
    );
    process.exit(1);
  }

  const screenHtml = fs.readFileSync(absScreen, 'utf-8');
  const screenFields = extractHtmlFieldNames(screenHtml);

  let laneBFields = [];
  let laneBSource;
  let apiIds = [];
  const zoneState = readZoneState(cwd);
  const explicitSource = args.source;
  // 【版1.8対応】current-zone.jsonのスキーマ正本化（10.2.1節）により`zone`は0/1/3/4の
  // 4値のみを取り、`2`は存在しなくなった。旧実装は`zone >= 2`でZone2到達を判定していたが、
  // これは常にfalseになり実装切替が機能しなくなる（過去の判定ロジックが02文書の
  // スキーマ確定によって無効化された箇所。PMへの報告事項）。10.3節「`--source=impl`の
  // 切替は`src_unlocked`を参照して自動選択する」の記述どおり、`src_unlocked`で判定する。
  const effectiveSource =
    explicitSource ||
    (zoneState.src_unlocked && fs.existsSync(path.join(cwd, 'src', 'backend')) ? 'impl' : 'contract');

  if (effectiveSource === 'impl') {
    // Zone2以降: src/backend配下の素朴なフィールド抽出（本格的なORM静的解析は9.1.1節がZone3向けに別途定める）。
    laneBSource = { type: 'impl', path: 'src/backend' };
    const backendDir = path.join(cwd, 'src', 'backend');
    const collected = new Set();
    (function walk(dir) {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (_err) {
        return;
      }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(ts|js|py)$/.test(e.name)) {
          const text = fs.readFileSync(full, 'utf-8');
          const re = /["'`]([a-zA-Z_][a-zA-Z0-9_]*)["'`]\s*:/g;
          let m;
          while ((m = re.exec(text))) collected.add(m[1]);
        }
      }
    })(backendDir);
    laneBFields = Array.from(collected);
  } else if (args.contract) {
    const absContract = path.isAbsolute(args.contract) ? args.contract : path.resolve(cwd, args.contract);
    if (!fs.existsSync(absContract)) {
      console.error(`[sync-check] 契約モックが存在しません: ${args.contract}`);
      process.exit(1);
    }
    const yamlText = fs.readFileSync(absContract, 'utf-8');
    laneBFields = extractSchemaPropertyNames(yamlText);
    apiIds = extractExistingApiIds(yamlText);
    laneBSource = { type: 'contract', path: path.relative(cwd, absContract).replace(/\\/g, '/') };
  } else {
    const base = path.basename(relScreen).replace(/\.html?$/i, '');
    const memo = readScreenDataFields(cwd, base);
    if (!memo) {
      console.error(
        '[sync-check] --contract が未指定で、対応する decisions/DL-*_screen-data-*.md も見つかりません。'
      );
      console.error('[sync-check] mockup-extract を先に実行するか --contract を指定すること。');
      process.exit(1);
    }
    laneBFields = memo.fields;
    laneBSource = { type: 'screen-data-memo', path: memo.file };
  }

  const diff = diffFieldNames(screenFields, laneBFields);
  const hasDiff = diff.onlyInA.length > 0 || diff.onlyInB.length > 0;

  const report = {
    screen: relScreen,
    scrId,
    laneBSource,
    screenFields,
    laneBFields,
    onlyInScreen: diff.onlyInA,
    onlyInLaneB: diff.onlyInB,
    matched: diff.matched.length,
    hasDiff,
  };

  if (hasDiff && !args.force) {
    report.status = 'diff_detected';
    report.message = '差分が検出されました。整合を取ってから再実行するか --force を指定してください。';
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  // 整合確認済み（またはforce）: 既存HB行が無ければHB-IDを採番し00-02へ登録する。
  // 既存であれば再採番せず、新たに判明した経路IDのみ経路追加ログへ追記する（M-dup2）。
  const existingHbRows = readTableAsObjects(ledger0002Path(cwd));
  const existingHbRow = findExistingHbRowByScrId(existingHbRows, scrId);
  const routeIds = [scrId, ...apiIds].filter(Boolean).join(', ');
  let hbId;
  let reused = false;
  if (existingHbRow) {
    hbId = existingHbRow['HB-ID'];
    reused = true;
    const known = collectKnownRouteIds(cwd, existingHbRow);
    const newlyDiscovered = apiIds.filter((id) => id && !known.has(id));
    for (const additionalId of newlyDiscovered) {
      // 本体行(3.2.1節、MUST NOT書き換え)は変更せず、追記専用の経路追加ログ(3.2.2節)へ
      // 差分のみ記録する。
      appendRowUnderHeading(
        ledger0002Path(cwd),
        ROUTE_LOG_HEADING,
        ['HB-ID', 'additional_id', 'added_at', 'added_by'],
        [hbId, additionalId, nowIso(), 'sync-check（同一画面の再実行による経路差分検知）']
      );
    }
  } else {
    hbId = 'HB-' + nextIdFromFiles('HB', [ledger0002Path(cwd)]);
    appendRow(
      ledger0002Path(cwd),
      [
        'HB-ID',
        '経路（SCR-ID/RPT-ID/BAT-ID/API-ID）',
        '正式要件ID',
        '実装ファイル（逆引き）',
        'API-ID（逆引き）',
        'モジュール（逆引き）',
        '状態',
      ],
      [hbId, routeIds, '(Zone3で変換)', '', '', '', '登録済み']
    );
  }

  const diffSummary = hasDiff
    ? `画面のみ=${diff.onlyInA.join('/') || 'なし'}, レーンBのみ=${diff.onlyInB.join('/') || 'なし'}`
    : '';

  appendSyncLedger(cwd, {
    kind: 'A⇔B',
    participants: 'designer, app-architect, qa',
    confirmationSummary: hasDiff
      ? `--force指定により差分ありで通過（残差分: ${diffSummary}）`
      : '画面項目とレーンB項目の完全一致を確認',
    relatedIds: [hbId, scrId, ...apiIds].filter(Boolean),
    override: hasDiff,
    diffSummary,
  });

  // 【10.3節「--forceによる迂回」、両方の記録をMUST】00-05へのoverride記録（上記）に加え、
  // 不可逆度「低」の決定ログを起票する。いずれか一方のみは不可（02文書10.3節）。
  let forceDecision = null;
  if (hasDiff) {
    forceDecision = recordForceOverrideDecision(cwd, { hbId, diffSummary });
  }

  // 【版1.8対応、10.2.1節】最初のHB-ID/API-ID採番に成功した時点でsrc_unlockedをtrueに
  // 固定する（単調・冪等）。app-architect（およびcoder、role-boundary-guard.js参照）の
  // src/**書込許可がこのタイミングで解放される。
  unlockSrc(cwd, 'sync-check');

  report.status = 'passed';
  report.hbId = hbId;
  report.hbReused = reused;
  if (forceDecision) report.forceDecision = forceDecision;
  console.log(JSON.stringify(report, null, 2));
}

function runBatchMode(cwd, args) {
  if (!args['job-name'] || !args.spec) {
    console.error('[sync-check] --kind=batch の場合 --job-name と --spec は必須です');
    process.exit(1);
  }
  const absSpec = path.isAbsolute(args.spec) ? args.spec : path.resolve(cwd, args.spec);
  if (!fs.existsSync(absSpec)) {
    console.error(`[sync-check] 入出力仕様ファイルが存在しません: ${args.spec}`);
    process.exit(1);
  }
  const relSpec = path.relative(cwd, absSpec).replace(/\\/g, '/');

  // 03文書3.2.3節（版1.4）: 「経由HB-ID」列は登録時点で判明している場合に限り一度だけ記入
  // する（同一操作内の追記であり競合しない）。正式ID列（F-BAT-{連番}）はZone3の
  // traceability-reverseが変換するため、登録時点では空欄のままにする。
  // 【M-dup2】ジョブ名を同一性キーに、既存行があれば再採番せず既存BAT-IDを再利用する
  // （ファイル冒頭コメント「同一性キーの設計」参照）。
  const BAT_HEADER = [
    'BAT-ID',
    'ジョブ名',
    '入出力仕様参照（decisions/配下）',
    '経由HB-ID（画面経由の場合）',
    '正式ID（F-BAT-{連番}）',
    '状態',
    '登録日時',
  ];
  const existingBatRows = readTableAsObjects(ledger0003Path(cwd));
  const existingBatRow = findExistingBatRowByJobName(existingBatRows, args['job-name']);
  let batId;
  let reused = false;
  if (existingBatRow) {
    batId = existingBatRow['BAT-ID'];
    reused = true;
    // 3.2.3節の列定義は「入出力仕様参照」列の記入・更新タイミングを「入出力仕様の変更時」
    // としており（3.2.1節のHB-ID本体行のMUST NOT書き換えとは異なり）更新を許容する設計
    // である。ジョブ名は同一のまま入出力仕様参照が変わった場合、新規BAT-IDを追記せず
    // 既存行を更新する（M-dup2、CT-0006）。
    if ((existingBatRow['入出力仕様参照（decisions/配下）'] || '') !== relSpec) {
      upsertRow(ledger0003Path(cwd), BAT_HEADER, 'BAT-ID', batId, [
        batId,
        args['job-name'],
        relSpec,
        existingBatRow['経由HB-ID（画面経由の場合）'] || args['hb-id'] || '',
        existingBatRow['正式ID（F-BAT-{連番}）'] || '',
        existingBatRow['状態'] || '登録済み',
        existingBatRow['登録日時'] || nowIso(),
      ]);
    }
  } else {
    batId = 'BAT-' + nextIdFromFiles('BAT', [ledger0003Path(cwd)]);
    appendRow(
      ledger0003Path(cwd),
      BAT_HEADER,
      [batId, args['job-name'], relSpec, args['hb-id'] || '', '', '登録済み', nowIso()]
    );
  }

  if (args['hb-id']) {
    // 【03文書3.2.3節の役割分担】ここでの`--hb-id`指定は「登録時点で判明している」場合
    // （00-03側の「経由HB-ID」列へ一度だけ記入、上記appendRowで完了）であるが、対象の
    // HB-IDが00-02台帳に実在するかは別途確認が必要である。加えて、事後判明分（今回のような
    // 登録時点判明分と異なり後から分かったケース）は00-02側を書き換えず「経路追加ログ」
    // （3.2.2節）へ追記する。ここでは「登録時点判明」でも、Mode Bの逆引き（9.1.1節）が
    // 00-02側からもBAT-IDを辿れるよう、経路追加ログにも同時記録する（追記のみで完結し
    // 00-02本体行は書き換えないため、02文書10.1.4節の競合回避原則を破らない）。
    // 【M-dup2】同一入力での再実行を冪等にするため、既に同じ組が記録済みなら追記しない。
    const rows = readTableAsObjects(ledger0002Path(cwd));
    const target = rows.find((r) => r['HB-ID'] === args['hb-id']);
    if (!target) {
      console.error(`[sync-check] 警告: 指定された HB-ID (${args['hb-id']}) が00-02台帳に見つかりません。`);
    } else if (!routeLogHasEntry(cwd, args['hb-id'], batId)) {
      appendRowUnderHeading(
        ledger0002Path(cwd),
        ROUTE_LOG_HEADING,
        ['HB-ID', 'additional_id', 'added_at', 'added_by'],
        [args['hb-id'], batId, nowIso(), 'sync-check --kind=batch']
      );
    }
  }

  appendSyncLedger(cwd, {
    kind: 'batch',
    participants: 'app-architect, qa',
    confirmationSummary: `入出力仕様(${relSpec})とサンプルデータの合意を確認`,
    relatedIds: [batId, args['hb-id']].filter(Boolean),
  });

  console.log(
    JSON.stringify({ status: 'passed', batId, batReused: reused, spec: relSpec, jobName: args['job-name'] }, null, 2)
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  if (args.kind === 'batch') {
    runBatchMode(cwd, args);
  } else {
    runScreenMode(cwd, args);
  }
}

main();
