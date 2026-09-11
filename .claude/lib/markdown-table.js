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
 *
 * 【M4追加】
 * `00-02_HBトレーサビリティ台帳.md`の「経路追加ログ」（03文書3.2.2節）のように、1ファイルに
 * 見出し（`## 経路追加ログ`）で区切られた2本目以降のテーブルを持つ台帳に対応するため、
 * `findNamedTable`/`appendRowUnderHeading`を追加した。既存の`findTable`/`appendRow`は
 * 「ファイル内最初のテーブル」のみを扱う既存動作のまま変更しない（後方互換）。
 * また、`00-01_成果物構成カタログ.md`のように「同一キーの行を上書き更新する」運用を
 * 要する台帳向けに`upsertRow`を追加した（キー列が一致する既存行があれば置換、無ければ追記）。
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

/**
 * ファイル内容に含まれる**全ての**Markdownテーブルを検出し、出現順の配列で返す
 * （`findTable`は最初の1つのみを返す既存動作のまま変更しない。後方互換のため純粋な
 * 追加関数とする）。
 *
 * 【新設理由（00-01成果物構成カタログの区分別テーブル構成への対応）】
 * `docs/00_.../00-01_成果物構成カタログ.md`（02文書9.4.3節・版1.9の9列スキーマ雛形、
 * 03文書3章）は「00_プロジェクト管理・ガバナンス」「02_要件定義」…「07_運用・保守」の
 * 区分ごとに`##`見出しで区切られた**複数のテーブル**から成る（1ファイル1テーブルではない）。
 * `readTableAsObjects`（`findTable`ベース）は最初のテーブル（00区分）しか読めず、
 * `.claude/lib/reverse-common.js`の`readCatalog`がこれをそのまま使うと、02〜07区分の行が
 * 常に読み落とされ、`checkCatalogSection`の`totalRows`が0になる（実測確認・PMへ報告）。
 * 本関数はファイル全体を走査してこの問題を解消する。
 */
function findAllTables(content) {
  const lines = content.split(/\r?\n/);
  const tables = [];
  let i = 0;
  while (i < lines.length - 1) {
    if (lines[i].trim().startsWith('|') && isSeparatorRow(lines[i + 1])) {
      const header = splitRow(lines[i]);
      let end = i + 1;
      const rows = [];
      for (let j = i + 2; j < lines.length; j++) {
        if (!lines[j].trim().startsWith('|')) break;
        rows.push(splitRow(lines[j]));
        end = j;
      }
      tables.push({ header, rows, startLine: i, endLine: end });
      i = end + 1;
    } else {
      i += 1;
    }
  }
  return tables;
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

/**
 * `heading`（例: "## 経路追加ログ"）の行以降に現れる最初のテーブルを見つける。
 * 見出し自体が無ければ `headingIndex: -1` を返す。見出しはあるがテーブルが無い場合は
 * `header: null, headingIndex: (見出し行番号)` を返す。
 */
function findNamedTable(content, heading) {
  const lines = content.split(/\r?\n/);
  const headingIndex = lines.findIndex((l) => l.trim() === heading.trim());
  if (headingIndex === -1) {
    return { header: null, rows: [], startLine: -1, endLine: -1, lines, headingIndex: -1 };
  }
  for (let i = headingIndex + 1; i < lines.length - 1; i++) {
    if (lines[i].trim().startsWith('|') && isSeparatorRow(lines[i + 1])) {
      const header = splitRow(lines[i]);
      let end = i + 1;
      const rows = [];
      for (let j = i + 2; j < lines.length; j++) {
        if (!lines[j].trim().startsWith('|')) break;
        rows.push(splitRow(lines[j]));
        end = j;
      }
      return { header, rows, startLine: i, endLine: end, lines, headingIndex };
    }
  }
  return { header: null, rows: [], startLine: -1, endLine: -1, lines, headingIndex };
}

/**
 * `heading`配下のテーブルに1行追記する。見出し自体が無ければファイル末尾に
 * 見出し＋テーブルを新設する。見出しはあるがテーブルがまだ無ければ見出し直後に新設する。
 */
function appendRowUnderHeading(filePath, heading, headerCols, rowValues, { description } = {}) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (_err) {
    content = '';
  }
  const rowLine = '| ' + rowValues.map((v) => (v === undefined || v === null ? '' : String(v))).join(' | ') + ' |';
  const found = findNamedTable(content, heading);

  if (found.headingIndex === -1) {
    const parts = [content.replace(/\n+$/, ''), '', heading, ''];
    if (description) parts.push(description, '');
    parts.push('| ' + headerCols.join(' | ') + ' |');
    parts.push('|' + headerCols.map(() => '---').join('|') + '|');
    parts.push(rowLine);
    fs.writeFileSync(filePath, parts.join('\n').replace(/^\n+/, '') + '\n', 'utf-8');
    return;
  }

  if (!found.header) {
    const insertAt = found.headingIndex + 1;
    const inserted = ['', '| ' + headerCols.join(' | ') + ' |', '|' + headerCols.map(() => '---').join('|') + '|', rowLine];
    const newLines = found.lines.slice(0, insertAt).concat(inserted, found.lines.slice(insertAt));
    fs.writeFileSync(filePath, newLines.join('\n').replace(/\n*$/, '\n'), 'utf-8');
    return;
  }

  const newLines = found.lines
    .slice(0, found.endLine + 1)
    .concat([rowLine], found.lines.slice(found.endLine + 1));
  fs.writeFileSync(filePath, newLines.join('\n').replace(/\n*$/, '\n'), 'utf-8');
}

/**
 * ファイル内最初のテーブルに対し、`keyCol`の値が`keyValue`と一致する既存行を置換するか
 * （無ければ）末尾に追記する。`docs/00_.../00-01_成果物構成カタログ.md`のように
 * 「生成主体が自身の担当行を都度更新する」運用（03文書8.1節）を持つ台帳向け。
 * 台帳・ファイルが存在しない場合は`appendRow`と同じ挙動で新規作成する。
 */
function upsertRow(filePath, headerCols, keyCol, keyValue, rowValues, { title, description } = {}) {
  let content = '';
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch (_err) {
    content = '';
  }
  if (!content) {
    appendRow(filePath, headerCols, rowValues, { title, description });
    return;
  }
  const { header, rows, startLine, endLine, lines } = findTable(content);
  if (!header) {
    appendRow(filePath, headerCols, rowValues, { title, description });
    return;
  }
  const keyIdx = header.indexOf(keyCol);
  if (keyIdx === -1) {
    appendRow(filePath, headerCols, rowValues, { title, description });
    return;
  }
  const newRowLine = '| ' + rowValues.map((v) => (v === undefined || v === null ? '' : String(v))).join(' | ') + ' |';
  const existingIdx = rows.findIndex((r) => r[keyIdx] === keyValue);
  const bodyLines = lines.slice(startLine + 2, endLine + 1);
  if (existingIdx === -1) {
    bodyLines.push(newRowLine);
  } else {
    bodyLines[existingIdx] = newRowLine;
  }
  const newLines = lines.slice(0, startLine + 2).concat(bodyLines, lines.slice(endLine + 1));
  fs.writeFileSync(filePath, newLines.join('\n').replace(/\n*$/, '\n'), 'utf-8');
}

module.exports = {
  findTable,
  findAllTables,
  readTable,
  readTableAsObjects,
  appendRow,
  splitRow,
  findNamedTable,
  appendRowUnderHeading,
  upsertRow,
};
