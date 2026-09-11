#!/usr/bin/env node
'use strict';

/**
 * 契約ID: CT-0003
 * 対象: .claude/lib/reverse-common.js の readCatalog(cwd)
 * 出典MUST: 02文書9.4.3節、.claude/lib/markdown-table.js の findAllTables 新設理由コメント
 *   「02〜07区分の行が常に読み落とされていた（実測確認）」
 * 著者: app-architect（02文書16.4節の原則により実装者=coderは書かない。骨格・検証内容は
 *       02文書16.7節に既出。本ファイルはそれを実行可能な形に起こしたものであり、
 *       検証内容自体は変更していない）
 *
 * 【検証すること】
 * `00-01_成果物構成カタログ.md`は、区分（00〜07）ごとに`##`見出しで区切られた複数の
 * Markdownテーブルから成る雛形形式を取りうる（03文書3章のカタログ雛形）。`readCatalog`は
 * ファイル内の**全テーブル**を走査して連結しなければならない。実例3（サイレント故障）は、
 * 最初の1テーブルしか読めず、02〜07区分の行が常に0件になっていた事例である。本契約は
 * ブラックボックステストとして`readCatalog`の入出力仕様のみに依存する。
 *
 * 【実行方法】
 *   node .claude/contracts/reverse-common.readCatalog.contract.js
 *   exit code 0 = 合格
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readCatalog } = require('../lib/reverse-common');

/**
 * 00-01カタログに「## 00_プロジェクト管理・ガバナンス」「## 03_アプリケーション設計」
 * 「## 07_運用・保守」の3見出し配下にそれぞれ2行ずつのテーブルを持つMarkdownを作る
 * （16.7節の指定どおり）。各テーブルは9列スキーマ（`文書番号`列を持つ）で揃える。
 */
function makeFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-0003-'));
  const dir = path.join(cwd, 'docs', '00_プロジェクト管理・ガバナンス');
  fs.mkdirSync(dir, { recursive: true });

  const header =
    '| 文書番号 | 文書名 | 生成ゾーン | 生成主体 | 生成方式 | 必須区分 | IPA対応 | 想定分量 | 生成状態 |\n' +
    '|---|---|---|---|---|---|---|---|---|\n';

  const section = (heading, rows) =>
    `## ${heading}\n\n${header}${rows.map((r) => `| ${r.join(' | ')} |`).join('\n')}\n\n`;

  const content =
    section('00_プロジェクト管理・ガバナンス', [
      ['00-01', '成果物構成カタログ', 'Zone0', 'app-architect', '手動', '必須', '-', '小', '省略'],
      ['00-02', 'HBトレーサビリティ台帳', 'Zone1', 'qa', '手動', '必須', '-', '小', '省略'],
    ]) +
    section('03_アプリケーション設計', [
      ['03-01', 'アーキテクチャ概要', 'Zone3', 'app-architect', 'as-built', '必須', '基本設計', '中', 'as-built生成済'],
      ['03-02', 'データモデル', 'Zone3', 'app-architect', 'as-built', '必須', '基本設計', '中', 'as-built生成済'],
    ]) +
    section('07_運用・保守', [
      ['07-01', '運用手順書', 'Zone3', 'sre', 'as-built', '必須', '運用・保守', '中', 'as-built生成済'],
      ['07-30', '運用実績記録', 'Zone4', 'sre', '継続更新', '必須', '運用・保守', '小', '未生成'],
    ]);

  fs.writeFileSync(path.join(dir, '00-01_成果物構成カタログ.md'), content, 'utf-8');
  return cwd;
}

const fixtureCwd = makeFixture();
const rows = readCatalog(fixtureCwd);

assert.strictEqual(
  rows.length,
  6,
  `全テーブル合計6行のはずが${rows.length}件しか読めていない（実例3のサイレント故障の再発、最初の1表で頭打ちの疑い）`
);
const docNos = rows.map((r) => r['文書番号']).sort();
assert.deepStrictEqual(
  docNos,
  ['00-01', '00-02', '03-01', '03-02', '07-01', '07-30'],
  '02〜07区分（見出し2番目以降のテーブル）の行が読み落とされている'
);

console.log('OK: CT-0003 readCatalog（複数テーブル構成の全テーブルを横断読み込み）');
