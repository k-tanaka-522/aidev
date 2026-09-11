#!/usr/bin/env node
'use strict';

/**
 * 契約ID: CT-0002
 * 対象: .claude/lib/zone-gate-conditions.js の checkCatalogSection(cwd, {sections, excludePrefixes})
 * 出典MUST: 02文書9.4.3節（9列スキーマの正本化）、.claude/lib/catalog-schema.js の
 *   UNKNOWN_SCHEMA_WARNING が述べる「fail closed: 判定不能を黙ってgaps=0件（検査パス）
 *   にはしない」の原則
 * 著者: app-architect（02文書16.4節の原則により実装者=coderは書かない。骨格・検証内容は
 *       02文書16.7節に既出。本ファイルはそれを実行可能な形に起こしたものであり、
 *       検証内容自体は変更していない）
 *
 * 【検証すること】
 * カタログのスキーマが既知の2種（9列/5列）のいずれにも一致しない場合、
 * `checkCatalogSection`は「未知スキーマ＝該当なし」に誤読される`complete: true`を
 * 返してはならない。実例2（サイレント故障）は、スキーマ不一致のカタログを渡すと
 * ゲート条件が例外にならず素通りしていた事例である。本契約はブラックボックステストとして
 * `checkCatalogSection`の入出力仕様のみに依存する。
 *
 * 【実行方法】
 *   node .claude/contracts/zone-gate-conditions.checkCatalogSection.contract.js
 *   exit code 0 = 合格
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkCatalogSection } = require('../lib/zone-gate-conditions');

/**
 * 00-01カタログを、v9（`文書番号`列）にもv5（`区分（02〜07）`列）にも一致しない
 * 架空の列構成（「番号」「名称」の2列）で作る（16.7節の指定どおり）。
 */
function makeFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-0002-'));
  const dir = path.join(cwd, 'docs', '00_プロジェクト管理・ガバナンス');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, '00-01_成果物構成カタログ.md'),
    ['| 番号 | 名称 |', '|---|---|', '| 03-01 | アーキテクチャ概要 |', ''].join('\n'),
    'utf-8'
  );
  return cwd;
}

const fixtureCwd = makeFixture();
const result = checkCatalogSection(fixtureCwd, { sections: ['03'], excludePrefixes: [] });

assert.notStrictEqual(
  result.complete,
  true,
  '未知スキーマなのにcomplete:trueで素通りしている（実例2のサイレント故障の再発）'
);
assert.strictEqual(
  result.catalogFound,
  false,
  '未知スキーマはcatalogFound:falseとしてfail closedに倒す必要がある（呼び出し側のNG分岐を通すため）'
);
assert.strictEqual(result.schemaVersion, 'unknown', 'schemaVersionがunknownとして報告されていない');

console.log('OK: CT-0002 checkCatalogSection（未知スキーマはfail closed）');
