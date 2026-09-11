#!/usr/bin/env node
'use strict';

/**
 * register-mockup.js（mockup-generate Skill 同梱スクリプト）
 *
 * 【目的・理由】
 * ハリボテHTML（画面 or 帳票）が書かれた時点で `SCR-ID`/`RPT-ID` を機構が自動採番し、
 * `prototypes/SCREEN_ID_INDEX.md`/`REPORT_ID_INDEX.md` へ登録する（01文書4.4.5節手順1、
 * 02文書10.1.1節・10.1.3節）。ID採番・台帳追記をLLMの自由記述に任せると採番の重複・
 * 台帳フォーマットの崩れが生じるため、`decide`/`new-decision.js`と同じ設計判断で
 * スクリプト化する。
 *
 * 【影響範囲】
 * `prototypes/SCREEN_ID_INDEX.md`、`prototypes/REPORT_ID_INDEX.md`への新規行追記。
 * `.claude-state/mockup-snapshots/{basename}.json`への新規スナップショット書き込み
 * （`mockup-update`が改修時の差分検知に使う、02文書5.2節）。
 *
 * 【前提条件・制約】
 * - 帳票/画面の判定は02文書10.1.3節の方針どおり**ディレクトリによる隔離**（MUST）。
 *   `--kind`省略時は`--file`のパスが`prototypes/reports/`配下かどうかで自動判定する。
 * - 同一HTMLに画面IDと帳票IDを二重採番しない（MUST NOT、10.1.3節）。
 * - 対象HTMLファイル自体の生成（会話内容の反映）は本スクリプトの責務ではない。
 *   Designerが会話しながらHTMLを書いた**後**に本スクリプトを呼ぶ想定。
 *
 * 【使い方】
 *   node register-mockup.js --file=prototypes/login.html --title="ログイン画面"
 *   node register-mockup.js --file=prototypes/reports/invoice.html --title="請求書" --kind=report
 */

const fs = require('fs');
const path = require('path');
const { extractHtmlFieldNames, extractHtmlTransitions } = require('../../../../../.claude/lib/field-extract');
const { nextIdFromFiles } = require('../../../../../.claude/lib/id-registry');
const { appendRow } = require('../../../../../.claude/lib/markdown-table');
const {
  screenIndexPath,
  reportIndexPath,
  mockupSnapshotsDir,
} = require('../../../../../.claude/lib/ledger-paths');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function inferKind(relPath) {
  return /^prototypes\/reports\//.test(relPath) ? 'report' : 'screen';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file || !args.title) {
    console.error('[register-mockup] --file と --title は必須です');
    process.exit(1);
  }

  const cwd = process.cwd();
  const absFile = path.isAbsolute(args.file) ? args.file : path.resolve(cwd, args.file);
  const relFile = path.relative(cwd, absFile).replace(/\\/g, '/');

  if (!fs.existsSync(absFile)) {
    console.error(`[register-mockup] 対象ファイルが存在しません: ${relFile}`);
    console.error('[register-mockup] 先にハリボテHTMLを作成してから本スクリプトを実行すること。');
    process.exit(1);
  }

  const kind = args.kind || inferKind(relFile);
  if (!['screen', 'report'].includes(kind)) {
    console.error('[register-mockup] --kind は screen|report のいずれか');
    process.exit(1);
  }
  if (kind === 'report' && !/^prototypes\/reports\//.test(relFile)) {
    console.error(
      '[register-mockup] --kind=report を指定する場合、ファイルは prototypes/reports/ 配下に置くこと（10.1.3節、ディレクトリによる機械的区別）'
    );
    process.exit(1);
  }
  if (kind === 'screen' && /^prototypes\/reports\//.test(relFile)) {
    console.error(
      '[register-mockup] prototypes/reports/ 配下のファイルは screen として登録できない（帳票として --kind=report を指定すること）'
    );
    process.exit(1);
  }

  const html = fs.readFileSync(absFile, 'utf-8');
  const fields = extractHtmlFieldNames(html);
  const transitions = extractHtmlTransitions(html);

  const indexPath = kind === 'report' ? reportIndexPath(cwd) : screenIndexPath(cwd);
  const prefix = kind === 'report' ? 'RPT' : 'SCR';
  const id = prefix + '-' + nextIdFromFiles(prefix, [indexPath]);

  const now = new Date().toISOString();
  appendRow(
    indexPath,
    kind === 'report'
      ? ['RPT-ID', '帳票名', 'ファイル', '登録日時', '状態']
      : ['SCR-ID', '画面名', 'ファイル', '登録日時', '状態'],
    [id, args.title, relFile, now, '登録済み']
  );

  const snapshotDir = mockupSnapshotsDir(cwd);
  fs.mkdirSync(snapshotDir, { recursive: true });
  const base = path.basename(relFile).replace(/\.html?$/i, '');
  const snapshotPath = path.join(snapshotDir, `${base}.json`);
  const snapshot = { id, kind, file: relFile, title: args.title, fields, transitions, savedAt: now };
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');

  console.log(
    JSON.stringify(
      {
        id,
        kind,
        file: relFile,
        index: path.relative(cwd, indexPath),
        fields,
        snapshot: path.relative(cwd, snapshotPath),
      },
      null,
      2
    )
  );
}

main();
