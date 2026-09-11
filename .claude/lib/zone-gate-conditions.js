#!/usr/bin/env node
'use strict';

/**
 * zone-gate-conditions.js（本タスクで新設・共有ライブラリ）
 *
 * 【目的・理由】
 * `.claude/lib/zone-gate.js`（GZ0/GZ2/GZ3の judgement 本体）が用いる個別の判定条件
 * （分母・分子の機械集計、00-01カタログの区分別完了判定等）を1箇所に集約する。
 * 01文書7.2節「判定者は報告の数字を転記しない。自ら数える」に従い、いずれの関数も
 * 他Skillの自己申告（合格率等）を受け取らず、台帳・decisions・testsを自らgrep/走査する。
 *
 * 【影響範囲】
 * `.claude/lib/zone-gate.js`、`.claude/skills/gate-check/scripts/gate-check.js`。
 *
 * 【前提条件・制約】
 * - `decision-check`（`context: fork`のSkill）は本来Claude Codeが個別に起動する独立
 *   コンテキストだが、`gate-check`スクリプト内から同等の判定材料を得るため、本ライブラリは
 *   `node .../decision-check/scripts/check.js --json`を子プロセスとして直接実行し、
 *   その標準出力JSONをパースする（SKILL.mdが明記する「このコマンドで機械可読なJSONレポートを
 *   返す」という契約に従った利用方法であり、decision-checkの判定ロジックを二重実装しない）。
 * - NFR-ID・BAT-ID（画面非経由）のテスト分子集計に用いる`tests/`配下の専用ディレクトリは
 *   02/01文書のどこにも明記が無い（HB-IDの`tests/e2e/`、API-IDの`tests/integration/`は
 *   明記があるが、NFR/BAT-standaloneには対応する明記が無い）。本タスクは`tests/`配下全体を
 *   走査する実装判断を採用した（`static-analysis.js`の`scanNfrTestLinks`/`scanBatTestLinks`
 *   参照）。この判断はPMへ報告する設計上の解釈である。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readTableAsObjects } = require('./markdown-table');
const {
  ledger0002Path,
  ledger0003Path,
  ledger0012Path,
  ledger0014Path,
} = require('./ledger-paths');
const { readCatalog } = require('./reverse-common');
const { listDecisionFiles } = require('./decisions');
const {
  V9_GENERATED_STATES,
  V9_OMITTED_STATE,
  V5_SCHEMA_WARNING,
  UNKNOWN_SCHEMA_WARNING,
  deriveSectionFromDocNo,
  detectSchemaVersion,
} = require('./catalog-schema');
const {
  scanContractApiIds,
  scanE2eHbLinks,
  scanIntegrationApiLinks,
  scanNfrTestLinks,
  scanBatTestLinks,
  filterExecutable,
} = require('./static-analysis');

/**
 * `decision-check`（M1実装）を子プロセスとして実行し、JSONレポートを取得する。
 * 失敗した場合は`{ error: <message> }`を返す（例外を投げない。呼び出し側は
 * `error`の有無で判定不能を扱う）。
 */
function runDecisionCheck(cwd = process.cwd()) {
  try {
    const scriptPath = path.join(__dirname, '..', 'skills', 'decision-check', 'scripts', 'check.js');
    const out = execFileSync('node', [scriptPath, '--json'], { cwd, encoding: 'utf-8' });
    return JSON.parse(out);
  } catch (err) {
    return { error: err.message };
  }
}

/**
 * 01文書6.5節条件6（トレーサビリティ充足）の分母・分子を機械集計する。
 * 分母 = HB-ID全件（00-02、廃止扱いを除く）＋ API-ID全件（契約モックのx-api-id）
 *        ＋ NFR-ID全件（決定ログfrontmatter）＋ 画面非経由のBAT-ID全件（00-03、経由HB-ID欄が空）
 * 分子 = 各IDのテストdocblock記載件数（skip/fixme/握りつぶしを除く、`filterExecutable`）
 *
 * 02文書10.1.2節「Zone1〜2」「Zone3以降」の分母は粒度が異なる（Zone3以降は正式要件ID起点の
 * RTM）が、正式要件ID変換後もIDの実体（HB-ID等）は`00-02`等に残り続けるため（`traceability-reverse`
 * が上書きではなく列追加で変換する設計、`reverse-common.js`参照）、本関数は両ゾーンで
 * 同一の集計方法を用いる近似とする（RTM正式版の個別パースは行わない。限界としてPMへ報告する）。
 */
function computeTraceabilityCoverage(cwd = process.cwd()) {
  const hbRows = readTableAsObjects(ledger0002Path(cwd));
  const hbIds = Array.from(
    new Set(
      hbRows
        .filter((r) => !/廃止|統合済み/.test(r['状態'] || ''))
        .map((r) => r['HB-ID'])
        .filter(Boolean)
    )
  );

  const contractApiIds = scanContractApiIds(cwd);
  const apiIds = Array.from(new Set(contractApiIds.map((a) => a.apiId).filter(Boolean)));

  const decisions = listDecisionFiles(cwd);
  const nfrIds = Array.from(new Set(decisions.map((d) => d.data['NFR-ID']).filter(Boolean)));

  const batRows = readTableAsObjects(ledger0003Path(cwd));
  const standaloneBatIds = batRows
    .filter((r) => !(r['経由HB-ID（画面経由の場合）'] || '').trim())
    .filter((r) => !/廃止|統合済み/.test(r['状態'] || ''))
    .map((r) => r['BAT-ID'])
    .filter(Boolean);

  const e2e = filterExecutable(scanE2eHbLinks(cwd));
  const it = filterExecutable(scanIntegrationApiLinks(cwd));
  const nfrTests = filterExecutable(scanNfrTestLinks(cwd));
  const batTests = filterExecutable(scanBatTestLinks(cwd));

  const coveredHb = new Set(e2e.map((l) => l.hbId));
  const coveredApi = new Set(it.map((l) => l.apiId));
  const coveredNfr = new Set(nfrTests.map((l) => l.nfrId));
  const coveredBat = new Set(batTests.map((l) => l.batId));

  const covered = [];
  const uncovered = [];
  for (const id of hbIds) (coveredHb.has(id) ? covered : uncovered).push(id);
  for (const id of apiIds) (coveredApi.has(id) ? covered : uncovered).push(id);
  for (const id of nfrIds) (coveredNfr.has(id) ? covered : uncovered).push(id);
  for (const id of standaloneBatIds) (coveredBat.has(id) ? covered : uncovered).push(id);

  return {
    denominator: hbIds.length + apiIds.length + nfrIds.length + standaloneBatIds.length,
    numerator: covered.length,
    covered,
    uncovered,
    breakdown: { hbIds, apiIds, nfrIds, standaloneBatIds },
  };
}

/**
 * `00-12_リスク管理台帳.md`に当該IDへの言及があるかをgrep相当で確認する（defer登録の確認）。
 * 01文書6.5節「分母−分子はリスク管理台帳へのdefer登録件数と一致していなければならない」の
 * 簡易チェック（既存`gate-check.js`の`findDeferred`と同じ方式、ticket kindとの整合を保つ）。
 */
function findDeferredIds(cwd, ids) {
  let text = '';
  try {
    text = fs.readFileSync(ledger0012Path(cwd), 'utf-8');
  } catch (_err) {
    return [];
  }
  return ids.filter((id) => text.includes(id));
}

/**
 * `00-01_成果物構成カタログ.md`の列スキーマ判定（02文書9.4.3節・版1.9が正本の9列
 * スキーマを一次スキーマとする。旧M3暫定の5列スキーマは移行期の後方互換のみ）。
 * スキーマ判定・区分導出・生成済み判定値は`.claude/lib/catalog-schema.js`に集約した
 * （前タスクは本ファイル内に定義していたが、`verify.js`の`computeGenerationGaps`が
 * 同じ判定を持たず9列カタログで黙ってスキップされる不整合があったため、本タスクで
 * 両者が同じ判定ロジックを共有するよう切り出した。PMへの報告事項）。
 *
 * 【本タスクでの是正（PMへ報告、前タスクからの継承）】
 * 旧実装はM3が採用した暫定5列スキーマ（`項番|成果物名|区分（02〜07）|状態（未生成/
 * 生成済み/対象外）|生成日時`）のみを前提としており、02文書9.4.3節（版1.9）が正本化した
 * 9列スキーマ（`文書番号|文書名|生成ゾーン|生成主体|生成方式|必須区分|IPA対応|想定分量|
 * 生成状態`）を渡すと、列名が一致せず`applicable`が常に`false`（`totalRows: 0`）になり、
 * GZ2条件5・GZ3条件6が**エラーにならないまま黙ってスキップされる**という不整合があった
 * （実測済み）。本関数は9列スキーマを一次スキーマとして扱うよう是正し、5列スキーマの
 * カタログを渡された場合は後方互換で判定は行うが、`console.error`で明示的に警告する
 * （移行期に「黙ってスキップ」を再発させないため）。
 */

/**
 * 9列スキーマ（正本）での区分別集計。`excludePrefixes`は`文書番号`の前方一致。
 * 「生成済み」相当の判定は`V9_GENERATED_STATES`（`as-built生成済`・`前倒し作成`）、
 * 「対象外」相当の判定は`V9_OMITTED_STATE`（`省略`）を用いる（判断根拠は本ファイル
 * 冒頭コメント、および完了報告の「3. 『生成済み相当』の判定」を参照）。
 */
function checkCatalogSectionV9(rows, { sections, excludePrefixes }) {
  const relevant = rows.filter((r) => {
    const docNo = (r['文書番号'] || '').trim();
    const sec = deriveSectionFromDocNo(docNo);
    if (!sections.includes(sec)) return false;
    if (excludePrefixes.some((p) => docNo.startsWith(p))) return false;
    return true;
  });
  const applicableRows = relevant.filter((r) => (r['生成状態'] || '').trim() !== V9_OMITTED_STATE);
  const missing = applicableRows.filter((r) => !V9_GENERATED_STATES.includes((r['生成状態'] || '').trim()));
  return {
    catalogFound: true,
    applicable: applicableRows.length > 0,
    complete: missing.length === 0,
    missing,
    totalRows: relevant.length,
    schemaVersion: 'v9',
    schemaWarning: null,
  };
}

/**
 * 5列スキーマ（M3暫定、後方互換のみ）での区分別集計。旧実装と同じロジックを維持しつつ、
 * 呼び出し側（`console.error`）へ移行が必要である旨を明示的に警告する（黙ってスキップ
 * しない）。
 */
function checkCatalogSectionV5(rows, { sections, excludePrefixes }) {
  console.error(`[zone-gate-conditions] ${V5_SCHEMA_WARNING}`);
  const relevant = rows.filter((r) => {
    const sec = (r['区分（02〜07）'] || '').trim();
    if (!sections.includes(sec)) return false;
    const itemNo = r['項番'] || '';
    if (excludePrefixes.some((p) => itemNo.startsWith(p))) return false;
    return true;
  });
  const applicableRows = relevant.filter((r) => r['状態（未生成/生成済み/対象外）'] !== '対象外');
  const missing = applicableRows.filter((r) => r['状態（未生成/生成済み/対象外）'] !== '生成済み');
  return {
    catalogFound: true,
    applicable: applicableRows.length > 0,
    complete: missing.length === 0,
    missing,
    totalRows: relevant.length,
    schemaVersion: 'v5',
    schemaWarning: V5_SCHEMA_WARNING,
  };
}

/**
 * `00-01_成果物構成カタログ.md`の指定区分（`sections`、例: ['06']）について、
 * `excludePrefixes`（文書番号の前方一致、例: ['07-50']）を除いた行の生成完了状況を判定する。
 *
 * - `catalogFound`: カタログ自体が読めたか（読めない場合は判定不能として扱う。fail closed）
 * - `applicable`: 対象区分・対象外文書番号を除いた行のうち、「対象外」（9列: `省略`、
 *   5列: `対象外`）でない行が1件以上あるか（＝該当する案件かどうか。02文書10.2節
 *   「該当する案件では」の判定に用いる）
 * - `complete`: `applicable`な行すべてが「生成済み」相当か
 * - `missing`: 未完了の行一覧
 * - `schemaVersion`: `'v9'`（正本）| `'v5'`（旧・後方互換）| `'unknown'`（列を認識できず
 *   判定不能） | `null`（カタログ自体が無い）
 * - `schemaWarning`: `v5`/`unknown`の場合に設定される警告文（黙ってスキップしないため）
 */
function checkCatalogSection(cwd, { sections, excludePrefixes = [] }) {
  const rows = readCatalog(cwd);
  const schemaVersion = detectSchemaVersion(rows);
  if (schemaVersion === 'empty') {
    return {
      catalogFound: false,
      applicable: false,
      complete: false,
      missing: [],
      totalRows: 0,
      schemaVersion: null,
      schemaWarning: null,
    };
  }
  if (schemaVersion === 'v9') {
    return checkCatalogSectionV9(rows, { sections, excludePrefixes });
  }
  if (schemaVersion === 'v5') {
    return checkCatalogSectionV5(rows, { sections, excludePrefixes });
  }
  console.error(`[zone-gate-conditions] ${UNKNOWN_SCHEMA_WARNING}`);
  // `catalogFound: false`とし、呼び出し側（zone-gate.js）の既存fail-closed分岐
  // （`!section.catalogFound`でNG）を通す。`applicable: true`のまま素通りさせると
  // 「未知スキーマ＝該当なし」に誤読され、本タスクが問題視した「黙ってスキップ」を
  // 別形で再発させるため（`applicable: false`だとゲートを通過してしまう）。
  return {
    catalogFound: false,
    applicable: false,
    complete: false,
    missing: [],
    totalRows: 0,
    schemaVersion: 'unknown',
    schemaWarning: UNKNOWN_SCHEMA_WARNING,
  };
}

/**
 * `checkCatalogSection`が返す`missing`行配列を、人が読んで対処できる形式
 * （`文書番号 文書名`のカンマ区切り、例: "06-01 移行計画書, 06-02 切替リハーサル計画書"）
 * へ整形する。
 *
 * 【是正理由（PMへの報告事項）】
 * `missing`の各要素は`checkCatalogSectionV9`/`V5`が返す生の行オブジェクトであり、
 * 9列スキーマの行は`項番`列を持たない（`文書番号`列を持つ）。従来`zone-gate.js`は
 * ゲートNG理由文を組み立てる際に`missing.map((r) => r['項番'])`で参照していたため、
 * 9列スキーマ運用下では常に`undefined`（joinすると空文字列）になり、「該当案件だが
 * 06番（移行・導入）の生成が未完了: , , , 」のように**どの文書が不足しているか分からない**
 * NG理由が出力されていた（PM実測報告）。ゲートの判定理由は人が読んで対処する部分であり、
 * 空欄では意味を成さないため、`schemaVersion`に応じて正しい列（9列: `文書番号`+`文書名`、
 * 5列: `項番`+`成果物名`）から組み立て直す。
 */
function formatMissingDocs(section) {
  const rows = (section && section.missing) || [];
  if (!rows.length) return '';
  if (section.schemaVersion === 'v9') {
    return rows
      .map((r) => {
        const no = (r['文書番号'] || '').trim();
        const name = (r['文書名'] || '').trim();
        return name ? `${no} ${name}` : no || '(文書番号不明)';
      })
      .join(', ');
  }
  if (section.schemaVersion === 'v5') {
    return rows
      .map((r) => {
        const no = r['項番'] || '';
        const name = r['成果物名'] || '';
        return name ? `${no} ${name}` : no || '(項番不明)';
      })
      .join(', ');
  }
  // 想定外のschemaVersion（本来ここには来ない。catalogFound:falseの経路はmissingが空のため）。
  // 誤って空文字列を返して「理由が空になる」不具合を再発させないよう、行全体をJSON化する。
  return rows.map((r) => JSON.stringify(r)).join(', ');
}

/**
 * `00-14_変更管理台帳.md`の「承認状態」列が「未承認」の行を数える（02文書10.2節のGZ3条件
 * 「requirements-first選択時、未承認CRが残っていないこと」）。`cr-ledger.js`（M5実装）が
 * 既に同等の`countUnapproved`を持つため、件数はそちらを正としつつ、本関数はCR-ID一覧も
 * 併せて返す（gate-checkの出力で「どのCRが未承認か」を明示するため）。
 */
function countUnapprovedCRs(cwd) {
  const rows = readTableAsObjects(ledger0014Path(cwd));
  const unapproved = rows.filter((r) => (r['承認状態'] || '').trim() === '未承認');
  return { count: unapproved.length, ids: unapproved.map((r) => r['CR-ID']).filter(Boolean) };
}

/** `.claude-state/process-option.json`の`mode`を読む。無ければ既定の`prototype-driven`。 */
function readProcessOptionMode(cwd = process.cwd()) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(cwd, '.claude-state', 'process-option.json'), 'utf-8'));
    return raw.mode || 'prototype-driven';
  } catch (_err) {
    return 'prototype-driven';
  }
}

module.exports = {
  runDecisionCheck,
  computeTraceabilityCoverage,
  findDeferredIds,
  checkCatalogSection,
  formatMissingDocs,
  countUnapprovedCRs,
  readProcessOptionMode,
};
