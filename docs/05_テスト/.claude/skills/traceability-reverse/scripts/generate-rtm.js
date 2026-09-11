#!/usr/bin/env node
'use strict';

/**
 * generate-rtm.js（docs/05_テスト/traceability-reverse 同梱スクリプト）
 *
 * 【目的・理由】
 * `00-02`（HB-ID、正式要件ID変換済み）・`00-03`（BAT-ID、正式ID変換済み）・
 * `tests/integration/`（API-ID docblock）を集約し、`05-02_トレーサビリティマトリクス.md`
 * （正式要件ID起点のRTM正式版）をas-built生成する（03文書3.7節、GZ3のGO条件、
 * 01文書6.5節条件6）。
 *
 * 【前提条件・制約】
 * `00-02`/`00-03`の正式ID変換が未完了（`docs/02_要件定義/reverse-doc`が先に実行されて
 * いない）場合は、生成DAG（02文書9.4.1節）違反として生成を保留し
 * `00-13_課題管理表.md`へ登録する（MUST、まとめ書きしない）。
 *
 * 【M5修正】03文書版1.5・3.2.6節が`00-13_課題管理表.md`の列を正本化したため、
 * `.claude/lib/issue-ledger.js`へ差し替えた。種別は列挙値`生成保留`
 * （`reverse-doc`のDAG未確定入力、02文書9.4.1節）に対応する。
 */

const fs = require('fs');
const path = require('path');
const { readTableAsObjects } = require('../../../../../../.claude/lib/markdown-table');
const { ledger0002Path, ledger0003Path } = require('../../../../../../.claude/lib/ledger-paths');
const { scanIntegrationApiLinks } = require('../../../../../../.claude/lib/static-analysis');
const { buildDocHeader, buildExecutionMarker, markCatalogGenerated, SEISEIKUBUN } = require('../../../../../../.claude/lib/reverse-common');
const { registerIssue, KIND } = require('../../../../../../.claude/lib/issue-ledger');

const DOC_DIR = path.join('docs', '05_テスト');

function main() {
  const cwd = process.cwd();
  const hbRows = readTableAsObjects(ledger0002Path(cwd));
  const batRows = readTableAsObjects(ledger0003Path(cwd));
  const apiLinks = scanIntegrationApiLinks(cwd);

  const unconverted = hbRows.filter((r) => !r['正式要件ID'] || r['正式要件ID'] === '(Zone3で変換)');
  if (unconverted.length > 0) {
    registerIssue(cwd, {
      kind: KIND.GENERATION_PENDING,
      detectedBy: 'traceability-reverse(generate-rtm)',
      content: `未確定入力あり: ${unconverted.map((r) => r['HB-ID']).join(', ')} の正式要件ID未変換（02文書9.4.1節の生成DAGにより docs/02_要件定義/reverse-doc の先行実行が必要）`,
      relatedIds: unconverted.map((r) => r['HB-ID']).join(', '),
    });
    console.error('[generate-rtm] 未確定入力あり（正式要件ID未変換のHB-IDが存在）。生成を保留し00-13へ登録しました。');
    process.exit(0);
  }

  // 【M5修正】static-analysis-run.js が版2.1のMUSTに対応し、解決不能な列を空欄ではなく
  // リテラル値`unresolved`で明記するよう変更された（unresolvedの明示方針）。本ファイルの
  // 「未特定」判定は空欄チェックのみだったため、`unresolved`を見逃して残課題欄が
  // 「(なし)」と誤って報告する回帰があった。両方の値を「未解決」として扱うよう修正する。
  const UNRESOLVED_VALUES = ['unresolved', ''];
  const displayOrUnresolved = (v) => (v && !UNRESOLVED_VALUES.includes(v) ? v : '(未特定)');

  const rtmRows = hbRows.map((r) => ({
    formalId: r['正式要件ID'],
    hbId: r['HB-ID'],
    route: r['経路（SCR-ID/RPT-ID/BAT-ID/API-ID）'],
    implFile: displayOrUnresolved(r['実装ファイル（逆引き）']),
    apiId: displayOrUnresolved(r['API-ID（逆引き）']),
    module: displayOrUnresolved(r['モジュール（逆引き）']),
    itCovered: apiLinks.some((l) => (r['API-ID（逆引き）'] || '').includes(l.apiId)) ? 'あり' : '要確認',
  }));

  const batRtmRows = batRows.map((r) => ({
    formalId: r['正式ID（F-BAT-{連番}）'] || '(未変換)',
    batId: r['BAT-ID'],
    job: r['ジョブ名'],
  }));

  const body = [
    '# 05-02 トレーサビリティマトリクス（正式版）',
    '',
    '## 1. はじめに',
    '',
    '`HB-ID`/`BAT-ID`を正式要件IDへ変換した後の、要件×テスト対応表（正式版）である',
    '（03文書3.7節、GZ3のGO条件、01文書6.5節条件6）。',
    '',
    '## 3. 本文（E2E: HB-ID起点）',
    '',
    '| 正式要件ID | HB-ID | 経路 | 実装ファイル（逆引き） | API-ID（逆引き） | モジュール（逆引き） | IT対応確認 |',
    '|---|---|---|---|---|---|---|',
    ...rtmRows.map((r) => `| ${r.formalId} | ${r.hbId} | ${r.route} | ${r.implFile} | ${r.apiId} | ${r.module} | ${r.itCovered} |`),
    '',
    '## 3.1 本文（バッチ: BAT-ID起点）',
    '',
    '| 正式ID | BAT-ID | ジョブ名 |',
    '|---|---|---|',
    ...batRtmRows.map((r) => `| ${r.formalId} | ${r.batId} | ${r.job} |`),
    '',
    '## 7. 残課題',
    '',
    rtmRows.some((r) => r.implFile === '(未特定)' || r.apiId === '(未特定)')
      ? '静的解析でunresolvedと判定された項目がある（`00-13_課題管理表.md`を参照）。実装からの推測で埋めていない。'
      : '(なし)',
    '',
  ].join('\n');

  const header = buildDocHeader({ docNo: '05-02', docName: 'トレーサビリティマトリクス', author: 'QA', seiseikubun: SEISEIKUBUN.AS_BUILT });
  const marker = buildExecutionMarker({ skill: 'docs/05_テスト/traceability-reverse', generatedAt: new Date().toISOString() });
  const outPath = path.join(cwd, DOC_DIR, '05-02_トレーサビリティマトリクス.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, header + marker + '\n\n' + body, 'utf-8');
  markCatalogGenerated(cwd, { itemNo: '05-02', name: 'トレーサビリティマトリクス', section: '05' });

  console.log(JSON.stringify({ status: 'done', file: path.relative(cwd, outPath), hbCount: rtmRows.length, batCount: batRtmRows.length }, null, 2));
}

main();
