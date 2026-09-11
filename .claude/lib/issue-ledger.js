#!/usr/bin/env node
'use strict';

/**
 * issue-ledger.js（M5新設・共有ライブラリ）
 *
 * 【目的・理由】
 * `docs/v2/03_成果物体系定義書.md`版1.5・3.2.6節が、`00-13_課題管理表.md`の列を
 * 正本化した（`課題ID | 種別 | 検出元 | 内容 | 関連ID | 検出日時 | 対応状況 |
 * 解消日時・対応内容`）。M4実装（`static-analysis-run.js`・`check-links.js`）は
 * この正本化に先行して暫定スキーマ（`項番 | 起票日 | 種別 | 内容 | 起票元 | ステータス`）
 * を個別に採用していたため、本ライブラリを新設し正本スキーマへの書き込みを1箇所に
 * 集約する（`decisions.js`・`markdown-table.js`と同じ設計判断。複数機構が同一台帳へ
 * 書式違いで書き込むことを防ぐ）。M5実装分（`gate-check.js`のHOLD登録）はこのライブラリを
 * 使う。M4実装分（`static-analysis-run.js`・`check-links.js`）もM5で本ライブラリへ
 * 追随させた（正本化前のファイルはこのリポジトリにまだ実体が無かったため、移行コストは
 * 発生しない。03文書版1.5の改訂履歴が「実装済みファイルの存在は確認できなかった」と
 * 明記している事実に基づく判断）。
 *
 * 【種別（03文書3.2.6節が定める列挙値）】
 * `リンク切れ`／`未記載`／`生成保留`／`帳票画面取り違え`／`廃棄トリガ検知`／
 * `レビュー指摘`／`差し戻し（要注意）・HOLD対応`／`その他`
 *
 * 【対応状況（同節）】
 * `未対応`／`対応中`／`解消済み`／`リスク管理台帳(00-12)へdefer登録済み（参照RISK-ID）`
 *
 * 【影響範囲】
 * `docs/05_テスト/.claude/skills/traceability-reverse/scripts/static-analysis-run.js`、
 * `.claude/skills/doc-link-check/scripts/check-links.js`、
 * `.claude/skills/gate-check/scripts/gate-check.js`。
 */

const { appendRow, readTableAsObjects } = require('./markdown-table');
const { ledger0013Path } = require('./ledger-paths');

const HEADER = ['課題ID', '種別', '検出元', '内容', '関連ID', '検出日時', '対応状況', '解消日時・対応内容'];

const KIND = {
  BROKEN_LINK: 'リンク切れ',
  UNDOCUMENTED: '未記載',
  GENERATION_PENDING: '生成保留',
  REPORT_SCREEN_MISMATCH: '帳票画面取り違え',
  DISPOSAL_TRIGGER: '廃棄トリガ検知',
  REVIEW_FINDING: 'レビュー指摘',
  RETURN_OR_HOLD: '差し戻し（要注意）・HOLD対応',
  OTHER: 'その他',
};

const STATUS = {
  OPEN: '未対応',
  IN_PROGRESS: '対応中',
  RESOLVED: '解消済み',
  deferred: (riskId) => `リスク管理台帳(00-12)へdefer登録済み（参照${riskId}）`,
};

function nextIssueId(cwd) {
  const rows = readTableAsObjects(ledger0013Path(cwd));
  let max = 0;
  for (const r of rows) {
    const m = /^ISS-(\d{4})$/.exec(r['課題ID'] || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `ISS-${String(max + 1).padStart(4, '0')}`;
}

/**
 * 00-13へ1件登録する（03文書3.2.6節の列定義に厳密に従う）。
 * `{ kind, detectedBy, content, relatedIds, status }`。`status`省略時は`未対応`。
 */
function registerIssue(cwd, { kind, detectedBy, content, relatedIds, status }) {
  const id = nextIssueId(cwd);
  appendRow(
    ledger0013Path(cwd),
    HEADER,
    [id, kind, detectedBy, content, relatedIds || '(なし)', new Date().toISOString(), status || STATUS.OPEN, ''],
    { title: '00-13 課題管理表', description: '> 列定義の正本: `docs/v2/03_成果物体系定義書.md` 3.2.6節' }
  );
  return id;
}

module.exports = { HEADER, KIND, STATUS, nextIssueId, registerIssue };
