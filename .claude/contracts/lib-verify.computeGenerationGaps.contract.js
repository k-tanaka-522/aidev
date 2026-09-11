#!/usr/bin/env node
'use strict';
/**
 * 契約ID: CT-0004
 * 対象: .claude/lib/verify.js の computeGenerationGaps(cwd)
 * 出典MUST: 01文書6.5節「逆差分」定義の周辺、02文書9.3節「生成漏れ検査」
 *   （生成済みとカタログが主張する項目に実ファイルが無い場合、検査は
 *   検出漏れ0件を安全側に倒すのではなく、gapsとして報告しなければならない）
 * 著者: app-architect（16.4節の原則により実装者=coderは書かない）
 *
 * 【本ファイルについて】
 * 02文書16.3.1節が骨格として示したコードそのものを実行可能な形に起こしたもの
 * （検証内容は変更していない。`require`のパスのみ、本ファイルの実際の配置場所
 * `.claude/contracts/`に合わせて`../lib/verify`とした）。
 *
 * 【実行方法】
 *   node .claude/contracts/lib-verify.computeGenerationGaps.contract.js
 *   exit code 0 = 合格
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeGenerationGaps } = require('../lib/verify');

function makeFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-0004-'));
  const dir = path.join(cwd, 'docs', '00_プロジェクト管理・ガバナンス');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '00-01_成果物構成カタログ.md'), [
    '## 03_アプリケーション設計',
    '| 文書番号 | 文書名 | 生成ゾーン | 生成主体 | 生成方式 | 必須区分 | IPA対応 | 想定分量 | 生成状態 |',
    '|---|---|---|---|---|---|---|---|---|',
    '| 03-01 | アーキテクチャ概要 | Zone3 | app-architect | as-built | 必須 | 基本設計 | 中 | as-built生成済 |',
    '',
  ].join('\n'));
  // 意図的に docs/03_アプリケーション設計/03-01_*.md を作らない
  // （「生成済み」と主張しているのに実ファイルが無い状態を再現する）
  return cwd;
}

const cwd = makeFixture();
const gaps = computeGenerationGaps(cwd);
assert.ok(gaps.length >= 1, '生成済みなのに実ファイルが無い項目はgapsに1件以上出るはずだが0件だった（サイレント故障の再発）');
assert.ok(gaps.some((g) => g.itemNo === '03-01'), 'gapsに03-01が含まれていない');
console.log('OK: CT-0004 computeGenerationGaps');
