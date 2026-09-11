#!/usr/bin/env node
'use strict';

/**
 * doc-header-guard.js（M0雛形）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#4・9.2節
 *
 * 【イベント】PostToolUse（Write, 対象パターン: `docs/0[2-7]_**` 配下の `.md` ファイル）
 * 【検知内容】doc-style-guide必須ヘッダー、`生成区分`フィールドの欠落。
 *   検査対象を `docs/0[2-7]_**` に限定する（版1.4。旧版は `docs/` 配下の `.md` 全体を
 *   対象にし docs/00・決定ログ・docs/v2 配下まで警告対象になっていた不備を是正）。
 * 【動作】exit 2（ブロック）
 * 【実装方針】`生成区分` は必須フィールドとし値は
 *   `実装反映(as-built)` | `事前設計(前倒し)` | `手動作成` のいずれか
 *   （03文書8.4節と統一、版1.4で訂正）。M3で実装。
 *
 * 【目的・理由】
 * IPA成果物がas-built生成なのか前倒し執筆なのか手動作成なのかを機械的に
 * 判別可能にし、9.2節の生成区分強制を担保する。
 * 【影響範囲】
 * `docs/0[2-7]_**` 配下の `.md` へのWrite。
 * 【前提条件・制約】
 * `docs/00`・決定ログ（`docs/00_.../decisions/**`）・`docs/v2` 配下は対象外。
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

  // <!-- M3で実装: docs/0[2-7]_** 配下の .md 判定、frontmatterの生成区分フィールド
  //      有無・値妥当性チェック -->

  process.exit(0);
}

main();
