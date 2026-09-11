#!/usr/bin/env node
'use strict';

/**
 * task-boundary-guard.js（段3、新設・最重要、M0雛形）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#7・8.2.4節
 *
 * 【イベント】PostToolUse（`Task`ツール）
 * 【検知内容】
 *   1. Task完了時の返り値テキストに `## 決定ブロック` 見出しが存在するかを
 *      正規表現で検査する。存在しなければ警告し `decision-warnings.json` へ
 *      `{type: "task_boundary_missing", agent_type, task_summary, timestamp}` を追記する
 *   2. 見出しが存在し内容が「決定なし」以外の場合、当該Task完了時刻以降に
 *      `decisions/DL-*` の新規ファイルが追加されているかを `git status` 相当で
 *      確認し、無ければ `{type: "task_boundary_unrecorded", ...}` を追記する
 * 【動作】警告のみ（exit 0）。ブロックしない理由は段1と同じ
 *   （判断の裁量、誤検知コスト）。
 * 【実装方針】M1で実装。
 *
 * 【目的・理由】
 * ファイル変更ではなく Task 境界という会話内の出来事を検知対象にする点が
 * 段1・段2と根本的に異なり、8.2.1節で指摘した構造的な盲点
 * （会話のみで完結しファイル変更を伴わない決定）を直接埋める。
 * orchestrate自身の「決定ブロックが空でない場合は次Task起動前にdecideを呼ぶ」
 * という遵守（8.2.4節）は自己申告であり検証手段が無いため、これを機構的に補強する。
 * 【影響範囲】
 * 全Subagentへの `Task` ツール呼び出し完了。
 * 【前提条件・制約】
 * **要検証（15章#20）**: サブエージェントが見出しの書式を微妙に変えて返した
 * 場合の検出漏れ。settings.json未登録のM0段階では発火しない。
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

  // <!-- M1で実装: Task返り値テキストの「## 決定ブロック」見出し正規表現検査、
  //      「決定なし」以外の内容判定、git status相当によるdecisions/DL-*新規
  //      ファイル確認、decision-warnings.jsonへの追記処理 -->

  process.exit(0);
}

main();
