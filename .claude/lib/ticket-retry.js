#!/usr/bin/env node
'use strict';

/**
 * ticket-retry.js（M5新設・共有ライブラリ）
 *
 * 【目的・理由】
 * 01文書7.4節「差し戻し上限とHOLDへのエスカレーション」・6.5節「差し戻し回数が3回以下」は
 * ゾーンに限らず全ゲートに適用される（全ゾーン共通、6.5節見出し）。02文書10.2節は
 * ゾーンゲート（GZ0/GZ2/GZ3）の差し戻しカウンタを`.claude/lib/gate-records.js`
 * （`zone-gate-retry.json`）として実装済みだが、**Mode B（Zone4）のチケット単位Gate
 * （12章のフロー図の`gate-check`ステップ）については、差し戻しカウンタの永続化先が
 * 02文書のどの節にも定義されていない**。これは`zone3-hotfix-count.json`（同種の欠落、
 * `zone3-hotfix.js`のコメント参照）と対になる欠落であり、本ライブラリで新規に埋める
 * （PMへ報告）。
 *
 * 【設計判断】
 * Mode BはGitHub Issue/PRが正（02文書12章）であり、新たなMarkdown台帳を作らずGitHub側の
 * ラベル・コメントで差し戻し履歴を追う設計も検討したが、本タスクの制約（GitHub MCPは
 * 接続不安定で実際には叩かない）により、GitHub側に状態を持たせると動作確認ができない。
 * したがって`gate-records.js`と同型の`.claude-state/mode-b-ticket-retry.json`
 * （チケット番号をキーにした差し戻しカウンタ）をローカルの正とし、実際にGitHub運用する
 * 段階になったらIssueのラベル（例: `retry-count:N`）と同期する拡張の余地を残す
 * （15章要検証と同型の未決事項として次段へ申し送る）。
 *
 * 【影響範囲】
 * `.claude/skills/gate-check/scripts/gate-check.js`（`--kind=ticket`）。
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

const TICKET_RETRY_RELATIVE_PATH = path.join('.claude-state', 'mode-b-ticket-retry.json');

function ticketRetryPath(cwd = process.cwd()) {
  return path.join(cwd, TICKET_RETRY_RELATIVE_PATH);
}

function readState(cwd = process.cwd()) {
  try {
    const raw = fs.readFileSync(ticketRetryPath(cwd), 'utf-8');
    const data = JSON.parse(raw);
    if (!data.tickets || typeof data.tickets !== 'object') data.tickets = {};
    return data;
  } catch (_err) {
    return { tickets: {} };
  }
}

function writeState(data, cwd = process.cwd()) {
  const dir = path.join(cwd, '.claude-state');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(ticketRetryPath(cwd), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function getTicketState(ref, cwd = process.cwd()) {
  const data = readState(cwd);
  return data.tickets[ref] || { retryCount: 0, hold: false, heldAt: null };
}

/** 差し戻しを1件記録する（累計+1、3回超過でhold化。01文書7.4節・6.5節条件5）。 */
function recordReturn(ref, cwd = process.cwd()) {
  const data = readState(cwd);
  const t = data.tickets[ref] || { retryCount: 0, hold: false, heldAt: null };
  t.retryCount += 1;
  if (t.retryCount > 3 && !t.hold) {
    t.hold = true;
    t.heldAt = new Date().toISOString();
  }
  data.tickets[ref] = t;
  writeState(data, cwd);
  return t;
}

/** HOLD解除（PM経由のユーザー承認後。gate-records.jsのHOLD解除手順10.2.2節と同型の運用）。 */
function resetHold(ref, cwd = process.cwd()) {
  const data = readState(cwd);
  data.tickets[ref] = { retryCount: 0, hold: false, heldAt: null };
  writeState(data, cwd);
  return data.tickets[ref];
}

module.exports = {
  TICKET_RETRY_RELATIVE_PATH,
  ticketRetryPath,
  readState,
  writeState,
  getTicketState,
  recordReturn,
  resetHold,
};
