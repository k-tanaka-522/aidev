#!/usr/bin/env node
'use strict';

/**
 * 契約ID: CT-0006
 * 対象: .claude/skills/sync-check/scripts/sync-check.js の runScreenMode / runBatchMode
 *   （`HB-ID`採番＝`docs/00_.../00-02_HBトレーサビリティ台帳.md`、`BAT-ID`採番＝
 *   `docs/00_.../00-03_バッチトレーサビリティ台帳.md`）
 * 出典MUST: `docs/v2/03_成果物体系定義書.md` 3.2.1節「以降、本体行は書き換えない
 *   （MUST NOT）」（`HB-ID`側。したがって重複防止は「既存IDをそのまま返し、追記しない」
 *   でなければならず「既存行を書き換える」であってはならない）、および同3.2.3節「BAT-ID /
 *   ジョブ名 / 入出力仕様参照 … 記入・更新タイミング: 入出力仕様の変更時」（`BAT-ID`側は
 *   `状態`・`入出力仕様参照`列の更新を許容する設計であることが列定義から読み取れる）。
 *   重複採番防止そのもののMUSTは03文書に現状明記が無いため、本タスク報告3番で
 *   3.2.1節・3.2.3節・（新設提案の）3.2.8節への追記を提案する。
 * 著者: app-architect（02文書16.4節の原則により実装者=coderは書かない。契約先行
 *   （contract-first）で作成した。02文書16.4節注記のとおり、Coderが`sync-check.js`の
 *   当該バグを修正中であり、本契約は修正前はFAILし、修正後にPASSすることを想定する）。
 *
 * 【検証すること】
 * (1) 画面モード: 同一`--screen`・同一`--contract`（レーンA/Bのフィールドが完全一致し
 *     `hasDiff:false`となる入力）で`sync-check.js`を2回実行しても、`00-02`台帳の行数は
 *     増えてはならない（2回目は1回目と同じ`HB-ID`を返し、新規追記しない）。
 * (2) バッチモード: 同一`--job-name`・同一`--spec`で`sync-check.js --kind=batch`を2回
 *     実行しても、`00-03`台帳の行数は増えてはならない（2回目は1回目と同じ`BAT-ID`を返す）。
 * (3) バッチモード: 同一`--job-name`だが`--spec`（入出力仕様参照）が変わった場合、新規の
 *     `BAT-ID`を追記登録するのではなく、既存行を更新（`入出力仕様参照`列の書き換え、
 *     `BAT-ID`は不変）しなければならない（3.2.3節の列定義がこの更新を許容している）。
 *
 * 【前提条件・制約】
 * `sync-check.js`は`module.exports`を持たない（CLI直接実行のみ）ため、本契約は
 * `child_process.execFileSync`でCLIとして2回起動し、結果の標準出力（JSON）と台帳ファイルの
 * 実際の行数を突合するブラックボックステストとする。
 *
 * 【実行方法】
 *   node .claude/contracts/sync-check.registerRoute.contract.js
 *   exit code 0 = 合格
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { readTableAsObjects } = require('../lib/markdown-table');
const { ledger0002Path, ledger0003Path } = require('../lib/ledger-paths');

const SYNC_CHECK_SCRIPT = path.resolve(__dirname, '..', 'skills', 'sync-check', 'scripts', 'sync-check.js');

function makeFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-0006-'));
  fs.mkdirSync(path.join(cwd, 'docs', '00_プロジェクト管理・ガバナンス'), { recursive: true });

  // --- 画面モード用フィクスチャ ---
  const prototypesDir = path.join(cwd, 'prototypes');
  fs.mkdirSync(prototypesDir, { recursive: true });
  fs.writeFileSync(
    path.join(prototypesDir, 'SCREEN_ID_INDEX.md'),
    [
      '| SCR-ID | ファイル | 画面名 |',
      '|---|---|---|',
      '| SCR-0001 | prototypes/login.html | ログイン画面 |',
      '',
    ].join('\n'),
    'utf-8'
  );
  fs.writeFileSync(
    path.join(prototypesDir, 'login.html'),
    [
      '<html><body><form>',
      '<input name="email" type="text">',
      '<input name="password" type="password">',
      '</form></body></html>',
      '',
    ].join('\n'),
    'utf-8'
  );
  const contractPath = path.join(cwd, 'contract.yaml');
  fs.writeFileSync(
    contractPath,
    [
      'paths:',
      '  /login:',
      '    post:',
      '      operationId: login',
      '      x-api-id: API-0001',
      '      requestBody:',
      '        content:',
      '          application/json:',
      '            schema:',
      '              type: object',
      '              properties:',
      '                email:',
      '                  type: string',
      '                password:',
      '                  type: string',
      '',
    ].join('\n'),
    'utf-8'
  );

  // --- バッチモード用フィクスチャ ---
  fs.writeFileSync(path.join(cwd, 'spec-v1.md'), '# nightly batch spec v1\n', 'utf-8');
  fs.writeFileSync(path.join(cwd, 'spec-v2.md'), '# nightly batch spec v2（入出力仕様の変更後）\n', 'utf-8');

  return cwd;
}

function runSyncCheck(cwd, args) {
  const out = execFileSync(process.execPath, [SYNC_CHECK_SCRIPT, ...args], {
    cwd,
    encoding: 'utf-8',
  });
  return JSON.parse(out);
}

const cwd = makeFixture();

// (1) 画面モード: 同一入力を2回実行しても00-02の行数が増えないこと。
const screenRun1 = runSyncCheck(cwd, ['--screen=prototypes/login.html', `--contract=${path.join(cwd, 'contract.yaml')}`]);
assert.strictEqual(screenRun1.status, 'passed', `1回目のsync-check(screen)がpassedにならなかった: ${JSON.stringify(screenRun1)}`);
const screenRun2 = runSyncCheck(cwd, ['--screen=prototypes/login.html', `--contract=${path.join(cwd, 'contract.yaml')}`]);
assert.strictEqual(screenRun2.status, 'passed', `2回目のsync-check(screen)がpassedにならなかった: ${JSON.stringify(screenRun2)}`);

const hbRows = readTableAsObjects(ledger0002Path(cwd));
assert.strictEqual(
  hbRows.length,
  1,
  `同一画面へのsync-check再実行で00-02の行数が増えてはならないが${hbRows.length}件になっている（HB-ID重複採番バグの再発）`
);
assert.strictEqual(
  screenRun2.hbId,
  screenRun1.hbId,
  `2回目の実行が1回目と異なるHB-IDを返している（${screenRun1.hbId} → ${screenRun2.hbId}）`
);

// (2) バッチモード: 同一入力を2回実行しても00-03の行数が増えないこと。
const batchRun1 = runSyncCheck(cwd, ['--kind=batch', '--job-name=nightly-batch', '--spec=spec-v1.md']);
const batchRun2 = runSyncCheck(cwd, ['--kind=batch', '--job-name=nightly-batch', '--spec=spec-v1.md']);
let batRows = readTableAsObjects(ledger0003Path(cwd));
assert.strictEqual(
  batRows.length,
  1,
  `同一ジョブへのsync-check --kind=batch再実行で00-03の行数が増えてはならないが${batRows.length}件になっている（BAT-ID重複採番バグの再発）`
);
assert.strictEqual(
  batchRun2.batId,
  batchRun1.batId,
  `2回目の実行が1回目と異なるBAT-IDを返している（${batchRun1.batId} → ${batchRun2.batId}）`
);

// (3) バッチモード: 同一job-nameで入出力仕様参照が変わった場合、新規行ではなく既存行の更新になること。
const batchRun3 = runSyncCheck(cwd, ['--kind=batch', '--job-name=nightly-batch', '--spec=spec-v2.md']);
batRows = readTableAsObjects(ledger0003Path(cwd));
assert.strictEqual(
  batRows.length,
  1,
  `入出力仕様の変更（ジョブ名は同一）は新規BAT-ID追記ではなく既存行の更新であるべきだが、行数が${batRows.length}件になっている`
);
assert.strictEqual(
  batchRun3.batId,
  batchRun1.batId,
  '入出力仕様変更時にBAT-IDが変わっている（新規採番ではなく既存行の更新でなければならない）'
);
assert.strictEqual(
  batRows[0]['入出力仕様参照（decisions/配下）'],
  'spec-v2.md',
  '入出力仕様参照列が新しいspec（spec-v2.md）に更新されていない（更新ではなく無視／無効な上書きの疑い）'
);

console.log('OK: CT-0006 sync-check（HB-ID/BAT-IDの重複採番防止、BAT-IDは内容変更時に既存行を更新）');
