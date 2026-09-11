#!/usr/bin/env node
'use strict';

/**
 * zone-state.js（M2実装、M3で正本スキーマに追随・版1.8）
 *
 * 【目的・理由】
 * `.claude-state/current-zone.json` は `role-boundary-guard.js`（app-architect/coderの
 * `src/**` 許可判定）・`gate-transition-guard.js`（ゾーンゲート通過判定）・
 * `artifact-emptiness-guard.js`（Zone3到達判定）等、複数のhookが参照する中核的な実行時
 * 状態ファイルである。M2実装時点では02文書がスキーマを一切定義しておらず、暫定スキーマ
 * `{zone, updated_at, updated_by}` を採用していた（本コメントの旧版参照）。
 *
 * 02文書 版1.8・10.2.1節でスキーマが正本化されたため、本ファイルはそれに追随する
 * （MUST）。正本スキーマ:
 * ```json
 * {
 *   "schema_version": 1,
 *   "zone": 1,
 *   "src_unlocked": true,
 *   "zone3_freeze_tag": "freeze-gz2-20260911-1200",
 *   "zone3_hotfix_active": false,
 *   "updated_at": "2026-09-11T10:00:00Z",
 *   "updated_by": "orchestrate"
 * }
 * ```
 * - `zone` は `0`/`1`/`3`/`4` の4値のみを取る（**`2`は使わない**）。`0`=Zone0（`GZ0`前）、
 *   `1`=`GZ0`GO後（Zone1・Zone2が機能単位で混在する期間全体）、`3`=`GZ2`GO後（Zone3）、
 *   `4`=`GZ3`GO後（Zone4/Mode B）。書込主体は`orchestrate`。
 * - `src_unlocked` はapp-architect（および7.1.2節の文言が実質的に同じ制約を持つcoder。
 *   下記【前提条件・制約】参照）の`src/**`書込許可フラグ。既定`false`、単調（一度`true`に
 *   なったら`false`に戻さない）。書込主体は`sync-check`。
 * - `zone3_freeze_tag`（GZ2 GO時に打刻したgit tag、9.4.2節。旧`freeze_tag`から
 *   版1.8でフィールド名を統一）・`zone3_hotfix_active`（Zone3内ミニチケット処理中か、
 *   10.4節）は「ゾーンゲート相当の操作」ではないため`gate-transition-guard.js`の
 *   監視対象に含めない（10.2.1節）。
 *
 * 【影響範囲】
 * `.claude/skills/sync-check/scripts/sync-check.js`（`src_unlocked`参照・更新）、
 * `.claude/hooks/gate-transition-guard.js`（`zone`前進判定、M3実装）、
 * `.claude/hooks/role-boundary-guard.js`（app-architect/coderの`src_unlocked`参照、M3実装）、
 * `.claude/hooks/artifact-emptiness-guard.js`（`zone`参照、M3実装）。
 *
 * 【前提条件・制約】
 * - ファイルが存在しない場合はZone0・未着手とみなし、正本スキーマの既定値
 *   （`{schema_version:1, zone:0, src_unlocked:false, zone3_freeze_tag:null,
 *   zone3_hotfix_active:false}`）を返す（例外を投げない）。
 * - 【PMへの報告事項】02文書7.1.2節の許可パス表は、版1.8で app-architect の行のみ
 *   `src_unlocked`参照に更新されたが、coder の行は「Zone2以降」という版1.7以前の文言の
 *   まま更新されていない（4.3節も app-architect のみ言及）。`src_unlocked`は
 *   「Zone1・Zone2の機能単位混在」問題を解消するために新設されたフラグであり、coderの
 *   `src/**`/`tests/**`書込制限も同一の問題（zone値がもはや`2`を取らない）を抱えるため、
 *   本実装は`role-boundary-guard.js`でcoderにも`src_unlocked`を適用する。これは02文書に
 *   明記の無い箇所への拡大解釈であり、7.1.2節の表更新漏れとしてPMへ報告する。
 *
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
 */

const fs = require('fs');
const path = require('path');

const ZONE_STATE_RELATIVE_PATH = path.join('.claude-state', 'current-zone.json');
const SCHEMA_VERSION = 1;
/** 10.2.1節が定める`zone`の許容値（`2`は意図的に含まない）。 */
const VALID_ZONE_VALUES = [0, 1, 3, 4];

function zoneStatePath(cwd) {
  return path.join(cwd, ZONE_STATE_RELATIVE_PATH);
}

function defaultZoneState() {
  return {
    schema_version: SCHEMA_VERSION,
    zone: 0,
    src_unlocked: false,
    zone3_freeze_tag: null,
    zone3_hotfix_active: false,
    updated_at: null,
    updated_by: null,
  };
}

/**
 * `.claude-state/current-zone.json` を読む。存在しない/壊れている/欠損フィールドが
 * ある場合でも、既定値でマージして正本スキーマの形を常に返す（例外を投げない）。
 * `zone`が`VALID_ZONE_VALUES`に無い値の場合は`0`にフォールバックする
 * （壊れた値で誤ってhookを素通りさせないための安全側フォールバック）。
 */
function readZoneState(cwd = process.cwd()) {
  const defaults = defaultZoneState();
  let data;
  try {
    const raw = fs.readFileSync(zoneStatePath(cwd), 'utf-8');
    data = JSON.parse(raw);
  } catch (_err) {
    return defaults;
  }
  const merged = Object.assign({}, defaults, data);
  if (typeof merged.zone !== 'number' || !VALID_ZONE_VALUES.includes(merged.zone)) {
    merged.zone = 0;
  }
  merged.src_unlocked = Boolean(merged.src_unlocked);
  return merged;
}

function writeZoneState(data, cwd = process.cwd()) {
  const dir = path.join(cwd, '.claude-state');
  fs.mkdirSync(dir, { recursive: true });
  const merged = Object.assign({}, defaultZoneState(), data, {
    schema_version: SCHEMA_VERSION,
  });
  fs.writeFileSync(zoneStatePath(cwd), JSON.stringify(merged, null, 2) + '\n', 'utf-8');
  return merged;
}

/**
 * `src_unlocked`を`true`に固定する（単調・冪等）。既に`true`なら何もしない。
 * `sync-check`が最初の`HB-ID`/`API-ID`採番成功時に呼ぶ想定（10.2.1節）。
 */
function unlockSrc(cwd = process.cwd(), updatedBy = 'sync-check') {
  const current = readZoneState(cwd);
  if (current.src_unlocked) return current;
  return writeZoneState(
    Object.assign({}, current, {
      src_unlocked: true,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    }),
    cwd
  );
}

module.exports = {
  ZONE_STATE_RELATIVE_PATH,
  SCHEMA_VERSION,
  VALID_ZONE_VALUES,
  zoneStatePath,
  defaultZoneState,
  readZoneState,
  writeZoneState,
  unlockSrc,
};
