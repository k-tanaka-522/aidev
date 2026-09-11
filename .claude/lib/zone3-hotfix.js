#!/usr/bin/env node
'use strict';

/**
 * zone3-hotfix.js（M5新設・共有ライブラリ）
 *
 * 【目的・理由】
 * 02文書10.2.1節は「累積差し戻し回数は`current-zone.json`の責務としない。累積カウントは
 * 既存の`.claude-state/zone3-hotfix-count.json`が正であり、本ファイルとの二重管理を避ける」
 * と記述している。しかし版1.8〜2.2までのどの版・どのマイルストーン（M1〜M4）を確認しても
 * `zone3-hotfix-count.json`を実際に生成・読み書きするコードは存在しなかった
 * （`grep -r zone3-hotfix-count .claude .claude-state`で本ライブラリ新設前は0件）。
 * 「既存の」という記述は実体を伴わない参照であり、`current-zone.json`・
 * `GZ{0,2,3}-99_ゲート記録.md`・`00-01_成果物構成カタログ.md`がM2・M3・M4でそれぞれ
 * 暫定スキーマの明記を要した（`zone-state.js`・`gate-records.js`・`reverse-common.js`の
 * 各コメント参照）のと同種の設計不足である。本ライブラリはM5実装にあたり以下の
 * **暫定スキーマ**を新規に定義する（PMへ報告）。
 *
 * 【暫定スキーマ】
 * 02文書10.4節は「Zone3内ミニチケットのGate（`gate-check --kind=zone3-hotfix`）の
 * 差し戻し回数を、GZ{0,2,3}-99とは別の台帳に記録し、01文書4.6.2節の『差し戻し回数の
 * 累積対象外』原則を機構的に担保する」ことを求める。この要求は「ゾーンゲートの差し戻し
 * カウンタを汚染しない」という**分離**が目的であり、「Zone3内ミニチケット同士でも
 * 差し戻しを無制限に許す」という意味ではない（01文書4.8節はZone3内ホットフィックスを
 * 「低〜中コスト・Zone3特有の日常」と位置づけるのみで、上限自体は撤廃していない）。
 * したがって本実装は、`.claude/lib/gate-records.js`が`GZ0`/`GZ2`/`GZ3`について採用した
 * 「3回超過でhold化」というパターンを、**個々のZone3内ミニチケットID単位**に適用する
 * （ゾーンゲート側の`zone-gate-retry.json`とは完全に独立したファイル・キー空間であり、
 * 08.2.5節の`decision-warnings.json`分離と同じ設計思想）。
 *
 * ```json
 * {
 *   "tickets": {
 *     "ZH-0001": { "retryCount": 1, "hold": false, "heldAt": null, "closedAt": null }
 *   }
 * }
 * ```
 *
 * 【影響範囲】
 * `.claude/skills/gate-check/scripts/gate-check.js`（`--kind=zone3-hotfix`）、
 * `.claude/skills/ticket-triage/scripts/ticket-triage.js`（起票時の`zone3_hotfix_active`
 * トグルと連動したID採番）。
 *
 * 【前提条件・制約】
 * ファイルが存在しない場合は空状態として扱う（例外を投げない）。
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

const ZONE3_HOTFIX_RELATIVE_PATH = path.join('.claude-state', 'zone3-hotfix-count.json');

function zone3HotfixPath(cwd = process.cwd()) {
  return path.join(cwd, ZONE3_HOTFIX_RELATIVE_PATH);
}

function readState(cwd = process.cwd()) {
  try {
    const raw = fs.readFileSync(zone3HotfixPath(cwd), 'utf-8');
    const data = JSON.parse(raw);
    if (!data.tickets || typeof data.tickets !== 'object') data.tickets = {};
    return data;
  } catch (_err) {
    return { tickets: {} };
  }
}

function writeState(data, cwd = process.cwd()) {
  const dir = path.join(cwd, '.claude-state');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(zone3HotfixPath(cwd), JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/** 次のZone3内ミニチケットID（`ZH-{4桁}`）を算出する。02〜04文書のどこにも採番規則が
 * 無いため、SCR/HB等の6種ID体系（`id-registry.js`）と同型の連番採番を踏襲する（PMへ報告）。
 */
function nextHotfixId(cwd = process.cwd()) {
  const data = readState(cwd);
  let max = 0;
  for (const id of Object.keys(data.tickets)) {
    const m = /^ZH-(\d{4})$/.exec(id);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `ZH-${String(max + 1).padStart(4, '0')}`;
}

/** 新規Zone3内ミニチケットを起票する。 */
function openHotfix(cwd = process.cwd()) {
  const data = readState(cwd);
  const id = nextHotfixId(cwd);
  data.tickets[id] = { retryCount: 0, hold: false, heldAt: null, closedAt: null };
  writeState(data, cwd);
  return id;
}

/** 差し戻しを1件記録する（累計+1、3回超過でhold化）。01文書7.4節の3回超上限を準用する。 */
function recordReturn(id, cwd = process.cwd()) {
  const data = readState(cwd);
  const t = data.tickets[id] || { retryCount: 0, hold: false, heldAt: null, closedAt: null };
  t.retryCount += 1;
  if (t.retryCount > 3 && !t.hold) {
    t.hold = true;
    t.heldAt = new Date().toISOString();
  }
  data.tickets[id] = t;
  writeState(data, cwd);
  return t;
}

/** 本番反映完了に伴いミニチケットをクローズする（10.4節手順6・7）。 */
function closeHotfix(id, cwd = process.cwd()) {
  const data = readState(cwd);
  const t = data.tickets[id];
  if (!t) return null;
  t.closedAt = new Date().toISOString();
  data.tickets[id] = t;
  writeState(data, cwd);
  return t;
}

function getHotfix(id, cwd = process.cwd()) {
  return readState(cwd).tickets[id] || null;
}

module.exports = {
  ZONE3_HOTFIX_RELATIVE_PATH,
  zone3HotfixPath,
  readState,
  writeState,
  nextHotfixId,
  openHotfix,
  recordReturn,
  closeHotfix,
  getHotfix,
};
