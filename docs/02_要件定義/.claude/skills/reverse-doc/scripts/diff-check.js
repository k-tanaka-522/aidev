#!/usr/bin/env node
'use strict';

/**
 * diff-check.js（02_要件定義/reverse-doc 同梱スクリプト、9.5節）
 *
 * 【目的・理由】
 * `requirements-first`（要件定義前倒しモード）選択時、Zone1のうちに執筆済みの
 * 前倒し要件定義書（`02-01_要件定義書.md`、契約上の中間検収物）と、実物
 * （`src/`・`decisions/contracts/`・`prototypes/`）から生成したas-built版を突合し、
 * 02文書9.5節の判定表（「文書のみ（未実装）」「実装のみ（契約外の追加）」
 * 「一致（検証待ち）」）を`02-99_前倒し版差分検査レポート.md`として出力する。
 * 不一致は自動で前倒し文書を書き換えず、`00-14_変更管理台帳.md`へCRとして起票する
 * （MUST、契約成果物を無断で書き換えないため。02文書9.5節）。
 *
 * 【PMへの報告事項: 前倒し文書の「機能項目」の構造化フォーマットが未定義】
 * 02文書9.5節・03文書のいずれも、前倒し要件定義書の中の「機能要件一覧」を機械可読な
 * 形でどう記述するかを定めていない（人間が読む文章として書かれる前提のため）。
 * 本実装は次の**暫定フォーマット**を前提とする（PMへの報告事項）。
 *   前倒し要件定義書内に `## 機能要件（前倒し）` という見出しのMarkdownテーブルを持ち、
 *   列は `項番 | 機能ID | 機能名 | 概要` とする。
 * このフォーマットに従っていない前倒し文書に対しては、機能項目の抽出ができない旨を
 * レポートに明記し、判定を「検証不能」として扱う（実装から推測しない、9.3節の原則）。
 *
 * 【PMへの報告事項: `00-14_変更管理台帳.md`の列スキーマが未定義】
 * 03文書3.2節は`00-14`を「変更管理台帳・手動記録」とするのみで列定義を持たない
 * （`00-02`〜`00-05`は版1.4で列定義が正本化されたが`00-14`は対象外だった）。本実装は
 * 次の**暫定スキーマ**を採用する: `CR-ID | 起票日 | 種別 | 対象文書 | 内容 | 起票元 | ステータス`。
 *
 * 【突合方式の限界】
 * 「機能が実装されているか」の判定はキーワードの部分一致（機能名・機能IDの文字列が
 * `src/`・`decisions/contracts/`・`prototypes/`のいずれかに出現するか）に留まる
 * 意味解析ではない、素朴な検索である。誤判定（同名の別概念、表記ゆれによる見逃し）が
 * 起こりうる（02文書10.3節が明記する命名ゆらぎの限界と同種）。
 *
 * 【使い方】
 *   node diff-check.js
 */

const fs = require('fs');
const path = require('path');
const { findTable, appendRow } = require('../../../../../../.claude/lib/markdown-table');
const { nextIdFromFiles } = require('../../../../../../.claude/lib/id-registry');
const { buildDocHeader, buildExecutionMarker, markCatalogGenerated, SEISEIKUBUN } = require('../../../../../../.claude/lib/reverse-common');
const { govDir } = require('../../../../../../.claude/lib/ledger-paths');
const { scanBackendRoutes, scanContractApiIds } = require('../../../../../../.claude/lib/static-analysis');

const DOC02_DIR = path.join('docs', '02_要件定義');

function walkTextFiles(dir, extFilter) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return results;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...walkTextFiles(full, extFilter));
    else if (!extFilter || extFilter.test(e.name)) results.push(full);
  }
  return results;
}

function existsInCodebase(cwd, keyword) {
  if (!keyword) return false;
  for (const dir of ['src', 'prototypes']) {
    const files = walkTextFiles(path.join(cwd, dir), /\.(tsx?|jsx?|py|html|ya?ml)$/);
    for (const f of files) {
      const text = fs.readFileSync(f, 'utf-8');
      if (text.includes(keyword)) return true;
    }
  }
  const contractDir = path.join(cwd, 'docs', '00_プロジェクト管理・ガバナンス', 'decisions', 'contracts');
  const contractFiles = walkTextFiles(contractDir, /\.ya?ml$/);
  for (const f of contractFiles) {
    if (fs.readFileSync(f, 'utf-8').includes(keyword)) return true;
  }
  return false;
}

function extractFrontLoadedFeatures(content) {
  const heading = '## 機能要件（前倒し）';
  const idx = content.indexOf(heading);
  if (idx === -1) return null;
  const rest = content.slice(idx);
  const { header, rows } = findTable(rest);
  if (!header) return [];
  const nameIdx = header.indexOf('機能名');
  const idIdx = header.indexOf('機能ID');
  const overviewIdx = header.indexOf('概要');
  return rows.map((r) => ({
    id: idIdx >= 0 ? r[idIdx] : '',
    name: nameIdx >= 0 ? r[nameIdx] : '',
    overview: overviewIdx >= 0 ? r[overviewIdx] : '',
  }));
}

function fileCr(cwd, { kind, targetDoc, content }) {
  const ledgerPath = path.join(govDir(cwd), '00-14_変更管理台帳.md');
  const crId = 'CR-' + nextIdFromFiles('CR', [ledgerPath]);
  appendRow(
    ledgerPath,
    ['CR-ID', '起票日', '種別', '対象文書', '内容', '起票元', 'ステータス'],
    [crId, new Date().toISOString(), kind, targetDoc, content, 'reverse-doc(02_要件定義, 9.5節差分検査)', '起票'],
    {
      title: '00-14 変更管理台帳',
      description:
        '> 【PMへの報告事項】列定義は本台帳を触るスクリプト（本ファイル）が採用した暫定スキーマ。' +
        '03文書に列定義の正本が無いため、03文書側への申し送り事項とする（M4）。',
    }
  );
  return crId;
}

function main() {
  const cwd = process.cwd();
  const doc0201 = path.join(cwd, DOC02_DIR, '02-01_要件定義書.md');
  if (!fs.existsSync(doc0201)) {
    console.error('[diff-check] 02-01_要件定義書.md（前倒し版）が存在しません。requirements-first選択時のみ実行するSkillです。');
    process.exit(1);
  }
  const content = fs.readFileSync(doc0201, 'utf-8');
  const features = extractFrontLoadedFeatures(content);

  const backendRoutes = scanBackendRoutes(cwd);
  const contractApiIds = scanContractApiIds(cwd);

  const rows = [];
  if (features === null) {
    rows.push({
      itemNo: '-',
      declared: '(抽出不能: `## 機能要件（前倒し）`見出しのテーブルが見つからない)',
      asBuilt: '検証不能',
      judgement: '検証不能',
    });
  } else {
    features.forEach((f, i) => {
      const keyword = f.name || f.id;
      const found = existsInCodebase(cwd, keyword) || existsInCodebase(cwd, f.id);
      rows.push({
        itemNo: f.id || `F-${String(i + 1).padStart(3, '0')}`,
        declared: `「${f.name}」を持つ（${f.overview}）`,
        asBuilt: found ? '実装内に該当キーワードを検出' : '実装に存在しない',
        judgement: found ? '一致（検証待ち）' : '文書のみ（未実装）',
      });
    });
  }

  // 実装のみ（契約外の追加）: 契約モックのAPI-IDのうち、前倒し文書のどの項目のキーワードにも
  // ヒットしないもの。
  const declaredKeywords = (features || []).flatMap((f) => [f.name, f.id]).filter(Boolean);
  for (const api of contractApiIds) {
    if (!api.apiId) continue;
    const mentioned = declaredKeywords.some((kw) => content.includes(kw) && (content.includes(api.routePath) || content.includes(api.apiId)));
    if (!mentioned && !content.includes(api.routePath)) {
      rows.push({
        itemNo: api.apiId,
        declared: '(記載なし)',
        asBuilt: `${api.routePath} が実在（契約モック: ${api.file}）`,
        judgement: '実装のみ（契約外の追加）',
      });
    }
  }

  const crIds = [];
  for (const row of rows) {
    if (row.judgement === '文書のみ（未実装）' || row.judgement === '実装のみ（契約外の追加）') {
      const crId = fileCr(cwd, {
        kind: row.judgement,
        targetDoc: '02-01_要件定義書.md',
        content: `${row.itemNo}: 前倒し版=${row.declared} / as-built=${row.asBuilt}`,
      });
      crIds.push(crId);
      row.cr = crId;
    }
  }

  const header = buildDocHeader({
    docNo: '02-99',
    docName: '前倒し版差分検査レポート',
    author: 'App-Architect',
    seiseikubun: SEISEIKUBUN.AS_BUILT,
  });
  const marker = buildExecutionMarker({ skill: 'docs/02_要件定義/reverse-doc(diff-check)', generatedAt: new Date().toISOString() });

  const bodyLines = [
    '# 02-99 前倒し版差分検査レポート',
    '',
    '## 1. はじめに',
    '',
    '本レポートは、要件定義前倒しモード（`requirements-first`）選択時に、Zone1のうちに',
    '執筆済みの`02-01_要件定義書.md`（契約上の中間検収物）と、実物（`src/`・',
    '`decisions/contracts/`・`prototypes/`）から生成したas-built版を突合した結果である',
    '（02文書9.5節）。判定が「文書のみ」「実装のみ」の項目は、契約成果物の変更を伴いうる',
    'ため本レポートが自動で前倒し文書を書き換えることはしない。`00-14_変更管理台帳.md`へ',
    'CRとして起票し、PM経由でユーザー（発注者）の承認を得た上で反映すること（MUST）。',
    '',
    '## 2. 突合結果',
    '',
    '| 項番 | 前倒し版の記述 | 実物（as-built） | 判定 | 起票CR |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.itemNo} | ${r.declared} | ${r.asBuilt} | ${r.judgement} | ${r.cr || '-'} |`),
    '',
    '## 3. 残課題',
    '',
    crIds.length
      ? `不一致 ${crIds.length} 件を \`00-14_変更管理台帳.md\` へCRとして起票した（${crIds.join(', ')}）。PMの承認後に反映すること。`
      : '不一致は検出されなかった。',
    '',
  ];

  const outPath = path.join(cwd, DOC02_DIR, '02-99_前倒し版差分検査レポート.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, header + marker + '\n\n' + bodyLines.join('\n'), 'utf-8');

  markCatalogGenerated(cwd, { itemNo: '02-99', name: '前倒し版差分検査レポート', section: '02' });

  console.log(JSON.stringify({ status: 'done', file: path.relative(cwd, outPath), rows: rows.length, crIds }, null, 2));
}

main();
