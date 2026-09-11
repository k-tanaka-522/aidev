#!/usr/bin/env node
'use strict';

/**
 * zone-gate.js（本タスクで新設・共有ライブラリ）
 *
 * 【目的・理由】
 * `gate-check`本体（GZ0/GZ2/GZ3のGO/NG/HOLD判定）は、02文書14.2節の段階移行計画の
 * どのマイルストーンにも実装担当が割り当てられておらず、M0〜M5のいずれでも実装されない
 * まま引き継がれていた（M5報告のとおり）。本ファイルはこの欠落を埋める、ゾーンゲート本体の
 * 判定ロジックである。
 *
 * 【判定条件の出典】
 * - GZ0: 02文書10.2節「決定ログの必須項目充足（8.3節の分母。不可逆度:高の決定、案件類型判定、
 *   プロセス・オプション選択を含む）」。01文書4.3節「ユーザー承認 かつ 実現可能性の確認」
 * - GZ2: 02文書10.2節（版2.2）「全機能の硬化完了、トレーサビリティ充足（10.1.2節、6.5節条件6）、
 *   Critical/High指摘0件、該当する案件では06番の生成完了」
 * - GZ3: 02文書10.2節「IPA成果物の生成完了、逆差分0件、RTM充足（9.3節）、07番の生成完了
 *   （04文書7.3節）。requirements-first選択時は9.5節の突合レポートに未承認CRが残っていないこと」
 * - 全ゲート共通のGO条件6項目・NG時の差し戻し・HOLDは01文書6.5節・7.4節。
 *
 * 【判定者は報告の数字を転記しない、自ら数える（01文書7.2節）】
 * 本モジュールは`--findings`で受け取るCritical/High件数・Guard結果・硬化完了フラグ以外の
 * すべて（決定ログの分母充足、トレーサビリティのカバレッジ、00-01カタログの生成状態、
 * 逆差分・生成漏れ、未承認CR件数）を、`zone-gate-conditions.js`・`verify.js`経由で
 * 台帳・decisions・testsから自ら数える。`--findings`自体も、未指定時は「未レビュー扱い」と
 * 明記した既定値を使い、隠さない（Mode B側`gate-check.js`の`readFindings`と同じ方針）。
 *
 * 【差し戻し回数とHOLD（10.2節・10.2.1節・10.2.2節、7.4節）】
 * NG判定のたびに`.claude-state/zone-gate-retry.json`の当該ゲートのカウンタを+1し、
 * 3回超過でHOLDへ遷移する。この設計判断（「NG判定＝差し戻し1回」としてgate-check自身が
 * カウントする）は、Mode B（`--kind=ticket`）が既に採用している方式
 * （`ticket-retry.js`の`recordReturn`を`!ok`時に呼ぶ）と対称にしたものである。
 * 一方`gate-transition-guard.js`（hook、M3実装）は「`current-zone.json`のzone値が
 * ゾーンゲート境界を後退方向に跨ぐ書込」を検知して同じカウンタに加算する、独立した
 * 別経路の検知である（4.8節が定める、Zone2→Zone1等の実際のゾーン後退という、より重い戻り）。
 * 両者は同じ`zone-gate-retry.json`を共有するが、加算対象の事象（NG判定 vs 実際のゾーン後退）が
 * 異なるため二重にカウントされる場面はない（NG判定はcurrent-zone.jsonへの前進書込自体を
 * 発生させないため）。この設計判断はPMへ報告する。
 *
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
 */

const {
  readRetryState,
  writeRetryState,
  recordReturnThroughGate,
  computeNextRetryState,
  appendGateRecord,
  latestGateJudgement,
} = require('./gate-records');
const {
  computeTraceabilityCoverage,
  findDeferredIds,
  checkCatalogSection,
  formatMissingDocs,
  countUnapprovedCRs,
  runDecisionCheck,
  readProcessOptionMode,
} = require('./zone-gate-conditions');
const { computeReverseDiff, computeGenerationGaps } = require('./verify');
const { registerIssue, KIND } = require('./issue-ledger');

/** Critical/High・Guard結果は`--findings`からのみ受け取る（Mode B側と同じ既定値方針）。 */
function normalizeFindings(raw) {
  const defaults = { critical: 0, high: 0, guardPass: true, hardeningComplete: true, source: 'default(未レビュー扱い)' };
  if (!raw) return defaults;
  return Object.assign({}, defaults, raw);
}

function judgeGZ0(cwd, findings) {
  const reasons = [];
  let ok = true;
  const dc = runDecisionCheck(cwd);

  if (dc.error) {
    ok = false;
    reasons.push(`decision-checkの実行に失敗した（判定不能、fail closed）: ${dc.error}`);
  } else {
    if (!dc.zone0.go) {
      ok = false;
      reasons.push(
        `Zone0決定ログの必須9項目が未充足: ${dc.zone0.numerator}/${dc.zone0.denominator}（未充足カテゴリ: ${dc.zone0.missing.join(', ') || 'なし'}）`
      );
    }
    if (dc.decisionWarnings.unresolved > 0) {
      ok = false;
      reasons.push(`decision-warnings.jsonの未解消警告が${dc.decisionWarnings.unresolved}件ある`);
    }
    if (dc.processOption.consistent === false) {
      ok = false;
      reasons.push('process-option.jsonとDL-0000のモードが不一致（8.7節）');
    }
  }

  if (findings.critical > 0 || findings.high > 0) {
    ok = false;
    reasons.push(`Critical/High指摘が${findings.critical + findings.high}件ある（01文書6.5節条件1）`);
  }
  if (!findings.guardPass) {
    ok = false;
    reasons.push('Guardがpassしていない（条件2）');
  }

  return {
    ok,
    reasons,
    denominator: dc.error ? null : dc.zone0.denominator,
    numerator: dc.error ? null : dc.zone0.numerator,
    unresolvedWarnings: dc.error ? null : dc.decisionWarnings.unresolved,
    detail: { decisionCheck: dc },
  };
}

function judgeGZ2(cwd, findings) {
  const reasons = [];
  let ok = true;

  if (findings.critical > 0 || findings.high > 0) {
    ok = false;
    reasons.push(`Critical/High指摘が${findings.critical + findings.high}件ある（条件1）`);
  }
  if (!findings.guardPass) {
    ok = false;
    reasons.push('Guardがpassしていない（条件2）');
  }
  if (!findings.hardeningComplete) {
    ok = false;
    reasons.push(
      `全機能の硬化完了が確認できない（--findingsのhardeningCompleteがfalse。source=${findings.source}）`
    );
  }
  if (latestGateJudgement('GZ0', cwd) !== 'GO') {
    ok = false;
    reasons.push('GZ0のGO記録が無い（条件4: 前ゾーンのGateがGO済みであること）');
  }

  const cov = computeTraceabilityCoverage(cwd);
  const deferred = findDeferredIds(cwd, cov.uncovered);
  const unresolvedGap = cov.uncovered.filter((id) => !deferred.includes(id));
  if (unresolvedGap.length > 0) {
    ok = false;
    reasons.push(
      `トレーサビリティ未充足（条件6）: ${unresolvedGap.join(', ')} がテストのdocblockで確認できず、` +
        'リスク管理台帳(00-12)へのdefer登録も無い'
    );
  }

  const section06 = checkCatalogSection(cwd, { sections: ['06'] });
  if (!section06.catalogFound) {
    ok = false;
    reasons.push('00-01成果物構成カタログが見つからず、06番（移行・導入）の該当判定ができない（fail closed）');
  } else if (section06.applicable && !section06.complete) {
    ok = false;
    reasons.push(
      `該当案件だが06番（移行・導入）の生成が未完了: ${formatMissingDocs(section06)}` +
        '（02文書10.2節版2.2「該当する案件では06番の生成完了」）'
    );
  }

  return {
    ok,
    reasons,
    denominator: cov.denominator,
    numerator: cov.numerator,
    detail: { coverage: cov, section06 },
  };
}

function judgeGZ3(cwd, findings, processOptionMode) {
  const reasons = [];
  let ok = true;

  if (findings.critical > 0 || findings.high > 0) {
    ok = false;
    reasons.push(`Critical/High指摘が${findings.critical + findings.high}件ある（条件1）`);
  }
  if (!findings.guardPass) {
    ok = false;
    reasons.push('Guardがpassしていない（条件2）');
  }
  if (latestGateJudgement('GZ2', cwd) !== 'GO') {
    ok = false;
    reasons.push('GZ2のGO記録が無い（条件4: 前ゾーンのGateがGO済みであること）');
  }

  const reverseDiff = computeReverseDiff(cwd);
  if (reverseDiff.totalOnlyInImpl > 0) {
    ok = false;
    reasons.push(
      `逆差分が${reverseDiff.totalOnlyInImpl}件ある（実装にのみ存在: 画面${reverseDiff.screens.onlyInImpl.join(', ') || 'なし'}` +
        `、API ${reverseDiff.apis.onlyInImpl.join(', ') || 'なし'}）`
    );
  }

  const generationGaps = computeGenerationGaps(cwd);
  if (generationGaps.length > 0) {
    ok = false;
    reasons.push(
      `生成漏れ検査でギャップが${generationGaps.length}件ある: ${generationGaps
        .map((g) => (g.name ? `${g.itemNo} ${g.name}` : g.itemNo || '(文書番号不明)'))
        .join(', ')}`
    );
  }

  const cov = computeTraceabilityCoverage(cwd);
  const deferred = findDeferredIds(cwd, cov.uncovered);
  const unresolvedGap = cov.uncovered.filter((id) => !deferred.includes(id));
  if (unresolvedGap.length > 0) {
    ok = false;
    reasons.push(`RTM/トレーサビリティ未充足: ${unresolvedGap.join(', ')} がdefer登録も無い`);
  }

  const section07 = checkCatalogSection(cwd, { sections: ['07'], excludePrefixes: ['07-50'] });
  if (!section07.catalogFound) {
    ok = false;
    reasons.push('00-01成果物構成カタログが見つからず、07番の完了判定ができない（fail closed）');
  } else if (section07.applicable && !section07.complete) {
    ok = false;
    reasons.push(
      `07番（運用・保守。07-50は9.1.3節によりGZ3判定対象外）の生成が未完了: ${formatMissingDocs(section07)}`
    );
  }

  const allSections = checkCatalogSection(cwd, {
    sections: ['02', '03', '04', '05', '06', '07'],
    excludePrefixes: ['07-50'],
  });
  if (allSections.catalogFound && !allSections.complete) {
    ok = false;
    reasons.push(
      `IPA標準成果物一式（02〜07、07-50を除く）の生成が未完了: ${formatMissingDocs(allSections)}`
    );
  }

  let unapprovedCr = null;
  if (processOptionMode === 'requirements-first') {
    unapprovedCr = countUnapprovedCRs(cwd);
    if (unapprovedCr.count > 0) {
      ok = false;
      reasons.push(
        `requirements-first選択時、未承認CRが${unapprovedCr.count}件残っている: ${unapprovedCr.ids.join(', ')}` +
          '（02文書10.2節・9.5節）'
      );
    }
  }

  return {
    ok,
    reasons,
    denominator: cov.denominator,
    numerator: cov.numerator,
    detail: { reverseDiff, generationGaps, coverage: cov, section07, allSections, unapprovedCr },
  };
}

const JUDGES = { GZ0: judgeGZ0, GZ2: judgeGZ2, GZ3: judgeGZ3 };

/**
 * ゾーンゲート（GZ0/GZ2/GZ3）の本体判定。`opts.findings`は`normalizeFindings`を通した
 * 生の値でよい（本関数内で正規化する）。
 *
 * 【`opts.dryRun`（本タスクで新設。読み取り専用モード）】
 * `true`の場合、判定（GO/NG/HOLDの算出）自体は通常どおり行うが、以下の**副作用を一切
 * 行わない**（記録への書込み・カウンタ更新をしない）:
 * - `GZ{0,2,3}-99_ゲート記録.md`への`appendGateRecord`（GO/NG/HOLDいずれの場合も）
 * - `.claude-state/zone-gate-retry.json`の差し戻しカウンタ更新（`writeRetryState`）
 * - HOLD遷移時の`00-13_課題管理表.md`への`registerIssue`
 *
 * 【新設理由（PMへの報告事項・設計書への反映が必要）】
 * 従来`gate-check`には判定を行うモードしか存在せず、状況確認のためだけに1回実行しても
 * 差し戻しカウンタが実際に加算されてしまっていた（`/status`・`/next`コマンドが
 * `gate-check`実行を「MUST NOT」としていたのはこの副作用を規律で避けるための対症療法
 * であり、機構の欠陥そのものは残っていた）。「規律をプロンプトの言い聞かせでなく機構で
 * 強制する」というv2の方針に従い、副作用を伴わない安全な確認手段を機構として用意する。
 * NG/HOLDの判定結果自体は`dryRun`時も計算する（`computeNextRetryState`で「実際に記録
 * した場合どうなるか」を副作用なしにシミュレートする。`recordReturnThroughGate`と同じ
 * 遷移ロジックを共有し、カウンタの増分計算がズレないようにする）。
 *
 * 戻り値: { gate, judgement: 'GO'|'NG'|'HOLD', reasons, denominator, numerator,
 *           retryState, detail, dryRun, recorded }
 * `recorded`は`!dryRun`（記録を実際に行ったかどうかを呼び出し側が一目で判定できるフラグ）。
 */
function judgeZoneGate(cwd, gate, opts = {}) {
  if (!JUDGES[gate]) {
    throw new Error(`judgeZoneGate: 不正なゲート種別 "${gate}"（GZ0/GZ2/GZ3のいずれか）`);
  }
  const dryRun = !!opts.dryRun;
  const findings = normalizeFindings(opts.findings);
  const retryState = readRetryState(cwd);
  const currentState = retryState[gate] || { retryCount: 0, hold: false, heldAt: null };

  if (currentState.hold) {
    // 10.2.2節HOLD解除手順ステップ1: 以降そのゲートの再判定要求をブロックし続ける
    // （自動では解除しない）。--reset-holdを経由した後でなければGOにはならない。
    // この分岐はそもそも読み取り（readRetryState）のみで副作用が無いため、dryRunの
    // 有無にかかわらず同じ挙動でよい。
    return {
      gate,
      judgement: 'HOLD',
      reasons: [
        `既にHOLD状態（差し戻し累計${currentState.retryCount}回 > 3）。` +
          '10.2.2節のHOLD解除手順（PM経由のユーザー承認・決定ログ起票・' +
          '`gate-check --reset-hold=' +
          gate +
          ' --decision=<DL-ID>`）を経てから再判定すること。',
      ],
      denominator: null,
      numerator: null,
      retryState: currentState,
      detail: { blocked: true },
      dryRun,
      recorded: false,
    };
  }

  const processOptionMode = readProcessOptionMode(cwd);
  const judgeFn = JUDGES[gate];
  const outcome = gate === 'GZ3' ? judgeFn(cwd, findings, processOptionMode) : judgeFn(cwd, findings);

  if (outcome.ok) {
    if (!dryRun) {
      appendGateRecord(
        gate,
        {
          judgement: 'GO',
          retryCount: currentState.retryCount,
          denominator: outcome.denominator,
          numerator: outcome.numerator,
          unresolvedWarnings: outcome.unresolvedWarnings != null ? outcome.unresolvedWarnings : undefined,
          note: '全条件充足',
        },
        cwd
      );
    }
    const reasons = dryRun
      ? outcome.reasons.concat([
          `（--dry-run: 判定はGOだが ${gate}-99_ゲート記録.md への記録は行っていない）`,
        ])
      : outcome.reasons;
    return {
      gate,
      judgement: 'GO',
      reasons,
      denominator: outcome.denominator,
      numerator: outcome.numerator,
      retryState: currentState,
      detail: outcome.detail,
      findings,
      dryRun,
      recorded: !dryRun,
    };
  }

  // NG/HOLD側。dryRun時は`recordReturnThroughGate`と同じ遷移ロジック
  // （`computeNextRetryState`）で「記録した場合どうなるか」を計算するのみで、
  // 実際の永続化（`writeRetryState`）は行わない。
  const after = dryRun ? computeNextRetryState(currentState) : recordReturnThroughGate(retryState, gate);
  if (!dryRun) {
    writeRetryState(retryState, cwd);
  }
  const judgement = after.hold ? 'HOLD' : 'NG';

  if (!dryRun) {
    appendGateRecord(
      gate,
      {
        judgement,
        retryCount: after.retryCount,
        denominator: outcome.denominator,
        numerator: outcome.numerator,
        unresolvedWarnings: outcome.unresolvedWarnings != null ? outcome.unresolvedWarnings : undefined,
        note: outcome.reasons.join('; '),
      },
      cwd
    );
  }

  const reasons = outcome.reasons.slice();
  if (after.hold) {
    reasons.push(
      `今回の差し戻し${dryRun ? '（--dry-run: シミュレーション）' : ''}で累計${after.retryCount}回となり` +
        '3回を超過したためHOLDに遷移した（01文書7.4節）。'
    );
    if (!dryRun) {
      const issId = registerIssue(cwd, {
        kind: KIND.RETURN_OR_HOLD,
        detectedBy: `gate-check --kind=zone-gate --gate=${gate}`,
        content: `${gate}が差し戻し3回超過によりHOLDした。理由: ${outcome.reasons.join('; ')}`,
        relatedIds: gate,
      });
      reasons.push(`00-13へ課題登録した（${issId}）。`);
    } else {
      reasons.push('（--dry-run: 00-13課題管理表への登録は行っていない）');
    }
  }
  if (dryRun) {
    reasons.push(
      `（--dry-run: ${gate}-99_ゲート記録.md への記録・zone-gate-retry.jsonの差し戻しカウンタ更新は行っていない。` +
        `実行前の差し戻し累計=${currentState.retryCount}回、記録した場合の想定値=${after.retryCount}回）`
    );
  }

  return {
    gate,
    judgement,
    reasons,
    denominator: outcome.denominator,
    numerator: outcome.numerator,
    retryState: dryRun ? currentState : after,
    // dryRun時のみ設定。「記録した場合どうなるか」を副作用なしに示す参考値
    // （`retryState`は常に実際に永続化されている値を指す。混同を避けるため分離する）。
    simulatedRetryState: dryRun ? after : undefined,
    detail: outcome.detail,
    findings,
    dryRun,
    recorded: !dryRun,
  };
}

module.exports = { judgeZoneGate, normalizeFindings };
