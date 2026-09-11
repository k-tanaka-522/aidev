#!/usr/bin/env node
'use strict';

/**
 * lint-guard.js（M0雛形）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節 hooks一覧 #1
 *
 * 【イベント】PostToolUse（Edit|Write）
 * 【検知内容】機械判定可能な規約違反。annotation方式を継続する。
 *   `prototypes/reports/**` への新規HTML追加時は `REPORT_ID_INDEX.md` への、
 *   それ以外の新規画面HTMLは `SCREEN_ID_INDEX.md` への登録漏れを分岐して警告する
 *   （版1.4、10.1.3節。帳票ハリボテと画面ハリボテはディレクトリで機械的に区別する）。
 * 【動作】exit 2（ブロック）
 * 【実装方針】M3で実装。02文書14.2節M3の完了条件「7章の全hookが動作確認済み」に対応する。
 *
 * 【目的・理由】
 * SCR-ID/RPT-ID採番台帳への登録漏れは10章のトレーサビリティ起点を崩すため、
 * 機械的に検知しブロックする必要がある。M0時点ではhookが settings.json に
 * 未登録であり発火しないため、本ファイルは骨格のみとし常に素通り（exit 0）する。
 *
 * 【影響範囲】
 * `prototypes/**` への Edit|Write 操作全般（PostToolUse）。
 *
 * 【前提条件・制約】
 * settings.json（.claude/v2-staging/settings.json、M3で .claude/settings.json へ昇格）に
 * PostToolUse フックとして登録されるまでは一切発火しない。
 */

const fs = require('fs');

/**
 * 標準入力からhookペイロード(JSON)を読み取る。
 *
 * 【目的・理由】PreToolUse/PostToolUse等のhookは、対象ツール呼び出し情報
 * （tool_name, tool_input, agent_id, agent_type等）をJSON形式で標準入力に渡す
 * 仕様のため、これをパースして判定材料にする。
 * 【影響範囲】本ファイル内の判定処理全体。
 * 【前提条件・制約】標準入力が空、または不正なJSONの場合は空オブジェクトを返し
 * 誤ってブロックしないことを優先する。
 */
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

  // <!-- M3で実装: prototypes/reports/** かどうかで SCREEN_ID_INDEX.md /
  //      REPORT_ID_INDEX.md のどちらへの登録漏れを警告するかを分岐する判定ロジック -->

  process.exit(0);
}

main();
