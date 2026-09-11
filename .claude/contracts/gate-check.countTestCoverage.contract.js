#!/usr/bin/env node
'use strict';

/**
 * 契約ID: CT-0001
 * 対象: .claude/skills/gate-check/scripts/gate-check.js の countTestCoverage(cwd, ids)
 * 出典MUST: 01文書6.5節「skip/fixme、例外処理の握りつぶしを含むテストは分子に数えない」
 * 著者: app-architect（02文書16.4節の原則により実装者=coderは書かない。骨格・検証内容は
 *       02文書16.3.1節・16.7節に既出。本ファイルはそれを実行可能な形に起こしたもの
 *       であり、検証内容自体は変更していない）
 *
 * 【検証すること】
 * `countTestCoverage`は、`test.skip`/`test.fixme`でマークされたHB-IDを分子（covered）に
 * 混入させてはならない（01文書6.5節）。実例1（サイレント故障）は、この除外ロジックが
 * コメント上は「除外する」と書かれていながら実装されておらず、skip/fixme対象を分子に
 * 数えていた事例である。本契約はブラックボックステストとして、`countTestCoverage`の
 * 入出力仕様のみに依存する（内部でどう`skip`/`fixme`を判定しているかには依存しない）。
 *
 * 【実行方法】
 *   node .claude/contracts/gate-check.countTestCoverage.contract.js
 *   exit code 0 = 合格
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { countTestCoverage } = require('../skills/gate-check/scripts/gate-check');

/**
 * `tests/e2e/`配下に HB-0001（正常）・HB-0002（test.skip）・HB-0003（test.fixme）を
 * 持つ合成テストファイル一式を作り、そのディレクトリをcwdとして返す（16.7節の指定どおり）。
 */
function makeFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-0001-'));
  const dir = path.join(cwd, 'tests', 'e2e');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'sample.spec.ts'),
    [
      '// HB-ID: HB-0001',
      "test('normal scenario is executable', async () => {",
      "  await page.goto('/normal');",
      '});',
      '',
      '// HB-ID: HB-0002',
      "test.skip('skipped scenario must not count', async () => {",
      "  await page.goto('/skipped');",
      '});',
      '',
      '// HB-ID: HB-0003',
      "test.fixme('fixme scenario must not count', async () => {",
      "  await page.goto('/fixme');",
      '});',
      '',
    ].join('\n'),
    'utf-8'
  );
  return cwd;
}

const fixtureCwd = makeFixture();
const { covered, uncovered } = countTestCoverage(fixtureCwd, ['HB-0001', 'HB-0002', 'HB-0003']);

assert.deepStrictEqual(
  covered.sort(),
  ['HB-0001'],
  'skip/fixme対象のIDが分子(covered)に混入している（実例1のサイレント故障の再発）'
);
assert.deepStrictEqual(
  uncovered.sort(),
  ['HB-0002', 'HB-0003'],
  'skip/fixme対象のIDがuncoveredに正しく振り分けられていない'
);

console.log('OK: CT-0001 countTestCoverage（skip/fixmeは分子に数えない）');
