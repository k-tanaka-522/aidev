#!/usr/bin/env node
'use strict';

/**
 * check.js（decision-check Skill 同梱スクリプト）
 *
 * 【目的・理由】
 * 01_プロセス定義書 4.7.3節が定める決定ログの分母（(a) Zone0必須決定項目9件、
 * (b) HB-ID単位の必須決定スロット4種×HB-ID件数、(c) 04文書が定める運用系分母）を、
 * 人手のレビューではなく機械的に集計する（02_実行基盤アーキテクチャ 8.3節）。
 * `decision-check` Skillは `context: fork` かつ `allowed-tools: Read, Grep, Glob`
 * （Write/Editを持たない）ため、本スクリプトも読み取り専用（副作用なし）とする。
 *
 * 【影響範囲】
 * 読み取りのみ:
 *   - docs/00_プロジェクト管理・ガバナンス/decisions/DL-*.md（frontmatter）
 *   - docs/00_プロジェクト管理・ガバナンス/00-02_HBトレーサビリティ台帳.md
 *   - .claude-state/decision-warnings.json
 *   - .claude-state/process-option.json
 *
 * 【前提条件・制約】
 * 00-02台帳・decision-warnings.json・process-option.json が存在しない場合は
 * 「0件」「未設定」として扱い、エラー終了しない（Zone0途中など、これらがまだ
 * 存在しない状態は正常系であるため）。
 *
 * 【使い方】
 *   node check.js            # 人間可読サマリ + JSON詳細を標準出力へ
 *   node check.js --json     # JSON詳細のみ
 */

const fs = require('fs');
const path = require('path');
const { listDecisionFiles } = require('../../../lib/decisions');
const { splitList } = require('../../../lib/frontmatter');
const { readWarnings } = require('../../../lib/warnings-store');

const ZONE0_CATEGORIES = [
  '事業背景',
  'スコープ外周',
  '法規制前提',
  '非機能骨格',
  'アーキ土台',
  '外部連携制約',
  '予算期限体制',
  '案件類型',
  '前倒しオプション',
];

const HB_SLOTS = ['業務ルール', '権限', '異常系', '外部連携'];

const OPS_CODES = ['M2', 'B5', 'M10'];

// decide/scripts/new-decision.js の buildBody() が出力する運用ヒアリング項目の見出し文言と一致させる
const OPS_HEARING_MARKERS = [
  '一次対応者・エスカレーション先',
  '事業影響の判断基準',
  '対外報告義務の有無と、報告先・期限',
  '本番変更の最終承認者',
  'データ廃棄・システム廃止の判断トリガとなる条件',
];

function readLedger(cwd) {
  const p = path.join(
    cwd,
    'docs',
    '00_プロジェクト管理・ガバナンス',
    '00-02_HBトレーサビリティ台帳.md'
  );
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch (_err) {
    return '';
  }
}

function extractHbIds(ledgerText) {
  const set = new Set();
  const re = /\bHB-\d{4}\b/g;
  let m;
  while ((m = re.exec(ledgerText))) set.add(m[0]);
  return Array.from(set).sort();
}

/** "業務ルール=あり, 異常系=該当なし" 形式をパースする。 */
function parseSlots(slotsField) {
  const result = {};
  for (const pair of splitList(slotsField)) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) result[k] = v || 'あり';
  }
  return result;
}

function computeZone0(allDecisions) {
  const found = {};
  for (const cat of ZONE0_CATEGORIES) found[cat] = [];
  for (const d of allDecisions) {
    for (const c of splitList(d.data['対象カテゴリ'])) {
      if (found[c]) found[c].push(d.data['決定ID']);
    }
  }
  const numerator = ZONE0_CATEGORIES.filter((c) => found[c].length > 0).length;
  return {
    denominator: ZONE0_CATEGORIES.length,
    numerator,
    missing: ZONE0_CATEGORIES.filter((c) => found[c].length === 0),
    satisfiedBy: found,
    go: numerator === ZONE0_CATEGORIES.length,
  };
}

function computeHbSlots(cwd, decisions) {
  const ledgerText = readLedger(cwd);
  const hbIds = extractHbIds(ledgerText);
  const detail = {};
  for (const hb of hbIds) {
    const covered = {};
    for (const d of decisions) {
      if (!splitList(d.data['関連HB-ID']).includes(hb)) continue;
      Object.assign(covered, parseSlots(d.data['対象スロット']));
    }
    detail[hb] = HB_SLOTS.map((s) => ({
      slot: s,
      addressed: Boolean(covered[s]),
      value: covered[s] || null,
    }));
  }
  const denominator = HB_SLOTS.length * hbIds.length;
  const numerator = Object.values(detail).reduce(
    (sum, slots) => sum + slots.filter((s) => s.addressed).length,
    0
  );
  return { hbIds, denominator, numerator, detail, ledgerFound: ledgerText.length > 0 };
}

function computeOps(decisions) {
  const detail = {};
  for (const code of OPS_CODES) {
    const matches = decisions.filter((d) => splitList(d.data['運用項目コード']).includes(code));
    const hearingOk = matches.some((d) =>
      OPS_HEARING_MARKERS.every((marker) => d.body.includes(marker))
    );
    detail[code] = {
      entries: matches.map((d) => d.data['決定ID']),
      hearingOk,
    };
  }
  return detail;
}

function computeProcessOption(cwd, dl0000) {
  let mirror = null;
  try {
    mirror = JSON.parse(
      fs.readFileSync(path.join(cwd, '.claude-state', 'process-option.json'), 'utf-8')
    );
  } catch (_err) {
    mirror = null;
  }
  let consistent;
  if (mirror && dl0000) {
    consistent = mirror.decided_by === 'DL-0000' && mirror.mode === dl0000.data['モード'];
  } else if (!mirror && !dl0000) {
    consistent = null; // Zone0未着手（正常。GZ0未到達時点でのNGにはしない）
  } else {
    consistent = false; // 片方だけ存在＝同期漏れ（8.7節が要求する不一致検知）
  }
  return { mirror, dl0000Mode: dl0000 ? dl0000.data['モード'] : null, consistent };
}

function main() {
  const jsonOnly = process.argv.includes('--json');
  const cwd = process.cwd();

  const all = listDecisionFiles(cwd);
  const dl0000 = all.find((d) => d.data['決定ID'] === 'DL-0000');
  const decisions = all.filter((d) => d.data['決定ID'] !== 'DL-0000');

  const zone0 = computeZone0(all);
  const hb = computeHbSlots(cwd, decisions);
  const ops = computeOps(decisions);

  const warningsData = readWarnings(cwd);
  const unresolved = warningsData.warnings.filter((w) => !w.resolved);

  const processOption = computeProcessOption(cwd, dl0000);

  const report = {
    zone0,
    hbId: hb,
    ops,
    decisionWarnings: {
      total: warningsData.warnings.length,
      unresolved: unresolved.length,
      unresolvedList: unresolved.map((w) => ({
        id: w.id,
        type: w.type,
        path_or_task: w.path_or_task,
        detected_at: w.detected_at,
      })),
    },
    processOption,
    totalDecisionFiles: all.length,
  };

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('=== decision-check レポート ===');
  console.log(
    `[Zone0分母] ${report.zone0.numerator}/${report.zone0.denominator}` +
      (report.zone0.missing.length ? ` 未充足: ${report.zone0.missing.join(', ')}` : ' (充足)')
  );
  console.log(
    `[HB-ID単位分母] HB-ID件数=${report.hbId.hbIds.length}, ${report.hbId.numerator}/${report.hbId.denominator}`
  );
  for (const code of OPS_CODES) {
    const o = report.ops[code];
    console.log(
      `[運用系分母:${code}] エントリ=${o.entries.length}件, ヒアリング5項目充足=${o.hearingOk}`
    );
  }
  console.log(
    `[decision-warnings.json] 総数=${report.decisionWarnings.total}, 未解消=${report.decisionWarnings.unresolved}`
  );
  if (report.decisionWarnings.unresolved > 0) {
    for (const w of report.decisionWarnings.unresolvedList) {
      console.log(`  - ${w.id} (${w.type}) ${w.path_or_task}`);
    }
  }
  console.log(
    `[process-option整合] mirror=${
      report.processOption.mirror ? report.processOption.mirror.mode : '(未設定)'
    }, DL-0000=${report.processOption.dl0000Mode || '(未起票)'}, consistent=${
      report.processOption.consistent
    }`
  );
  console.log('');
  console.log('--- JSON詳細 ---');
  console.log(JSON.stringify(report, null, 2));
}

main();
