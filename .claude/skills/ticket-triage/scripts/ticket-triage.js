#!/usr/bin/env node
'use strict';

/**
 * ticket-triage.js（ticket-triage Skill 同梱スクリプト、M5新設）
 *
 * 【目的・理由】
 * 02文書12章のMode Bループの入口（`GitHub Issue → ticket-triage → impact-analysis`）、
 * および04文書8.2節が定める運用事象のチケット化判定を機構化する。ヒアリング・LLMの
 * 意味理解に頼らず機械的に判定できる部分（ラベル一致、キーワード一致、現在のゾーン状態）
 * は本スクリプトが決定論的に行い、判定できない部分（04文書8.2節の「07-10-02の
 * ポストモーテム項目で運用上判定する」等、人間の一次対応結果を要する事項）は
 * `needsHumanJudgement: true` として明示し、機構が勝手に断定しない（decision-checkや
 * static-analysisと同じ「わからないことはわからないと言う」原則）。
 *
 * 【GitHub連携】impact-analysis.jsと同じ設計（GitHub MCPをNode子プロセスから直接呼ばない。
 * SKILL.md手順でClaudeがMCP呼び出し結果をticket-store.jsのスキーマへ変換してから
 * 本スクリプトへ渡す。MCP不使用時は--title/--body/--labelsを直接指定する）。
 *
 * 【使い方】
 *   node ticket-triage.js --title="..." --body="..." --labels=bug,critical [--number=42]
 *   node ticket-triage.js --ticket-file=<path>
 *   node ticket-triage.js --ticket=TICKET-0001   # 既存ローカルticketの再判定
 */

const fs = require('fs');
const path = require('path');
const { saveTicket, loadTicket, updateTicket } = require('../../../lib/ticket-store');
const { readZoneState } = require('../../../lib/zone-state');
const { openHotfix } = require('../../../lib/zone3-hotfix');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
    else if (/^--[^=]+$/.test(raw)) args[raw.slice(2)] = true;
  }
  return args;
}

// ラベル一致を最優先し、無ければ日本語/英語キーワードでヒューリスティック分類する
// （04文書8.2節・01文書5章はいずれも分類ロジックの語彙集合を定義していないため、
// 本実装が採用した具体的な語彙集合。PMへ報告）。
const CATEGORY_LABELS = {
  bug: ['bug', 'defect'],
  feature: ['feature', 'enhancement'],
  'tech-debt': ['tech-debt', 'refactor'],
  ops: ['ops', 'incident', 'operations'],
  security: ['security'],
};
const CATEGORY_KEYWORDS = {
  bug: ['不具合', 'バグ', 'エラー', '障害', '直らない', '動かない'],
  feature: ['追加', '新機能', 'したい', '欲しい'],
  'tech-debt': ['リファクタ', '技術的負債', '負債の解消'],
  ops: ['監視', 'アラート', 'インシデント', '問合せ', '問い合わせ'],
  security: ['脆弱性', 'セキュリティ', 'CVE'],
};

const URGENCY_LABELS = { high: ['critical', 'urgent', 'p1'], low: ['low', 'p3'] };
const URGENCY_KEYWORDS = { high: ['緊急', '本番停止', 'すぐに', '至急'] };

const SCALE_LABELS = {
  large: ['new-tenant', 'architecture-change', 'new-external-system', 'new-nfr-category', 'breaking-change'],
  minor: ['trivial', 'minor', 'typo', 'copy-change'],
};
// 01文書3.4節の基準（表）に対応するキーワード。完全な判定はimpact-analysis実行後の
// 「影響範囲がトレーサビリティマトリクスの1領域を跨ぐか」次第であり、本スクリプト単独では
// 確定できない（後述のnotesで明示する）。
const SCALE_KEYWORDS_LARGE = ['新規テナント', '新規契約形態', 'プラン階層', '非同期ジョブ化', 'アーキテクチャ', '新しい認証方式', '新しい法規制'];

function matchLabel(labels, table) {
  const lower = (labels || []).map((l) => String(l).toLowerCase());
  for (const [key, candidates] of Object.entries(table)) {
    if (candidates.some((c) => lower.includes(c))) return key;
  }
  return null;
}

function matchKeyword(text, table) {
  for (const [key, candidates] of Object.entries(table)) {
    if (candidates.some((c) => text.includes(c))) return key;
  }
  return null;
}

function classify(ticket) {
  const labels = ticket.labels || [];
  const text = `${ticket.title || ''}\n${ticket.body || ''}`;

  const category = matchLabel(labels, CATEGORY_LABELS) || matchKeyword(text, CATEGORY_KEYWORDS) || 'unclassified';
  const urgency = matchLabel(labels, URGENCY_LABELS) || matchKeyword(text, URGENCY_KEYWORDS) || 'normal';
  let scale = matchLabel(labels, SCALE_LABELS);
  if (!scale) {
    scale = SCALE_KEYWORDS_LARGE.some((k) => text.includes(k)) ? 'large' : 'normal';
  }

  let opsClassification = null;
  if (category === 'ops') {
    // 04文書8.2節の3区分。ラベルによる明示指定を優先し、無ければキーワードで暫定判定する。
    // 「07-10/07-20の手順どおりで収束するか」は一次対応の実施結果次第であり、
    // 本スクリプト単独では断定できないため、いずれにも該当しなければ
    // needsHumanJudgement とする（MUST、断定しない）。
    if (labels.includes('runbook-resolved') || text.includes('手順どおり')) {
      opsClassification = { decision: 'no-ticket', reason: '07-10/07-20の手順どおりの対応で収束（恒久変更なし）。07-30-01への記録のみ。' };
    } else if (labels.includes('permanent-fix-needed') || /恒久|再発防止|設計変更/.test(text)) {
      opsClassification = { decision: 'ticketize', reason: '恒久対応（設計変更・実装変更）を要すると判定。' };
    } else if (labels.includes('needs-business-decision') || /事業判断|エスカレーション/.test(text)) {
      opsClassification = { decision: 'escalate-hold', reason: '一次対応で収束せず事業判断を要する。PM経由でユーザーに確認。' };
    } else {
      opsClassification = {
        decision: 'needs-human-judgement',
        reason: '04文書8.2節: 「再発防止策が設計・実装変更を含むか」は07-10-02ポストモーテム項目での人間判定が前提のため、機構だけでは断定しない。',
      };
    }
  }

  return { category, urgency, scale, opsClassification };
}

function determineRoute(cwd, classification) {
  const zoneState = readZoneState(cwd);
  if (classification.opsClassification && classification.opsClassification.decision === 'no-ticket') {
    return { route: 'no-ticket', zoneState };
  }
  if (classification.opsClassification && classification.opsClassification.decision === 'escalate-hold') {
    return { route: 'hold', zoneState };
  }
  if (zoneState.zone3_hotfix_active) {
    return { route: 'zone3-hotfix', zoneState };
  }
  if (zoneState.zone === 4) {
    return { route: 'mode-b', zoneState };
  }
  // 01文書3.1節・3.2節: Mode AとMode Bは排他。GZ3のGO前にticket-triageが呼ばれることは
  // 本来想定されない（Zone3期間中の運用事象は04文書8.1節によりZone3内ミニチケット経路へ
  // 誘導されるはずである）。想定外の状態としてneeds-human-judgementで返す。
  return { route: 'unexpected-zone', zoneState };
}

function buildNextStep(route, ticketId, hotfixId) {
  if (route === 'zone3-hotfix') {
    return `node .claude/skills/impact-analysis/scripts/impact-analysis.js --ticket=${ticketId} --mode=zone3-hotfix --hotfix-id=${hotfixId}`;
  }
  if (route === 'mode-b') {
    return `node .claude/skills/impact-analysis/scripts/impact-analysis.js --ticket=${ticketId} --mode=mode-b --cr`;
  }
  if (route === 'no-ticket') {
    return '(チケット化しない。07-30-01_インシデント記録への記録のみでクローズしてよい)';
  }
  if (route === 'hold') {
    return '(PM経由でユーザーに確認。01文書3.5節・4.8節)';
  }
  return '(orchestrateへ状態を報告し、Mode B開始状況を確認すること)';
}

function loadTicketFromArgs(cwd, args) {
  if (args.ticket) {
    const t = loadTicket(args.ticket, cwd);
    if (!t) throw new Error(`ticket "${args.ticket}" が見つからない`);
    return t;
  }
  let base = {};
  if (args['ticket-file']) {
    const p = path.isAbsolute(args['ticket-file']) ? args['ticket-file'] : path.join(cwd, args['ticket-file']);
    base = JSON.parse(fs.readFileSync(p, 'utf-8'));
  }
  const ticket = Object.assign(
    {
      title: args.title || base.title || '',
      body: args.body || base.body || '',
      labels: args.labels ? args.labels.split(',').map((s) => s.trim()) : base.labels || [],
      github_issue_number: args.number ? Number(args.number) : base.github_issue_number,
      source: base.source || (args.number ? 'github' : 'local'),
    },
    base.id ? { id: base.id } : {}
  );
  return saveTicket(ticket, cwd);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const ticket = loadTicketFromArgs(cwd, args);

  const classification = classify(ticket);
  const { route, zoneState } = determineRoute(cwd, classification);

  let hotfixId = null;
  if (route === 'zone3-hotfix') {
    hotfixId = openHotfix(cwd);
  }

  const nextStep = buildNextStep(route, ticket.id, hotfixId);

  const result = {
    ticketId: ticket.id,
    classification,
    route,
    zoneSnapshot: { zone: zoneState.zone, zone3_hotfix_active: zoneState.zone3_hotfix_active },
    hotfixId,
    nextStep,
    largeScaleCaveat:
      classification.scale === 'large'
        ? '01文書3.4節の基準に該当する可能性がある。特に基準4（影響範囲がトレーサビリティマトリクスの1領域を跨ぐか）はimpact-analysis実行後でないと確定できないため、Zone1退避の要否はimpact-analysis結果を踏まえて人手で最終判断すること（MUST、本スクリプトはキーワード一致による一次判定に留まる）。'
        : null,
    changeScaleLoop:
      classification.scale === 'minor'
        ? 'Execute → Review → Gate（Plan/Reverse/Guard省略可、01文書6.4節）'
        : classification.scale === 'large'
        ? 'Zone1へ退避しフルループ適用（01文書3.4節・6.4節）'
        : 'Plan → Execute → Guard → Review → Gate（Reverseは影響文書がある場合のみ、01文書6.4節）',
  };

  updateTicket(ticket.id, { state: 'triaged', triage: result }, cwd);

  console.log(JSON.stringify({ status: 'done', ticket, result }, null, 2));

  if (classification.opsClassification && classification.opsClassification.decision === 'needs-human-judgement') {
    console.error('[ticket-triage] 運用事象のチケット化判定が機構だけでは確定できない。07-10-02ポストモーテム項目の結果を踏まえ人手で判定すること。');
  }
  if (route === 'unexpected-zone') {
    console.error(`[ticket-triage] 現在のzone=${zoneState.zone}はMode B(zone4)でもZone3内ミニチケット(zone3_hotfix_active)でもない。Mode Bはまだ開始していない可能性がある（01文書3.1節・3.2節、Mode AとMode Bは排他）。`);
  }
}

main();
