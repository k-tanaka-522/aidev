#!/usr/bin/env node
'use strict';

/**
 * zone-state.js（M2共有ライブラリ）
 *
 * 【目的・理由】
 * `sync-check`は10.3節「Zone2に入りsrc/backend/に実装が生じた後は、突合対象を契約モックから
 * 実装へ切り替える」ために現在のゾーンを知る必要がある。02文書は`.claude-state/current-zone.json`
 * の存在を随所で前提にする（4.1節・7.3節#3・8.7節等）が、**具体的なJSONスキーマは
 * どの節にも明記されていない**（`gate-transition-guard.js`は「zone値の前進的書込」とだけ言及）。
 * 本ライブラリはM2実装にあたり暫定スキーマ `{ "zone": 0|1|2|3|4, "updated_at": ISO8601,
 * "updated_by": string }` を採用する。これは`process-option.json`
 * （8.7節が明記するスキーマ）と対称的な最小構成とした。**この暫定は設計不足としてPMへ
 * 報告する**（後続M3で`gate-transition-guard.js`を実装する際にスキーマが確定していない場合、
 * 本ファイルの定義を正本として扱うか、M3側で再定義するかの判断が必要になる）。
 *
 * 【影響範囲】
 * `.claude/skills/sync-check/scripts/*.js`。将来的に`role-boundary-guard.js`・
 * `gate-transition-guard.js`（いずれもM3実装）もこのスキーマを参照する可能性がある。
 *
 * 【前提条件・制約】
 * ファイルが存在しない場合はZone0（決定ログ未着手〜Zone0中）とみなし `{zone: 0}` を返す
 * （例外を投げない。M0〜M1段階のプロジェクトではまだ本ファイルが存在しないため）。
 */

const fs = require('fs');
const path = require('path');

const ZONE_STATE_RELATIVE_PATH = path.join('.claude-state', 'current-zone.json');

function zoneStatePath(cwd) {
  return path.join(cwd, ZONE_STATE_RELATIVE_PATH);
}

function readZoneState(cwd = process.cwd()) {
  try {
    const raw = fs.readFileSync(zoneStatePath(cwd), 'utf-8');
    const data = JSON.parse(raw);
    if (typeof data.zone !== 'number') data.zone = 0;
    return data;
  } catch (_err) {
    return { zone: 0 };
  }
}

function writeZoneState(data, cwd = process.cwd()) {
  const dir = path.join(cwd, '.claude-state');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(zoneStatePath(cwd), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

module.exports = { ZONE_STATE_RELATIVE_PATH, zoneStatePath, readZoneState, writeZoneState };
