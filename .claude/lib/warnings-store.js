#!/usr/bin/env node
'use strict';

/**
 * warnings-store.js（決定ログ機構 共有ライブラリ）
 *
 * 【目的・理由】
 * `.claude-state/decision-warnings.json` は段1〜段3（decision-log-guard.js /
 * decision-stop-check.js / task-boundary-guard.js）が書き込み、`decide` が消し込み、
 * `decision-check` が未解消件数を分母計算に組み込む共有状態ファイルである
 * （docs/v2/02_実行基盤アーキテクチャ.md 8.2.5節）。読み書きの実装を1箇所に集約し、
 * 各hook・各Skillスクリプトで書式がずれることを防ぐ。
 *
 * 【影響範囲】
 * `.claude/hooks/decision-log-guard.js`、`.claude/hooks/decision-stop-check.js`、
 * `.claude/hooks/task-boundary-guard.js`、`.claude/skills/decide/scripts/*.js`、
 * `.claude/skills/decision-check/scripts/*.js`。
 *
 * 【前提条件・制約】
 * `cwd` 引数はテスト時に本番リポジトリを汚さず疑似リポジトリ（scratchpad配下）を
 * 対象にできるよう、明示的に渡せるようにしている（既定値は `process.cwd()`）。
 */

const fs = require('fs');
const path = require('path');

const WARNINGS_RELATIVE_PATH = path.join('.claude-state', 'decision-warnings.json');

function warningsPath(cwd) {
  return path.join(cwd, WARNINGS_RELATIVE_PATH);
}

/** decision-warnings.json を読む。存在しない/壊れている場合は空の状態を返す（例外を投げない）。 */
function readWarnings(cwd = process.cwd()) {
  try {
    const raw = fs.readFileSync(warningsPath(cwd), 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.warnings)) data.warnings = [];
    return data;
  } catch (_err) {
    return { warnings: [] };
  }
}

/** decision-warnings.json を書く。`.claude-state/` が無ければ作成する。 */
function writeWarnings(data, cwd = process.cwd()) {
  const dir = path.join(cwd, '.claude-state');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(warningsPath(cwd), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** 既存の警告IDから次の連番（W-{4桁}）を算出する。 */
function nextWarningId(data) {
  let max = 0;
  for (const w of data.warnings) {
    const m = /^W-(\d{4})$/.exec(w.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `W-${String(max + 1).padStart(4, '0')}`;
}

/**
 * 警告を1件追加する。02文書8.2.5節のスキーマ
 * `{id, type, detected_at, path_or_task, resolved, resolved_by}` に、
 * hookごとに必要な追加フィールド（`extra`）をマージして永続化する。
 * 呼び出し側は本関数の戻り値（追加したエントリ）を使ってログ出力する。
 */
function addWarning(data, { type, path_or_task, extra }) {
  const id = nextWarningId(data);
  const entry = Object.assign(
    {
      id,
      type,
      detected_at: new Date().toISOString(),
      path_or_task,
      resolved: false,
      resolved_by: null,
    },
    extra || {}
  );
  data.warnings.push(entry);
  return entry;
}

module.exports = {
  WARNINGS_RELATIVE_PATH,
  warningsPath,
  readWarnings,
  writeWarnings,
  nextWarningId,
  addWarning,
};
