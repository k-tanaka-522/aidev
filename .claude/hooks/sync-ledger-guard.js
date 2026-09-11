#!/usr/bin/env node
'use strict';

/**
 * sync-ledger-guard.js（新設、版1.5、M0雛形）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#10・10.1.5節
 *
 * 【イベント】PostToolUse（Edit|Write,
 *   `docs/00_.../00-02_HBトレーサビリティ台帳.md`,
 *   `docs/00_.../00-03_バッチトレーサビリティ台帳.md`）
 * 【検知内容】`00-02`/`00-03`への追記（`HB-ID`/`API-ID`/`BAT-ID`の登録）に
 *   対応する `docs/00_.../00-05_同期点記録台帳.md` の追記が同一操作内に
 *   伴っていない場合を検知する。
 * 【動作】警告のみ（exit 0）。`.claude-state/decision-warnings.json` へ
 *   `{type: "sync_ledger_missing", ...}` を追記し8.2.5節の消し込み機構を共用する。
 * 【実装方針】01文書8.1節が同期点合意の証跡をIPA準拠主張の成立条件とするため、
 *   単なる注意書きに留めず検知機構化した（10.1.5節）。
 *
 * 【目的・理由】
 * `00-05`同期点記録台帳は`gate-check`が01文書7.6節の同期点由来分母の出典として
 * 読む唯一の台帳であるため、`00-02`/`00-03`への追記と同時に更新されないと
 * ゲート判定の分母が欠落する。
 * 【影響範囲】
 * `docs/00_プロジェクト管理・ガバナンス/00-02_HBトレーサビリティ台帳.md`、
 * `docs/00_プロジェクト管理・ガバナンス/00-03_バッチトレーサビリティ台帳.md` へのEdit|Write。
 * 【前提条件・制約】
 * 実装時期は02文書14.2節の段階移行計画（M0〜M6）に明記が無い
 * （本Skillの起票元である`sync-check`はM2の完了条件に含まれるため、
 * 本ファイルは暫定的にM2相当での実装を想定する。この対応関係は設計書に
 * 明記が無いためPMへ報告する）。settings.json未登録のM0段階では発火しない。
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

  // <!-- M2相当で実装（14.2節に明記なし、PMへ要確認）: 00-02/00-03への追記検知、
  //      同一操作内の00-05追記有無の確認、decision-warnings.jsonへの
  //      {type: "sync_ledger_missing", ...} 追記処理 -->

  process.exit(0);
}

main();
