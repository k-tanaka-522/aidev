#!/usr/bin/env node
'use strict';

/**
 * verify.js（M4新設・共有ライブラリ）
 *
 * 【目的・理由】
 * 02文書9.3節「正確性の担保」が要求する2種の検査を実装する。
 * (1) **逆差分検出**: 実装 vs 合意媒体（ハリボテ・契約モック・決定ログ・各種台帳）の
 *     比較に限定し、実装にのみ存在する要素を検出する（生成された設計文書との比較は
 *     「生成漏れ検査」と呼び分け、混同しない。01文書6.5節が正本）
 * (2) **生成漏れ検査**: 生成された文書と生成元（実装・合意媒体）との対応関係を
 *     確認する検査。00-01カタログが「生成済み」とする行について、実ファイルの存在と
 *     reverse-doc実行時マーカーの有無を確認する
 *
 * 【影響範囲】
 * `.claude/skills/gate-check/scripts/verify-reverse.js`（GZ3判定の入力として利用）。
 *
 * 【前提条件・制約】
 * 画面の逆差分は`SCR-ID`総数と実装側ルーティング定義の画面数の突合、APIの逆差分は
 * `API-ID`（契約モック）と実装側エンドポイント数の突合で検出する（02文書10.1節が
 * 定める判定方法）。ファイル名ベースの素朴な突合であり、動的ルーティング等
 * `.claude/lib/static-analysis.js`が対応できない範囲は検出対象に含めない
 * （限界は同モジュールのコメントを参照）。
 *
 * 【契約】
 * CT-0004（.claude/contracts/lib-verify.computeGenerationGaps.contract.js）。
 * 対象関数: computeGenerationGaps(cwd)。出典MUST: 01文書6.5節「逆差分」定義の周辺、
 * 02文書9.3節「生成漏れ検査」（検出漏れ0件を安全側に倒さず、gapsとして報告する）。16.7節。
 */

const fs = require('fs');
const path = require('path');
const { readTableAsObjects } = require('./markdown-table');
const { screenIndexPath } = require('./ledger-paths');
const { scanFrontendRoutes, scanBackendRoutes, scanContractApiIds } = require('./static-analysis');
const { hasExecutionMarker, readCatalog } = require('./reverse-common');
const {
  V9_GENERATED_STATES,
  V5_SCHEMA_WARNING,
  UNKNOWN_SCHEMA_WARNING,
  deriveSectionFromDocNo,
  detectSchemaVersion,
} = require('./catalog-schema');

/** 02文書10.1節・9.3節: 実装 vs 合意媒体（ハリボテ・契約モック）の逆差分検出。 */
function computeReverseDiff(cwd) {
  const screenRows = readTableAsObjects(screenIndexPath(cwd));
  const screenBases = new Set(
    screenRows.map((r) => path.basename(r['ファイル'] || '', path.extname(r['ファイル'] || '')))
  );
  const frontendRoutes = scanFrontendRoutes(cwd);
  const implRouteBases = frontendRoutes.map((r) => r.routePath.replace(/^\//, '').replace(/\/$/, '') || 'index');
  const screensOnlyInImpl = implRouteBases.filter((b) => !screenBases.has(b));

  const contractApiIds = scanContractApiIds(cwd);
  const agreedApiPaths = new Set(contractApiIds.map((a) => `${a.method} ${a.routePath}`));
  const backendRoutes = scanBackendRoutes(cwd);
  const apisOnlyInImpl = backendRoutes.filter((r) => !agreedApiPaths.has(`${r.method} ${r.routePath}`));

  return {
    screens: {
      agreedCount: screenBases.size,
      implCount: new Set(implRouteBases).size,
      onlyInImpl: Array.from(new Set(screensOnlyInImpl)),
    },
    apis: {
      agreedCount: agreedApiPaths.size,
      implCount: backendRoutes.length,
      onlyInImpl: apisOnlyInImpl.map((r) => `${r.method} ${r.routePath} (${r.file})`),
    },
    totalOnlyInImpl: new Set(screensOnlyInImpl).size + apisOnlyInImpl.length,
  };
}

/**
 * 02文書9.3節「生成漏れ検査」: 00-01カタログの「生成済み」行と実ファイル・マーカーの対応確認。
 *
 * 【本タスクでの是正（PMへの報告事項）】
 * 旧実装は`readTableAsObjects(ledger0001Path(cwd))`（＝`markdown-table.js`の`findTable`
 * ベース、ファイル内最初の1テーブルのみを読む）でカタログを読み、02文書9.4.3節（版1.9）が
 * 正本化した9列スキーマではなくM3暫定の5列スキーマの列名
 * （`状態（未生成/生成済み/対象外）`・`区分（02〜07）`・`項番`）を直接参照していた。
 * 9列カタログを渡すとこれらの列が存在しないため`gaps`が常に空配列になり、GZ3の
 * 「生成漏れ検査」が**エラーにならないまま黙って無効化**されていた（`.claude/lib/
 * zone-gate-conditions.js`の`checkCatalogSection`が既に是正済みの不整合と同種の
 * サイレント故障。実測確認済み）。本関数は同ファイルと同じ判定基盤
 * （`.claude/lib/catalog-schema.js`のスキーマ判定、`reverse-common.js`の`readCatalog`
 * ＝`findAllTables`ベースの複数テーブル対応）を共有するよう是正した。
 */
function computeGenerationGaps(cwd) {
  const catalog = readCatalog(cwd);
  const schemaVersion = detectSchemaVersion(catalog);

  if (schemaVersion === 'empty') {
    // カタログ自体が無い/空。`checkCatalogSection`の`catalogFound: false`と対称に、
    // 呼び出し側（zone-gate.js）が既に「00-01が読めない場合は別条件でfail closed」を
    // 行っているため、ここでは検査対象0件として扱う（このファイル自身のfail closedは
    // 「読めたがスキーマ不明」の場合のみ行う。次の分岐参照）。
    return [];
  }
  if (schemaVersion === 'unknown') {
    console.error(`[verify] ${UNKNOWN_SCHEMA_WARNING}`);
    // fail closed: 判定不能を「黙ってgaps=0件（検査パス）」にはしない。1件のギャップとして
    // 報告し、GZ3を通過させない（`checkCatalogSection`が`catalogFound: false`でNGにする
    // 設計と対称。02文書9.3節の慎重さの方針）。
    return [{ itemNo: null, name: null, reason: UNKNOWN_SCHEMA_WARNING }];
  }
  if (schemaVersion === 'v5') {
    console.error(`[verify] ${V5_SCHEMA_WARNING}`);
  }

  const gaps = [];
  for (const row of catalog) {
    let itemNo;
    let name;
    let section;
    let isGenerated;
    if (schemaVersion === 'v9') {
      itemNo = (row['文書番号'] || '').trim();
      name = (row['文書名'] || '').trim();
      section = deriveSectionFromDocNo(itemNo);
      isGenerated = V9_GENERATED_STATES.includes((row['生成状態'] || '').trim());
    } else {
      itemNo = row['項番'];
      name = row['成果物名'];
      section = row['区分（02〜07）'];
      isGenerated = row['状態（未生成/生成済み/対象外）'] === '生成済み';
    }
    if (!isGenerated || !itemNo) continue;

    const zoneDirCandidates = fs.existsSync(path.join(cwd, 'docs'))
      ? fs.readdirSync(path.join(cwd, 'docs')).filter((d) => d.startsWith(`${section}_`))
      : [];
    let found = null;
    for (const zd of zoneDirCandidates) {
      const dir = path.join(cwd, 'docs', zd);
      const matches = findByItemNoPrefix(dir, itemNo);
      if (matches.length > 0) {
        found = matches[0];
        break;
      }
    }
    if (!found) {
      gaps.push({ itemNo, name, reason: 'カタログは生成済みだが、対応するファイルが見つからない' });
      continue;
    }
    const content = fs.readFileSync(found, 'utf-8');
    if (!hasExecutionMarker(content)) {
      gaps.push({ itemNo, name, reason: `ファイルは存在するが reverse-doc 実行時マーカーが無い（${path.relative(cwd, found)}）。手動編集の可能性` });
    }
  }
  return gaps;
}

function findByItemNoPrefix(dir, itemNo) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return results;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      results.push(...findByItemNoPrefix(path.join(dir, e.name), itemNo));
    } else if (e.name.startsWith(`${itemNo}_`) && e.name.endsWith('.md')) {
      results.push(path.join(dir, e.name));
    }
  }
  return results;
}

module.exports = { computeReverseDiff, computeGenerationGaps };
