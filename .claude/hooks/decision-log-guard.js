#!/usr/bin/env node
'use strict';

/**
 * decision-log-guard.js（段1、M0雛形）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#5・8.2.2節
 *
 * 【イベント】PostToolUse（Edit|Write, アーキテクチャ関連パターン:
 *   `infra/**`, `decisions/contracts/**`, `prototypes/**` の新規画面/帳票、外部連携設定）
 * 【検知内容】対応する決定ログが直近に追記されていない変更。
 * 【動作】警告のみ（exit 0）。あえてブロックしない
 *   （決定ログを書くべきかの判断自体にエージェントの裁量が必要な場面が多く、
 *   機械的な exit 2 は誤検知コストが高いため。8.2.2節）。
 *   `.claude-state/decision-warnings.json` へ
 *   `{id, type: "file_change", path, detected_at, resolved: false}` として永続化する
 *   （版1.4で永続化先を明記。旧版はstderr出力のみで永続化先が無かった不備の是正）。
 * 【実装方針】M1で実装（決定ログ機構の中核）。
 *
 * 【目的・理由】
 * 「なぜそう決めたか」は実物からは復元できないため、Zone0〜2の決定の書き漏らしを
 * ファイル変更をトリガに検知する（8章冒頭）。ただし8.2.1節が指摘する通り、
 * 会話のみで完結しファイル変更を伴わない決定には構造的に盲目である
 * （その補完は段3 = task-boundary-guard.js が担う）。
 * 【影響範囲】
 * `infra/**`, `decisions/contracts/**`, `prototypes/**`の新規画面/帳票ファイル、
 * 外部連携設定ファイル等へのEdit|Write。
 * 【前提条件・制約】
 * `.claude-state/decision-warnings.json` が存在しない場合は新規作成する想定
 * （M1で実装）。settings.json未登録のM0段階では発火しない。
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

  // <!-- M1で実装: アーキテクチャ関連パターンの判定、直近の決定ログ更新時刻との比較、
  //      decision-warnings.jsonへの {type: "file_change", ...} 追記処理 -->

  process.exit(0);
}

main();
