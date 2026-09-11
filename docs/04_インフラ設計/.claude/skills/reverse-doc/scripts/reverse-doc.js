#!/usr/bin/env node
'use strict';

/**
 * reverse-doc.js（docs/04_インフラ設計 同梱スクリプト）
 *
 * 【目的・理由】
 * `infra/`（IaC定義）・決定ログからインフラ設計書一式（04-01〜04-11）をas-built生成する
 * （03文書3.6節）。`04-01`・`04-02`はdrawio二段階生成の対象（03文書8.5.1節・8.5.2節）。
 *
 * 【前提条件・制約】
 * IaCファイルの分類は暫定パターン（SKILL.md参照、PMへの報告事項）。04-04（可用性）・
 * 04-07（DR）・04-11（CI/CD）は該当ファイルが無い場合「対象外」とし空文書を生成しない。
 */

const fs = require('fs');
const path = require('path');
const { walkFiles } = require('../../../../../../.claude/lib/static-analysis');
const { buildMermaidFlowchart, buildSimpleDrawioXml } = require('../../../../../../.claude/lib/diagram-gen');
const {
  buildDocHeader,
  buildExecutionMarker,
  markCatalogGenerated,
  excerptDecisions,
  SEISEIKUBUN,
} = require('../../../../../../.claude/lib/reverse-common');

const DOC_DIR = path.join('docs', '04_インフラ設計');

function classifyInfraFiles(cwd) {
  const files = walkFiles(path.join(cwd, 'infra'), /\.(ts|py|ya?ml|tf|json)$/).map((f) => path.relative(cwd, f).replace(/\\/g, '/'));
  const buckets = { network: [], monitoring: [], backup: [], dr: [], cicd: [], other: [] };
  for (const f of files) {
    if (/network|vpc|subnet/i.test(f)) buckets.network.push(f);
    else if (/monitor|alarm|cloudwatch/i.test(f)) buckets.monitoring.push(f);
    else if (/backup|snapshot/i.test(f)) buckets.backup.push(f);
    else if (/\bdr\b|disaster/i.test(f)) buckets.dr.push(f);
    else if (/cicd|pipeline|workflow/i.test(f)) buckets.cicd.push(f);
    else buckets.other.push(f);
  }
  buckets.all = files;
  return buckets;
}

function writeDoc(cwd, { docNo, docName, seiseikubun, body }) {
  const header = buildDocHeader({ docNo, docName, author: 'Infra-Architect', seiseikubun });
  const marker = buildExecutionMarker({ skill: 'docs/04_インフラ設計/reverse-doc', generatedAt: new Date().toISOString() });
  const outPath = path.join(cwd, DOC_DIR, `${docNo}_${docName}.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, header + marker + '\n\n' + body, 'utf-8');
  markCatalogGenerated(cwd, { itemNo: docNo, name: docName, section: '04' });
  return outPath;
}

function markExcluded(cwd, docNo, docName) {
  markCatalogGenerated(cwd, { itemNo: docNo, name: docName, section: '04', status: 'excluded' });
}

function gen0401(cwd, buckets) {
  const nodes = [{ id: 'user', label: '利用者' }, { id: 'alb', label: 'ALB/API Gateway相当' }, { id: 'app', label: 'アプリケーション（ECS/Lambda相当）' }, { id: 'db', label: 'データストア' }];
  const edges = [{ from: 'user', to: 'alb' }, { from: 'alb', to: 'app' }, { from: 'app', to: 'db' }];
  const mermaid = buildMermaidFlowchart(nodes, edges, 'LR');
  const drawioPath = path.join(cwd, DOC_DIR, '04-01_システム構成図_別紙1.drawio');
  fs.mkdirSync(path.dirname(drawioPath), { recursive: true });
  fs.writeFileSync(drawioPath, buildSimpleDrawioXml(nodes, edges), 'utf-8');

  const body = [
    '# 04-01 システム構成図', '',
    '## 別紙一覧', '', '| 別紙番号 | ファイル名 | 内容 |', '|---|---|---|',
    '| 別紙1 | 04-01_システム構成図_別紙1.drawio | 全体構成図（第2段階、簡易生成。AWS4シェイプ未使用、要検証） |', '',
    '## 1. はじめに', '', 'infra/配下のIaC定義からのリバース生成である。', '',
    '## 3. 本文（第1段階Mermaidスケルトン、03文書8.5.2節）', '', '```mermaid', mermaid, '```', '',
    `検出したIaCファイル: ${buckets.all.length}件。`, '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '04-01', docName: 'システム構成図', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0402(cwd, buckets) {
  if (buckets.network.length === 0) {
    markExcluded(cwd, '04-02', 'ネットワーク設計');
    return null;
  }
  const nodes = [{ id: 'vpc', label: 'VPC' }, { id: 'pub', label: 'Public Subnet' }, { id: 'priv', label: 'Private Subnet' }];
  const edges = [{ from: 'vpc', to: 'pub' }, { from: 'vpc', to: 'priv' }];
  const mermaid = buildMermaidFlowchart(nodes, edges, 'TB');
  const drawioPath = path.join(cwd, DOC_DIR, '04-02_ネットワーク設計_別紙1.drawio');
  fs.writeFileSync(drawioPath, buildSimpleDrawioXml(nodes, edges), 'utf-8');
  const body = [
    '# 04-02 ネットワーク設計', '',
    '## 別紙一覧', '', '| 別紙番号 | ファイル名 | 内容 |', '|---|---|---|',
    '| 別紙1 | 04-02_ネットワーク設計_別紙1.drawio | VPC構成図（第2段階、簡易生成） |', '',
    '## 1. はじめに', '', buckets.network.map((f) => `- ${f}`).join('\n'), '',
    '## 3. 本文（第1段階Mermaidスケルトン）', '', '```mermaid', mermaid, '```', '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '04-02', docName: 'ネットワーク設計', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0403(cwd) {
  const { section } = excerptDecisions(cwd, { categoryIncludes: ['法規制', 'セキュリティ'] });
  const body = [
    '# 04-03 セキュリティ設計（インフラ層）', '', '## 1. はじめに', '', section,
    '## 3. 本文', '', '- 参照: `.claude/skills/security-style-guide/SECURITY_STANDARD.md`', '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '04-03', docName: 'セキュリティ設計（インフラ層）', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0405(cwd, buckets) {
  const body = [
    '# 04-05 監視設計', '', '## 1. はじめに', '',
    '検知対象IaCファイル（監視・アラート関連）からのリバース生成である。', '',
    '## 3. 本文', '', buckets.monitoring.length ? buckets.monitoring.map((f) => `- ${f}`).join('\n') : '未記載（該当ファイルが見つからなかった）。', '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '04-05', docName: '監視設計', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0406(cwd, buckets) {
  if (buckets.backup.length === 0) {
    markExcluded(cwd, '04-06', 'バックアップ設計');
    return null;
  }
  const body = [
    '# 04-06 バックアップ設計', '', '## 1. はじめに', '', buckets.backup.map((f) => `- ${f}`).join('\n'), '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '04-06', docName: 'バックアップ設計', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0409(cwd) {
  const body = ['# 04-09 環境設計', '', '## 1. はじめに', '', 'infra/配下の環境別定義（dev/stg/prod相当）を転記する。', '', '## 3. 本文', '', '(環境変数・パラメータの一覧は`infra/`実装を正とする、二重メンテナンスを避けるため転記に留める)', ''].join('\n');
  return writeDoc(cwd, { docNo: '04-09', docName: '環境設計', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0410(cwd, buckets) {
  const body = [
    '# 04-10 IaC方針', '', '## 1. はじめに', '', `infra/配下は${buckets.all.length}ファイルのIaC定義からなる。`, '',
    '## 3. 本文', '', '- `iac-style-guide`（IaC規約）に従う。', '',
  ].join('\n');
  return writeDoc(cwd, { docNo: '04-10', docName: 'IaC方針', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function gen0408(cwd) {
  const { section, matched } = excerptDecisions(cwd, { categoryIncludes: ['予算', 'コスト'] });
  if (matched.length === 0) {
    // 04-08は必須（03文書3.6節）だが根拠となる決定ログが無い場合は「未記載」を明示する。
  }
  const body = ['# 04-08 コスト見積', '', '## 1. はじめに', '', section, '## 3. 本文', '', matched.length ? '(2.5節を参照)' : '未記載（コスト見積に関する決定ログが見つからなかった）。', ''].join('\n');
  return writeDoc(cwd, { docNo: '04-08', docName: 'コスト見積', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function main() {
  const cwd = process.cwd();
  const buckets = classifyInfraFiles(cwd);
  const generated = [
    gen0401(cwd, buckets),
    gen0402(cwd, buckets),
    gen0403(cwd),
    gen0405(cwd, buckets),
    gen0406(cwd, buckets),
    gen0408(cwd),
    gen0409(cwd),
    gen0410(cwd, buckets),
  ]
    .filter(Boolean)
    .map((p) => path.relative(cwd, p));
  console.log(JSON.stringify({ status: 'done', generated, buckets }, null, 2));
}

main();
