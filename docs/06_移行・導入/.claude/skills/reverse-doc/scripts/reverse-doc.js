#!/usr/bin/env node
'use strict';

/**
 * reverse-doc.js（docs/06_移行・導入 同梱スクリプト）
 *
 * 【目的・理由】
 * 01文書4.6.1節・03文書3.8節（版1.3）に従い、GZ2以前（リリース実施より前）に
 * 06-01〜06-04をas-built生成する。データ移行を伴わない案件は06-01/06-02を
 * 「対象外」とする（03文書4.3節）。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const {
  buildDocHeader,
  buildExecutionMarker,
  markCatalogGenerated,
  excerptDecisions,
  SEISEIKUBUN,
} = require('../../../../../../.claude/lib/reverse-common');

const DOC_DIR = path.join('docs', '06_移行・導入');

function writeDoc(cwd, { docNo, docName, seiseikubun, body, author }) {
  const header = buildDocHeader({ docNo, docName, author, seiseikubun });
  const marker = buildExecutionMarker({ skill: 'docs/06_移行・導入/reverse-doc', generatedAt: new Date().toISOString() });
  const outPath = path.join(cwd, DOC_DIR, `${docNo}_${docName}.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, header + marker + '\n\n' + body, 'utf-8');
  markCatalogGenerated(cwd, { itemNo: docNo, name: docName, section: '06' });
  return outPath;
}

function hasMigrationDecision(cwd) {
  const { matched } = excerptDecisions(cwd, { categoryIncludes: ['データ移行', 'リプレース'] });
  return matched.length > 0;
}

function gen0601_0602(cwd) {
  if (!hasMigrationDecision(cwd)) {
    markCatalogGenerated(cwd, { itemNo: '06-01', name: '移行計画書', section: '06', status: 'excluded' });
    markCatalogGenerated(cwd, { itemNo: '06-02', name: '移行手順書', section: '06', status: 'excluded' });
    return [];
  }
  const { section } = excerptDecisions(cwd, { categoryIncludes: ['データ移行', 'リプレース'] });
  const body1 = ['# 06-01 移行計画書', '', '## 1. はじめに', '', section, ''].join('\n');
  const body2 = ['# 06-02 移行手順書', '', '## 1. はじめに', '', '(移行手順の詳細は決定ログ・実装から転記する)', ''].join('\n');
  return [
    writeDoc(cwd, { docNo: '06-01', docName: '移行計画書', seiseikubun: SEISEIKUBUN.AS_BUILT, body: body1, author: 'Infra-Architect' }),
    writeDoc(cwd, { docNo: '06-02', docName: '移行手順書', seiseikubun: SEISEIKUBUN.AS_BUILT, body: body2, author: 'SRE' }),
  ];
}

function gen0603(cwd) {
  // 契約上の検収物指定が無い場合はtests/配下のCI実行ログで代替してよい（03文書4.3節）。
  // 本実装はtests/e2e・tests/integrationの件数を「実施結果」として集計する簡易版とする。
  let e2eCount = 0;
  let itCount = 0;
  try {
    e2eCount = fs.readdirSync(path.join(cwd, 'tests', 'e2e')).length;
  } catch (_err) {
    e2eCount = 0;
  }
  try {
    itCount = fs.readdirSync(path.join(cwd, 'tests', 'integration')).length;
  } catch (_err) {
    itCount = 0;
  }
  const body = [
    '# 06-03 受入テスト結果報告書', '', '## 1. はじめに', '',
    'GZ2のGO判定材料の一つとして位置づける（01文書4.6.1節）。', '',
    '## 3. 結果（tests/配下のテストファイル件数による簡易集計）', '',
    `- E2Eテストファイル数: ${e2eCount}`, `- 結合テストファイル数: ${itCount}`, '',
    '## 5. 残課題', '', '契約上の検収物指定がある場合は、実行ログ（CI）へのリンクを追加すること。', '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '06-03', docName: '受入テスト結果報告書', seiseikubun: SEISEIKUBUN.AS_BUILT, body, author: 'QA' });
}

function gen0604(cwd) {
  let lastCommit = '(git情報なし)';
  try {
    lastCommit = execSync('git log -1 --format=%H', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch (_err) {
    lastCommit = '(git情報なし)';
  }
  const body = [
    '# 06-04 リリース手順書', '', '## 1. はじめに', '',
    'リリース実施（SRE主導、dry-run→承認→本番実行の3ステップ、01文書4.6.1節・02文書12章）の', '直前に確定する手順書である。', '',
    '## 3. 作業手順', '', '1. dry-run（差分確認）', '2. ユーザー承認', '3. 本番実行', '',
    `最終コミット: ${lastCommit}`, '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '06-04', docName: 'リリース手順書', seiseikubun: SEISEIKUBUN.AS_BUILT, body, author: 'SRE' });
}

function main() {
  const cwd = process.cwd();
  const generated = [...gen0601_0602(cwd), gen0603(cwd), gen0604(cwd)].filter(Boolean).map((p) => path.relative(cwd, p));
  console.log(JSON.stringify({ status: 'done', generated }, null, 2));
}

main();
