#!/usr/bin/env node
'use strict';

/**
 * static-analysis-run.js（docs/05_テスト/traceability-reverse 同梱スクリプト）
 *
 * 【目的・理由】
 * 02文書9.1.1節「Mode B入口ゲート向けRTM逆引き列の機械生成」を実行し、`00-02`台帳の
 * 「実装ファイル（逆引き）」「API-ID（逆引き）」「モジュール（逆引き）」列（03文書3.2.1節が
 * 列定義の正本）を静的解析結果で書き戻す。
 *
 * 【影響範囲】
 * `docs/00_.../00-02_HBトレーサビリティ台帳.md`（逆引き3列の更新）、
 * `docs/00_.../00-13_課題管理表.md`（unresolved一覧の登録）。
 *
 * 【前提条件・制約】
 * 静的解析の対応範囲・限界は`.claude/lib/static-analysis.js`のコメント、および
 * SKILL.md「静的解析の限界」節を正とする。unresolvedと判定したHB-IDの逆引き列は
 * 実装から推測して埋めない（MUST NOT、02文書9.3節の原則）。
 *
 * 【M5修正】02文書版2.1（9.1.1節）は「`unresolved`の明示方針」をMUST化し、「該当列に
 * 値を空欄のまま残す、または黙って推測で埋めることをせず、明示的に`unresolved`という値を
 * 記載する（MUST）」と定めた。M4時点の本スクリプトは解決できなかった列を**空文字列のまま**
 * 残しており（`link.apiId || ''`相当）、この版2.1のMUSTに反していた
 * （Mode Bの`impact-analysis`が「空欄＝未解決」と「空欄＝そもそも該当なし」を区別できず、
 * 波及先を誤って過小報告するリスクがあったため、M5実装時に本ファイルへ遡って適用した）。
 * 本修正で、(1) 解決できたリンクのうち一部列のみ空の場合はその列に`unresolved`を明示し、
 * (2) `tests/e2e/`のdocblockでHB-ID自体への言及が無く静的解析を試行すらできなかった
 * HB-IDについても、3列すべてに`unresolved`を書き込み、理由付きで00-13へ登録するよう
 * 拡張した（旧版は後者を「対象外」として黙って無視していた）。
 *
 * 【M5修正2】03文書版1.5・3.2.6節が`00-13_課題管理表.md`の列を正本化した
 * （`課題ID|種別|検出元|内容|関連ID|検出日時|対応状況|解消日時・対応内容`）。
 * 旧版は`項番|起票日|種別|内容|起票元|ステータス`という暫定スキーマを直書きしていたため、
 * `.claude/lib/issue-ledger.js`（正本スキーマの共有実装）へ差し替えた。種別は列挙値に
 * `静的解析unresolved`に相当する項目が無いため`その他`を用いる（03文書の列挙値は
 * `未記載`をZone3のリバース生成における「決定ログに根拠が無い判断」専用としており、
 * Mode B入口ゲート向け静的解析の未解決とは意味が異なるため、無理に当てはめない）。
 */

const { buildHbReverseLinks } = require('../../../../../../.claude/lib/static-analysis');
const { readTableAsObjects, upsertRow } = require('../../../../../../.claude/lib/markdown-table');
const { ledger0002Path } = require('../../../../../../.claude/lib/ledger-paths');
const { registerIssue, KIND } = require('../../../../../../.claude/lib/issue-ledger');

function registerUnresolved(cwd, unresolved) {
  for (const u of unresolved) {
    registerIssue(cwd, {
      kind: KIND.OTHER,
      detectedBy: 'traceability-reverse(static-analysis)',
      content: `静的解析unresolved: ${u.reason}（${u.file || ''}）`,
      relatedIds: u.hbId || u.table || '',
    });
  }
}

const UNRESOLVED = 'unresolved';

function main() {
  const cwd = process.cwd();
  const { links, unresolved } = buildHbReverseLinks(cwd);

  const header = [
    'HB-ID',
    '経路（SCR-ID/RPT-ID/BAT-ID/API-ID）',
    '正式要件ID',
    '実装ファイル（逆引き）',
    'API-ID（逆引き）',
    'モジュール（逆引き）',
    '状態',
  ];
  const existingRows = readTableAsObjects(ledger0002Path(cwd));
  const linkedHbIds = new Set(links.map((l) => l.hbId));
  const allUnresolved = unresolved.slice();

  for (const link of links) {
    const existing = existingRows.find((r) => r['HB-ID'] === link.hbId);
    if (!existing) continue;
    upsertRow(ledger0002Path(cwd), header, 'HB-ID', link.hbId, [
      link.hbId,
      existing['経路（SCR-ID/RPT-ID/BAT-ID/API-ID）'],
      existing['正式要件ID'],
      link.implFile || UNRESOLVED,
      link.apiId || UNRESOLVED,
      link.module || UNRESOLVED,
      existing['状態'],
    ]);
  }

  // 02文書版2.1・9.1.1節「unresolvedの明示方針」（MUST）: tests/e2e/にHB-IDのdocblock
  // 自体が見つからず静的解析を試行すらできなかったHB-IDも、黙って対象外にせず3列すべてに
  // `unresolved`を明示し、理由付きで00-13へ登録する（M4時点は本ケースを無視していた）。
  for (const row of existingRows) {
    const hbId = row['HB-ID'];
    if (!hbId || linkedHbIds.has(hbId)) continue;
    upsertRow(ledger0002Path(cwd), header, 'HB-ID', hbId, [
      hbId,
      row['経路（SCR-ID/RPT-ID/BAT-ID/API-ID）'],
      row['正式要件ID'],
      UNRESOLVED,
      UNRESOLVED,
      UNRESOLVED,
      row['状態'],
    ]);
    allUnresolved.push({
      hbId,
      reason: 'tests/e2e/にHB-IDのdocblockが見つからず静的解析を試行できていない（E2Eテスト未作成、または対応アダプタ外のテストフレームワークの可能性）',
      file: '',
    });
  }

  registerUnresolved(cwd, allUnresolved);

  console.log(
    JSON.stringify(
      { status: 'done', resolved: links.length, unresolved: allUnresolved.length, unresolvedDetail: allUnresolved },
      null,
      2
    )
  );
}

main();
