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
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
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

function nextCrId(cwd) {
  const rows = readTableAsObjects(ledger0014Path(cwd));
  let max = 0;
  for (const r of rows) {
    const m = /^CR-(\d{4})$/.exec(r['CR-ID'] || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `CR-${String(max + 1).padStart(4, '0')}`;
}

/**
 * 00-14へ1件起票する（03文書3.2.7節の列定義に厳密に従う）。承認状態は既定`未承認`、
 * 反映状態は既定`未反映`で起票する（PMが承認するまで機械的に確定させない、MUST）。
 */
function registerCr(cwd, { origin, kind, targetIdOrSection, content, filingAgent, relatedTicket }) {
  const id = nextCrId(cwd);
  appendRow(
    ledger0014Path(cwd),
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

module.exports = { HEADER, ORIGIN, APPROVAL, REFLECTION, nextCrId, registerCr, countUnapproved };
