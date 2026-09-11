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
 */

const fs = require('fs');
const { findTable } = require('../../../lib/markdown-table');
const { ledger0001Path } = require('../../../lib/ledger-paths');
const { readZoneState } = require('../../../lib/zone-state');

function readProcessOption(cwd) {
  try {
    const raw = fs.readFileSync(require('path').join(cwd, '.claude-state', 'process-option.json'), 'utf-8');
    const data = JSON.parse(raw);
    return data.mode === 'requirements-first' ? 'requirements-first' : 'prototype-driven';
  } catch (_err) {
    return 'prototype-driven';
  }
}

function main() {
  const cwd = process.cwd();
  const zoneState = readZoneState(cwd);
  const mode = readProcessOption(cwd);
  const suppressed = zoneState.zone < 3 && mode === 'prototype-driven';

  let content = '';
  try {
    content = fs.readFileSync(ledger0001Path(cwd), 'utf-8');
  } catch (_err) {
    console.log(JSON.stringify({ status: 'skipped', reason: '00-01_成果物構成カタログ.md が存在しない' }, null, 2));
    return;
  }

  const { header, rows } = findTable(content);
  if (!header) {
    console.log(JSON.stringify({ status: 'skipped', reason: '暫定スキーマのテーブルが見当たらない' }, null, 2));
    return;
  }
  const idxStatus = header.indexOf('状態（未生成/生成済み/対象外）');
  if (idxStatus === -1) {
    console.log(JSON.stringify({ status: 'skipped', reason: '想定スキーマと異なる' }, null, 2));
    return;
  }
  const idxTask = header.indexOf('項番');
  const idxName = header.indexOf('成果物名');
  const ungenerated = rows
    .filter((r) => (r[idxStatus] || '').includes('未生成'))
    .map((r) => ({ 項番: idxTask !== -1 ? r[idxTask] : '?', 成果物名: idxName !== -1 ? r[idxName] : '?' }));

  console.log(
    JSON.stringify(
      {
        status: 'done',
        zone: zoneState.zone,
        mode,
        suppressed,
        ungeneratedCount: ungenerated.length,
        ungenerated: suppressed ? '(抑制中のため詳細省略。zone<3 かつ prototype-driven)' : ungenerated,
      },
      null,
      2
    )
  );
}

main();
