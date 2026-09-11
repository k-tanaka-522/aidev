#!/usr/bin/env node
'use strict';

/**
 * decision-stop-check.js（段2、M0雛形）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#6・8.2.3節
 *
 * 【イベント】Stop
 * 【検知内容】セッション中の `git diff` 相当の変更差分と決定ログ追記を突合し、
 *   パターン該当なのに記録が無い変更を検知する。
 * 【動作】警告のみ（exit 0）。`.claude-state/decision-warnings.json` へ
 *   `{type: "stop_session", ...}` として永続化し、PMに一覧提示する。
 * 【実装方針】M1で実装。
 *
 * 【目的・理由】
 * decision-log-guard.js（段1）が捕捉しきれない、セッション終了時点での
 * 未記録の決定を最終確認する第2の網（8.2.3節）。
 * 【影響範囲】
 * セッション全体で変更されたファイル一覧（`git diff`相当）。
 * 【前提条件・制約】
 * **要検証（15章#2）**: Stop hookの実行タイミングでgitワーキングツリーの
 * 差分を確実に取得できるか、Stop hook自体がこの用途で利用可能な仕様か。
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

  // <!-- M1で実装: git diff相当の変更差分取得（要検証、15章#2）、
  //      決定ログ追記との突合、decision-warnings.jsonへの
  //      {type: "stop_session", ...} 追記処理 -->

  process.exit(0);
}

main();
