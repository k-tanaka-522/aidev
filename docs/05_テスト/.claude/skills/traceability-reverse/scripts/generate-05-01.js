#!/usr/bin/env node
'use strict';

/**
 * generate-05-01.js（docs/05_テスト/traceability-reverse 同梱スクリプト）
 *
 * 【目的・理由】
 * `05-01_テスト方針.md`（UT/IT/E2E/STの責務分担、6種ID体系の要約、03文書3.7節）を
 * `test-design-guide`（M1実装済み）の内容を転記して生成する。
 */

const fs = require('fs');
const path = require('path');
const { readTableAsObjects } = require('../../../../../../.claude/lib/markdown-table');
const { ledger0002Path, ledger0003Path } = require('../../../../../../.claude/lib/ledger-paths');
const { buildDocHeader, buildExecutionMarker, markCatalogGenerated, SEISEIKUBUN } = require('../../../../../../.claude/lib/reverse-common');

const DOC_DIR = path.join('docs', '05_テスト');

function main() {
  const cwd = process.cwd();
  const hbCount = readTableAsObjects(ledger0002Path(cwd)).length;
  const batCount = readTableAsObjects(ledger0003Path(cwd)).length;

  const body = [
    '# 05-01 テスト方針',
    '',
    '## 1. はじめに',
    '',
    '02文書10.1.2節・10.1節が定める6種ID体系（SCR/HB/API/NFR/RPT/BAT）に基づく',
    '試験レベルの責務分担を要約する（`test-design-guide` Skillの転記）。',
    '',
    '## 3. 本文',
    '',
    '| 試験レベル | 分母 | 機械抽出単位 |',
    '|---|---|---|',
    '| E2E | HB-ID全件 | `tests/e2e/`docblockのHB-ID |',
    '| IT（結合テスト） | API-ID全件 | `tests/integration/`docblockのAPI-ID |',
    '| ST（システムテスト・非機能） | NFR-ID全件 | 非機能検証テストのdocblockのNFR-ID |',
    '',
    `現時点の分母: HB-ID ${hbCount}件、BAT-ID ${batCount}件（画面非経由分はそのまま分母に算入、`,
    '03文書3.10.2節）。',
    '',
    '## 7. 残課題',
    '',
    '(なし)',
    '',
  ].join('\n');

  const header = buildDocHeader({ docNo: '05-01', docName: 'テスト方針', author: 'QA', seiseikubun: SEISEIKUBUN.AS_BUILT });
  const marker = buildExecutionMarker({ skill: 'docs/05_テスト/traceability-reverse', generatedAt: new Date().toISOString() });
  const outPath = path.join(cwd, DOC_DIR, '05-01_テスト方針.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, header + marker + '\n\n' + body, 'utf-8');
  markCatalogGenerated(cwd, { itemNo: '05-01', name: 'テスト方針', section: '05' });

  console.log(JSON.stringify({ status: 'done', file: path.relative(cwd, outPath) }, null, 2));
}

main();
