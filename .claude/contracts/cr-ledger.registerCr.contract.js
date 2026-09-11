#!/usr/bin/env node
'use strict';

/**
 * 契約ID: CT-0005
 * 対象: .claude/lib/cr-ledger.js の registerCr(cwd, {origin, kind, targetIdOrSection, content,
 *   filingAgent, relatedTicket})
 * 出典MUST: `docs/v2/03_成果物体系定義書.md` 3.2.7節は現時点では「重複起票を行わない」旨の
 *   MUSTを明記していない（このギャップ自体が本タスクの報告事項3番）。したがって本契約は、
 *   `.claude/lib/cr-ledger.js`冒頭コメント【M-dup修正（重複蓄積バグ、PMからの委譲）】
 *   ・【重複判定の設計（issue-ledger.jsと同一方針）】が明記する、PMから委譲された是正済み
 *   実装の仕様を出典とする（3.2.7節への追記提案は本タスク報告3番、正式なMUST化後に
 *   `must.doc`/`must.section`を差し替える）。
 * 著者: app-architect（02文書16.4節の原則により実装者=coderは書かない。`registerCr`自体は
 *   既にPMからの委譲でcoderにより是正済みだが、その是正内容を契約として固定化するのは
 *   app-architectの責務である、16.4節）。
 *
 * 【検証すること】
 * (1) 同一の変更要求（`起票元`・`種別`・`対象ID・項番`・`内容`・`関連Ticket`が完全一致）を
 *     2回`registerCr`しても、`00-14_変更管理台帳.md`の行数は増えてはならない（2回目は
 *     1回目と同じ`CR-ID`を返し、`appendRow`を呼ばない）。
 * (2) 既存行の`承認状態`が`却下`の場合は重複防止の対象から除外する（除外対象＝マッチしない）。
 *     却下されたCRと同内容の変更要求が再度registerCrされた場合、`却下`行の`CR-ID`を
 *     再利用せず、新規`CR-ID`で登録しなければならない。
 * (3) 既存行の`承認状態`が`承認`（却下ではない）の場合は重複防止の対象に含める。承認済みの
 *     CRと同内容が再度registerCrされた場合、新規登録せず既存の`CR-ID`をそのまま返す。
 * 上記いずれも`.claude/lib/cr-ledger.js`の`findDuplicateCr`・`registerCr`の実装コメントが
 * 明記する設計どおりであることを固定化する（実例1〜4と同型の「サイレント故障」ではなく
 * 「PMから委譲された是正の再発防止」だが、`countUnapproved`（GZ3判定の未承認件数）が
 * 重複起票で水増しされるという実害は実例1〜4と同種であるため、16.6節(a)に該当する対象として
 * 契約化する）。
 *
 * 【実行方法】
 *   node .claude/contracts/cr-ledger.registerCr.contract.js
 *   exit code 0 = 合格
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { HEADER, ORIGIN, APPROVAL, REFLECTION, registerCr } = require('../lib/cr-ledger');
const { appendRow, readTableAsObjects } = require('../lib/markdown-table');
const { ledger0014Path } = require('../lib/ledger-paths');

/**
 * `00-14_変更管理台帳.md`に、あらかじめ「却下済みのCR」1件・「承認済みのCR」1件を
 * 登録済みの状態で作る（重複防止ロジックが`却下`のみを除外対象とすることを検証するため）。
 */
function makeFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-0005-'));
  const dir = path.join(cwd, 'docs', '00_プロジェクト管理・ガバナンス');
  fs.mkdirSync(dir, { recursive: true });
  const ledgerPath = ledger0014Path(cwd);

  appendRow(
    ledgerPath,
    HEADER,
    [
      'CR-0001',
      new Date().toISOString(),
      ORIGIN.OTHER,
      '',
      'F-100',
      '却下済み内容のCR',
      'coder',
      APPROVAL.REJECTED,
      '2026-01-01T00:00:00Z / PM',
      REFLECTION.NOT_REFLECTED,
      '',
      '',
    ],
    { title: '00-14 変更管理台帳', description: '> 列定義の正本: `docs/v2/03_成果物体系定義書.md` 3.2.7節' }
  );
  appendRow(
    ledgerPath,
    HEADER,
    [
      'CR-0002',
      new Date().toISOString(),
      ORIGIN.OTHER,
      '',
      'F-200',
      '承認済み内容のCR',
      'coder',
      APPROVAL.APPROVED,
      '2026-01-01T00:00:00Z / PM',
      REFLECTION.NOT_REFLECTED,
      '',
      '',
    ]
  );
  return cwd;
}

const cwd = makeFixture();

// (2) 却下済みと同内容 → 新規CR-IDで登録されること（CR-0001を再利用しない）。
const idAfterRejectedRetry = registerCr(cwd, {
  origin: ORIGIN.OTHER,
  targetIdOrSection: 'F-100',
  content: '却下済み内容のCR',
});
let rows = readTableAsObjects(ledger0014Path(cwd));
assert.strictEqual(
  rows.length,
  3,
  `却下済みCRと同内容の再提起は新規登録されるはずが、行数が${rows.length}件（期待値3件）になっている`
);
assert.notStrictEqual(
  idAfterRejectedRetry,
  'CR-0001',
  '却下済みのCR-IDがそのまま再利用されている（却下は重複防止の除外対象であるべき）'
);

// (1) 直前で新規登録された内容を、全く同じ引数でもう一度registerCr → 行数が増えず同じCR-IDが返ること。
const idAfterSameRetryAgain = registerCr(cwd, {
  origin: ORIGIN.OTHER,
  targetIdOrSection: 'F-100',
  content: '却下済み内容のCR',
});
rows = readTableAsObjects(ledger0014Path(cwd));
assert.strictEqual(
  rows.length,
  3,
  `同一の変更要求を2回登録すると行数が増えてはならないが、${rows.length}件になっている（重複蓄積バグの再発）`
);
assert.strictEqual(
  idAfterSameRetryAgain,
  idAfterRejectedRetry,
  '同一内容の再登録なのに異なるCR-IDが返っている（新規行が追記された疑い）'
);

// (3) 承認済みと同内容 → 新規登録せず既存のCR-0002をそのまま返すこと。
const idForApprovedDuplicate = registerCr(cwd, {
  origin: ORIGIN.OTHER,
  targetIdOrSection: 'F-200',
  content: '承認済み内容のCR',
});
rows = readTableAsObjects(ledger0014Path(cwd));
assert.strictEqual(
  rows.length,
  3,
  `承認済みCRと同内容の再登録は重複防止の対象に含めるはずが、行数が${rows.length}件になっている`
);
assert.strictEqual(
  idForApprovedDuplicate,
  'CR-0002',
  '承認済みの既存CR-IDが再利用されず、別のCR-IDが返っている'
);

console.log('OK: CT-0005 registerCr（重複起票の防止、却下済みのみ再登録対象）');
