#!/usr/bin/env node
'use strict';

/**
 * decisions.js（決定ログ機構 共有ライブラリ）
 *
 * 【目的・理由】
 * 決定ログの配置先（`docs/00_プロジェクト管理・ガバナンス/decisions/`）・ファイル名規則
 * （`DL-{4桁}_{タイトルkebab}.md`）・ID採番規則は 02_実行基盤アーキテクチャ 8.1節が定める。
 * `decide`（起票）と `decision-check`（集計）の双方がこの規則を共有する必要があるため、
 * ディレクトリ走査・ID採番ロジックを1箇所に集約する。
 *
 * 【影響範囲】
 * `.claude/skills/decide/scripts/*.js`、`.claude/skills/decision-check/scripts/*.js`。
 *
 * 【前提条件・制約】
 * `DL-0000` はプロセス・オプション専用の予約IDであり（02文書8.7節）、通常の連番採番
 * （`nextDecisionId`）の対象からは除外する。
 *
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
 */

const fs = require('fs');
const path = require('path');
const { parseFrontmatter, stringifyFrontmatter } = require('./frontmatter');

const DECISIONS_DIR_SEGMENTS = ['docs', '00_プロジェクト管理・ガバナンス', 'decisions'];

function decisionsDir(cwd = process.cwd()) {
  return path.join(cwd, ...DECISIONS_DIR_SEGMENTS);
}

/**
 * decisions/ 直下の DL-*.md（contracts/ 等のサブディレクトリは対象外）を全件読み込み、
 * {file, path, data(frontmatter), body} の配列を返す。存在しない場合は空配列。
 */
function listDecisionFiles(cwd = process.cwd()) {
  const dir = decisionsDir(cwd);
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return [];
  }
  const files = entries
    .filter((e) => e.isFile() && /^DL-\d{4}_.*\.md$/.test(e.name))
    .map((e) => e.name)
    .sort();
  return files.map((name) => {
    const full = path.join(dir, name);
    const text = fs.readFileSync(full, 'utf-8');
    const { data, body } = parseFrontmatter(text);
    return { file: name, path: full, data, body };
  });
}

/**
 * 次の決定ID（0000を除く連番、4桁ゼロ埋め文字列。例: "0001"）を算出する。
 * ファイル名から `DL-(\d{4})_` を抽出し、既存の最大値+1を返す。
 */
function nextDecisionId(cwd = process.cwd()) {
  const dir = decisionsDir(cwd);
  let files = [];
  try {
    files = fs.readdirSync(dir);
  } catch (_err) {
    files = [];
  }
  let max = 0;
  for (const f of files) {
    const m = /^DL-(\d{4})_/.exec(f);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n !== 0) max = Math.max(max, n);
    }
  }
  return String(max + 1).padStart(4, '0');
}

function slugify(raw) {
  const base = (raw || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'untitled';
}

/**
 * 【M4追加】機構（`decide` Skill経由ではなくスクリプトから直接）が決定ログを起票する
 * ための最小ヘルパー。`sync-check --force`（02文書10.3節、版1.8）が「差分ゼロ未達での
 * 迂回」を不可逆度「低」の決定として記録する場合など、対話的なヒアリングを介さず
 * 機構が自律的に決定ログを残す必要がある箇所で使う。
 * `decide` Skill本体（`.claude/skills/decide/scripts/new-decision.js`）はユーザー対話・
 * decision-warnings.jsonの消し込みを伴うため、そちらとは別の軽量版として独立させる
 * （対話を伴わない機構発の決定ログという性質が異なるため、共通化はしない）。
 */
function createDecisionFile(cwd, { category, title, slug, content, rationale, irreversibility, irreversibilityReason, disposition, roles = [], lanes = [] }) {
  if (!['高', '中', '低'].includes(irreversibility)) {
    throw new Error('createDecisionFile: irreversibility must be 高|中|低');
  }
  const id = 'DL-' + nextDecisionId(cwd);
  const dir = decisionsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `${id}_${slugify(slug || title)}.md`;
  const filePath = path.join(dir, fileName);
  const fm = {
    決定ID: id,
    決定内容: content,
    不可逆度: irreversibility,
    状態: '確定',
    決定日時: new Date().toISOString(),
    決定者: '機構（自動記録）',
    決定に関与したロール: roles.join(', '),
    影響レーン: lanes.join(', '),
    対象カテゴリ: category || '',
  };
  const body =
    `# ${id}: ${title}\n\n` +
    `## 決定内容\n${content}\n\n` +
    `## 根拠\n${rationale || '(未記載)'}\n\n` +
    `## 不可逆性の理由\n${irreversibilityReason || '(未記載)'}\n\n` +
    `## 覆す場合の扱い\n${disposition || '(01文書4.8節のゾーン別戻りコスト表の該当区分に従う)'}\n`;
  fs.writeFileSync(filePath, stringifyFrontmatter(fm, body), 'utf-8');
  return { id, file: path.relative(cwd, filePath) };
}

module.exports = {
  DECISIONS_DIR_SEGMENTS,
  decisionsDir,
  listDecisionFiles,
  nextDecisionId,
  createDecisionFile,
};
