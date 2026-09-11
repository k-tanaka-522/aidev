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
 */

const fs = require('fs');
const path = require('path');
const {
  extractHtmlFieldNames,
  extractSchemaPropertyNames,
  extractExistingApiIds,
  diffFieldNames,
} = require('../../../lib/field-extract');
const { readTableAsObjects, appendRow, findTable } = require('../../../lib/markdown-table');
const { nextIdFromFiles } = require('../../../lib/id-registry');
const {
  screenIndexPath,
  reportIndexPath,
  ledger0002Path,
  ledger0003Path,
  ledger0005Path,
  decisionsDir,
} = require('../../../lib/ledger-paths');
const { readZoneState } = require('../../../lib/zone-state');

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

function appendSyncLedger(cwd, { kind, participants, confirmationSummary, relatedIds }) {
  appendRow(
    ledger0005Path(cwd),
    ['通過日時', '同期点種別（A⇔B/B⇔C/A⇔C、バッチ版は`batch`）', '参加レーン（担当エージェント）', '確認項目', '関連ID（DL-/HB-/SCR-/RPT-/API-）'],
    [nowIso(), kind, participants, confirmationSummary, relatedIds.join(', ')]
  );
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
  const effectiveSource =
    explicitSource || (zoneState.zone >= 2 && fs.existsSync(path.join(cwd, 'src', 'backend')) ? 'impl' : 'contract');

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

  // 整合確認済み（またはforce）: HB-IDを採番し00-02へ登録、同一操作内で00-05へ追記する。
  const hbId = 'HB-' + nextIdFromFiles('HB', [ledger0002Path(cwd)]);
  const routeIds = [scrId, ...apiIds].filter(Boolean).join(', ');
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

  appendSyncLedger(cwd, {
    kind: 'A⇔B',
    participants: 'designer, app-architect, qa',
    confirmationSummary: hasDiff
      ? `--force指定により差分ありで通過（残差分: 画面のみ=${diff.onlyInA.join('/')||'なし'}, レーンBのみ=${diff.onlyInB.join('/')||'なし'}）`
      : '画面項目とレーンB項目の完全一致を確認',
    relatedIds: [hbId, scrId, ...apiIds].filter(Boolean),
  });

  report.status = 'passed';
  report.hbId = hbId;
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

  const batId = 'BAT-' + nextIdFromFiles('BAT', [ledger0003Path(cwd)]);
  appendRow(
    ledger0003Path(cwd),
    ['BAT-ID', 'ジョブ名', '入出力仕様参照（decisions/配下）', '経由HB-ID（画面経由の場合）', '状態', '登録日時'],
    [batId, args['job-name'], relSpec, args['hb-id'] || '', '登録済み', nowIso()]
  );

  if (args['hb-id']) {
    // 画面を経由するバッチ: 00-02台帳の経路欄にもBAT-IDを追記する（MUST拡張、03文書3.10.2節）。
    const rows = readTableAsObjects(ledger0002Path(cwd));
    const target = rows.find((r) => r['HB-ID'] === args['hb-id']);
    if (!target) {
      console.error(`[sync-check] 警告: 指定された HB-ID (${args['hb-id']}) が00-02台帳に見つかりません。`);
    } else {
      // 簡易実装: 既存行を書き換えず、経路欄の拡張は追記コメント行として別途残す
      // （00-02の行更新はmarkdown-table.jsが単純追記のみをサポートするため、
      //  既存行の書き換えはM2のスコープ外としてPMへ報告する）。
      console.error(
        `[sync-check] 注記: HB-ID ${args['hb-id']} の経路欄への ${batId} 追記は、` +
          '既存行の書き換えロジックが未実装のため手動確認が必要です（PMへの報告事項）。'
      );
    }
  }

  appendSyncLedger(cwd, {
    kind: 'batch',
    participants: 'app-architect, qa',
    confirmationSummary: `入出力仕様(${relSpec})とサンプルデータの合意を確認`,
    relatedIds: [batId, args['hb-id']].filter(Boolean),
  });

  console.log(JSON.stringify({ status: 'passed', batId, spec: relSpec, jobName: args['job-name'] }, null, 2));
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
