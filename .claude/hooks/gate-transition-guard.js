#!/usr/bin/env node
'use strict';

/**
 * gate-transition-guard.js（M0雛形）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#3・10.2節
 *
 * 【イベント】PreToolUse（`.claude-state/current-zone.json` へのWrite/Edit）
 * 【検知内容】「ゾーンゲート相当の操作」を `current-zone.json` の `zone` 値を
 *   前進させる書込として具体的に定義する（版1.4、旧版は未定義だった）。
 *   書込もうとする新しい `zone` 値に対応するゾーンゲート判定が
 *   `GZ{0,2,3}-99_ゲート記録.md` にGOとして記録されていない場合に検知する。
 * 【動作】exit 2（ブロック）。後退・同値の書込は許可する。
 * 【実装方針】ミニゲートには適用しない（10.2節で区別）。M3で実装。
 *
 * 【目的・理由】
 * ゾーンゲート（GZ0/GZ2/GZ3）の判定を経ずにゾーンを前進させることを防ぎ、
 * 「戻りは正常系・ゾーンゲートのみ差し戻しカウント対象」という設計原則
 * （1.3節・10.2節）を機構的に担保する。
 * 【影響範囲】
 * `.claude-state/current-zone.json` への Write/Edit。
 * 【前提条件・制約】
 * `GZ{0,2,3}-99_ゲート記録.md` にGO記録があるかどうかの判定にはファイル読取が必要。
 * settings.json未登録のM0段階では発火しない。
 */

const fs = require('fs');

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

function main() {
  const _payload = readHookPayload();

  // <!-- M3で実装: current-zone.jsonの現在値と書込予定値の比較（前進/後退/同値判定）、
  //      GZ{0,2,3}-99_ゲート記録.mdのGO記録確認 -->

  process.exit(0);
}

main();
