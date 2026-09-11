#!/usr/bin/env node
'use strict';

/**
 * gate-records.js（M3新設・本タスクで10.2.2節の正本スキーマへ移行）
 *
 * 【目的・理由】
 * `gate-transition-guard.js`（02文書7.3節#3・10.2節）は「書込もうとする新しいzone値に
 * 対応するゾーンゲート判定が `GZ{0,2,3}-99_ゲート記録.md` にGOとして記録されていない
 * 場合に検知する」ことを要求される。M3実装時点では台帳のMarkdownスキーマが02文書のどこにも
 * 定義されておらず、暫定スキーマ（GFMテーブル: `日時 | 判定 | 差し戻し回数 | 備考`）を
 * 採用していた（本ファイル旧版のコメント参照）。
 *
 * その後 02文書 版1.9・10.2.2節が「`GZ{0,2,3}-99_ゲート記録.md`のスキーマ定義とHOLD解除
 * 手順」を正本として新設した（版2.2まで変更なし）。本タスク（ゾーンゲート本体`gate-check`
 * の実装）はこの正本スキーマに正式に追随する（MUST）。
 *
 * 【10.2.2節が定める正本スキーマ】
 * ファイルはゲート種別ごとに独立（`GZ0-99_ゲート記録.md`等）。本体はGFMテーブルではなく、
 * 判定のたびに追記する見出し＋箇条書きのブロックとする（まとめ書き禁止・追記専用、
 * 9.4節と同じ原則）。
 *
 * ```markdown
 * ## {GZ0|GZ2|GZ3} 判定記録 #{連番}
 *
 * - 判定日時: 2026-09-11T10:00:00Z
 * - 判定結果: GO | NG | HOLD | RESET
 * - 差し戻し累積回数: 1
 * - 分母: 42
 * - 分子: 42
 * - 未解消decision-warnings件数: 0
 * - 判定主体: gate-check（context: fork）
 * - 参照決定ログ: DL-0050（RESETエントリの場合MUST。それ以外は該当があれば記載）
 * - 備考: ...
 * ```
 *
 * 本ファイルへの書込は`gate-check`経由に限る（素のWriteによる手編集を禁止、MUST NOT）。
 * 本ライブラリは`gate-check`スクリプト（`.claude/skills/gate-check/scripts/*.js`）からのみ
 * 呼び出されることを前提とする。
 *
 * 【後方互換性への配慮】
 * `.claude/hooks/gate-transition-guard.js`（変更禁止のhook）は本ファイルの
 * `latestGateJudgement(gate, cwd)` を呼び出し `!== 'GO'` の判定にのみ使う。旧GFMテーブル
 * 形式から新ブロック形式への移行は本関数の内部実装のみで吸収し、hook側のインターフェース
 * （関数シグネチャ・戻り値の文字列集合 `GO|NG|HOLD`）は変更しない（MUST）。旧形式の
 * ファイルが万一残っていた場合に備え、ブロック形式で0件だった場合のみ、フォールバックとして
 * 旧GFMテーブル形式を読む（読み取り専用の後方互換。新規書込は常に新形式で行う）。
 *
 * 【差し戻し回数の状態管理（10.2.1節、変更なし）】
 * ゾーンゲート（`GZ0`/`GZ2`/`GZ3`）のみが差し戻しカウント対象であり、ミニゲート・Zone1⇄2の
 * 機能単位往復は対象外である。カウントの永続化先は`.claude-state/zone-gate-retry.json`
 * （`{ "GZ0": {retryCount, hold, heldAt}, "GZ2": {...}, "GZ3": {...} }`）のまま変更しない。
 *
 * 【HOLD解除手順（10.2.2節、本タスクで実装）】
 * 1. HOLD発生時、`gate-check`は判定結果`HOLD`のエントリを追記し、以降そのゲートの
 *    再判定要求を`exit 2`相当でブロックする（自動では解除しない）
 * 2. PMがユーザーに事業判断を仰ぎ、続行の承認を得る
 * 3. 承認内容を決定ログへ起票する
 * 4. `gate-check --reset-hold=<GZ0|GZ2|GZ3> --decision=<DL-ID>`を実行し、判定結果`RESET`
 *    のエントリ（参照決定ログIDを含む）を追記した上で、差し戻し累積回数を`0`にリセットする
 * 5. リセット後、通常どおり当該ゲートの判定を再実行する
 * 本ファイルの`resetHold()`がステップ4を実装する。ステップ1〜3・5は`gate-check`スクリプト
 * および運用（PM・ユーザー）の責務である。
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

const GATES = ['GZ0', 'GZ2', 'GZ3'];

function gateRecordPath(gate, cwd = process.cwd()) {
  return path.join(govDir(cwd), `${gate}-99_ゲート記録.md`);
}

function readFileSafe(p) {
  try {
    return fs.readFileSync(p, 'utf-8');
  } catch (_err) {
    return '';
  }
}

/**
 * 10.2.2節の正本スキーマ（見出し＋箇条書きブロック）を解析し、判定記録の配列を返す
 * （出現順＝追記順のまま）。各要素は `{ seq, fields... }`（fieldsのキーは箇条書きの
 * ラベルそのまま。例: `判定結果`, `分母`, `分子`, `差し戻し累積回数`, `未解消decision-warnings件数`,
 * `判定主体`, `参照決定ログ`, `備考`, `判定日時`）。
 */
function readGateRecords(gate, cwd = process.cwd()) {
  const content = readFileSafe(gateRecordPath(gate, cwd));
  if (!content) return [];
  const headerRe = new RegExp(`^##\\s+${gate}\\s+判定記録\\s+#(\\d+)\\s*$`);
  const lines = content.split(/\r?\n/);
  const records = [];
  let current = null;
  for (const line of lines) {
    const hm = headerRe.exec(line.trim());
    if (hm) {
      if (current) records.push(current);
      current = { seq: parseInt(hm[1], 10) };
      continue;
    }
    if (!current) continue;
    const lm = /^-\s*([^:：]+)[:：]\s*(.*)$/.exec(line.trim());
    if (lm) {
      current[lm[1].trim()] = lm[2].trim();
    }
  }
  if (current) records.push(current);
  return records;
}

/**
 * 旧M3実装が採用していたGFMテーブル形式（`日時 | 判定 | 差し戻し回数 | 備考`）の
 * 読み取り専用フォールバック。新規ファイルはこの形式では書かない（読み取り互換のみ）。
 */
function readLegacyTableJudgement(gate, cwd = process.cwd()) {
  const rows = readTableAsObjects(gateRecordPath(gate, cwd));
  if (!rows.length) return null;
  const last = rows[rows.length - 1];
  const raw = last['判定'] || last['判定（GO/NG/HOLD）'] || '';
  const m = /GO|NG|HOLD|RESET/i.exec(String(raw));
  return m ? m[0].toUpperCase() : null;
}

/**
 * 指定ゲートの最新判定（GO/NG/HOLD/RESET）を返す。台帳が無い・行が無い場合は null。
 * `gate-transition-guard.js`（hook、変更禁止）から呼ばれるインターフェースであるため、
 * 戻り値の型・文字列集合は変更しない。
 */
function latestGateJudgement(gate, cwd = process.cwd()) {
  const records = readGateRecords(gate, cwd);
  if (records.length) {
    const last = records[records.length - 1];
    const raw = last['判定結果'] || '';
    const m = /GO|NG|HOLD|RESET/i.exec(String(raw));
    return m ? m[0].toUpperCase() : null;
  }
  // 新形式のブロックが1件も無い場合のみ、旧GFMテーブル形式にフォールバックする。
  return readLegacyTableJudgement(gate, cwd);
}

function nextRecordSeq(gate, cwd = process.cwd()) {
  const records = readGateRecords(gate, cwd);
  return records.reduce((max, r) => Math.max(max, r.seq || 0), 0) + 1;
}

/**
 * `GZ{0,2,3}-99_ゲート記録.md` へ1件、追記専用で判定記録を書き込む（10.2.2節のMUSTスキーマ）。
 * 本関数は`gate-check`スクリプトからのみ呼ぶこと（素のWrite手編集の禁止、MUST NOT）。
 *
 * `entry`: { judgement, judgedAt, retryCount, denominator, numerator, unresolvedWarnings,
 *            judgedBy, decisionRef, note }
 * `judgement`は`GO|NG|HOLD|RESET`のいずれか。`decisionRef`は`RESET`エントリではMUST、
 * それ以外は該当があれば記載する（無ければ行自体を省略する）。
 */
function appendGateRecord(gate, entry, cwd = process.cwd()) {
  if (!GATES.includes(gate)) {
    throw new Error(`appendGateRecord: 不正なゲート種別 "${gate}"（GZ0/GZ2/GZ3のいずれか）`);
  }
  if (!/^(GO|NG|HOLD|RESET)$/.test(entry.judgement)) {
    throw new Error(`appendGateRecord: 不正な判定結果 "${entry.judgement}"`);
  }
  if (entry.judgement === 'RESET' && !entry.decisionRef) {
    throw new Error('appendGateRecord: RESETエントリには参照決定ログ（decisionRef）がMUST');
  }

  const seq = nextRecordSeq(gate, cwd);
  const block = [];
  block.push(`## ${gate} 判定記録 #${seq}`, '');
  block.push(`- 判定日時: ${entry.judgedAt || new Date().toISOString()}`);
  block.push(`- 判定結果: ${entry.judgement}`);
  block.push(`- 差し戻し累積回数: ${entry.retryCount != null ? entry.retryCount : 0}`);
  block.push(`- 分母: ${entry.denominator != null ? entry.denominator : '-'}`);
  block.push(`- 分子: ${entry.numerator != null ? entry.numerator : '-'}`);
  block.push(
    `- 未解消decision-warnings件数: ${entry.unresolvedWarnings != null ? entry.unresolvedWarnings : '-'}`
  );
  block.push(`- 判定主体: ${entry.judgedBy || 'gate-check（context: fork）'}`);
  if (entry.decisionRef) block.push(`- 参照決定ログ: ${entry.decisionRef}`);
  block.push(`- 備考: ${entry.note || ''}`);
  block.push('');

  const p = gateRecordPath(gate, cwd);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const existing = readFileSafe(p);
  const prefix = existing
    ? existing.replace(/\n*$/, '\n\n')
    : `# ${gate}-99 ゲート記録\n\n> スキーマ正本: docs/v2/02_実行基盤アーキテクチャ.md 10.2.2節。本ファイルへの書込は\`gate-check\`経由に限る（素のWrite手編集禁止）。\n\n`;
  fs.writeFileSync(p, prefix + block.join('\n') + '\n', 'utf-8');
  return seq;
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

/**
 * 10.2.2節「HOLD解除手順」ステップ4を実装する。RESETエントリを台帳へ追記し、
 * `zone-gate-retry.json`の当該ゲートを`{retryCount:0, hold:false, heldAt:null}`へ戻す。
 * `decisionId`（`DL-xxxx`形式）はMUST（PM経由のユーザー承認を記録した決定ログID）。
 */
function resetHold(gate, decisionId, cwd = process.cwd()) {
  if (!GATES.includes(gate)) {
    throw new Error(`resetHold: 不正なゲート種別 "${gate}"（GZ0/GZ2/GZ3のいずれか）`);
  }
  if (!decisionId) {
    throw new Error('resetHold: --decision=<DL-ID> はMUST（10.2.2節HOLD解除手順ステップ4）');
  }
  const retryState = readRetryState(cwd);
  const before = retryState[gate] || { retryCount: 0, hold: false, heldAt: null };
  const seq = appendGateRecord(
    gate,
    {
      judgement: 'RESET',
      retryCount: 0,
      judgedBy: 'gate-check（context: fork） --reset-hold',
      decisionRef: decisionId,
      note: `HOLD解除（02文書10.2.2節手順）。リセット前の差し戻し累積回数=${before.retryCount}、hold=${before.hold}`,
    },
    cwd
  );
  retryState[gate] = { retryCount: 0, hold: false, heldAt: null };
  writeRetryState(retryState, cwd);
  return { gate, seq, before, after: retryState[gate] };
}

module.exports = {
  GATES,
  GATE_BOUNDARIES,
  gateRecordPath,
  readGateRecords,
  appendGateRecord,
  latestGateJudgement,
  RETRY_STATE_RELATIVE_PATH,
  retryStatePath,
  readRetryState,
  writeRetryState,
  recordReturnThroughGate,
  resetHold,
};
