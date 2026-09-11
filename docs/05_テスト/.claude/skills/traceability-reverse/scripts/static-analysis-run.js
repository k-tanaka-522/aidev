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
 * 空欄のまま残し、実装から推測して埋めない（MUST NOT、02文書9.3節の原則）。
 */

const fs = require('fs');
const path = require('path');
const { readTableAsObjects, upsertRow, appendRow } = require('../../../../../../.claude/lib/markdown-table');
const { ledger0002Path, govDir } = require('../../../../../../.claude/lib/ledger-paths');
const { buildHbReverseLinks } = require('../../../../../../.claude/lib/static-analysis');

function registerUnresolved(cwd, unresolved) {
  if (unresolved.length === 0) return;
  const issuesPath = path.join(govDir(cwd), '00-13_課題管理表.md');
  const header = ['項番', '起票日', '種別', '内容', '起票元', 'ステータス'];
  for (const u of unresolved) {
    appendRow(
      issuesPath,
      header,
      ['-', new Date().toISOString(), '静的解析unresolved', `${u.hbId || u.table || ''}: ${u.reason}（${u.file || ''}）`, 'traceability-reverse(static-analysis)', '未対応'],
      { title: '00-13 課題管理表' }
    );
  }
}

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

  for (const link of links) {
    const existing = existingRows.find((r) => r['HB-ID'] === link.hbId);
    if (!existing) continue;
    upsertRow(ledger0002Path(cwd), header, 'HB-ID', link.hbId, [
      link.hbId,
      existing['経路（SCR-ID/RPT-ID/BAT-ID/API-ID）'],
      existing['正式要件ID'],
      link.implFile,
      link.apiId,
      link.module,
      existing['状態'],
    ]);
  }

  registerUnresolved(cwd, unresolved);

  console.log(JSON.stringify({ status: 'done', resolved: links.length, unresolved: unresolved.length, unresolvedDetail: unresolved }, null, 2));
}

main();
