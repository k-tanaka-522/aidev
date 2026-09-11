#!/usr/bin/env node
'use strict';

/**
 * artifact-emptiness-fullscan.js（routines Skill 同梱スクリプト、M5新設）
 *
 * 【目的・理由】
 * 02文書14.2節M5「Routines稼働開始に伴い、artifact-emptiness-guard.jsの定期全件走査を
 * 補助的機構として追加登録する（MAY、7.3節#8参照）」への対応。`artifact-emptiness-guard.js`
 * （M3実装）はPostToolUse（`00-01`の変更差分のみ）を正の起動契機とするhookであり、
 * stdinのPostToolUseペイロードを前提にしているためRoutineから直接叩けない。本スクリプトは
 * 同じ判定ロジック（`zone`と`process-option`による抑制、`00-01`の「未生成」行の集計）を
 * **全件走査版**として独立に実装する（hook本体は変更しない、7.3節#8の「起動契機を置き換え
 * るものではない」というMUSTに従う）。
 *
 * 【影響範囲】読み取りのみ（`docs/00_.../00-01_成果物構成カタログ.md`、
 * `.claude-state/current-zone.json`、`.claude-state/process-option.json`）。
 *
 * 【契約】
 * 対象内と判定した（coderの一次判定、PMへ報告）。`00-01_成果物構成カタログ.md`から
 * 「未生成」件数を集計する処理であり16.6節(c)「複数エントリの横断集計」に該当する。
 * ただし16.4節は契約の著者をapp-architectに限定し（MUST）、本タスクの実装者（coder）は
 * 今回の修正対象そのものについて自ら契約を書く立場にあるため、本ファイルでは契約テストを
 * 追加しない（PMへの発注として報告する）。
 *
 * 【M-scan修正（`findTable`誤用によるテーブル取りこぼしバグ、PMからの委譲）】
 * 本ファイルは従来`.claude/lib/markdown-table.js`の`findTable`（ファイル内**最初の1
 * テーブルのみ**を読む）を直接使っていたため、`00-01_成果物構成カタログ.md`が区分ごとに
 * `##`見出しで区切られた**複数テーブル**構成（03文書3章の雛形。`docs/00_.../00-01`実測で
 * 9テーブル構成を確認）を取ると、00区分（プロジェクト管理・ガバナンス）以外の02〜07区分の
 * 「未生成」行を静かに読み落としていた（実測: 修正前は実際の未生成3件に対し報告1件）。
 * これはCT-0003（`.claude/lib/reverse-common.js`の`readCatalog`）が既に修正した**同じ
 * バグクラス**である。本タスクはCT-0003の修正で導入された`readCatalog`（全テーブル走査、
 * `findAllTables`ベース）をそのまま再利用し、同じ読み取りロジックを新しく書き直さない
 * （PMからの指示どおり）。
 *
 * また、`readCatalog`が返す行は02文書9.4.3節（版1.9）の9列スキーマ（`文書番号`/
 * `生成状態`列等）を前提とするが、本ファイルは従来M3暫定の5列スキーマの列名
 * （`状態（未生成/生成済み/対象外）`等）を直書きしていたため、実際の`docs/00_.../00-01`
 * （9列スキーマの雛形）を読むと列名が一致せず`status: 'skipped'`（想定スキーマと異なる）に
 * なり、複数テーブル対応以前に**全件が取りこぼされていた**ことも本修正で判明した（実測、
 * PMへ報告）。`.claude/lib/zone-gate-conditions.js`の`checkCatalogSectionV9`/`V5`、
 * `.claude/lib/catalog-schema.js`の`detectSchemaVersion`が既に同種のスキーマ判定
 * （9列を正本、5列を後方互換として扱いconsole.errorで警告する）を持つため、本ファイルも
 * 同じ判定ロジックを再利用し、9列/5列いずれのカタログでも取りこぼさず集計する。
 */

const fs = require('fs');
const { readCatalog } = require('../../../lib/reverse-common');
const { readZoneState } = require('../../../lib/zone-state');
const {
  V9_GENERATED_STATES,
  V9_OMITTED_STATE,
  V5_SCHEMA_WARNING,
  UNKNOWN_SCHEMA_WARNING,
  detectSchemaVersion,
} = require('../../../lib/catalog-schema');

function readProcessOption(cwd) {
  try {
    const raw = fs.readFileSync(require('path').join(cwd, '.claude-state', 'process-option.json'), 'utf-8');
    const data = JSON.parse(raw);
    return data.mode === 'requirements-first' ? 'requirements-first' : 'prototype-driven';
  } catch (_err) {
    return 'prototype-driven';
  }
}

/**
 * 9列スキーマ（正本、02文書9.4.3節）の行から「未生成」相当（`生成状態`が
 * `V9_GENERATED_STATES`にも`V9_OMITTED_STATE`にも該当しない行）を抽出する。
 * `zone-gate-conditions.js`の`checkCatalogSectionV9`と同じ判定基準を用いる。
 */
function extractUngeneratedV9(rows) {
  return rows
    .filter((r) => (r['生成状態'] || '').trim() !== V9_OMITTED_STATE)
    .filter((r) => !V9_GENERATED_STATES.includes((r['生成状態'] || '').trim()))
    .map((r) => ({ 項番: r['文書番号'] || '?', 成果物名: r['文書名'] || '?' }));
}

/** 5列スキーマ（M3暫定、後方互換のみ）から「未生成」行を抽出する。 */
function extractUngeneratedV5(rows) {
  return rows
    .filter((r) => (r['状態（未生成/生成済み/対象外）'] || '').includes('未生成'))
    .map((r) => ({ 項番: r['項番'] || '?', 成果物名: r['成果物名'] || '?' }));
}

function main() {
  const cwd = process.cwd();
  const zoneState = readZoneState(cwd);
  const mode = readProcessOption(cwd);
  const suppressed = zoneState.zone < 3 && mode === 'prototype-driven';

  // 【M-scan修正】単一テーブルのみを読む`findTable`直呼びをやめ、CT-0003が導入した
  // 全テーブル走査版`readCatalog`を再利用する（複数テーブル構成の00-01を正しく読む）。
  const rows = readCatalog(cwd);
  const schemaVersion = detectSchemaVersion(rows);

  if (schemaVersion === 'empty') {
    console.log(
      JSON.stringify(
        { status: 'skipped', reason: '00-01_成果物構成カタログ.md が存在しない、またはテーブルが空' },
        null,
        2
      )
    );
    return;
  }

  let ungenerated;
  let schemaWarning = null;
  if (schemaVersion === 'v9') {
    ungenerated = extractUngeneratedV9(rows);
  } else if (schemaVersion === 'v5') {
    schemaWarning = V5_SCHEMA_WARNING;
    console.error(`[artifact-emptiness-fullscan] ${V5_SCHEMA_WARNING}`);
    ungenerated = extractUngeneratedV5(rows);
  } else {
    // fail closed（黙ってスキップしない、UNKNOWN_SCHEMA_WARNING参照）。
    console.error(`[artifact-emptiness-fullscan] ${UNKNOWN_SCHEMA_WARNING}`);
    console.log(
      JSON.stringify({ status: 'skipped', reason: '想定スキーマと異なる（fail closed）' }, null, 2)
    );
    return;
  }

  console.log(
    JSON.stringify(
      {
        status: 'done',
        zone: zoneState.zone,
        mode,
        suppressed,
        schemaVersion,
        schemaWarning,
        ungeneratedCount: ungenerated.length,
        ungenerated: suppressed ? '(抑制中のため詳細省略。zone<3 かつ prototype-driven)' : ungenerated,
      },
      null,
      2
    )
  );
}

main();
