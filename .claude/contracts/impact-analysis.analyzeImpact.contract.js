#!/usr/bin/env node
'use strict';

/**
 * 契約ID: CT-0008
 * 対象: .claude/lib/impact-analysis.js の analyzeImpact(cwd, {text, explicitIds, mode})
 * 出典MUST: 01文書5.2節「影響範囲分析の手順（必須・MUST）」手順3「逆引き（波及先の導出）。
 *   実装ファイル・APIエンドポイントを検索キーに、RTM全体を逆引きして同一の実装ファイル・
 *   同一API・同一画面を共有する他の要件IDを機械抽出する」、および同節「実装を読んで
 *   『影響がありそうな箇所』を主観的に洗い出す方法は禁止する（MUST NOT）」。機械抽出が
 *   期待どおり動かず波及先を取りこぼしても例外にならず「影響なし」に見える出力を返す
 *   構造であるため、16.6節(a)「分母・分子集計への関与」（`analyzeImpact`の結果は
 *   `gate-check.js`の`judge`が`denominatorIds`として直接利用する）・(c)「複数エントリの
 *   横断集計」に該当する。
 * 著者: app-architect（02文書16.4節の原則により実装者=coderは書かない）
 *
 * 【検証すること】
 * `00-02_HBトレーサビリティ台帳.md`に、同一の実装ファイルを共有する2件のHB-ID行
 * （直接影響対象のHB-0001と、実装ファイル共有により連動影響を受けるはずのHB-0002）、
 * および無関係なファイルを持つHB-0003を用意する。`analyzeImpact`にHB-0001を明示指定して
 * 呼び出したとき、
 * (1) `directImpacts`にHB-0001が含まれること
 * (2) `indirectImpacts`（連動影響、01文書5.2節手順3の「波及先」）にHB-0002が含まれること
 *     （実装ファイル共有による逆引きが機能していることの確認。0件に丸められていないか）
 * (3) `indirectImpacts`に無関係なHB-0003が含まれないこと（過検出していないか）
 *
 * 【実行方法】
 *   node .claude/contracts/impact-analysis.analyzeImpact.contract.js
 *   exit code 0 = 合格
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { analyzeImpact } = require('../lib/impact-analysis');

function makeFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-0008-'));
  const dir = path.join(cwd, 'docs', '00_プロジェクト管理・ガバナンス');
  fs.mkdirSync(dir, { recursive: true });

  const header =
    '| HB-ID | 経路（SCR-ID/RPT-ID/BAT-ID/API-ID） | 正式要件ID | 実装ファイル（逆引き） | API-ID（逆引き） | モジュール（逆引き） | 状態 |\n' +
    '|---|---|---|---|---|---|---|\n';
  const rows = [
    ['HB-0001', 'SCR-0001', '(Zone3で変換)', 'src/frontend/pages/order.tsx', 'API-0001', 'services/order', '登録済み'],
    // HB-0002はHB-0001と実装ファイルを共有する＝連動影響を受けるはずの行
    ['HB-0002', 'SCR-0002', '(Zone3で変換)', 'src/frontend/pages/order.tsx', '', '', '登録済み'],
    // HB-0003は無関係（別ファイル・別モジュール）
    ['HB-0003', 'SCR-0003', '(Zone3で変換)', 'src/frontend/pages/unrelated.tsx', '', 'services/unrelated', '登録済み'],
  ];
  const body = rows.map((r) => `| ${r.join(' | ')} |`).join('\n');
  fs.writeFileSync(path.join(dir, '00-02_HBトレーサビリティ台帳.md'), header + body + '\n', 'utf-8');
  fs.writeFileSync(
    path.join(dir, '00-03_バッチトレーサビリティ台帳.md'),
    '| BAT-ID | ジョブ名 | 入出力仕様参照（decisions/配下） | 経由HB-ID（画面経由の場合） | 正式ID（F-BAT-{連番}） | 状態 | 登録日時 |\n|---|---|---|---|---|---|---|\n',
    'utf-8'
  );
  return cwd;
}

const cwd = makeFixture();
const result = analyzeImpact(cwd, { text: 'チケット: HB-0001の改修', explicitIds: ['HB-0001'], mode: 'mode-b' });

const directIds = result.directImpacts.map((d) => d.hbId);
const indirectIds = result.indirectImpacts.map((d) => d.hbId);

assert.ok(directIds.includes('HB-0001'), `directImpactsに対象のHB-0001が含まれていない: ${JSON.stringify(directIds)}`);
assert.ok(
  indirectIds.includes('HB-0002'),
  `実装ファイル共有による連動影響(HB-0002)がindirectImpactsに含まれていない（波及先の機械抽出が0件に丸められている疑い）: ${JSON.stringify(indirectIds)}`
);
assert.ok(
  !indirectIds.includes('HB-0003'),
  `無関係なHB-0003が連動影響として誤検出されている: ${JSON.stringify(indirectIds)}`
);

console.log('OK: CT-0008 analyzeImpact（実装ファイル共有による連動影響の機械抽出）');
