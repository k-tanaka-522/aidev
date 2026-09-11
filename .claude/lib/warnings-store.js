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
 *
 * 【M-dup調査（重複蓄積バグ、PMからの委譲）】
 * `.claude/lib/issue-ledger.js`（00-13）の重複蓄積バグを受け、`addWarning`の呼び出し元
 * 3箇所（`decision-log-guard.js`・`decision-stop-check.js`・`task-boundary-guard.js`）を
 * 確認した。`decision-stop-check.js`は元から`existingUnresolvedPaths`で未解消の同一パスを
 * 除外してから`addWarning`を呼んでおり重複しない。`task-boundary-guard.js`は
 * `path_or_task`に`agentType`（例: "coder"）を使っており、これはTask呼び出しのたびに
 * 異なりうる`task_summary`/`agent_id`を持つ**別々の事象**を束ねる識別子に過ぎない。
 * 同じ`agentType`で決定ブロックを書き忘れる違反が2回起きた場合、それは同じ問題の
 * 重複検出ではなく**別々の違反**であるため、ここでの重複除去は行わない（issue-ledger.js
 * の「同じ検出の再登録を防ぐ」とは異なる性質。誤ってdedupすると2回目以降の違反が
 * 記録から消え、後退になる）。
 * 一方`decision-log-guard.js`は、同一ファイルへの複数回のEdit呼び出し（1つの変更を
 * 完成させる過程でありがちな挙動）のたびに無条件で`addWarning`しており、`decision-check`
 * の8.3節分母計算（8.2.5節）に使われる未解消件数を同一原因のまま水増しする、
 * issue-ledger.jsと同型の重複蓄積バグだった。呼び出し元（`decision-log-guard.js`）側で
 * 是正した（`findUnresolvedWarning`を新設し、同一`type`・同一`path_or_task`の未解消
 * 警告が既にあれば`addWarning`を呼ばない）。`addWarning`自体は3者で意味が異なる
 * `path_or_task`を扱う共通APIであるため、ライブラリ側で一律にdedupを強制せず、
 * 呼び出し元がオプトインする方式とした（`task-boundary-guard.js`の挙動を変えないため）。
 *
 * 【契約】
 * 対象外と判定した（coderの一次判定、PMへ報告）。本ファイル自体（`addWarning`等の
 * 読み書きプリミティブ）はGate判定の分母・分子計算を行わない。分母計算
 * （`.claude/skills/decision-check/scripts/check.js`が`unresolved.length`を数え、
 * `.claude/lib/zone-gate.js`がそれをGZ0判定の理由に使う）は呼び出し側の責務であり、
 * 既に登録済みの契約群と同様の観点で16.6節に該当しうるのは
 * `decision-check`/`zone-gate.js`側である（本ファイルのAPI自体はブラックボックスの
 * 入出力として素直で、既知のサイレント故障パターンには該当しない）。M7（16.9節）時点では
 * 既存の登録済み契約4件（`.claude/contracts/MANIFEST.json`参照）のみが契約化済みである。
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

/**
 * 同一`type`・同一`path_or_task`で`resolved: false`の既存エントリを探す（重複登録防止、
 * M-dup新設）。呼び出し側がオプトインして使うヘルパーであり、`addWarning`自体はこれを
 * 内部で呼ばない（上記ヘッダーコメント【M-dup調査】参照。呼び出し元ごとに`path_or_task`の
 * 意味が異なり、一律のdedupは`task-boundary-guard.js`の挙動を誤って変えてしまうため）。
 * 見つからなければ`undefined`を返す。
 */
function findUnresolvedWarning(data, { type, path_or_task }) {
  return data.warnings.find((w) => w.type === type && w.path_or_task === path_or_task && !w.resolved);
}

module.exports = {
  WARNINGS_RELATIVE_PATH,
  warningsPath,
  readWarnings,
  writeWarnings,
  nextWarningId,
  addWarning,
  findUnresolvedWarning,
};
