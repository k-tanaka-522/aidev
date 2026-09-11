#!/usr/bin/env node
'use strict';

/**
 * reverse-doc.js（docs/03_アプリケーション設計 同梱スクリプト）
 *
 * 【目的・理由】
 * `src/backend`・`src/frontend`・`prototypes/`・決定ログからアプリケーション設計書一式
 * （03-01〜03-10）をas-built生成する（03文書3.5節）。03-10（CRUD図）は9.1.2節の
 * 静的解析、03-03（ER図）はMermaid、03-09（バッチ設計）は8.5節の二段階drawio生成の
 * 対象とする。
 *
 * 【前提条件・制約】
 * 03-04（API設計）は契約モックが存在する場合のみ、03-05（画面設計）はSCREEN_ID_INDEXに
 * 行がある場合のみ、03-08（帳票設計）はREPORT_ID_INDEXに行がある場合のみ、03-09（バッチ
 * 設計）は00-03に行がある場合のみ生成する（条件付き必須の機械判定、03文書4章・7章）。
 * 該当が無い場合は00-01カタログへ「対象外」を記録し空文書を生成しない（MUST NOT）。
 */

const fs = require('fs');
const path = require('path');
const { readTableAsObjects } = require('../../../../../../.claude/lib/markdown-table');
const { ledger0003Path } = require('../../../../../../.claude/lib/ledger-paths');
const {
  buildDocHeader,
  buildExecutionMarker,
  markCatalogGenerated,
  excerptDecisions,
  SEISEIKUBUN,
} = require('../../../../../../.claude/lib/reverse-common');
const { buildMermaidFlowchart, buildSimpleDrawioXml } = require('../../../../../../.claude/lib/diagram-gen');
const {
  scanOrmTables,
  scanBackendRoutes,
  scanContractApiIds,
  buildCrudMatrix,
} = require('../../../../../../.claude/lib/static-analysis');

const DOC_DIR = path.join('docs', '03_アプリケーション設計');

function writeDoc(cwd, { docNo, docName, seiseikubun, body, author = 'App-Architect' }) {
  const header = buildDocHeader({ docNo, docName, author, seiseikubun });
  const marker = buildExecutionMarker({ skill: 'docs/03_アプリケーション設計/reverse-doc', generatedAt: new Date().toISOString() });
  const outPath = path.join(cwd, DOC_DIR, `${docNo}_${docName}.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, header + marker + '\n\n' + body, 'utf-8');
  markCatalogGenerated(cwd, { itemNo: docNo, name: docName, section: '03' });
  return outPath;
}

function markExcluded(cwd, docNo, docName) {
  markCatalogGenerated(cwd, { itemNo: docNo, name: docName, section: '03', status: 'excluded' });
}

function readIndexRows(cwd, relPath) {
  try {
    return readTableAsObjects(path.join(cwd, relPath));
  } catch (_err) {
    return [];
  }
}

function gen0301(cwd) {
  const { section } = excerptDecisions(cwd, { categoryIncludes: ['アーキテクチャ'] });
  const backendRoutes = scanBackendRoutes(cwd);
  const body = [
    '# 03-01 アーキテクチャ概要', '', '## 1. はじめに', '',
    'src/backend・src/frontendの構成と決定ログから、アーキテクチャの全体像をas-built生成する。',
    '', section,
    '## 3. 本文', '',
    `バックエンドのルーティング定義数: ${backendRoutes.length}件。`, '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '03-01', docName: 'アーキテクチャ概要', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0302(cwd) {
  const tables = scanOrmTables(cwd);
  const nodes = tables.map((t) => ({ id: t.table, label: t.table }));
  const mermaid = buildMermaidFlowchart(nodes, [], 'TB');
  const body = [
    '# 03-02 コンポーネント設計', '', '## 1. はじめに', '',
    'src/backend/models配下のORM定義から、主要コンポーネント（データエンティティ）を', '抽出した一覧である。', '',
    '## 3. 本文（第1段階Mermaidスケルトン、03文書8.5.2節）', '',
    '```mermaid', mermaid, '```', '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '03-02', docName: 'コンポーネント設計', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0303(cwd) {
  const tables = scanOrmTables(cwd);
  const erLines = ['erDiagram', ...tables.map((t) => `    ${t.table} { string id }`)];
  const body = [
    '# 03-03 データモデル設計（ER図）', '', '## 1. はじめに', '',
    'ORM定義（src/backend/models）からのリバース生成である（Mermaid形式、03文書8.5.1節）。', '',
    '## 3. 本文', '', '```mermaid', erLines.join('\n'), '```', '',
    '## 7. 残課題', '',
    'カラム定義・リレーションの詳細抽出はアダプタが対応するORM記法（@Column等）の範囲に', '限られる（`.claude/lib/static-analysis.js`参照）。', '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '03-03', docName: 'データモデル設計', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0304(cwd) {
  const contractApiIds = scanContractApiIds(cwd);
  if (contractApiIds.length === 0) {
    markExcluded(cwd, '03-04', 'API設計');
    return null;
  }
  const body = [
    '# 03-04 API設計', '', '## 1. はじめに', '',
    '`decisions/contracts/*.openapi.yaml`（契約モック）からのリバース生成である。', '',
    '## 3. 本文', '',
    '| API-ID | メソッド | パス | operationId | 契約モック |',
    '|---|---|---|---|---|',
    ...contractApiIds.map((a) => `| ${a.apiId || '(未採番)'} | ${a.method} | ${a.routePath} | ${a.operationId || ''} | ${a.file} |`),
    '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '03-04', docName: 'API設計', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0305(cwd) {
  const rows = readIndexRows(cwd, path.join('prototypes', 'SCREEN_ID_INDEX.md'));
  if (rows.length === 0) {
    markExcluded(cwd, '03-05', '画面設計');
    return null;
  }
  const nodes = rows.map((r) => ({ id: (r['SCR-ID'] || '').replace(/-/g, '_'), label: `${r['SCR-ID']} ${r['画面名'] || ''}` }));
  const mermaid = buildMermaidFlowchart(nodes, [], 'LR');
  const body = [
    '# 03-05 画面設計', '', '## 1. はじめに', '',
    '`prototypes/`確定版＋`SCREEN_ID_INDEX.md`からのリバース生成である。', '',
    '## 3. 本文（画面一覧）', '',
    '| SCR-ID | 画面名 | ファイル |', '|---|---|---|',
    ...rows.map((r) => `| ${r['SCR-ID']} | ${r['画面名'] || ''} | ${r['ファイル'] || ''} |`),
    '', '## 3.1 画面遷移図（既定: Mermaid、03文書8.5.1節）', '',
    '```mermaid', mermaid, '```', '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '03-05', docName: '画面設計', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0306(cwd) {
  const body = [
    '# 03-06 セキュリティ設計（アプリ層）', '', '## 1. はじめに', '',
    '共通セキュリティ基準は`.claude/skills/security-style-guide/SECURITY_STANDARD.md`を', '正本とし、本書は転記・複製せずリンク参照する（02文書4.4節、doc-style-guide/SKILL.md）。', '',
    '## 3. 本文', '',
    '- 参照: `.claude/skills/security-style-guide/SECURITY_STANDARD.md`', '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '03-06', docName: 'セキュリティ設計（アプリ層）', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0307(cwd) {
  const { section } = excerptDecisions(cwd, { categoryIncludes: ['アーキテクチャ'] });
  const body = [
    '# 03-07 実装方針', '', '## 1. はじめに', '', section,
    '## 3. 本文', '', '`code-style-guide`（言語規約・フレームワーク規約・DB設計規約）に従う実装方針である。', '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '03-07', docName: '実装方針', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0308(cwd) {
  const rows = readIndexRows(cwd, path.join('prototypes', 'REPORT_ID_INDEX.md'));
  if (rows.length === 0) {
    markExcluded(cwd, '03-08', '帳票設計');
    return null;
  }
  const body = [
    '# 03-08 帳票設計', '', '## 1. はじめに', '',
    '`prototypes/reports/`の帳票ハリボテ＋`REPORT_ID_INDEX.md`からのリバース生成である。', '',
    '## 3. 本文（帳票一覧）', '', '| RPT-ID | 帳票名 | ファイル |', '|---|---|---|',
    ...rows.map((r) => `| ${r['RPT-ID']} | ${r['帳票名'] || ''} | ${r['ファイル'] || ''} |`), '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '03-08', docName: '帳票設計', seiseikubun: SEISEIKUBUN.AS_BUILT, author: 'Designer', body });
}

function gen0309(cwd) {
  const rows = readTableAsObjects(ledger0003Path(cwd));
  if (rows.length === 0) {
    markExcluded(cwd, '03-09', 'バッチ設計');
    return null;
  }
  // 8.5節: 業務フロー図はdrawio形式。第1段階Mermaidスケルトンを本文に残し、
  // 第2段階drawio別紙を生成する（03文書8.5.2節、二段階生成）。
  const nodes = [{ id: 'start', label: '起動（スケジューラ）' }, ...rows.map((r, i) => ({ id: `job${i}`, label: r['ジョブ名'] })), { id: 'end', label: '完了' }];
  const edges = [{ from: 'start', to: nodes[1] ? nodes[1].id : 'end' }, ...rows.slice(0, -1).map((_, i) => ({ from: `job${i}`, to: `job${i + 1}` }))];
  if (rows.length > 0) edges.push({ from: `job${rows.length - 1}`, to: 'end' });
  const mermaid = buildMermaidFlowchart(nodes, edges, 'LR');
  const drawioPath = path.join(cwd, DOC_DIR, '03-09_バッチ設計_別紙1.drawio');
  fs.mkdirSync(path.dirname(drawioPath), { recursive: true });
  fs.writeFileSync(drawioPath, buildSimpleDrawioXml(nodes, edges), 'utf-8');

  const body = [
    '# 03-09 バッチ設計', '',
    '## 別紙一覧', '', '| 別紙番号 | ファイル名 | 内容 |', '|---|---|---|',
    '| 別紙1 | 03-09_バッチ設計_別紙1.drawio | バッチ処理フロー図（第2段階、簡易生成。9.7節要検証） |', '',
    '## 1. はじめに', '',
    '`00-03_バッチトレーサビリティ台帳.md`＋入出力仕様（決定ログ配下）からのリバース生成である。', '',
    '## 3. 本文（バッチ処理一覧）', '', '| BAT-ID | ジョブ名 | 入出力仕様参照 |', '|---|---|---|',
    ...rows.map((r) => `| ${r['BAT-ID']} | ${r['ジョブ名']} | ${r['入出力仕様参照（decisions/配下）']} |`), '',
    '## 3.1 処理フロー図（第1段階Mermaidスケルトン。別紙1のdrawioが正式版、03文書8.5.2節）', '',
    '```mermaid', mermaid, '```', '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '03-09', docName: 'バッチ設計', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0310(cwd) {
  const { matrix, unresolved } = buildCrudMatrix(cwd);
  const tables = Object.keys(matrix);
  const features = Array.from(new Set(tables.flatMap((t) => Object.keys(matrix[t]))));
  const headerLine = '| テーブル＼機能 | ' + features.join(' | ') + ' |';
  const sep = '|---|' + features.map(() => '---').join('|') + '|';
  const rows = tables.map((t) => {
    const cells = features.map((f) => {
      const ops = matrix[t][f];
      return ops ? Array.from(ops).sort().join('') : '';
    });
    return `| ${t} | ${cells.join(' | ')} |`;
  });
  const body = [
    '# 03-10 CRUD図', '', '## 1. はじめに', '',
    'ORM定義（テーブル）×データアクセス層のCRUD操作を機能単位（API-ID等）に紐づけた', 'マトリクスである（02文書9.1.2節、03文書3.11節）。', '',
    '## 3. 本文', '', headerLine, sep, ...rows, '',
    '## 7. 残課題', '',
    unresolved.length
      ? unresolved.map((u) => `- ${u.table}（${u.operation}, ${u.file}）: ${u.reason}`).join('\n')
      : '(なし)',
    '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '03-10', docName: 'CRUD図', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function main() {
  const cwd = process.cwd();
  const generated = [gen0301(cwd), gen0302(cwd), gen0303(cwd), gen0304(cwd), gen0305(cwd), gen0306(cwd), gen0307(cwd), gen0308(cwd), gen0309(cwd), gen0310(cwd)]
    .filter(Boolean)
    .map((p) => path.relative(cwd, p));
  console.log(JSON.stringify({ status: 'done', generated }, null, 2));
}

main();
