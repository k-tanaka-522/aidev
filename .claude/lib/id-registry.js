#!/usr/bin/env node
'use strict';

/**
 * id-registry.js（M2共有ライブラリ）
 *
 * 【目的・理由】
 * 02文書10.1節の6種ID体系（SCR/HB/RPT/BAT/API/NFR）はいずれも「連番＋4桁ゼロ埋め」の
 * 採番方式であり（`decisions.js`のDL-ID採番と同型）、採番ロジックが各Skillスクリプトで
 * バラバラだとID重複・欠番の温床になる。走査対象（どのファイル群から最大値を拾うか）だけを
 * 呼び出し側が指定し、採番アルゴリズム自体は本ライブラリに集約する。
 *
 * 【影響範囲】
 * `prototypes/.claude/skills/mockup-generate/scripts/*.js`（SCR-ID/RPT-ID）、
 * `.claude/skills/sync-check/scripts/*.js`（HB-ID/BAT-ID）、
 * `docs/00_.../decisions/contracts/.claude/skills/contract-design/scripts/*.js`（API-ID）。
 *
 * 【前提条件・制約】
 * 4桁ゼロ埋め（`PREFIX-0001`）を既定とする。DL-IDと同じ桁数にすることで、6種ID体系と
 * 決定ログIDの見た目上の区別は接頭辞のみに委ねる（02文書9.1節「本規則の対象外」表）。
 *
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
 */

const fs = require('fs');

/**
 * 与えられた複数のテキスト（ファイル内容の文字列配列）から `${prefix}-(\d+)` を
 * 全て収集し、最大値+1を4桁ゼロ埋め文字列で返す。1件も無ければ "0001"。
 */
function nextIdFromTexts(prefix, texts) {
  const re = new RegExp(`${prefix}-(\\d{3,})`, 'g');
  let max = 0;
  for (const text of texts) {
    if (!text) continue;
    let m;
    while ((m = re.exec(text))) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return String(max + 1).padStart(4, '0');
}

/**
 * ファイルパスの配列を読み込み（存在しないものは無視）、nextIdFromTextsに委ねる。
 */
function nextIdFromFiles(prefix, filePaths) {
  const texts = filePaths.map((p) => {
    try {
      return fs.readFileSync(p, 'utf-8');
    } catch (_err) {
      return '';
    }
  });
  return nextIdFromTexts(prefix, texts);
}

/**
 * ディレクトリ配下の指定拡張子のファイルをすべて読み、nextIdFromTextsに委ねる。
 * ディレクトリが存在しなければ "0001" を返す。
 */
function nextIdFromDir(prefix, dirPath, extFilter) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (_err) {
    return nextIdFromTexts(prefix, []);
  }
  const files = entries
    .filter((e) => e.isFile() && (!extFilter || e.name.endsWith(extFilter)))
    .map((e) => require('path').join(dirPath, e.name));
  return nextIdFromFiles(prefix, files);
}

module.exports = { nextIdFromTexts, nextIdFromFiles, nextIdFromDir };
