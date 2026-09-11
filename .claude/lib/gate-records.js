#!/usr/bin/env node
'use strict';

/**
 * gate-records.js（M3新設・共有ライブラリ）
 *
 * 【目的・理由】
 * `gate-transition-guard.js`（02文書7.3節#3・10.2節）は「書込もうとする新しいzone値に
 * 対応するゾーンゲート判定が `GZ{0,2,3}-99_ゲート記録.md` にGOとして記録されていない
 * 場合に検知する」ことを要求されるが、**この台帳ファイルの具体的なMarkdownスキーマは
 * 02文書のどの節にも定義されていない**（`gate-check`のSKILL.mdも「台帳への記録」と
 * 言及するのみで列定義を持たない）。これは`current-zone.json`が M2 時点で暫定スキーマの
 * 明記を要した（`.claude/lib/zone-state.js`のコメント参照）のと同種の設計不足であり、
 * 本ライブラリはM3実装にあたり以下の**暫定スキーマ**を採用する。この暫定は設計不足として
 * PMへ報告する。
 *
 * 【暫定スキーマ】
 * ファイル: `docs/00_プロジェクト管理・ガバナンス/GZ{0,2,3}-99_ゲート記録.md`
 * 本体は`.claude/lib/markdown-table.js`が扱うGFM単一テーブルとし、列は
 * `日時 | 判定（GO/NG/HOLD） | 差し戻し回数（当時点の累計） | 備考` とする（他の
 * `00-xx`台帳と同じ「生きた台帳・追記のみ」パターンを踏襲）。判定は**最後の行**を
 * 最新判定として扱う。
 *
 * 【差し戻し回数の状態管理】
 * ゾーンゲート（`GZ0`/`GZ2`/`GZ3`）のみが差し戻しカウント対象であり（10.2節）、
 * ミニゲート・Zone1⇄2の機能単位往復は対象外である。カウントの永続化先も02文書に
 * 明記が無いため、`.claude-state/zone-gate-retry.json`を新設し
 * `{ "GZ0": {retryCount, hold, heldAt}, "GZ2": {...}, "GZ3": {...} }` の形式で保持する
 * （`decision-warnings.json`・`current-zone.json`と同じ`.claude-state/`配下の実行時状態
 * という位置づけ）。3回超過で`hold: true`とし、01文書4.8節が定める「3回超でHOLD」を
 * 機構的に表現する。**HOLDの解除手順（誰が・どう解除するか）は02文書のどこにも定義が
 * 無いため、本実装は「`hold: true`である限り、当該ゲートを跨ぐ前進書込を無条件でブロック
 * し続ける」という保守的な挙動を採用し、解除は`.claude-state/zone-gate-retry.json`を
 * 人手（PM経由の承認プロセス、01文書4.8節）で編集する運用に委ねる**。これも設計不足として
 * PMへ報告する。
 *
 * 【影響範囲】
 * `.claude/hooks/gate-transition-guard.js`。将来的に`gate-check`本実装（M3スコープ外、
 * SKILL.md本体の`<!-- M3で実装 -->`コメントはgate-check自身の分母・分子集計ロジックを
 * 指しており、本タスクの委譲範囲外）とスキーマを共有する可能性がある。
 *
 * 【前提条件・制約】
 * ファイルが存在しない場合は「GO記録なし」として扱う（judgement: null）。
 */

const fs = require('fs');
const path = require('path');
const { readTableAsObjects } = require('./markdown-table');
const { govDir } = require('./ledger-paths');

/**
 * ゾーンゲート境界の定義。`to`はそのゲートを通過した後に到達するzone値。
 * Zone1→Zone2（`to: 2`相当）は10.2節が明記する「準ゲート・差し戻し対象外」であるため
 * 意図的にここに含めない（`gate-transition-guard.js`はこの配列に無い境界を無条件で許可する）。
 */
const GATE_BOUNDARIES = [
  { gate: 'GZ0', to: 1 },
  { gate: 'GZ2', to: 3 },
  { gate: 'GZ3', to: 4 },
];

function gateRecordPath(gate, cwd = process.cwd()) {
  return path.join(govDir(cwd), `${gate}-99_ゲート記録.md`);
}

/**
 * 指定ゲートの最新判定（GO/NG/HOLD）を返す。台帳が無い・行が無い場合は null。
 */
function latestGateJudgement(gate, cwd = process.cwd()) {
  const rows = readTableAsObjects(gateRecordPath(gate, cwd));
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const raw = last['判定'] || last['判定（GO/NG/HOLD）'] || '';
  const m = /GO|NG|HOLD/i.exec(String(raw));
  return m ? m[0].toUpperCase() : null;
}

const RETRY_STATE_RELATIVE_PATH = path.join('.claude-state', 'zone-gate-retry.json');

function retryStatePath(cwd = process.cwd()) {
  return path.join(cwd, RETRY_STATE_RELATIVE_PATH);
}

function emptyRetryState() {
  const data = {};
  for (const b of GATE_BOUNDARIES) {
    data[b.gate] = { retryCount: 0, hold: false, heldAt: null };
  }
  return data;
}

/** `.claude-state/zone-gate-retry.json` を読む。無い/壊れている場合は空状態を返す。 */
function readRetryState(cwd = process.cwd()) {
  try {
    const raw = fs.readFileSync(retryStatePath(cwd), 'utf-8');
    const data = JSON.parse(raw);
    const merged = emptyRetryState();
    for (const gate of Object.keys(merged)) {
      if (data[gate]) merged[gate] = Object.assign({}, merged[gate], data[gate]);
    }
    return merged;
  } catch (_err) {
    return emptyRetryState();
  }
}

function writeRetryState(data, cwd = process.cwd()) {
  const dir = path.join(cwd, '.claude-state');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(retryStatePath(cwd), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * 指定ゲートについて「差し戻し」を1件記録する（累計+1、3回超過でhold化）。
 * `data`はreadRetryStateの戻り値をそのまま渡すことを想定し、破壊的に更新して返す。
 */
function recordReturnThroughGate(data, gate) {
  const state = data[gate] || { retryCount: 0, hold: false, heldAt: null };
  state.retryCount += 1;
  if (state.retryCount > 3 && !state.hold) {
    state.hold = true;
    state.heldAt = new Date().toISOString();
  }
  data[gate] = state;
  return state;
}

module.exports = {
  GATE_BOUNDARIES,
  gateRecordPath,
  latestGateJudgement,
  RETRY_STATE_RELATIVE_PATH,
  retryStatePath,
  readRetryState,
  writeRetryState,
  recordReturnThroughGate,
};
