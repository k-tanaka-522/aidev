#!/usr/bin/env node
'use strict';

/**
 * gate-check.js（gate-check Skill 同梱スクリプト、M5新設）
 *
 * 【目的・理由】
 * `gate-check`本体（GO/NG/HOLD判定ロジック）は、SKILL.mdのコメントが示すとおりM0以来
 * `<!-- M3で実装 -->`のまま残っていた（M3は実際にはHooks/Permissions強制層の実装が
 * スコープであり、gate-checkのGO/NG/HOLD判定本体を実装するマイルストーンがどこにも
 * 割り当てられていなかった、という段階移行計画自体の抜け。02文書14.2節参照）。
 * `GZ0`/`GZ2`/`GZ3`（ゾーンゲート、Mode A側）のフル実装はこの抜けを引き継いだまま
 * 未実装であり、**本タスク（M5）の委譲範囲外**として着手しない（PMへ報告）。
 * 一方、Mode B（`--kind=ticket`）とZone3内ミニチケット（`--kind=zone3-hotfix`）の
 * Gateは02文書12章・10.4節がM5の実装対象として明記しているため、本スクリプトは
 * この2種類のみを実装する。
 *
 * 【判定条件（01文書6.5節「Gate判定基準（全ゾーン共通）」を準用）】
 * 1. Critical/High指摘が0件（`--findings`で読み込むJSON。review-dispatchが未実装のため
 *    現時点は人手/暫定レビュー結果を渡す運用とする。デフォルトは全0扱いとし、その旨を
 *    出力に明記する。「レビューをしていないのにGOにする」ことを隠さないため）
 * 2. 全Guardがpass（同上、`--findings`の`guardPass`フィールド。既定true）
 * 3. トレーサビリティの充足（回帰テスト、01文書5.2節「連動影響」のテストID再実行）:
 *    分母 = 直接影響+連動影響のHB-ID/API-ID（`impact-analysis`エンジンを再計算して取得）、
 *    分子 = tests/e2e・tests/integrationのdocblockに当該IDが記載されている件数
 *    （`skip`/`fixme`は分子に数えない、01文書6.5節）
 * 4. 分母-分子の差分は`00-12_リスク管理台帳.md`のdefer登録件数と一致していること
 *    （簡易チェック: 台帳本文に当該IDが含まれるかのgrep相当）
 * 5. 差し戻し回数が3回以下（`--kind=ticket`は`.claude/lib/ticket-retry.js`、
 *    `--kind=zone3-hotfix`は`.claude/lib/zone3-hotfix.js`。02文書10.4節「累積対象外」の
 *    原則どおり両者は完全に独立したカウンタである）
 *
 * 【使い方】
 *   node gate-check.js --kind=ticket --ref=TICKET-0001 [--ticket=TICKET-0001] [--ids=HB-0001,...] \
 *     [--findings=<path to {critical,high,guardPass}.json>]
 *   node gate-check.js --kind=zone3-hotfix --ref=ZH-0001 --ids=HB-0002 [--findings=...]
 */

const fs = require('fs');
const path = require('path');
const { analyzeImpact } = require('../../../lib/impact-analysis');
const { loadTicket } = require('../../../lib/ticket-store');
const { scanE2eHbLinks, scanIntegrationApiLinks, filterExecutable } = require('../../../lib/static-analysis');
const ticketRetry = require('../../../lib/ticket-retry');
const zone3Hotfix = require('../../../lib/zone3-hotfix');
const { ledger0012Path } = require('../../../lib/ledger-paths');
const { registerIssue, KIND } = require('../../../lib/issue-ledger');
const { resetHold, computeNextRetryState } = require('../../../lib/gate-records');
const { judgeZoneGate } = require('../../../lib/zone-gate');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
    else if (/^--[^=]+$/.test(raw)) args[raw.slice(2)] = true;
  }
  return args;
}

function readFindings(cwd, args) {
  const defaults = { critical: 0, high: 0, guardPass: true, source: 'default(未レビュー扱い)' };
  if (!args.findings) return defaults;
  try {
    const p = path.isAbsolute(args.findings) ? args.findings : path.join(cwd, args.findings);
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    return Object.assign({}, defaults, data, { source: args.findings });
  } catch (err) {
    return Object.assign({}, defaults, { source: `読み込み失敗(${err.message})、既定値使用` });
  }
}

/**
 * 分母IDに対する分子（テストdocblock記載件数）を数える。skip/fixme・握りつぶしは除外する
 * （01文書6.5節。本タスクで`filterExecutable`によるskip/fixme検知を`static-analysis.js`に
 * 新設し、本関数のコメントが元々主張していた「除外する」を実際に実装した。旧実装は
 * コメントのみでこの除外を行っていなかったバグであり、本タスクで是正した。PMへ報告する）。
 */
function countTestCoverage(cwd, ids) {
  const e2e = filterExecutable(scanE2eHbLinks(cwd));
  const it = filterExecutable(scanIntegrationApiLinks(cwd));
  const covered = [];
  const uncovered = [];
  for (const id of ids) {
    const prefix = id.split('-')[0];
    let hit = false;
    if (prefix === 'HB') hit = e2e.some((l) => l.hbId === id);
    else if (prefix === 'API') hit = it.some((l) => l.apiId === id);
    if (hit) covered.push(id);
    else uncovered.push(id);
  }
  return { covered, uncovered };
}

function findDeferred(cwd, ids) {
  let text = '';
  try {
    text = fs.readFileSync(ledger0012Path(cwd), 'utf-8');
  } catch (_err) {
    return [];
  }
  return ids.filter((id) => text.includes(id));
}

function computeImpact(cwd, args, mode) {
  let text = '';
  let ticket = null;
  if (args.ticket) {
    ticket = loadTicket(args.ticket, cwd);
    if (ticket) text = `${ticket.title || ''}\n${ticket.body || ''}`;
  }
  const explicitIds = args.ids ? args.ids.split(',').map((s) => s.trim()).filter(Boolean) : [];
  return analyzeImpact(cwd, { text, explicitIds, mode });
}

/**
 * `dryRun`（本タスクで新設。読み取り専用モード）: `true`の場合、判定は通常どおり行うが
 * `ticketRetry.recordReturn`/`zone3Hotfix.recordReturn`（差し戻しカウンタの永続化）・
 * `registerIssue`（00-13への課題登録）を行わない。カウンタの「記録した場合の想定値」は
 * `.claude/lib/gate-records.js`の`computeNextRetryState`（ゾーンゲート側と共用する純粋関数）
 * で副作用なく計算する。詳細は`.claude/lib/zone-gate.js`の`judgeZoneGate`の`dryRun`コメント
 * （同じ設計判断をMode B/Zone3内ミニチケットのGateにも適用したもの）を参照。
 */
function judge(cwd, args, kind, dryRun = false) {
  const mode = kind === 'zone3-hotfix' ? 'zone3-hotfix' : 'mode-b';
  const impact = computeImpact(cwd, args, mode);
  const findings = readFindings(cwd, args);

  const denominatorIds = Array.from(
    new Set([
      ...impact.directImpacts.map((d) => d.hbId),
      ...impact.indirectImpacts.map((d) => d.hbId),
    ])
  ).filter(Boolean);

  const { covered, uncovered } = countTestCoverage(cwd, denominatorIds);
  const deferred = findDeferred(cwd, uncovered);
  const unresolvedGap = uncovered.filter((id) => !deferred.includes(id));

  const ref = args.ref || args.ticket || args['hotfix-id'] || '(未指定)';
  let retryState;
  if (kind === 'zone3-hotfix') {
    retryState = zone3Hotfix.getHotfix(ref, cwd) || { retryCount: 0, hold: false };
  } else {
    retryState = ticketRetry.getTicketState(ref, cwd);
  }

  const reasons = [];
  let ok = true;

  if (findings.critical > 0 || findings.high > 0) {
    ok = false;
    reasons.push(`Critical/High指摘が${findings.critical + findings.high}件ある（01文書6.5節条件1）`);
  }
  if (!findings.guardPass) {
    ok = false;
    reasons.push('Guardがpassしていない（条件2）');
  }
  if (unresolvedGap.length > 0) {
    ok = false;
    reasons.push(
      `トレーサビリティ未充足: ${unresolvedGap.join(', ')} が回帰テストで再確認されておらず、リスク管理台帳へのdefer登録も無い（条件6・条件『分母-分子=defer件数』）`
    );
  }
  if (impact.unresolved.length > 0) {
    reasons.push(`impact-analysisにunresolvedが${impact.unresolved.length}件ある（GOをブロックはしないが人手確認が必要。黙って無視しない）`);
  }

  let judgement;
  let simulatedRetryState;
  if (retryState.hold) {
    judgement = 'HOLD';
    reasons.push('既にHOLD状態（差し戻し3回超過済み）。gate-recordsのHOLD解除手順(10.2.2節)に準じ、PM経由のユーザー承認と決定ログ起票を経てリセットすること。');
  } else if (ok) {
    judgement = 'GO';
  } else {
    const after = dryRun
      ? computeNextRetryState(retryState)
      : kind === 'zone3-hotfix'
        ? zone3Hotfix.recordReturn(ref, cwd)
        : ticketRetry.recordReturn(ref, cwd);
    if (dryRun) simulatedRetryState = after;
    judgement = after.hold ? 'HOLD' : 'NG';
    if (after.hold) {
      reasons.push(
        `今回の差し戻し${dryRun ? '（--dry-run: シミュレーション）' : ''}で3回を超過したためHOLDに遷移した（01文書7.4節）。`
      );
      if (!dryRun) {
        // 03文書3.2.6節「差し戻し（要注意）・HOLD対応」: HOLD発生時、GZ系ゲート記録
        // （GZ{0,2,3}-99、本kindには存在しない）とは別に、解消作業を追跡する課題として
        // 00-13へ起票する（MUST）。二重登録を避けるため、hold未設定→設定に遷移した
        // このタイミングでのみ登録する（既にhold状態での再判定時は登録しない）。
        const issId = registerIssue(cwd, {
          kind: KIND.RETURN_OR_HOLD,
          detectedBy: `gate-check --kind=${kind}`,
          content: `${kind === 'zone3-hotfix' ? 'Zone3内ミニチケット' : 'Mode Bチケット'}のGateが差し戻し3回超過によりHOLDした（ref=${ref}）。01文書7.4節・6.5節条件5に基づく。解消は本kindでのHOLD解除運用（PM経由のユーザー承認、決定ログ起票）による（10.2.2節のGZ向け手順を準用）。`,
          relatedIds: ref,
        });
        reasons.push(`00-13へ課題登録した（${issId}）。`);
      } else {
        reasons.push('（--dry-run: 00-13課題管理表への登録は行っていない）');
      }
    }
    if (dryRun) {
      reasons.push(
        `（--dry-run: 差し戻しカウンタ(${
          kind === 'zone3-hotfix' ? 'zone3-hotfix-count.json' : 'mode-b-ticket-retry.json'
        })の更新は行っていない。実行前=${retryState.retryCount}回、記録した場合の想定値=${after.retryCount}回）`
      );
    }
  }

  return {
    kind,
    ref,
    judgement,
    reasons,
    findings,
    denominator: denominatorIds,
    numeratorCovered: covered,
    uncovered,
    deferred,
    retryState: dryRun
      ? retryState
      : kind === 'zone3-hotfix'
        ? zone3Hotfix.getHotfix(ref, cwd)
        : ticketRetry.getTicketState(ref, cwd),
    simulatedRetryState,
    impactUnresolved: impact.unresolved,
    dryRun,
    recorded: !dryRun,
    note:
      kind === 'zone3-hotfix'
        ? '差し戻しカウントは.claude-state/zone3-hotfix-count.jsonで管理し、GZ0/GZ2/GZ3の累積カウンタ(zone-gate-retry.json)とは独立している（01文書4.6.2節の累積対象外の原則）。'
        : '差し戻しカウントは.claude-state/mode-b-ticket-retry.jsonで管理する（02/01文書のどこにも永続化先の定義が無かったためM5で新設。PMへ報告）。',
  };
}

/**
 * ゾーンゲート（GZ0/GZ2/GZ3、Mode A側）本体の判定。本タスクで新設した
 * `.claude/lib/zone-gate.js`へ委譲する薄いラッパー（Mode Bの`judge()`と対称の構成）。
 *
 * 【使い方】
 *   node gate-check.js --kind=zone-gate --gate=GZ0 [--findings=<path>]
 *   node gate-check.js --kind=zone-gate --gate=GZ2 [--findings=<path>]
 *   node gate-check.js --kind=zone-gate --gate=GZ3 [--findings=<path>]
 *
 * `--findings`のJSON形式は`readFindings()`と同じ（critical/high/guardPass）に加え、
 * `hardeningComplete`（GZ2向け、全機能の硬化完了。既定true）を追加で読む。
 *
 * `--dry-run`（本タスクで新設）を付けると、判定は行うが`GZ{0,2,3}-99_ゲート記録.md`への
 * 追記・`.claude-state/zone-gate-retry.json`の差し戻しカウンタ更新・HOLD時の00-13登録を
 * 一切行わない（`judgeZoneGate`の`opts.dryRun`にそのまま委譲する）。`/status`・`/next`
 * コマンドが状況確認のためにゲート判定を安全に呼べるようにする目的で新設した
 * （PMへの報告事項。詳細は`.claude/lib/zone-gate.js`の`judgeZoneGate`コメント参照）。
 */
function runZoneGate(cwd, args) {
  const gate = args.gate;
  if (!['GZ0', 'GZ2', 'GZ3'].includes(gate)) {
    console.error('[gate-check] --kind=zone-gate には --gate=GZ0|GZ2|GZ3 が必須');
    process.exit(2);
  }
  // readFindings()はJSONファイル全体をdefaultsへObject.assignするため、`hardeningComplete`が
  // ファイルに含まれていればfindingsBaseに既に反映されている（二重読み込みしない）。
  const findingsBase = readFindings(cwd, args);
  const findings = Object.assign({ hardeningComplete: true }, findingsBase);
  if (!args.findings) {
    findings.hardeningCompleteSource = 'default(未確認扱い、hardeningComplete=trueで通す)';
  }
  const dryRun = !!args['dry-run'];
  const result = judgeZoneGate(cwd, gate, { findings, dryRun });
  console.log(JSON.stringify({ status: 'done', result }, null, 2));
  if (result.judgement === 'NG') process.exitCode = 1;
  if (result.judgement === 'HOLD') process.exitCode = 2;
}

/**
 * 10.2.2節「HOLD解除手順」ステップ4のCLIエントリ。
 *   node gate-check.js --reset-hold=GZ2 --decision=DL-0050
 */
function runResetHold(cwd, args) {
  const gate = args['reset-hold'];
  if (!['GZ0', 'GZ2', 'GZ3'].includes(gate)) {
    console.error('[gate-check] --reset-hold には GZ0|GZ2|GZ3 のいずれかを指定すること');
    process.exit(2);
  }
  if (!args.decision) {
    console.error('[gate-check] --reset-hold には --decision=<DL-ID> がMUST（10.2.2節HOLD解除手順ステップ4）');
    process.exit(2);
  }
  const result = resetHold(gate, args.decision, cwd);
  console.log(JSON.stringify({ status: 'done', reset: result }, null, 2));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  if (args['reset-hold']) {
    runResetHold(cwd, args);
    return;
  }

  if (args.kind === 'zone-gate') {
    runZoneGate(cwd, args);
    return;
  }

  const kind = args.kind === 'zone3-hotfix' ? 'zone3-hotfix' : args.kind === 'ticket' ? 'ticket' : null;

  if (!kind) {
    console.error('[gate-check] --kind=ticket|zone3-hotfix|zone-gate のいずれかを指定すること（zone-gateは--gate=GZ0|GZ2|GZ3も併せて指定）。');
    process.exit(2);
  }

  const dryRun = !!args['dry-run'];
  const result = judge(cwd, args, kind, dryRun);
  console.log(JSON.stringify({ status: 'done', result }, null, 2));

  if (result.judgement === 'NG') process.exitCode = 1;
  if (result.judgement === 'HOLD') process.exitCode = 2;
}

main();
