#!/usr/bin/env node
'use strict';

/**
 * field-extract.js（M2共有ライブラリ）
 *
 * 【目的・理由】
 * `sync-check`（10.3節）はレーンA（ハリボテHTML）とレーンB（契約モックOpenAPI、または
 * `mockup-extract`が出力する決定ログ内データモデルメモ）を「grepで機械的に突合する」ことを
 * 要求される。02文書10.3節はこれをHTML `<input name="...">` の一覧とOpenAPIの`properties`
 * キー一覧の突合として具体化しており、同一の抽出ロジックを`mockup-generate`（スナップショット
 * 保存用）・`mockup-update`（差分検知用）・`mockup-extract`（データ抽出）・`sync-check`
 * （突合）が共有する必要があるため1箇所に集約する。
 *
 * 【影響範囲】
 * `prototypes/.claude/skills/{mockup-generate,mockup-update,mockup-extract}/scripts/*.js`、
 * `docs/00_.../decisions/contracts/.claude/skills/contract-design/scripts/*.js`、
 * `.claude/skills/sync-check/scripts/*.js`。
 *
 * 【前提条件・制約】
 * - フルスペックのHTMLパーサー/YAMLパーサーは使わない（`frontmatter.js`と同じ判断。
 *   package.json不在でjs-yaml等の外部依存が導入されていないため）。02文書10.3節が
 *   「grepで機械的に抽出する」ことを前提とした設計であるため、正規表現ベースの
 *   軽量抽出で要件を満たせると判断した。
 * - 命名ゆらぎ（snake_case⇔camelCase等）の吸収は`canonicalizeFieldName`が行うが、
 *   意味的対応（同じ概念を異なる語彙で表現している場合）までは検出できない
 *   （02文書10.3節が明記する限界そのもの。15章#3として要検証のまま）。
 *
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
 */

/** HTMLから <input>/<select>/<textarea> の name 属性を抽出する（重複除去、出現順）。 */
function extractHtmlFieldNames(html) {
  const names = [];
  const seen = new Set();
  const re = /<(?:input|select|textarea)\b[^>]*\bname=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      names.push(m[1]);
    }
  }
  return names;
}

/** HTMLから <input> の name→type のマップを抽出する（type省略時は既定 "text"）。 */
function extractHtmlFieldTypes(html) {
  const map = {};
  const re = /<input\b([^>]*)>/gi;
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const nameMatch = /\bname=["']([^"']+)["']/i.exec(attrs);
    if (!nameMatch) continue;
    const typeMatch = /\btype=["']([^"']+)["']/i.exec(attrs);
    map[nameMatch[1]] = typeMatch ? typeMatch[1] : 'text';
  }
  return map;
}

/** HTMLから <a href="..."> と <form action="..."> を画面遷移候補として抽出する。 */
function extractHtmlTransitions(html) {
  const targets = [];
  const seen = new Set();
  const reA = /<a\b[^>]*\bhref=["']([^"'#][^"']*)["'][^>]*>/gi;
  const reForm = /<form\b[^>]*\baction=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = reA.exec(html))) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      targets.push({ type: 'link', target: m[1] });
    }
  }
  while ((m = reForm.exec(html))) {
    if (!seen.has('form:' + m[1])) {
      seen.add('form:' + m[1]);
      targets.push({ type: 'form', target: m[1] });
    }
  }
  return targets;
}

/**
 * OpenAPI（YAML）テキストから operationId の一覧を、出現位置（行番号）とともに抽出する。
 * 既に x-api-id が付与済みかどうかも合わせて返す（直後の行に x-api-id: があるかを確認）。
 */
function extractOperationIds(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const results = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)operationId:\s*(\S+)\s*$/.exec(lines[i]);
    if (!m) continue;
    const indent = m[1];
    const operationId = m[2];
    let apiId = null;
    // operationIdの直後（同一インデント以上が続く限り）にx-api-idがあるか確認する。
    for (let j = i + 1; j < lines.length; j++) {
      const nextIndentMatch = /^(\s*)\S/.exec(lines[j]);
      if (!nextIndentMatch) continue;
      if (nextIndentMatch[1].length < indent.length) break;
      const apiIdMatch = /^\s*x-api-id:\s*(API-\d+)\s*$/.exec(lines[j]);
      if (apiIdMatch) {
        apiId = apiIdMatch[1];
        break;
      }
      if (nextIndentMatch[1].length <= indent.length) break;
    }
    results.push({ operationId, lineIndex: i, indent, apiId });
  }
  return results;
}

/** OpenAPIテキスト中の既存 x-api-id: API-XXXX をすべて抽出する。 */
function extractExistingApiIds(yamlText) {
  const re = /x-api-id:\s*(API-\d+)/g;
  const ids = [];
  let m;
  while ((m = re.exec(yamlText))) ids.push(m[1]);
  return ids;
}

/**
 * OpenAPIテキストから `properties:` ブロック配下のキー一覧を抽出する（インデントベース）。
 * ネストしたproperties（オブジェクト型のプロパティ配下）も再帰的に拾うが、
 * 平坦なフィールド名一覧として返す（02文書10.3節が要求するのはフィールド名突合のみのため、
 * ネスト構造そのものの再現はしない）。
 */
function extractSchemaPropertyNames(yamlText) {
  const lines = yamlText.split(/\r?\n/);
  const names = [];
  const seen = new Set();
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)properties:\s*$/.exec(lines[i]);
    if (!m) continue;
    const baseIndent = m[1].length;
    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (!line.trim()) continue;
      const keyMatch = /^(\s*)([A-Za-z0-9_.\-]+):/.exec(line);
      if (!keyMatch) break;
      const indent = keyMatch[1].length;
      if (indent <= baseIndent) break;
      // properties直下の子キーのみを対象とする（1段深いキーだけ、孫階層はスキップ）。
      if (indent === baseIndent + 2 || indent === baseIndent + 4) {
        const key = keyMatch[2];
        if (!seen.has(key) && !['type', 'format', 'items', 'required', 'description', 'example', 'enum', 'default', 'properties'].includes(key)) {
          seen.add(key);
          names.push(key);
        }
      }
    }
  }
  return names;
}

/** スネークケース・キャメルケース・ケバブケースの表記ゆらぎを吸収した正規形を返す。 */
function canonicalizeFieldName(name) {
  return String(name).toLowerCase().replace(/[_\-\s]/g, '');
}

/**
 * 2つのフィールド名配列を正規化比較し、{ onlyInA, onlyInB, matched } を返す。
 * onlyInA/onlyInBには元表記（正規化前）を格納する。
 */
function diffFieldNames(namesA, namesB) {
  const canonA = new Map(namesA.map((n) => [canonicalizeFieldName(n), n]));
  const canonB = new Map(namesB.map((n) => [canonicalizeFieldName(n), n]));
  const onlyInA = [];
  const onlyInB = [];
  const matched = [];
  for (const [key, orig] of canonA) {
    if (canonB.has(key)) {
      matched.push({ a: orig, b: canonB.get(key) });
    } else {
      onlyInA.push(orig);
    }
  }
  for (const [key, orig] of canonB) {
    if (!canonA.has(key)) onlyInB.push(orig);
  }
  return { onlyInA, onlyInB, matched };
}

/** OpenAPIテキストのoperationId直後にx-api-idを挿入する（in-place文字列編集）。 */
function injectApiId(yamlText, targetOperationId, apiId) {
  const lines = yamlText.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)operationId:\s*(\S+)\s*$/.exec(lines[i]);
    if (m && m[2] === targetOperationId) {
      const indent = m[1];
      lines.splice(i + 1, 0, `${indent}x-api-id: ${apiId}`);
      return lines.join('\n');
    }
  }
  return yamlText;
}

module.exports = {
  extractHtmlFieldNames,
  extractHtmlFieldTypes,
  extractHtmlTransitions,
  extractOperationIds,
  extractExistingApiIds,
  extractSchemaPropertyNames,
  canonicalizeFieldName,
  diffFieldNames,
  injectApiId,
};
