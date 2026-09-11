#!/usr/bin/env node
'use strict';

/**
 * reverse-doc.js（docs/02_要件定義 同梱スクリプト）
 *
 * 【目的・理由】
 * 決定ログ・`00-02`〜`00-03`台帳・契約モックから要件定義書一式（`02-01`〜`02-04`）を
 * as-built生成する（03文書3.4節）。`02-02`の生成に伴い`HB-ID`/`BAT-ID`を正式要件ID
 * （`F-{領域}-{連番}`/`F-BAT-{連番}`）へ変換する（01文書4.4.5節手順8、02文書9.4.1節の
 * 生成DAG「00-02 HB台帳（正式ID変換前）→ 02-02」に対応）。
 *
 * 【影響範囲】
 * `docs/02_要件定義/02-0{1,2,3,4}_*.md`、`docs/00_.../00-02`・`00-03`（正式ID列）、
 * `docs/00_.../00-01_成果物構成カタログ.md`。
 *
 * 【前提条件・制約】
 * - `--diff-check-only`指定時はdiff-check.js（9.5節）のみを実行する。
 * - `requirements-first`選択時は`02-01`を上書きしない（前倒し文書を保護する、MUST）。
 * - 9.4節「1件判明するごとに逐次追記」の原則に従い、各文書を生成し終えるたびに
 *   00-01カタログを更新する（まとめて最後に更新しない）。
 *
 * 【使い方】
 *   node reverse-doc.js
 *   node reverse-doc.js --diff-check-only
 */

const fs = require('fs');
const path = require('path');
const { readTableAsObjects } = require('../../../../../../.claude/lib/markdown-table');
const { ledger0002Path, ledger0003Path } = require('../../../../../../.claude/lib/ledger-paths');
const {
  buildDocHeader,
  buildExecutionMarker,
  markCatalogGenerated,
  excerptDecisions,
  convertHbIdsToFormalIds,
  convertBatIdsToFormalIds,
  SEISEIKUBUN,
} = require('../../../../../../.claude/lib/reverse-common');

const DOC_DIR = path.join('docs', '02_要件定義');

function readProcessOption(cwd) {
  try {
    const raw = fs.readFileSync(path.join(cwd, '.claude-state', 'process-option.json'), 'utf-8');
    const data = JSON.parse(raw);
    return data.mode === 'requirements-first' ? 'requirements-first' : 'prototype-driven';
  } catch (_err) {
    return 'prototype-driven';
  }
}

function writeDoc(cwd, { docNo, docName, seiseikubun, body }) {
  const header = buildDocHeader({ docNo, docName, author: 'App-Architect', seiseikubun });
  const marker = buildExecutionMarker({ skill: 'docs/02_要件定義/reverse-doc', generatedAt: new Date().toISOString() });
  const outPath = path.join(cwd, DOC_DIR, `${docNo}_${docName}.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, header + marker + '\n\n' + body, 'utf-8');
  markCatalogGenerated(cwd, { itemNo: docNo, name: docName, section: '02' });
  return outPath;
}

function generate0201(cwd) {
  const { section } = excerptDecisions(cwd, { categoryIncludes: ['事業背景', 'スコープ', '法規制', 'アーキテクチャ'] });
  const hbRows = readTableAsObjects(ledger0002Path(cwd));
  const body = [
    '# 02-01 要件定義書',
    '',
    '## 1. はじめに',
    '',
    '本書はZone3のas-builtリバース生成により、決定ログ・ハリボテ・実装から自動生成された',
    '要件定義書である（01文書4.6.3節）。01番（システム企画相当）に対応する背景・スコープは',
    '本章に統合する（02文書4.2.1節、03文書3.3節）。',
    '',
    section,
    '## 3. 本文',
    '',
    `本システムが提供する機能の一覧は\`02-02_機能要件一覧.md\`を参照する。現時点で採番済みの`,
    `\`HB-ID\`は${hbRows.length}件である。`,
    '',
    '## 4. 非機能要件への対応',
    '',
    '詳細は`02-03_非機能要件一覧.md`を参照する。',
    '',
    '## 7. 残課題',
    '',
    '決定ログに根拠が見つからない判断は「未記載」と明記している（02文書9.3節）。',
    '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '02-01', docName: '要件定義書', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function generate0202(cwd) {
  const hbConverted = convertHbIdsToFormalIds(cwd);
  const batConverted = convertBatIdsToFormalIds(cwd);
  const body = [
    '# 02-02 機能要件一覧',
    '',
    '## 1. はじめに',
    '',
    '`HB-ID`（機能／E2Eシナリオ単位）・`BAT-ID`（バッチジョブ単位）を、01文書4.4.5節',
    '手順8に従い正式要件IDへ変換した一覧である。',
    '',
    '## 3. 本文（HB-ID → 正式機能要件ID 変換対応表）',
    '',
    '| HB-ID | 正式要件ID | 経路 |',
    '|---|---|---|',
    ...hbConverted.map((r) => `| ${r.hbId} | ${r.formalId} | ${r.route || ''} |`),
    '',
    '## 3.1 BAT-ID → 正式バッチ要件ID 変換対応表',
    '',
    '| BAT-ID | 正式ID |',
    '|---|---|',
    ...batConverted.map((r) => `| ${r.batId} | ${r.formalId} |`),
    '',
    '## 7. 残課題',
    '',
    hbConverted.length === 0 && batConverted.length === 0
      ? '変換対象の`HB-ID`/`BAT-ID`が存在しない（Zone1〜2で同期点が未通過の可能性がある）。'
      : '(なし)',
    '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '02-02', docName: '機能要件一覧', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function generate0203(cwd) {
  const { section, matched } = excerptDecisions(cwd, { categoryIncludes: ['非機能'] });
  const decisions = require('../../../../../../.claude/lib/decisions').listDecisionFiles(cwd);
  const nfrRows = decisions.filter((d) => d.data['NFR-ID']);
  const body = [
    '# 02-03 非機能要件一覧',
    '',
    '## 1. はじめに',
    '',
    '01文書4.4.5節が定める`NFR-ID`（非機能要件1件の粒度）を決定ログから転記する。',
    '',
    section,
    '## 3. 本文（NFR-ID一覧）',
    '',
    '| NFR-ID | 決定ID | 内容 |',
    '|---|---|---|',
    ...nfrRows.map((d) => `| ${d.data['NFR-ID']} | ${d.data['決定ID']} | ${(d.data['決定内容'] || '').slice(0, 80)} |`),
    '',
    matched.length === 0 && nfrRows.length === 0 ? '未記載（該当する非機能決定ログが見つからなかった）。' : '',
    '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '02-03', docName: '非機能要件一覧', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function generate0204(cwd) {
  const { section } = excerptDecisions(cwd, { categoryIncludes: ['外部連携'] });
  const contractsDir = path.join(cwd, 'docs', '00_プロジェクト管理・ガバナンス', 'decisions', 'contracts');
  let contractFiles = [];
  try {
    contractFiles = fs.readdirSync(contractsDir).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  } catch (_err) {
    contractFiles = [];
  }
  if (contractFiles.length === 0) {
    // 条件付き必須（外部連携がある案件のみ、03文書3.4節）。契約モックが存在しない場合は
    // 対象外として00-01カタログに「対象外」を記録し、実体ファイルは生成しない（MUST NOT
    // 空文書の生成、4.5節「省略した場合の記録」に準じる）。
    markCatalogGenerated(cwd, { itemNo: '02-04', name: '外部インターフェース要件', section: '02', status: 'excluded' });
    return null;
  }
  const body = [
    '# 02-04 外部インターフェース要件',
    '',
    '## 1. はじめに',
    '',
    section,
    '## 3. 本文',
    '',
    ...contractFiles.map((f) => `- ${f}`),
    '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '02-04', docName: '外部インターフェース要件', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function main() {
  const cwd = process.cwd();
  const args = process.argv.slice(2);
  const diffCheckOnly = args.includes('--diff-check-only');

  const mode = readProcessOption(cwd);
  const results = { mode };

  if (mode === 'requirements-first') {
    const doc0201Path = path.join(cwd, DOC_DIR, '02-01_要件定義書.md');
    if (fs.existsSync(doc0201Path)) {
      // eslint-disable-next-line global-require
      require('./diff-check.js');
      results.diffCheckRan = true;
    } else {
      console.error('[reverse-doc] requirements-first選択時ですが02-01（前倒し版）が見つかりません。');
    }
  }

  if (diffCheckOnly) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  const generated = [];
  if (mode !== 'requirements-first') {
    generated.push(generate0201(cwd));
  } else {
    console.error('[reverse-doc] requirements-first選択時のため02-01（前倒し文書）は上書きしません。');
  }
  generated.push(generate0202(cwd));
  generated.push(generate0203(cwd));
  const doc0204 = generate0204(cwd);
  if (doc0204) generated.push(doc0204);

  results.generated = generated.filter(Boolean).map((p) => path.relative(cwd, p));
  console.log(JSON.stringify(results, null, 2));
}

main();
