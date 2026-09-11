#!/usr/bin/env node
'use strict';

/**
 * gate-transition-guard.js（M3本実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#3・10.2節・10.2.1節（版1.8で
 * スキーマ・遷移判定表を正本化）
 *
 * 【イベント】PreToolUse（`.claude-state/current-zone.json` へのWrite/Edit）
 * 【検知内容】「ゾーンゲート相当の操作」を `current-zone.json` の `zone` 値を
 *   前進させる書込として定義する。10.2.1節の遷移判定表（下記）に従い、対応する
 *   ゾーンゲートのGO記録（`GZ{0,2,3}-99_ゲート記録.md`）が無い前進をブロックする。
 *
 * 【10.2.1節の遷移判定表（版1.8、MUST・そのまま実装）】
 *   | 現在のzone | 書込もうとするzone | 判定 |
 *   |---|---|---|
 *   | 0 | 1 | GZ0のGO記録が存在すれば許可、無ければ exit 2 |
 *   | 1 | 3 | GZ2のGO記録が存在すれば許可、無ければ exit 2 |
 *   | 3 | 4 | GZ3のGO記録が存在すれば許可、無ければ exit 2 |
 *   | 任意 | 同値 | 許可（ノーオペ書込） |
 *   | 任意 | それより小さい値 | 常に許可（exit 0）。ゲート記録の有無に関わらずブロックしない |
 *   | 上記以外（例: 0→3, 1→4等、中間ゲートを飛ばす遷移） | 常に exit 2（MUST） |
 *
 *   `src_unlocked`・`zone3_freeze_tag`・`zone3_hotfix_active`の変更は`zone`値自体を
 *   変えない限り監視対象に含めない（10.2.1節）。
 *
 * 【差し戻し回数カウントとHOLD（10.2節・01文書4.8節、本実装による拡張）】
 * 10.2.1節の遷移判定表自体はHOLD状態に言及していない。しかし02文書10.2節・PMからの
 * M3委譲は「差し戻し回数はゾーンゲート（GZ0/GZ2/GZ3）にのみ適用し、3回超過でHOLD」を
 * 明示的に要求している。本実装はこれを次のとおり実現する（**表に無い拡張として実装した
 * ことをPMへ報告する**）。
 *   - `zone`値がゾーンゲート境界を後退方向に跨ぐ書込（例: 1→0, 3→1, 4→3）を検知する
 *     たびに `.claude-state/zone-gate-retry.json`（`.claude/lib/gate-records.js`参照）の
 *     該当ゲートの`retryCount`を+1する。後退は表のとおり常に許可した上で、副作用として
 *     カウントのみ行う。
 *   - 該当ゲートの`retryCount`が3を超えると`hold: true`を記録する。以後、そのゲートを
 *     跨ぐ前進書込は、GO記録の有無に関わらず`exit 2`でブロックし続ける（HOLD解除の手順は
 *     02文書に定義が無いため、`.claude-state/zone-gate-retry.json`を人手で編集する運用に
 *     委ねる。設計不足としてPMへ報告する）。
 *
 * 【影響範囲】
 * `.claude-state/current-zone.json` への Write/Edit。
 * 【前提条件・制約】
 * - 新しい`zone`値は、Writeツールなら`tool_input.content`をJSONとして解釈し、Editツール
 *   なら現在のファイル内容に`old_string`→`new_string`を適用した結果をJSONとして解釈する
 *   （いずれも本フックはPreToolUseで発火するため、書込前の現在のファイル内容を読める）。
 * - 新しい`zone`値を特定できない場合（JSON解析失敗、フィールド欠落等）は、誤ってブロック
 *   することを避けるため安全側（exit 0）に倒す。ただしstderrに警告を出す。
 * - settings.json未登録（.claude/settings.json への正式登録はM6）の間は発火しない。
 *   M3では動作確認のみ `echo '<JSON>' | node gate-transition-guard.js` で行う。
 */

const fs = require('fs');
const path = require('path');
const { readZoneState, zoneStatePath, VALID_ZONE_VALUES } = require('../lib/zone-state');
const {
  GATE_BOUNDARIES,
  latestGateJudgement,
  readRetryState,
  writeRetryState,
  recordReturnThroughGate,
} = require('../lib/gate-records');

/** 10.2.1節の遷移判定表のうち、前進として許可されうる唯一の組み合わせ。それ以外の前進は常に拒否する。 */
const VALID_FORWARD = {
  0: { to: 1, gate: 'GZ0' },
  1: { to: 3, gate: 'GZ2' },
  3: { to: 4, gate: 'GZ3' },
};

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

/**
 * PreToolUseペイロードから、これから書き込まれようとしている新しい`zone`値を特定する。
 * 特定できない場合は undefined を返す（呼び出し側が安全側の扱いをする）。
 */
function resolveNewZoneValue(payload, cwd) {
  const toolName = payload.tool_name;
  const input = payload.tool_input || {};

  if (typeof input.content === 'string') {
    // Write相当: 新しい内容がそのままcontentに入っている。
    try {
      const parsed = JSON.parse(input.content);
      return typeof parsed.zone === 'number' ? parsed.zone : undefined;
    } catch (_err) {
      return undefined;
    }
  }

  if (typeof input.new_string === 'string') {
    // Edit相当: 書込前の現在のファイル内容にold_string→new_stringを適用してから解釈する。
    try {
      const current = fs.readFileSync(zoneStatePath(cwd), 'utf-8');
      const replaced =
        typeof input.old_string === 'string' ? current.split(input.old_string).join(input.new_string) : current;
      const parsed = JSON.parse(replaced);
      return typeof parsed.zone === 'number' ? parsed.zone : undefined;
    } catch (_err) {
      return undefined;
    }
  }

  // ツール仕様が想定と異なる場合（フィールド名変更等）。安全側でundefinedを返す。
  void toolName;
  return undefined;
}

function main() {
  const payload = readHookPayload();
  const cwd = process.cwd();

  const filePath = payload && payload.tool_input && payload.tool_input.file_path;
  if (!filePath) {
    process.exit(0);
  }
  const absTarget = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const relPath = path.relative(cwd, absTarget).replace(/\\/g, '/');
  if (relPath !== '.claude-state/current-zone.json') {
    process.exit(0);
  }

  const oldZone = readZoneState(cwd).zone;
  const newZoneRaw = resolveNewZoneValue(payload, cwd);

  if (typeof newZoneRaw !== 'number' || Number.isNaN(newZoneRaw)) {
    console.error(
      '[gate-transition-guard] 新しいzone値を特定できませんでした（tool_input仕様が想定と異なる可能性）。誤ブロックを避けるため許可します。'
    );
    process.exit(0);
  }

  if (!VALID_ZONE_VALUES.includes(newZoneRaw)) {
    console.error(
      `[gate-transition-guard] zone値 ${newZoneRaw} は10.2.1節が定める許容値（0/1/3/4）に含まれません。書込をブロックします。`
    );
    process.exit(2);
  }

  const newZone = newZoneRaw;

  if (newZone === oldZone) {
    process.exit(0); // ノーオペ書込
  }

  const retryState = readRetryState(cwd);

  if (newZone < oldZone) {
    // 後退: 表のとおり常に許可する。跨いだゾーンゲート境界があれば差し戻しとしてカウントする。
    let changed = false;
    for (const b of GATE_BOUNDARIES) {
      if (oldZone >= b.to && newZone < b.to) {
        const state = recordReturnThroughGate(retryState, b.gate);
        changed = true;
        console.error(
          `[gate-transition-guard] ${b.gate} を跨ぐ後退を検知しました（zone ${oldZone} -> ${newZone}）。` +
            `累計差し戻し回数: ${state.retryCount}${state.hold ? '（HOLD状態に移行）' : ''}`
        );
      }
    }
    if (changed) writeRetryState(retryState, cwd);
    process.exit(0);
  }

  // 前進: 10.2.1節の表どおり、0→1・1→3・3→4以外は常に拒否する。
  const rule = VALID_FORWARD[oldZone];
  if (!rule || rule.to !== newZone) {
    console.error(
      `[gate-transition-guard] zone ${oldZone} -> ${newZone} は中間ゲートを飛ばす遷移です（10.2.1節の表に無い遷移）。書込をブロックします。`
    );
    process.exit(2);
  }

  const gateState = retryState[rule.gate] || { retryCount: 0, hold: false };
  if (gateState.hold) {
    console.error(
      `[gate-transition-guard] ${rule.gate} はHOLD状態です（差し戻し累計 ${gateState.retryCount} 回 > 3）。` +
        '人間による解除（01文書4.8節の承認プロセス、.claude-state/zone-gate-retry.jsonの手動編集）が必要です。' +
        `zone ${oldZone} -> ${newZone} への前進書込をブロックします。`
    );
    process.exit(2);
  }

  const judgement = latestGateJudgement(rule.gate, cwd);
  if (judgement !== 'GO') {
    console.error(
      `[gate-transition-guard] ${rule.gate} のGO判定が ${rule.gate}-99_ゲート記録.md に見つかりません` +
        `（現在の判定: ${judgement || '記録なし'}）。zone ${oldZone} -> ${newZone} への前進書込をブロックします。`
    );
    process.exit(2);
  }

  process.exit(0);
}

main();
