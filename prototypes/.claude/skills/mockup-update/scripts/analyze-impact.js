#!/usr/bin/env node
'use strict';

/**
 * analyze-impact.js（mockup-update Skill 同梱スクリプト）
 *
 * 【目的・理由】
 * ハリボテ改修時に `SCR-ID`・入力項目の変化を検知し、その`SCR-ID`を経路に含む`HB-ID`を
 * `00-02`台帳から逆引きして特定した上で、影響を受けるレーンB（契約モック・データモデル）・
 * E2Eシナリオへの波及を警告する（02文書5.2節「mockup-update」、01文書4.4.5節手順7の
 * 追随ルールを機械的に支援する軽量影響分析）。
 *
 * 【影響範囲】
 * 読み取りのみ（`prototypes/`のHTML、`.claude-state/mockup-snapshots/`、
 * `docs/00_.../00-02_HBトレーサビリティ台帳.md`、`tests/e2e/`、`src/`）。
 * 末尾でスナップショットを更新する（次回改修時の差分基準を最新化するため）。
 *
 * 【前提条件・制約】
 * - 01文書4.4.5節手順7が定める3区分（画面単体の変更／画面遷移の軽微な変更／
 *   画面遷移の構造自体が変わる大幅な作り直し）の**判定自体はQA/Designerの判断に委ねる**
 *   （HB-IDを新規採番すべきかはビジネス的判断を要するため、本スクリプトは機械的に
 *   検出できる差分と影響候補の一覧化までに留める。MUST NOT自動でHB-IDを再採番）。
 * - `tests/e2e/`・`src/`のgrepは「ファイル名またはdocblock中にSCR-ID/HB-IDが含まれるか」の
 *   文字列一致であり、意味的な追跡ではない（02文書10.3節が明記する機械抽出の限界と同種）。
 *
 * 【使い方】
 *   node analyze-impact.js --file=prototypes/login.html
 */

const fs = require('fs');
const path = require('path');
const {
  extractHtmlFieldNames,
  extractHtmlTransitions,
  diffFieldNames,
} = require('../../../../../.claude/lib/field-extract');
const { readTableAsObjects } = require('../../../../../.claude/lib/markdown-table');
const { screenIndexPath, ledger0002Path, mockupSnapshotsDir } = require('../../../../../.claude/lib/ledger-paths');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function findScrIdForFile(cwd, relFile) {
  const rows = readTableAsObjects(screenIndexPath(cwd));
  const hit = rows.find((r) => r['ファイル'] === relFile);
  return hit ? hit['SCR-ID'] : null;
}

function findHbIdsForScrId(cwd, scrId) {
  if (!scrId) return [];
  const rows = readTableAsObjects(ledger0002Path(cwd));
  return rows
    .filter((r) => (r['経路（SCR-ID/RPT-ID/BAT-ID/API-ID）'] || '').includes(scrId))
    .map((r) => r['HB-ID'])
    .filter(Boolean);
}

/** ディレクトリを再帰的に走査し、条件に合うファイルパス一覧を返す（簡易glob代替）。 */
function walk(dir, predicate, results = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return results;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      walk(full, predicate, results);
    } else if (predicate(full)) {
      results.push(full);
    }
  }
  return results;
}

function grepFilesContaining(dir, needles) {
  if (!needles.length) return [];
  const files = walk(dir, (f) => /\.(ts|tsx|js|jsx|py|spec\.ts|test\.ts)$/i.test(f));
  const hits = [];
  for (const f of files) {
    let content;
    try {
      content = fs.readFileSync(f, 'utf-8');
    } catch (_err) {
      continue;
    }
    if (needles.some((n) => content.includes(n))) hits.push(f);
  }
  return hits;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('[analyze-impact] --file は必須です');
    process.exit(1);
  }

  const cwd = process.cwd();
  const absFile = path.isAbsolute(args.file) ? args.file : path.resolve(cwd, args.file);
  const relFile = path.relative(cwd, absFile).replace(/\\/g, '/');

  if (!fs.existsSync(absFile)) {
    console.error(`[analyze-impact] 対象ファイルが存在しません: ${relFile}`);
    process.exit(1);
  }

  const html = fs.readFileSync(absFile, 'utf-8');
  const currentFields = extractHtmlFieldNames(html);
  const currentTransitions = extractHtmlTransitions(html).map((t) => t.target).sort();

  const base = path.basename(relFile).replace(/\.html?$/i, '');
  const snapshotPath = path.join(mockupSnapshotsDir(cwd), `${base}.json`);
  let previous = null;
  try {
    previous = JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
  } catch (_err) {
    previous = null;
  }

  const previousFields = previous ? previous.fields : [];
  const previousTransitions = previous ? (previous.transitions || []).map((t) => t.target).sort() : [];

  const fieldDiff = diffFieldNames(previousFields, currentFields);
  const transitionsChanged = JSON.stringify(previousTransitions) !== JSON.stringify(currentTransitions);

  const scrId = findScrIdForFile(cwd, relFile);
  if (!scrId) {
    console.error(
      `[analyze-impact] 警告: ${relFile} は SCREEN_ID_INDEX.md に未登録です。先に mockup-generate の register-mockup.js で登録すること。`
    );
  }
  const hbIds = findHbIdsForScrId(cwd, scrId);

  const impactedTests = grepFilesContaining(
    path.join(cwd, 'tests', 'e2e'),
    [scrId, ...hbIds].filter(Boolean)
  ).map((f) => path.relative(cwd, f));
  const impactedSrc = grepFilesContaining(path.join(cwd, 'src'), [scrId, ...hbIds].filter(Boolean)).map((f) =>
    path.relative(cwd, f)
  );

  // 01文書4.4.5節手順7の3区分に沿った推奨アクション（機械判定できる範囲のみ）。
  let recommendation;
  if (!previous) {
    recommendation = '初回スナップショットが無いため差分判定不可。今回の状態を基準として保存する。';
  } else if (transitionsChanged) {
    recommendation =
      '画面遷移（リンク/フォームの遷移先）が変化した。01文書4.4.5節手順7に従い、' +
      '経路上のSCR-ID構成が変わる大幅な作り直しか、軽微な変更かをQA/Designerが判断し、' +
      '前者なら新HB-IDを採番し旧HB-IDを統合済み/廃止として明示的にクローズすること（MUST NOT黙って再利用）。';
  } else if (fieldDiff.onlyInA.length || fieldDiff.onlyInB.length) {
    recommendation =
      '画面単体の項目変更（追加/削除）のみを検知。既存のSCR-ID/HB-IDを維持し、' +
      'SCREEN_ID_INDEX.mdの当該行を改訂し、関連する契約モック・データモデルメモへの反映を' +
      'レーンBに連携すること（sync-checkでの再突合を推奨）。';
  } else {
    recommendation = 'フィールド・画面遷移ともに変化なし（文言変更のみ等）。ID変更は不要。';
  }

  // スナップショットを最新化する（次回改修時の差分基準）。
  fs.mkdirSync(mockupSnapshotsDir(cwd), { recursive: true });
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify(
      {
        id: scrId,
        kind: previous ? previous.kind : 'screen',
        file: relFile,
        title: previous ? previous.title : undefined,
        fields: currentFields,
        transitions: extractHtmlTransitions(html),
        savedAt: new Date().toISOString(),
      },
      null,
      2
    ) + '\n',
    'utf-8'
  );

  console.log(
    JSON.stringify(
      {
        file: relFile,
        scrId,
        hbIds,
        addedFields: fieldDiff.onlyInB,
        removedFields: fieldDiff.onlyInA,
        transitionsChanged,
        impactedTests,
        impactedSrc,
        recommendation,
      },
      null,
      2
    )
  );
}

main();
