#!/usr/bin/env node
'use strict';

/**
 * frontmatter.js（決定ログ機構 共有ライブラリ）
 *
 * 【目的・理由】
 * 決定ログ（`decisions/DL-*.md`）は `decision-check` が `grep` 相当で機械集計できる
 * ことを要求される（docs/v2/02_実行基盤アーキテクチャ.md 8.3節）。本プロジェクトには
 * js-yaml 等の外部依存が導入されていない（package.json 不在）ため、フルスペックの
 * YAML パーサーは使わず、本プロジェクトが実際に使う範囲（フラットな `key: value`
 * 1行ごとのfrontmatter、複数値はカンマ区切り）に限定した軽量パーサーを自前実装する。
 *
 * 【影響範囲】
 * `.claude/skills/decide/scripts/*.js`、`.claude/skills/decision-check/scripts/*.js`、
 * `.claude/lib/decisions.js` から読み込まれる。
 *
 * 【前提条件・制約】
 * - ネスト構造・YAMLの配列記法（`- item`）はサポートしない（決定ログのfrontmatterは
 *   フラットなキーのみで表現できるよう8.4節の書式を設計しているため不要）。
 * - 値に `:` を含む文章（例: 時刻表記）がある場合、キーと値の区切りは最初の `:` とする。
 *
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
 */

const FM_DELIM = /^---\s*$/;

/**
 * Markdown文字列をfrontmatter部分(data)と本文(body)に分割してパースする。
 * frontmatterが無い場合は data={} を返す。
 */
function parseFrontmatter(text) {
  const lines = String(text).split(/\r?\n/);
  if (!FM_DELIM.test(lines[0] || '')) {
    return { data: {}, body: text };
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (FM_DELIM.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end === -1) {
    return { data: {}, body: text };
  }
  const data = {};
  for (const line of lines.slice(1, end)) {
    if (!line.trim()) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key) data[key] = value;
  }
  const body = lines
    .slice(end + 1)
    .join('\n')
    .replace(/^\n+/, '');
  return { data, body };
}

/**
 * data（キー→値の単純なオブジェクト）とbodyから、frontmatter付きMarkdown文字列を組み立てる。
 * キーの出現順は Object.entries の順（呼び出し側が書きたい順にオブジェクトを組む）。
 */
function stringifyFrontmatter(data, body) {
  const lines = ['---'];
  for (const [k, v] of Object.entries(data)) {
    const value = v === undefined || v === null ? '' : String(v);
    lines.push(`${k}: ${value}`);
  }
  lines.push('---', '');
  return lines.join('\n') + (body || '');
}

/**
 * カンマ区切りの値を配列に分割する（前後の空白は除去、空要素は除外）。
 * 決定ログのfrontmatterでは「決定に関与したロール」「対象カテゴリ」「関連HB-ID」等の
 * 複数値フィールドをこの形式で保持する。
 */
function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

module.exports = { parseFrontmatter, stringifyFrontmatter, splitList };
