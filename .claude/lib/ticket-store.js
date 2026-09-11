#!/usr/bin/env node
'use strict';

/**
 * ticket-store.js（M5新設・共有ライブラリ）
 *
 * 【目的・理由】
 * 02文書12章は「チケット = GitHub Issue、リリース単位 = PR」を正と定める。しかし本タスクの
 * 制約により、GitHub MCPサーバーは接続が不安定なため実際にAPIを叩かない前提で実装する
 * （PMからのタスク指示）。`ticket-triage`・`impact-analysis`・`gate-check --kind=ticket`は
 * いずれも「Issue/PRの構造化データ」を入力として要求するが、その取得経路（GitHub MCP経由か
 * ローカル代替か）を意識せず処理できるようにするため、**入力の正規形（下記スキーマ）を
 * 1箇所に集約**し、GitHub MCPが使える場合はSKILL.md側の手順でMCP呼び出し結果をこの正規形に
 * 変換してファイル化し、使えない場合は人手（PM/orchestrate）がこの正規形のJSONを直接
 * 作成する、という2経路が同じ後続処理（本ライブラリ以降のスクリプト）に合流する設計とする。
 *
 * 【スキーマ】
 * Issue（チケット）: `.claude-state/tickets/{TICKET-ID}.json`
 * ```json
 * {
 *   "id": "TICKET-0001",
 *   "source": "github" | "local",
 *   "github_issue_number": 42,
 *   "title": "...",
 *   "body": "...",
 *   "labels": ["bug", "zone3-hotfix"],
 *   "created_at": "2026-09-11T10:00:00Z",
 *   "state": "open" | "triaged" | "in-progress" | "in-review" | "closed"
 * }
 * ```
 * PR（リリース単位）: `.claude-state/prs/{PR-ID}.json`
 * ```json
 * {
 *   "id": "PR-0001",
 *   "source": "github" | "local",
 *   "github_pr_number": 7,
 *   "ticket_id": "TICKET-0001",
 *   "title": "...",
 *   "changed_files": ["src/backend/..."],
 *   "ci_status": "pending" | "success" | "failure",
 *   "review_status": "pending" | "approved" | "changes_requested",
 *   "state": "open" | "merged" | "closed"
 * }
 * ```
 *
 * 【影響範囲】
 * `.claude/skills/ticket-triage/scripts/ticket-triage.js`、
 * `.claude/skills/impact-analysis/scripts/impact-analysis.js`、
 * `.claude/skills/gate-check/scripts/gate-check.js`（`--kind=ticket`）。
 *
 * 【前提条件・制約】
 * GitHub MCPを実際に呼び出す処理はここには含めない（呼び出し可否の判断・呼び出し自体は
 * 各SKILL.mdの手順としてClaude本体が行う。Node子プロセスからMCPツールを呼ぶことはできない
 * ため、「GitHub MCP連携」は『SKILL.mdの手順としてMCPツール呼び出しを試み、結果を本スキーマの
 * JSONへ変換してから本ライブラリ以降の処理に渡す』という設計で表現する）。
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

function ticketsDir(cwd = process.cwd()) {
  return path.join(cwd, '.claude-state', 'tickets');
}

function prsDir(cwd = process.cwd()) {
  return path.join(cwd, '.claude-state', 'prs');
}

function ticketPath(id, cwd = process.cwd()) {
  return path.join(ticketsDir(cwd), `${id}.json`);
}

function prPath(id, cwd = process.cwd()) {
  return path.join(prsDir(cwd), `${id}.json`);
}

function nextLocalId(prefix, dir) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir);
  } catch (_err) {
    entries = [];
  }
  let max = 0;
  const re = new RegExp(`^${prefix}-(\\d{4})\\.json$`);
  for (const e of entries) {
    const m = re.exec(e);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

/** チケット(Issue代替)を保存する。`id`未指定時は`TICKET-{4桁}`を自動採番する。 */
function saveTicket(ticket, cwd = process.cwd()) {
  const dir = ticketsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const id = ticket.id || nextLocalId('TICKET', dir);
  const data = Object.assign({ id, source: 'local', labels: [], state: 'open' }, ticket, { id });
  fs.writeFileSync(ticketPath(id, cwd), JSON.stringify(data, null, 2) + '\n', 'utf-8');
  return data;
}

function loadTicket(id, cwd = process.cwd()) {
  try {
    return JSON.parse(fs.readFileSync(ticketPath(id, cwd), 'utf-8'));
  } catch (_err) {
    return null;
  }
}

function listTickets(cwd = process.cwd()) {
  let entries = [];
  try {
    entries = fs.readdirSync(ticketsDir(cwd));
  } catch (_err) {
    return [];
  }
  return entries
    .filter((e) => e.endsWith('.json'))
    .map((e) => JSON.parse(fs.readFileSync(path.join(ticketsDir(cwd), e), 'utf-8')));
}

function updateTicket(id, patch, cwd = process.cwd()) {
  const current = loadTicket(id, cwd) || { id };
  const merged = Object.assign({}, current, patch, { id });
  fs.writeFileSync(ticketPath(id, cwd), JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  return merged;
}

/** PR(リリース単位代替)を保存する。`id`未指定時は`PR-{4桁}`を自動採番する。 */
function savePr(pr, cwd = process.cwd()) {
  const dir = prsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const id = pr.id || nextLocalId('PR', dir);
  const data = Object.assign(
    { id, source: 'local', changed_files: [], ci_status: 'pending', review_status: 'pending', state: 'open' },
    pr,
    { id }
  );
  fs.writeFileSync(prPath(id, cwd), JSON.stringify(data, null, 2) + '\n', 'utf-8');
  return data;
}

function loadPr(id, cwd = process.cwd()) {
  try {
    return JSON.parse(fs.readFileSync(prPath(id, cwd), 'utf-8'));
  } catch (_err) {
    return null;
  }
}

function updatePr(id, patch, cwd = process.cwd()) {
  const current = loadPr(id, cwd) || { id };
  const merged = Object.assign({}, current, patch, { id });
  fs.writeFileSync(prPath(id, cwd), JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  return merged;
}

module.exports = {
  ticketsDir,
  prsDir,
  ticketPath,
  prPath,
  saveTicket,
  loadTicket,
  listTickets,
  updateTicket,
  savePr,
  loadPr,
  updatePr,
};
