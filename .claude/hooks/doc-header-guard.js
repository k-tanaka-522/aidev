#!/usr/bin/env node
'use strict';

/**
 * doc-header-guard.js（M3本実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#4・9.2節、
 * `.claude/skills/doc-style-guide/SKILL.md`（文書ヘッダー仕様、M1実装済み）
 *
 * 【イベント】PostToolUse（Write, `docs/0[2-7]_**/*.md`）
 * 【検知内容】doc-style-guide必須ヘッダーの欠落、`生成区分`フィールドの欠落・不正値。
 *   検査対象は`docs/0[2-7]_**`に限定する（`docs/00`・`decisions/**`・`docs/v2/*`は対象外）。
 * 【動作】exit 2（ブロック）
 *
 * 【PMへの報告事項（設計書間の不整合）】
 * 02文書7.3節#4は`生成区分`の値集合を3値
 * （`実装反映(as-built)`|`事前設計(前倒し)`|`手動作成`）としているが、
 * `doc-style-guide/SKILL.md`（M1実装、03文書8.4節を根拠とする）は4値
 * （上記3値に加えて`実装反映(as-built) - スナップショット版`）を定義している。
 * 02文書7.3節#4の本文は「03文書8.4節と統一」と明記しているにもかかわらず、実際には
 * 03文書側の4値と一致していない（02文書自身の記述が古いまま）。本実装は既に実装済みの
 * `doc-style-guide`（実際に`reverse-doc`系が参照する側）に合わせ、4値を正としてチェックする。
 *
 * 【影響範囲】
 * `docs/0[2-7]_**` 配下の `.md` へのWrite。
 * 【前提条件・制約】
 * - ヘッダーは`decisions/DL-*.md`と同じ`---`区切りのfrontmatter形式であるため
 *   `.claude/lib/frontmatter.js`のパーサーを流用する。
 * - `docs/00`・決定ログ（`docs/00_.../decisions/**`）・`docs/v2`配下は対象外。
 * - settings.json未登録のM3段階では発火しない。動作確認は
 *   `echo '<JSON>' | node doc-header-guard.js` で行う。
 */

const fs = require('fs');
const path = require('path');
const { parseFrontmatter } = require('../lib/frontmatter');

/** doc-style-guideが定める必須ヘッダーフィールド（SKILL.md本文の例に基づく）。 */
const REQUIRED_FIELDS = [
  '文書番号',
  '文書名',
  '版数',
  '作成日',
  '最終更新日',
  '作成者',
  '承認者',
  '分類',
  '準拠規格',
  '生成区分',
];

/**
 * 【PMへの報告事項、上部コメント参照】doc-style-guide/SKILL.mdの実装済み4値を正とする。
 * 02文書7.3節#4本文の3値記載は03文書8.4節との統一が取れていない（設計書間の不整合）。
 */
const VALID_SEISEIKUBUN = [
  '実装反映(as-built)',
  '実装反映(as-built) - スナップショット版',
  '事前設計(前倒し)',
  '手動作成',
];

/**
 * `docs/0[2-7]_**` 配下の `.md` かどうかを判定する。`.claude/lib/path-glob.js` の
 * `matchGlob` は `[2-7]` のような文字クラスに未対応（サポート範囲を`*`/`**`のみに
 * 意図的に絞っている）ため、本フックはこの判定にのみ専用の正規表現を用いる。
 */
function isTargetPath(relPath) {
  return /^docs\/(0[2-7])_[^/]+\/.*\.md$/.test(relPath);
}

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

function main() {
  const payload = readHookPayload();
  const cwd = process.cwd();

  const filePath = payload && payload.tool_input && payload.tool_input.file_path;
  if (!filePath) process.exit(0);

  const absTarget = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const relPath = path.relative(cwd, absTarget).replace(/\\/g, '/');

  if (!isTargetPath(relPath)) {
    process.exit(0);
  }
  // decisions/配下（docs/00配下にしか存在しないはずだが念のため）とdocs/v2は対象外。
  if (/\/decisions\//.test(relPath) || /^docs\/v2\//.test(relPath)) {
    process.exit(0);
  }

  const content =
    (payload.tool_input && payload.tool_input.content) !== undefined
      ? payload.tool_input.content
      : (() => {
          try {
            return fs.readFileSync(absTarget, 'utf-8');
          } catch (_err) {
            return null;
          }
        })();

  if (typeof content !== 'string') {
    console.error(`[doc-header-guard] ${relPath} の内容を取得できませんでした。誤ブロックを避け許可します。`);
    process.exit(0);
  }

  const { data } = parseFrontmatter(content);
  const missing = REQUIRED_FIELDS.filter((f) => !data[f] || String(data[f]).trim() === '');

  if (missing.length > 0) {
    console.error(
      `[doc-header-guard] ${relPath} のヘッダーに必須フィールドが欠落しています: ${missing.join(', ')}` +
        '（doc-style-guide必須ヘッダー、9.2節）。'
    );
    process.exit(2);
  }

  const seiseikubun = String(data['生成区分']).trim();
  if (!VALID_SEISEIKUBUN.includes(seiseikubun)) {
    console.error(
      `[doc-header-guard] ${relPath} の「生成区分」フィールドの値が不正です: "${seiseikubun}"。` +
        `有効な値: ${VALID_SEISEIKUBUN.join(' | ')}（9.2節）。`
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
