#!/usr/bin/env node
'use strict';

/**
 * edit-payload-observer.js（M3新設・観測専用フック）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.4節・15章#19
 * （PM指示: `role-boundary-guard.js`の前提そのものの検証、M3追加委譲）
 *
 * 【イベント】PostToolUse（Edit|Write）
 * 【検知内容】なし（検知・判定は一切行わない）。
 * 【動作】常に exit 0。受け取ったペイロードをそのまま
 *   `.claude-state/hook-payload-samples/edit-{ISO8601風タイムスタンプ}-{連番}.json`
 *   へ保存するだけの、副作用のない観測専用フックである。`task-payload-observer.js`
 *   と全く同じ作り（保存先のファイル名接頭辞のみ`edit-`に変更）。
 *
 * 【目的・理由】
 * `task-payload-observer.js`の実機観測（M3、PM実施）により、`Agent`ツール
 * （`tool_name: "Agent"`、旧称`Task`）の完了ペイロードには`agent_id`/`agent_type`
 * （snake_case・ペイロード直下）が存在せず、`tool_response.agentId`/
 * `tool_response.agentType`（camelCase）に格納されていることが判明した
 * （02文書7.4節の記述はこの点で実態と異なる）。
 *
 * しかし`role-boundary-guard.js`が判定したいのは「**サブエージェントが`src/`等を
 * 編集しようとした瞬間**」であり、これは`Edit`/`Write`のPreToolUse/PostToolUseで
 * 発生する。`Agent`ツール完了時のペイロード構造がそうだったからといって、
 * `Edit`/`Write`イベントのペイロードにも同じ形でエージェント識別子が载るとは限らない
 * （むしろ載らない可能性が疑われる。だからこそ01文書・02文書のM0時点の草稿は
 * `active-agent.json`方式をフォールバックとして残していた）。本フックは、この
 * `role-boundary-guard.js`の前提そのものを実機で検証するために新設する。
 *
 * 【影響範囲】
 * `.claude-state/hook-payload-samples/` への新規ファイル作成のみ。既存ファイルの変更・
 * 削除は一切行わない。他のいかなる処理もブロックしない（常にexit 0）。
 *
 * 【前提条件・制約】
 * - 本フックは`.claude/settings.json`（M3の安全な有効化版）の`PostToolUse`
 *   `Edit|Write`エントリに**追加登録**する（既存の`decision-log-guard.js`・
 *   `sync-ledger-guard.js`はそのまま維持し、置き換えない）。
 * - `task-payload-observer.js`と同様、書込に失敗しても例外を投げず必ずexit 0で
 *   終了する（観測専用フックが本来の処理を妨げてはならないため）。
 * - サブエージェント自身が自分の`Edit`/`Write`呼び出しの結果を確認することはできない
 *   点は`task-payload-observer.js`と同じ制約ではない。**`Edit`/`Write`は
 *   PostToolUseの時点で当該ツール呼び出し自体が完了しているため、`Edit`/`Write`を
 *   行った当のサブエージェント自身が、同一ターン内で発火したこのフックの結果
 *   （保存されたサンプル）を直接は読めない。ただしPM（メインスレッド）は、
 *   サブエージェントの作業完了後に`.claude-state/hook-payload-samples/edit-*.json`
 *   を確認できる**。
 */

const fs = require('fs');
const path = require('path');

const SAMPLES_DIR_RELATIVE = path.join('.claude-state', 'hook-payload-samples');

function readRawStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (_err) {
    return '';
  }
}

function main() {
  const cwd = process.cwd();
  const raw = readRawStdin();

  try {
    const dir = path.join(cwd, SAMPLES_DIR_RELATIVE);
    fs.mkdirSync(dir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = Math.random().toString(36).slice(2, 8);
    const filePath = path.join(dir, `edit-${ts}-${rand}.json`);

    let pretty = null;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch (_err) {
      pretty = null;
    }

    const content = JSON.stringify(
      {
        observed_at: new Date().toISOString(),
        raw_stdin: raw,
        parsed: pretty ? JSON.parse(pretty) : null,
        top_level_keys: pretty ? Object.keys(JSON.parse(pretty)) : [],
      },
      null,
      2
    );
    fs.writeFileSync(filePath, content + '\n', 'utf-8');
  } catch (_err) {
    // 観測専用フックは本来の処理を妨げてはならない。書込失敗は握りつぶす。
  }

  process.exit(0);
}

main();
