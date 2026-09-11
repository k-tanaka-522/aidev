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
 * 【要確認・重要】本ファイルは`.claude/lib/markdown-table.js`の`findTable`
 * （ファイル内**最初の1テーブルのみ**を読む）を使っているが、CT-0003が対象とする
 * `.claude/lib/reverse-common.js`の`readCatalog`は、まさに同じ00-01が「区分ごとに
 * `##`見出しで区切られた複数テーブル」を持つ構成であるため`findAllTables`へ切り替えた
 * という経緯がある（CT-0003のコメント参照）。本ファイルが`findTable`のままだと、
 * 00区分（プロジェクト管理・ガバナンス）以外の02〜07区分の「未生成」行を静かに
 * 取りこぼしている可能性が高い（実例3と同型のサイレント故障の疑い、未検証）。
 * 本タスクの委譲範囲は【契約】欄の追加のみであるため実装修正は行っていないが、
 * 疑わしいバグとしてPMへ報告する。契約テスト自体はapp-architectへの発注とする。
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
