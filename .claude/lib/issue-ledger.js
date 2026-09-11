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
 *
 * 【M-dup修正（重複蓄積バグ、PMからの委譲）】
 * `registerIssue`は従来、既存行との照合を一切せず`nextIssueId`で採番して無条件に
 * `appendRow`していた。この結果、`doc-link-check`等の検出系Skillを同じ入力に対して
 * 2回実行すると、1回目の検出と全く同じ内容が2回目にも「新規課題」として登録され、
 * 台帳が増殖する（実機確認済み・PMへ報告済みの不具合）。本節はこれを是正する。
 *
 * 【重複判定の設計】
 * 03文書3.2.6節の列のうち、`種別`・`検出元`・`内容`・`関連ID`の4列が一致し、かつ
 * 既存行の`対応状況`が`解消済み`でない場合に「同じ課題」とみなし、新規登録せず
 * 既存行の`課題ID`を返す（`appendRow`を呼ばない）。
 * - `検出日時`は照合対象に**含めない**（実行のたびに変わる値であり、含めると重複検出が
 *   機能しなくなるため。PMからの委譲指示のとおり）
 * - `課題ID`は生成対象自体であるため照合に使わない
 * - `対応状況`・`解消日時・対応内容`は照合条件ではなく「除外フィルタ」として使う。
 *   `解消済み`の既存行と内容が一致する場合は**再発**とみなし、新規登録する（MUST）。
 *   同じ問題が再び起きたという事実は記録に値するためであり、「解消済みだから無視する」
 *   という誤読を避ける。`未対応`・`対応中`・`リスク管理台帳(00-12)へdefer登録済み`は
 *   いずれも「未解消」として重複防止の対象に含める（defer登録済みでも問題自体が
 *   解決したわけではないため）
 * - 既存行の書き換えは行わない（02文書10.1.4節が定める追記専用方式を維持する。複数の
 *   機構が並行して同じ台帳へ書き込むため、既存行の書き換えは競合のリスクがある）
 *
 * 【契約】
 * 対象外と判定した（coderの判断、PMへ報告）。00-13課題管理表は`gate-check`等いずれの
 * Gateからも読み取られず、GO/NG判定の分母・分子計算には組み込まれていない（`registerIssue`
 * の呼び出しはHOLD遷移時の記録・Routineの検出結果着地点としての書き込み専用であり、
 * 16.6節(a)「分母・分子集計への関与」には該当しない。02文書16.6節の他の基準（b〜e）にも
 * 該当しない）。したがって本修正（重複防止ロジック）を契約テスト化する必要性は無いと判断した。
 * なお16.6節の選別基準に該当するかどうかの最終判定はapp-architectの所管であり、本記載は
 * coderの一次判定に留まる。M7（16.9節）時点では既存の登録済み契約4件（`.claude/contracts/MANIFEST.json`
 * 参照）のみが契約化済みである。
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

/**
 * `rows`（`readTableAsObjects`の戻り値）を渡せば再読み込みを省略できる。
 * `registerIssue`が同一ファイルを2度読むことを避けるための内部最適化であり、
 * 単体で使う場合は省略してよい（`cwd`から自前で読み込む）。
 */
function nextIssueId(cwd, rows) {
  const list = rows || readTableAsObjects(ledger0013Path(cwd));
  let max = 0;
  for (const r of list) {
    const m = /^ISS-(\d{4})$/.exec(r['課題ID'] || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `ISS-${String(max + 1).padStart(4, '0')}`;
}

/**
 * 既存行の中から「同じ課題」とみなせる未解消エントリを探す（重複登録防止）。
 * 【目的・理由】上記ヘッダーコメント「重複判定の設計」を参照。
 * 【前提条件・制約】`検出日時`・`課題ID`は照合に使わない。`対応状況`が`解消済み`の
 * 行は対象から除外する（再発は新規登録すべきであるため、ここではマッチさせない）。
 */
function findDuplicateOpenIssue(rows, { kind, detectedBy, content, relatedIds }) {
  const normalizedRelatedIds = relatedIds || '(なし)';
  return rows.find(
    (r) =>
      r['種別'] === kind &&
      r['検出元'] === detectedBy &&
      r['内容'] === content &&
      r['関連ID'] === normalizedRelatedIds &&
      r['対応状況'] !== STATUS.RESOLVED
  );
}

/**
 * 00-13へ1件登録する（03文書3.2.6節の列定義に厳密に従う）。
 * `{ kind, detectedBy, content, relatedIds, status }`。`status`省略時は`未対応`。
 *
 * 【重複蓄積バグの修正（PMからの委譲、M-dup）】既存の未解消エントリ（`対応状況`が
 * `解消済み`以外）で`種別`・`検出元`・`内容`・`関連ID`が完全一致するものがあれば、
 * 新規登録せずその既存行の`課題ID`をそのまま返す（`appendRow`を呼ばない）。
 * 解消済みの同内容が再発した場合は新規登録する（ヘッダーコメント参照）。
 */
function registerIssue(cwd, { kind, detectedBy, content, relatedIds, status }) {
  const ledgerPath = ledger0013Path(cwd);
  const rows = readTableAsObjects(ledgerPath);

  const duplicate = findDuplicateOpenIssue(rows, { kind, detectedBy, content, relatedIds });
  if (duplicate) {
    return duplicate['課題ID'];
  }

  const id = nextIssueId(cwd, rows);
  appendRow(
    ledgerPath,
    HEADER,
    [id, kind, detectedBy, content, relatedIds || '(なし)', new Date().toISOString(), status || STATUS.OPEN, ''],
    { title: '00-13 課題管理表', description: '> 列定義の正本: `docs/v2/03_成果物体系定義書.md` 3.2.6節' }
  );
  return id;
}

module.exports = { HEADER, KIND, STATUS, nextIssueId, registerIssue, findDuplicateOpenIssue };
