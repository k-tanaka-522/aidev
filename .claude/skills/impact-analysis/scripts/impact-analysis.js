#!/usr/bin/env node
'use strict';

/**
 * impact-analysis.js（impact-analysis Skill 同梱スクリプト、M5新設）
 *
 * 【目的・理由】
 * 01文書5.2節の影響範囲分析手順を`.claude/lib/impact-analysis.js`のエンジンに委ね、
 * (1) チケット入力の取得（GitHub MCP経由で取得済みのJSON、ローカルticket-store、
 * または個別フラグのいずれか）、(2) 分析結果のCLI出力、(3) 01文書5.2節手順6が求める
 * `00-14_変更管理台帳.md`へのCR起票、を行う薄いラッパーである。
 *
 * 【GitHub MCPとの関係（MUST、タスク指示）】
 * 本スクリプト自体はGitHub MCPを一切呼び出さない（Node子プロセスからMCPツールを直接
 * 呼ぶことはできない）。SKILL.md手順は「GitHub MCPが使える場合、呼び出し元（Claude）が
 * `mcp__github__get_issue`等を呼び、結果を`.claude/lib/ticket-store.js`のスキーマへ変換して
 * `.claude-state/tickets/{id}.json`に保存してから本スクリプトを`--ticket=<id>`で呼ぶ」
 * という手順を定める。MCPが使えない場合は、PM/orchestrateが同じスキーマのJSONを手で
 * 作成する（`--ticket-file`）か、`--title`/`--body`を直接渡す。**MCPの有無で後続処理の
 * コードパスは変わらない**（MCPが無くても成立する設計、タスク指示のとおり）。
 *
 * 【使い方】
 *   node impact-analysis.js --ticket=TICKET-0001 [--mode=mode-b|zone3-hotfix] [--cr]
 *   node impact-analysis.js --ticket-file=/path/to/ticket.json [--mode=...] [--cr]
 *   node impact-analysis.js --title="..." --body="..." --ids=HB-0001,API-0002
 *   node impact-analysis.js --ids=HB-0001 --mode=zone3-hotfix --hotfix-id=ZH-0001
 *
 * 【契約】
 * 対象内（委譲）と判定した（coderの一次判定、PMへ報告）。本ファイル自体はCLI入出力の
 * 薄いラッパーであり判定ロジックを持たないが、呼び出す`analyzeImpact`
 * （`.claude/lib/impact-analysis.js`）が算出する直接影響・連動影響のHB-ID/API-ID集合は、
 * `gate-check/scripts/gate-check.js`の`judge`が`denominatorIds`（01文書6.5節条件6の
 * トレーサビリティ分母）としてそのまま再利用しており、16.6節(a)「分母・分子集計への
 * 関与」に該当する。現時点で`analyzeImpact`を対象とする契約は無い。加えて本ファイルは
 * `--cr`指定時に`.claude/lib/cr-ledger.js`の`registerCr`を呼ぶが、そちらの重複起票防止
 * ロジックについては`cr-ledger.js`のヘッダーコメント【契約】欄を参照（本タスクの
 * 別件・台帳重複蓄積バグ修正で判定済み）。`analyzeImpact`分についてはapp-architectへの
 * 発注として報告する。
 */

const fs = require('fs');
const path = require('path');
const { analyzeImpact } = require('../../../lib/impact-analysis');
const { loadTicket, updateTicket } = require('../../../lib/ticket-store');
const crLedger = require('../../../lib/cr-ledger');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
    else if (/^--[^=]+$/.test(raw)) args[raw.slice(2)] = true;
  }
  return args;
}

function loadInput(cwd, args) {
  let ticket = null;
  if (args.ticket) {
    ticket = loadTicket(args.ticket, cwd);
    if (!ticket) {
      console.error(`[impact-analysis] ticket "${args.ticket}" が .claude-state/tickets/ に見つからない。ticket-triageで先に取り込むこと。`);
    }
  } else if (args['ticket-file']) {
    const p = path.isAbsolute(args['ticket-file']) ? args['ticket-file'] : path.join(cwd, args['ticket-file']);
    try {
      ticket = JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (err) {
      console.error(`[impact-analysis] --ticket-file の読み込みに失敗: ${err.message}`);
    }
  }
  const title = args.title || (ticket && ticket.title) || '';
  const body = args.body || (ticket && ticket.body) || '';
  const explicitIds = args.ids ? args.ids.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return { text: `${title}\n${body}`, explicitIds, ticket };
}

/**
 * 01文書5.2節手順6「分析結果をIssue本文に記録し、00-14変更管理台帳のCRとして紐づける」、
 * および5.5節ルール2「Ticketには対応する変更管理台帳のCR番号を必ず紐づける（MUST）」を
 * 実装する。03文書版1.5・3.2.7節が正本化した列スキーマ（`.claude/lib/cr-ledger.js`）で
 * 起票し、ticket-store側にも書き戻すことで「紐づけ」を双方向にする（00-14→ticket参照
 * だけでなく、ticket→CR番号も追跡できるようにする。これを怠ると5.5節ルール2が文書上のみの
 * 努力目標になり、機構としては半分しか担保できない）。
 */
function registerCr(cwd, { ticket, args, result }) {
  const ticketRef = (ticket && (ticket.id || ticket.github_issue_number)) || args.ticket || args['hotfix-id'] || '(未指定)';
  const direct = result.directImpacts.map((d) => d.hbId).join(', ') || '(なし)';
  const indirect = result.indirectImpacts.map((d) => d.hbId).join(', ') || '(なし)';
  const title = (ticket && ticket.title) || args.title || '(タイトル未指定)';
  const crId = crLedger.registerCr(cwd, {
    origin: crLedger.ORIGIN.MODE_B_IMPACT_ANALYSIS,
    targetIdOrSection: direct,
    content: `[${result.mode}] ${title} / 直接影響=${direct} / 連動影響=${indirect}（回帰テスト対象）`,
    filingAgent: '機構（impact-analysis自動起票）',
    relatedTicket: String(ticketRef),
  });
  if (ticket && ticket.id) {
    updateTicket(ticket.id, { crIds: (ticket.crIds || []).concat([crId]) }, cwd);
  }
  return crId;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const input = loadInput(cwd, args);
  input.mode = args.mode === 'zone3-hotfix' ? 'zone3-hotfix' : 'mode-b';

  const result = analyzeImpact(cwd, input);

  let crId = null;
  if (args.cr) {
    crId = registerCr(cwd, { ticket: input.ticket, args, result });
  }

  const summary = {
    mode: result.mode,
    targetIds: result.targetIds,
    direct: result.directImpacts.map((d) => d.hbId),
    indirect: result.indirectImpacts.map((d) => d.hbId),
    nonFunctionalMatched: result.nonFunctionalImpacts.matched.map((n) => n.nfrId),
    nonFunctionalAllCount: result.nonFunctionalImpacts.allNfrIds.length,
    unresolvedCount: result.unresolved.length,
    crId,
  };

  console.log(
    JSON.stringify(
      {
        status: 'done',
        summary,
        detail: result,
      },
      null,
      2
    )
  );

  if (result.unresolved.length > 0) {
    console.error(`[impact-analysis] unresolved ${result.unresolved.length}件。detail.unresolved を確認し、人手で波及範囲を確認すること（黙って無視しない、MUST）。`);
  }
}

main();
