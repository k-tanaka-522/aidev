#!/usr/bin/env node
'use strict';

/**
 * role-boundary-guard.js（M0雛形）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.1.2節・7.3節#2・7.4節
 *
 * 【イベント】PreToolUse（Edit|Write）
 * 【検知内容】ロール境界違反。7.1.2節の許可パス表と `agent_id`/`agent_type`
 *   （hook入力共通フィールド、版1.4でweb調査により確認済み）を突合する。
 *   既定は「全ロール拒否のホワイトリスト方式」。
 * 【動作】exit 2（ブロック）
 * 【実装方針】`agent_id`/`agent_type`参照方式（版1.4で確定）。M3で実装。
 *
 * 【許可パス表（7.1.2節、そのまま転記）】
 *   - （未設定＝メインスレッド＝PM）: docs/00_プロジェクト管理・ガバナンス/**（decisions/**を除く）、.claude-state/**
 *   - consultant: docs/00_プロジェクト管理・ガバナンス/decisions/**
 *   - designer: prototypes/**、decisions/**（decide経由の起票）。Zone3ではdocs/03_**の画面設計配下も許可
 *   - app-architect: decisions/**。Zone1中はdecisions/contracts/**まで、Zone2以降はsrc/**も許可
 *     （Zoneの判定は .claude-state/current-zone.json 参照）
 *   - infra-architect: infra/**、decisions/**、Zone3のみdocs/04_**
 *   - coder: src/**, tests/**（Zone2以降）
 *   - qa: tests/**、docs/00_.../00-02〜00-03（台帳）、Zone3のみdocs/05_**
 *   - sre: infra/**、Zone3以降docs/07_**、docs/06_**
 *
 * 【目的・理由】
 * 「誰が何を書けるか」を宣言的に固定し、規律のプロンプト依存を排する（v1の課題2.1節）。
 * 【影響範囲】
 * docs/02_**〜docs/04_**, src/**, infra/**, tests/**, decisions/**, prototypes/** への
 * Write/Edit 全般。
 * 【前提条件・制約】
 * `agent_type` が未設定の場合にメインスレッド（PM）と一意に判定してよいかは要検証
 * （15章#19）。settings.json未登録のM0段階では発火しない。
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

  // <!-- M3で実装: agent_type別の許可パス表とtool_input.file_pathの突合、
  //      current-zone.json参照によるZone依存の許可パス切り替え -->

  process.exit(0);
}

main();
