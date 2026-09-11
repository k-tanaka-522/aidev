#!/usr/bin/env node
'use strict';

/**
 * markdown-table.js（M2共有ライブラリ）
 *
 * 【目的・理由】
 * `prototypes/SCREEN_ID_INDEX.md`・`REPORT_ID_INDEX.md`・`docs/00_.../00-02`〜`00-05`の
 * 各台帳はいずれもGFM形式のMarkdownテーブル1本を本体とする「生きた台帳」であり
 * （docs/v2/03_成果物体系定義書.md 3.2節・3.2.1節）、追記のたびに全文を書き直すのは
 * 事故（既存行の欠落）のリスクが高い。テーブルの検出・行の追記・行の読み取りを
 * 1箇所に集約し、各台帳スクリプト（mockup-generate, contract-design, sync-check等）が
 * 同じロジックを再実装しないようにする。
 *
 * 【影響範囲】
 * `prototypes/.claude/skills/{mockup-generate,mockup-update,mockup-extract}/scripts/*.js`、
 * `docs/00_プロジェクト管理・ガバナンス/decisions/contracts/.claude/skills/contract-design/scripts/*.js`、
 * `.claude/skills/sync-check/scripts/*.js`。
 *
 * 【前提条件・制約】
 * - 対象ファイルには最初に出現するパイプテーブル（`| ... |`の連続行、2行目が
 *   `|---|...`のセパレータ行）のみを「本体テーブル」とみなす。台帳フォーマットは
 *   本ライブラリの利用者（各scripts/*.js）が単一テーブル構成になるよう設計する。
 * - セル内に`|`を含む値は想定しない（decisions.jsのfrontmatter同様、フラットな運用を前提）。
 */

const fs = require('fs');

function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((c) => c.trim());
}

function isSeparatorRow(line) {
  return /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line);
}

/**
 * ファイル内容から最初のMarkdownテーブルを見つけ、
 * { header, rows(配列の配列), startLine, endLine(inclusive), lines(全行) } を返す。
 * 見つからない場合は table: null を返す。
 */
function findTable(content) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length - 1; i++) {
    if (lines[i].trim().startsWith('|') && isSeparatorRow(lines[i + 1])) {
      const header = splitRow(lines[i]);
      let end = i + 1;
      const rows = [];
      for (let j = i + 2; j < lines.length; j++) {
        if (!lines[j].trim().startsWith('|')) break;
        rows.push(splitRow(lines[j]));
        end = j;
      }
      return { header, rows, startLine: i, endLine: end, lines };
    }
  }
  return { header: null, rows: [], startLine: -1, endLine: -1, lines };
}

/** ファイルを読み、テーブルを抽出する。存在しなければ table: null。 */
function readTable(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (_err) {
    return { header: null, rows: [], startLine: -1, endLine: -1, lines: [] };
  }
  return findTable(content);
}

/**
 * テーブルの行をオブジェクト配列（キー=header）として返す。
 */
function readTableAsObjects(filePath) {
  const { header, rows } = readTable(filePath);
  if (!header) return [];
  return rows.map((r) => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = r[idx] !== undefined ? r[idx] : '';
    });
    return obj;
  });
}

/**
 * 既存ファイルのテーブル末尾に1行追記する。ファイルが存在しない、またはテーブルが
 * 無い場合は、`headerCols`から新規にヘッダー・セパレータを作り、`title`と
 * `description`を冒頭に置いた新規ファイルとして作成する。
 */
function appendRow(filePath, headerCols, rowValues, { title, description } = {}) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (_err) {
    content = '';
  }

  const rowLine = '| ' + rowValues.map((v) => (v === undefined || v === null ? '' : String(v))).join(' | ') + ' |';

  if (!content) {
    const parts = [];
    if (title) parts.push(`# ${title}`, '');
    if (description) parts.push(description, '');
    parts.push('| ' + headerCols.join(' | ') + ' |');
    parts.push('|' + headerCols.map(() => '---').join('|') + '|');
    parts.push(rowLine);
    fs.writeFileSync(filePath, parts.join('\n') + '\n', 'utf-8');
    return;
  }

  const { header, endLine, lines } = findTable(content);
  if (!header) {
    // テーブルが無いファイル（想定外だが安全に追記する）: 末尾にテーブルを新設する。
    const parts = [content.replace(/\n+$/, ''), ''];
    parts.push('| ' + headerCols.join(' | ') + ' |');
    parts.push('|' + headerCols.map(() => '---').join('|') + '|');
    parts.push(rowLine);
    fs.writeFileSync(filePath, parts.join('\n') + '\n', 'utf-8');
    return;
  }

  const newLines = lines.slice(0, endLine + 1).concat([rowLine], lines.slice(endLine + 1));
  fs.writeFileSync(filePath, newLines.join('\n').replace(/\n*$/, '\n'), 'utf-8');
}

module.exports = { findTable, readTable, readTableAsObjects, appendRow, splitRow };
