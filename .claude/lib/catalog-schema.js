#!/usr/bin/env node
'use strict';

/**
 * catalog-schema.js（本タスクで新設・共有ライブラリ）
 *
 * 【目的・理由】
 * `docs/00_.../00-01_成果物構成カタログ.md`の列スキーマ判定（9列スキーマ/5列スキーマ/不明）は
 * `.claude/lib/zone-gate-conditions.js`の`checkCatalogSection`が実装していたが、
 * `.claude/lib/verify.js`の`computeGenerationGaps`は同じ判定を持たず、M3暫定の5列スキーマの
 * 列名（`状態（未生成/生成済み/対象外）`・`区分（02〜07）`・`項番`）を直接参照したままだった。
 * そのため02文書9.4.3節（版1.9）が正本化した9列カタログを渡すと`gaps`が常に空配列になり、
 * GZ3の「生成漏れ検査」が黙って無効化される不具合があった（`checkCatalogSection`が是正済みの
 * 不整合と同種のサイレント故障。PMへの報告事項、実測確認済み）。判定ロジックの二重実装・
 * 将来のズレの再発を防ぐため、スキーマ判定を1箇所に集約する（`checkCatalogSection`・
 * `computeGenerationGaps`の両方がこのモジュールを利用する）。
 *
 * 【影響範囲】
 * `.claude/lib/zone-gate-conditions.js`（`checkCatalogSection`）、
 * `.claude/lib/verify.js`（`computeGenerationGaps`）。
 *
 * 【前提条件・制約】
 * 02文書9.4.3節（版1.9）が正本化した9列スキーマ
 * （`文書番号|文書名|生成ゾーン|生成主体|生成方式|必須区分|IPA対応|想定分量|生成状態`）を
 * 一次スキーマとする。旧M3暫定の5列スキーマ
 * （`項番|成果物名|区分（02〜07）|状態（未生成/生成済み/対象外）|生成日時`）は移行期の
 * 後方互換としてのみ扱う。列名・状態値の文字列は本モジュールを正とし、利用側で直書きしない。
 */

/** 9列スキーマを識別するためのキー列（`readTableAsObjects`/`readCatalog`の出力オブジェクトが持つキー）。 */
const CATALOG_V9_KEY = '文書番号';
/** 5列スキーマ（M3暫定、後方互換）を識別するためのキー列。 */
const CATALOG_V5_KEY = '区分（02〜07）';

/** 9列スキーマの「生成状態」5値のうち、「生成済み」相当とみなす値。 */
const V9_GENERATED_STATES = ['as-built生成済', '前倒し作成'];
/** 9列スキーマの「生成状態」のうち、対象外（旧5列スキーマの「対象外」相当）とみなす値。 */
const V9_OMITTED_STATE = '省略';

/** 5列スキーマ（後方互換）読み込み時に呼び出し側が`console.error`すべき警告文。 */
const V5_SCHEMA_WARNING =
  '00-01成果物構成カタログが旧スキーマ（5列、M3暫定）のまま読み込まれた。' +
  '02文書9.4.3節（版1.9）が正本化した9列スキーマ（文書番号/生成状態列を含む）への' +
  '移行が必要（判定は5列スキーマの互換ロジックで継続するが、早期に00-01を9列化すること）。';

/** いずれのスキーマにも一致しない場合に呼び出し側が`console.error`すべき警告文（fail closed）。 */
const UNKNOWN_SCHEMA_WARNING =
  '00-01成果物構成カタログの列スキーマを認識できない（9列スキーマの`文書番号`列、' +
  '5列スキーマの`区分（02〜07）`列のいずれも見つからない）。判定不能として扱う' +
  '（fail closed。黙ってスキップしない）。';

/**
 * `文書番号`（例: "06-01"、"07-50"）から区分（"06"、"07"等の2桁）を前方一致で導出する。
 * `GZ{0,2,3}-99`・`decisions/DL-{4桁}`・`（欠番）`のように2桁数字始まりでない文書番号は
 * 区分なし（空文字）として扱う。
 */
function deriveSectionFromDocNo(docNo) {
  const m = /^(\d{2})-/.exec(String(docNo || '').trim());
  return m ? m[1] : '';
}

/**
 * カタログ行配列（`readCatalog`・`readTableAsObjects`等の出力、オブジェクト配列）の
 * 列スキーマを判定する。
 * 戻り値: `'v9'`（正本）| `'v5'`（旧・後方互換）| `'unknown'`（列を認識できず判定不能）|
 * `'empty'`（`rows`が空。カタログ自体が無い/未初期化）。
 */
function detectSchemaVersion(rows) {
  if (!rows || !rows.length) return 'empty';
  const sampleKeys = Object.keys(rows[0]);
  if (sampleKeys.includes(CATALOG_V9_KEY)) return 'v9';
  if (sampleKeys.includes(CATALOG_V5_KEY)) return 'v5';
  return 'unknown';
}

module.exports = {
  CATALOG_V9_KEY,
  CATALOG_V5_KEY,
  V9_GENERATED_STATES,
  V9_OMITTED_STATE,
  V5_SCHEMA_WARNING,
  UNKNOWN_SCHEMA_WARNING,
  deriveSectionFromDocNo,
  detectSchemaVersion,
};
