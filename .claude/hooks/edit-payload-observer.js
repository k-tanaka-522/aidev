#!/usr/bin/env node
'use strict';

/**
 * edit-payload-observer.js（M3新設・観測専用フック）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.4節・15章#19
 * （PM指示: `role-boundary-guard.js`の前提そのものの検証、M3追加委譲）
 *
 * 【イベント】PreToolUse（Edit|Write）および PostToolUse（Edit|Write）の両方
 *   （PM指示により追加登録、M3で拡張）。
 * 【検知内容】なし（検知・判定は一切行わない）。
 * 【動作】常に exit 0。受け取ったペイロードをそのまま
 *   `.claude-state/hook-payload-samples/{pre|post}-edit-{ISO8601風タイムスタンプ}-{連番}.json`
 *   へ保存するだけの、副作用のない観測専用フックである。`task-payload-observer.js`
 *   と全く同じ作り。
 *
 * 【版1.1（M3追加委譲）】`role-boundary-guard.js`は`PreToolUse`（Edit|Write）として
 * 動作する（02文書7.3節#2）。`PostToolUse`ではファイルが既に書き終わっているため、
 * 書込を止められない。したがって、`PostToolUse`のペイロードでエージェント識別子が
 * 確認できても、それだけでは「`role-boundary-guard.js`が実際に機能する」ことの
 * 証明にはならない。**`PreToolUse`側でも同じ識別子が載ることを別途確認する必要がある**
 * ため、本フックを`PreToolUse`の`Edit|Write`にも追加登録した。
 * 保存ファイル名の接頭辞を`pre-edit-`/`post-edit-`とし、`hook_event_name`フィールドの
 * 値（`"PreToolUse"`/`"PostToolUse"`）を正規化して用いることで、ファイル名だけで
 * どちらのイベントかを判別できるようにした（PM確認の迅速化）。`hook_event_name`が
 * 取得できない・想定外の値の場合は`unknown-edit-`を接頭辞とし、誤って`pre`/`post`と
 * ラベル付けしない（安全側）。
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
 * - 本フックは`.claude/settings.json`（M3の安全な有効化版）の`PreToolUse`と
 *   `PostToolUse`の両方の`Edit|Write`エントリに**追加登録**する（`PostToolUse`側の
 *   既存の`decision-log-guard.js`・`sync-ledger-guard.js`はそのまま維持し、
 *   置き換えない）。
 * - `task-payload-observer.js`と同様、書込に失敗しても例外を投げず必ずexit 0で
 *   終了する（観測専用フックが本来の処理を妨げてはならないため）。
 * - **`.claude-state/hook-payload-samples/`配下は観測データの蓄積先であり、本フックは
 *   新規ファイルの作成のみを行う。既存ファイルの削除・上書きは一切行わない（MUST NOT）。**
 * - サブエージェント自身が自分の`Edit`/`Write`呼び出しの結果を確認することはできない
 *   点は`task-payload-observer.js`と同じ制約ではない。**`PostToolUse`は当該ツール
 *   呼び出し自体が完了した後に発火するため、`Edit`/`Write`を行った当のサブエージェント
 *   自身が、同一ターン内で発火したこのフックの結果（保存されたサンプル）を直接は
 *   読めない。ただしPM（メインスレッド）は、サブエージェントの作業完了後に
 *   `.claude-state/hook-payload-samples/{pre,post}-edit-*.json`を確認できる**。
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

/**
 * ペイロードの`hook_event_name`から、保存ファイル名の接頭辞（`pre-edit`/`post-edit`/
 * `unknown-edit`）を決める。ファイル名だけでPreToolUse/PostToolUseを判別できるように
 * するための分類であり、`parsed.hook_event_name`の値そのものは`parsed`にそのまま
 * 保存されるため、本関数の分類が誤っていても実体データは失われない（安全側）。
 */
function classifyEventPrefix(parsed) {
  const name = parsed && typeof parsed.hook_event_name === 'string' ? parsed.hook_event_name : '';
  if (/^PreToolUse$/i.test(name)) return 'pre-edit';
  if (/^PostToolUse$/i.test(name)) return 'post-edit';
  return 'unknown-edit';
}

function main() {
  const cwd = process.cwd();
  const raw = readRawStdin();

  try {
    const dir = path.join(cwd, SAMPLES_DIR_RELATIVE);
    fs.mkdirSync(dir, { recursive: true });

    let pretty = null;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch (_err) {
      pretty = null;
    }
    const parsedForNaming = pretty ? JSON.parse(pretty) : null;

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = Math.random().toString(36).slice(2, 8);
    const prefix = classifyEventPrefix(parsedForNaming);
    const filePath = path.join(dir, `${prefix}-${ts}-${rand}.json`);

    const content = JSON.stringify(
      {
        observed_at: new Date().toISOString(),
        raw_stdin: raw,
        parsed: parsedForNaming,
        top_level_keys: parsedForNaming ? Object.keys(parsedForNaming) : [],
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
