#!/usr/bin/env node
'use strict';

/**
 * cr-ledger.js（M5新設・共有ライブラリ）
 *
 * 【目的・理由】
 * `docs/v2/03_成果物体系定義書.md`版1.5・3.2.7節が`00-14_変更管理台帳.md`の列を
 * 正本化した（`CR-ID|起票日時|起票元|種別(前倒し版差分検査由来のみ)|対象ID・項番|内容|
 * 起票元エージェント|承認状態|承認日時・承認者|反映状態|反映日時|関連Ticket`）。
 * `.claude/skills/impact-analysis/scripts/impact-analysis.js`（01文書5.2節手順6）が
 * この正本スキーマで起票できるよう、採番・書き込みを1箇所に集約する
 * （`issue-ledger.js`と同じ設計判断）。
 *
 * 【承認状態を3値に限定する理由（03文書3.2.7節）】
 * `gate-check`がGZ3判定時に`未承認`件数を機械集計する対象であるため、自由記述を
 * 禁止する（MUST NOT自由記述）。
 *
 * 【影響範囲】
 * `.claude/skills/impact-analysis/scripts/impact-analysis.js`。
 *
 * 【M-dup修正（重複蓄積バグ、PMからの委譲）】
 * `.claude/lib/issue-ledger.js`（00-13）に発見された重複蓄積バグ（同一検出を2回登録すると
 * 台帳が増殖する）を受け、同種の「無条件追記」が本ファイルにも無いか確認した結果、
 * `registerCr`も既存行との照合を一切せず無条件に`appendRow`していたことが判明したため、
 * 同じ方針で是正する。
 *
 * 【重複判定の設計（issue-ledger.jsと同一方針）】
 * 03文書3.2.7節の列のうち、`起票元`・`種別（前倒し版差分検査由来のみ）`・`対象ID・項番`・
 * `内容`・`関連Ticket`が一致し、かつ既存行の`承認状態`が`却下`でない場合に「同じCR」と
 * みなし、新規起票せず既存行の`CR-ID`を返す（`appendRow`を呼ばない）。
 * - `起票日時`は照合対象に含めない（実行のたびに変わる値のため）
 * - `承認状態`が`却下`の既存行と内容が一致する場合は新規起票する。却下されたCRと
 *   同内容の変更が再度必要になった場合、却下という判断を書き換えずに新しいCRとして
 *   再提起できる必要があるため（issue-ledger.jsの「解消済みの再発は新規登録」と同型の
 *   判断。`承認`済みの既存行と一致する場合は「既に承認済みの変更」として重複防止の対象に
 *   含める＝再登録しない。`未承認`はもちろん重複防止の対象）
 * - `反映状態`・`反映日時`は照合条件に使わない（起票時点では常に`未反映`のため意味を
 *   持たない列）
 * - 既存行の書き換えは行わない（02文書10.1.4節が定める追記専用方式を維持する）
 *
 * 【契約】
 * 対象内と判定した（coderの一次判定、PMへ報告）。`countUnapproved`（後述）は
 * `.claude/lib/zone-gate-conditions.js`の`countUnapprovedCRs`経由で`.claude/lib/zone-gate.js`
 * のGZ3 GO/NG判定に直接使われており、16.6節(a)「分母・分子集計への関与」に該当する。
 * `registerCr`が重複起票すると`countUnapproved`（未承認件数）が水増しされ、GZ3判定の
 * 根拠数値が汚染される。ただし16.4節は契約の著者をapp-architectに限定し（MUST）、
 * `contract-integrity-guard.js`で機構的に強制する設計になっている。本タスクの実装者
 * （coder）は今回の修正対象そのものについて自ら契約を書く立場にあり、16.4節が禁じる
 * 「実装者が自分の契約テストも書く」構造そのものに該当するため、本ファイルでは契約
 * テストを追加しない。加えて、契約は既存の設計書MUSTの引用（`must.quote`）に基づいて
 * 書く形式（16.3.1節）だが、「重複起票を防止する」というMUST自体が現時点の03文書
 * 3.2.7節には明記されていない（本修正はバグ修正であり、既存の明文化されたMUSTの実装
 * ではない）。したがって「設計側への発注」として扱う: app-architectに対し、(1) 03文書
 * 3.2.6節・3.2.7節（またはその親である10.1.4節の追記専用方式の記述）に「同一検出・同一
 * 変更内容の重複起票を行わない」旨のMUSTを追記すること、(2) その上で`registerCr`/
 * `countUnapprovedCRs`を対象に新規の契約IDを採番して契約化することを提案する
 * （PMへ報告。本コメントは特定の契約IDをまだ参照しない。採番・登録はapp-architectが
 * MANIFEST.json登録と同時に行うべき作業であるため）。M7（16.9節）時点では既存の登録済み
 * 契約4件（`.claude/contracts/MANIFEST.json`参照）のみが契約化済みである。
 */

const { appendRow, readTableAsObjects } = require('./markdown-table');
const { ledger0014Path } = require('./ledger-paths');

const HEADER = [
  'CR-ID',
  '起票日時',
  '起票元',
  '種別（前倒し版差分検査由来のみ）',
  '対象ID・項番',
  '内容',
  '起票元エージェント',
  '承認状態',
  '承認日時・承認者',
  '反映状態',
  '反映日時',
  '関連Ticket',
];

const ORIGIN = {
  FRONT_LOADED_DIFF: '前倒し版差分検査',
  MODE_B_IMPACT_ANALYSIS: 'Mode B影響範囲分析',
  GATE_NG_RETURN: 'ゲートNG差し戻し',
  OTHER: 'その他',
};

const APPROVAL = { UNAPPROVED: '未承認', APPROVED: '承認', REJECTED: '却下' };
const REFLECTION = { NOT_REFLECTED: '未反映', REFLECTED: '反映済み' };

/** `rows`を渡せば`registerCr`からの二重読み込みを省略できる（issue-ledger.jsと同型）。 */
function nextCrId(cwd, rows) {
  const list = rows || readTableAsObjects(ledger0014Path(cwd));
  let max = 0;
  for (const r of list) {
    const m = /^CR-(\d{4})$/.exec(r['CR-ID'] || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `CR-${String(max + 1).padStart(4, '0')}`;
}

/**
 * 既存行の中から「同じCR」とみなせる、再登録すべきでないエントリを探す（重複起票防止）。
 * 【前提条件・制約】`起票日時`・`CR-ID`は照合に使わない。`承認状態`が`却下`の行は対象から
 * 除外する（却下されたCRと同内容の変更を再提起する場合は新規起票すべきであるため）。
 */
function findDuplicateCr(rows, { origin, kind, targetIdOrSection, content, relatedTicket }) {
  const normalizedTarget = targetIdOrSection || '';
  const normalizedKind = kind || '';
  const normalizedTicket = relatedTicket || '';
  return rows.find(
    (r) =>
      r['起票元'] === (origin || ORIGIN.OTHER) &&
      r['種別（前倒し版差分検査由来のみ）'] === normalizedKind &&
      r['対象ID・項番'] === normalizedTarget &&
      r['内容'] === (content || '') &&
      r['関連Ticket'] === normalizedTicket &&
      r['承認状態'] !== APPROVAL.REJECTED
  );
}

/**
 * 00-14へ1件起票する（03文書3.2.7節の列定義に厳密に従う）。承認状態は既定`未承認`、
 * 反映状態は既定`未反映`で起票する（PMが承認するまで機械的に確定させない、MUST）。
 *
 * 【重複蓄積バグの修正（PMからの委譲、M-dup）】既存の未却下エントリ（`承認状態`が
 * `却下`以外）で`起票元`・`種別`・`対象ID・項番`・`内容`・`関連Ticket`が完全一致する
 * ものがあれば、新規起票せずその既存行の`CR-ID`をそのまま返す（`appendRow`を呼ばない）。
 * これにより`countUnapproved`（GZ3判定が参照する未承認件数）が同一変更の重複起票で
 * 水増しされることを防ぐ。
 */
function registerCr(cwd, { origin, kind, targetIdOrSection, content, filingAgent, relatedTicket }) {
  const ledgerPath = ledger0014Path(cwd);
  const rows = readTableAsObjects(ledgerPath);

  const duplicate = findDuplicateCr(rows, { origin, kind, targetIdOrSection, content, relatedTicket });
  if (duplicate) {
    return duplicate['CR-ID'];
  }

  const id = nextCrId(cwd, rows);
  appendRow(
    ledgerPath,
    HEADER,
    [
      id,
      new Date().toISOString(),
      origin || ORIGIN.OTHER,
      kind || '',
      targetIdOrSection || '',
      content || '',
      filingAgent || '機構（自動起票）',
      APPROVAL.UNAPPROVED,
      '',
      REFLECTION.NOT_REFLECTED,
      '',
      relatedTicket || '',
    ],
    { title: '00-14 変更管理台帳', description: '> 列定義の正本: `docs/v2/03_成果物体系定義書.md` 3.2.7節' }
  );
  return id;
}

/** GZ3判定向け: 承認状態が「未承認」の行数を数える（03文書3.2.7節、gate-checkが参照する想定）。 */
function countUnapproved(cwd) {
  const rows = readTableAsObjects(ledger0014Path(cwd));
  return rows.filter((r) => r['承認状態'] === APPROVAL.UNAPPROVED).length;
}

module.exports = { HEADER, ORIGIN, APPROVAL, REFLECTION, nextCrId, registerCr, countUnapproved, findDuplicateCr };
