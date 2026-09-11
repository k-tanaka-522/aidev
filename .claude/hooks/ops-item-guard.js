#!/usr/bin/env node
'use strict';

/**
 * ops-item-guard.js（新設、M0雛形）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#9
 *
 * 【イベント】PostToolUse（Edit|Write, `infra/**` の監視・バックアップ・DR関連IaC
 *   定義ファイル、`src/**` のジョブスケジューラ定義ファイル）
 * 【検知内容】対応する `docs/00_.../00-04_運用項目一覧.md` のエントリが
 *   存在しない変更。
 * 【動作】警告のみ（exit 0）
 * 【実装方針】04文書10章#6への対応。M4で実装。
 *
 * 【目的・理由】
 * 運用項目（監視・バックアップ・DR等）がIaC/ジョブ定義として実装されているのに
 * 運用項目一覧に登録されていない、という登録漏れを検知する。
 * 【影響範囲】
 * `infra/**` の監視・バックアップ・DR関連IaC定義ファイル、`src/**` の
 * ジョブスケジューラ定義ファイル。
 * 【前提条件・制約】
 * 検知対象パターン（04番技術設計文書の実際の構成に基づく命名規則の具体例）の
 * 提供は04文書側へ申し送り事項（15章#21）であり、M0時点では確定していない。
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

  // <!-- M4で実装: 監視・バックアップ・DR関連IaC定義ファイル/ジョブスケジューラ
  //      定義ファイルの検知パターン（04文書側からの申し送り待ち、15章#21）、
  //      00-04運用項目一覧.mdとの突合処理 -->

  process.exit(0);
}

main();
