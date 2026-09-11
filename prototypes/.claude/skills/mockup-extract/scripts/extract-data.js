#!/usr/bin/env node
'use strict';

/**
 * extract-data.js（mockup-extract Skill 同梱スクリプト）
 *
 * 【目的・理由】
 * 確定したハリボテからデータ項目（入力フィールド名・型のヒント）・画面遷移条件を
 * 抽出し、レーンB向けの構造化データとして出力する（02文書5.2節）。02文書5.2節は
 * この出力を「記述系文書ではなく決定ログのサブフォーマット
 * （`DL-xxxx_screen-data-{screen}.md`）として`decisions/`配下に保存し、`sync-check`が読む」
 * と定めており、`decide`のDL-ID採番（`decisions.js`）と同じ体系を流用する。
 *
 * 【影響範囲】
 * `docs/00_プロジェクト管理・ガバナンス/decisions/DL-{4桁}_screen-data-{screen}.md`
 * への新規ファイル作成。
 *
 * 【前提条件・制約】
 * - 抽出対象画面の`SCR-ID`が`00-02`台帳の`HB-ID`経路に未紐付けであれば警告する
 *   （02文書5.2節「mockup-extract」の責務。sync-check未実施の段階では常に警告になる
 *   のが正常であり、これはブロックしない）。
 * - 型のヒントはHTMLの`type`属性からの推測に留まり、実際のバックエンド型（DB型等）の
 *   決定はレーンB（App-Architect）が行う。本スクリプトは「ヒント」以上のものを主張しない。
 *
 * 【使い方】
 *   node extract-data.js --file=prototypes/login.html
 */

const fs = require('fs');
const path = require('path');
const {
  extractHtmlFieldNames,
  extractHtmlFieldTypes,
  extractHtmlTransitions,
} = require('../../../../../.claude/lib/field-extract');
const { stringifyFrontmatter } = require('../../../../../.claude/lib/frontmatter');
const { decisionsDir, nextDecisionId } = require('../../../../../.claude/lib/decisions');
const { readTableAsObjects } = require('../../../../../.claude/lib/markdown-table');
const { screenIndexPath, ledger0002Path } = require('../../../../../.claude/lib/ledger-paths');

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

function isScrIdLinkedToHb(cwd, scrId) {
  if (!scrId) return false;
  const rows = readTableAsObjects(ledger0002Path(cwd));
  return rows.some((r) => (r['経路（SCR-ID/RPT-ID/BAT-ID/API-ID）'] || '').includes(scrId));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    console.error('[extract-data] --file は必須です');
    process.exit(1);
  }

  const cwd = process.cwd();
  const absFile = path.isAbsolute(args.file) ? args.file : path.resolve(cwd, args.file);
  const relFile = path.relative(cwd, absFile).replace(/\\/g, '/');

  if (!fs.existsSync(absFile)) {
    console.error(`[extract-data] 対象ファイルが存在しません: ${relFile}`);
    process.exit(1);
  }

  const html = fs.readFileSync(absFile, 'utf-8');
  const fields = extractHtmlFieldNames(html);
  const types = extractHtmlFieldTypes(html);
  const transitions = extractHtmlTransitions(html);

  const scrId = findScrIdForFile(cwd, relFile);
  const linked = isScrIdLinkedToHb(cwd, scrId);
  if (!scrId) {
    console.error(`[extract-data] 警告: ${relFile} は SCREEN_ID_INDEX.md に未登録です。`);
  } else if (!linked) {
    console.error(
      `[extract-data] 警告: ${scrId} はまだ 00-02台帳 のHB-ID経路に未紐付けです（sync-check未実施の可能性）。`
    );
  }

  const base = path.basename(relFile).replace(/\.html?$/i, '');
  const id = 'DL-' + nextDecisionId(cwd);
  const fileName = `${id}_screen-data-${base}.md`;
  const dir = decisionsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);

  const fm = {
    決定ID: id,
    種別: 'screen-data-extract',
    関連SCRID: scrId || '(未登録)',
    抽出元ファイル: relFile,
    状態: '確定',
    決定日時: new Date().toISOString(),
  };

  const bodyLines = [];
  bodyLines.push(`# ${id}: ${base} 画面データ抽出`, '');
  bodyLines.push('## 入力項目一覧（型はHTML属性からのヒント。DB型等の最終決定はレーンBが行う）', '');
  bodyLines.push('| フィールド名 | 型ヒント |', '|---|---|');
  for (const f of fields) {
    bodyLines.push(`| ${f} | ${types[f] || '(不明)'} |`);
  }
  bodyLines.push('', '## 画面遷移候補', '');
  if (transitions.length) {
    bodyLines.push('| 種別 | 遷移先 |', '|---|---|');
    for (const t of transitions) bodyLines.push(`| ${t.type} | ${t.target} |`);
  } else {
    bodyLines.push('(遷移候補なし)');
  }
  bodyLines.push('', '## SCR-IDのHB-ID紐付け状況', '', linked ? '紐付け済み' : '未紐付け（sync-check未実施の可能性）', '');

  const fileContent = stringifyFrontmatter(fm, bodyLines.join('\n') + '\n');
  if (fs.existsSync(filePath)) {
    console.error(`[extract-data] 既に同名のファイルが存在します: ${filePath}`);
    process.exit(1);
  }
  fs.writeFileSync(filePath, fileContent, 'utf-8');

  console.log(
    JSON.stringify(
      {
        file: path.relative(cwd, filePath),
        id,
        scrId,
        linkedToHb: linked,
        fields,
        transitions,
      },
      null,
      2
    )
  );
}

main();
