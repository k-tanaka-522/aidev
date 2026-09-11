#!/usr/bin/env node
'use strict';

/**
 * reverse-doc.js（docs/07_運用・保守 同梱スクリプト）
 *
 * 【目的・理由】
 * `00-04_運用項目一覧.md`・決定ログ（`運用項目コード`frontmatter）・実物から、
 * `07-00`（単独文書、全分類コードをセクションとして格納）と`07-10`/`07-20`（群、
 * 04文書5.3節の固定対応表に従う分類項目ごとの固定文書）をas-built生成する。
 *
 * 【前提条件・制約】
 * 04文書6章「条件B」（M2・B5・M10）は判断基準・体制情報を実物から復元できないため、
 * 対応する決定ログ（`運用項目コード`フィールドが一致するエントリ）が無ければ
 * 「未記載」と明記し、実装から推測しない（MUST、04文書6.3節）。
 */

const fs = require('fs');
const path = require('path');
const { readTableAsObjects } = require('../../../../../../.claude/lib/markdown-table');
const { ledger0004Path } = require('../../../../../../.claude/lib/ledger-paths');
const { OPS_MAPPING, DOC_TITLES, CONDITION_B_CODES } = require('../../../../../../.claude/lib/ops-mapping');
const {
  buildDocHeader,
  buildExecutionMarker,
  markCatalogGenerated,
  SEISEIKUBUN,
} = require('../../../../../../.claude/lib/reverse-common');
const { listDecisionFiles } = require('../../../../../../.claude/lib/decisions');

const DOC_DIR = path.join('docs', '07_運用・保守');

function writeDoc(cwd, { docNo, docName, dir, seiseikubun, body, author = 'SRE' }) {
  const header = buildDocHeader({ docNo, docName, author, seiseikubun });
  const marker = buildExecutionMarker({ skill: 'docs/07_運用・保守/reverse-doc', generatedAt: new Date().toISOString() });
  const outPath = path.join(cwd, DOC_DIR, dir || '', `${docNo}_${docName}.md`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, header + marker + '\n\n' + body, 'utf-8');
  markCatalogGenerated(cwd, { itemNo: docNo, name: docName, section: '07' });
  return outPath;
}

function findOpsDecision(cwd, code) {
  const all = listDecisionFiles(cwd);
  return all.find((d) => (d.data['運用項目コード'] || '') === code);
}

function gen0700(cwd, opsItems) {
  const byCode = {};
  for (const item of opsItems) {
    const code = item['分類コード（B/I/M）'];
    byCode[code] = byCode[code] || [];
    byCode[code].push(item);
  }

  const sections = [];
  sections.push('## 別紙一覧', '', '| 別紙番号 | 種別 | タイトル | 参照箇所 |', '|---|---|---|---|');
  sections.push(
    '| 別紙1 | drawio | インシデント対応運用フロー図 | M2 インシデント対応運用設計 |',
    ''
  );
  for (const code of Object.keys(OPS_MAPPING)) {
    const mapping = OPS_MAPPING[code];
    const items = byCode[code] || [];
    sections.push(`### ${code} ${mapping.section}`, '');
    if (CONDITION_B_CODES.includes(code)) {
      const decision = findOpsDecision(cwd, code);
      if (decision) {
        sections.push(`（決定ログより転記、04文書6章「条件B」該当）: ${decision.data['決定内容']}`, '');
      } else {
        sections.push('未記載（対応する決定ログ（`運用項目コード`フィールド）が見つからなかった。実装から推測しない、04文書6.3節）。', '');
      }
    } else if (items.length > 0) {
      sections.push(...items.map((it) => `- ${it['タスク名']}（頻度: ${it['頻度']}、担当: ${it['担当']}、根拠: ${it['根拠（決定ログID or 実装パス）']}）`));
      sections.push('');
    } else {
      sections.push('（該当する運用項目が`00-04`に登録されていない）', '');
    }
    if (mapping.doc) sections.push(`対応文書: \`${mapping.doc}_${DOC_TITLES[mapping.doc] || ''}\``, '');
  }

  const body = [
    '# 07-00 運用設計書', '',
    ...sections,
  ].join('\n');
  return writeDoc(cwd, { docNo: '07-00', docName: '運用設計書', seiseikubun: SEISEIKUBUN.AS_BUILT, body });
}

function genGroupDocs(cwd, opsItems) {
  const byCode = {};
  for (const item of opsItems) {
    const code = item['分類コード（B/I/M）'];
    byCode[code] = byCode[code] || [];
    byCode[code].push(item);
  }
  const generated = [];
  const groupedByDoc = {};
  for (const [code, mapping] of Object.entries(OPS_MAPPING)) {
    if (!mapping.doc) continue;
    // 03文書3.9節: 07-50（廃棄プロセス）はZone4（稼働後、廃止判断が下された時点）に
    // 生成する。Zone3のリバース生成時点では廃止判断ログが無ければ生成しない（対象外）。
    if (code === 'M10' && !findOpsDecision(cwd, 'M10')) {
      markCatalogGenerated(cwd, { itemNo: mapping.doc, name: DOC_TITLES[mapping.doc] || mapping.doc, section: '07', status: 'excluded' });
      continue;
    }
    groupedByDoc[mapping.doc] = groupedByDoc[mapping.doc] || [];
    groupedByDoc[mapping.doc].push({ code, mapping, items: byCode[code] || [] });
  }
  for (const [docId, entries] of Object.entries(groupedByDoc)) {
    const [prefix, groupNo, seq] = docId.split('-');
    const dirName = `${prefix}-${groupNo}`;
    const title = DOC_TITLES[docId] || docId;
    const body = [
      `# ${docId} ${title}`, '',
      '## 1. はじめに', '',
      `本手順書は\`07-00_運用設計書.md\`の${entries.map((e) => `${e.code} ${e.mapping.section}`).join('、')}に対応する（04文書5.1節）。`, '',
      '## 3. 作業手順', '',
      ...entries.flatMap((e) =>
        e.items.length
          ? e.items.map((it) => `- ${it['タスク名']}（頻度: ${it['頻度']}、担当: ${it['担当']}）`)
          : ['（該当する運用項目が`00-04`に未登録。実物から復元できない場合は決定ログを参照）']
      ),
      '',
    ].join('\n');
    generated.push(writeDoc(cwd, { docNo: docId, docName: title, dir: dirName, seiseikubun: SEISEIKUBUN.AS_BUILT, body }));
  }
  return generated;
}

function main() {
  const cwd = process.cwd();
  const opsItems = readTableAsObjects(ledger0004Path(cwd));
  const generated = [gen0700(cwd, opsItems), ...genGroupDocs(cwd, opsItems)].filter(Boolean).map((p) => path.relative(cwd, p));
  console.log(JSON.stringify({ status: 'done', generated }, null, 2));
}

main();
