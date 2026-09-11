#!/usr/bin/env node
'use strict';

/**
 * task-boundary-guard.js（段3、新設・最重要、M1実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#7・8.2.4節
 *
 * 【イベント】PostToolUse（`Task`ツール）
 * 【検知内容】
 *   1. Task完了時の返り値テキストに `## 決定ブロック` 見出しが存在するかを
 *      正規表現で検査する。存在しなければ警告し `decision-warnings.json` へ
 *      `{type: "task_boundary_missing", agent_type, task_summary, timestamp}` を追記する
 *   2. 見出しが存在し内容が「決定なし」以外の場合、decisions/ 配下に未コミットの
 *      新規/変更ファイルが存在するか（git相当）を確認し、無ければ
 *      `{type: "task_boundary_unrecorded", ...}` を追記する
 * 【動作】警告のみ（exit 0）。ブロックしない理由は段1と同じ
 *   （判断の裁量、誤検知コスト）。
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
 * - 【要検証（15章#20）】サブエージェントが見出しの書式を微妙に変えて返した場合の
 *   検出漏れ。本実装は `#`〜`###` の見出しレベル・前後の空白揺れは吸収するが、
 *   「決定ブロック」という文言自体の表記揺れ（英語表記等）までは吸収しない。
 * - 【新たに直面した不確実性・PMへの報告事項】PostToolUse（Task）のペイロードにおける
 *   Task完了報告テキストの実際のフィールド名は、02文書側の要検証項目にも明記が無く
 *   本実装では未確認である。本実装は `tool_response`（文字列 or {content|text} or 配列）、
 *   `result`、`output` を順に試す防御的実装とし、実際のフィールド名が異なる場合は
 *   常に `task_boundary_missing` を誤検知し続ける（＝安全側だが警告過多になる）リスクを
 *   残す。これは動作確認結果として報告する。
 * - decisions/ 配下の「Task完了以降に新規追加されたか」は、正確な開始時刻を
 *   hookペイロードから取得できないため、「現時点でdecisions/配下に未コミットの
 *   変更が存在するか」で近似する（15章#20と同種の精度限界）。
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
const { readWarnings, writeWarnings, addWarning } = require('../lib/warnings-store');

const HEADING_RE = /^#{1,3}\s*決定ブロック\s*$/m;
const NO_DECISION_RE = /決定なし/;

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

/**
 * PostToolUse(Task) ペイロードから、Subagentが返したテキストを取り出そうと試みる。
 * 【前提条件・制約】上部のコメント参照。フィールド名は防御的に複数候補を試す。
 */
function extractTaskResultText(payload) {
  const candidates = [
    payload && payload.tool_response,
    payload && payload.tool_response && payload.tool_response.content,
    payload && payload.tool_response && payload.tool_response.text,
    payload && payload.result,
    payload && payload.output,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0) return c;
    if (Array.isArray(c)) {
      const text = c
        .map((part) => (typeof part === 'string' ? part : (part && part.text) || ''))
        .join('\n');
      if (text.trim().length > 0) return text;
    }
  }
  return '';
}

function decisionsHaveUncommittedChanges(cwd) {
  const decisionsPath = 'docs/00_プロジェクト管理・ガバナンス/decisions';
  try {
    const tracked = execFileSync('git', ['diff', '--name-only', 'HEAD', '--', decisionsPath], {
      cwd,
      encoding: 'utf-8',
    });
    const untracked = execFileSync(
      'git',
      ['ls-files', '--others', '--exclude-standard', '--', decisionsPath],
      { cwd, encoding: 'utf-8' }
    );
    return (tracked + untracked).trim().length > 0;
  } catch (_err) {
    return false;
  }
}

function main() {
  const payload = readHookPayload();
  const cwd = process.cwd();

  const agentType =
    payload.agent_type ||
    (payload.tool_input && payload.tool_input.subagent_type) ||
    'unknown';
  const taskSummary = ((payload.tool_input && payload.tool_input.description) || '').slice(0, 200);
  const text = extractTaskResultText(payload);

  const data = readWarnings(cwd);
  let changed = false;

  if (!HEADING_RE.test(text)) {
    addWarning(data, {
      type: 'task_boundary_missing',
      path_or_task: agentType,
      extra: { agent_type: agentType, task_summary: taskSummary },
    });
    changed = true;
    console.error(
      `[task-boundary-guard] agent_type=${agentType} のTask完了報告に「## 決定ブロック」見出しが見つかりません。`
    );
  } else {
    const headingIndex = text.search(HEADING_RE);
    const afterHeading = text.slice(headingIndex);
    // 次の見出し（同レベル以下）が現れるまでを決定ブロックの範囲とみなす
    const nextHeadingMatch = afterHeading.slice(1).search(/\n#{1,3}\s/);
    const block = nextHeadingMatch === -1 ? afterHeading : afterHeading.slice(0, nextHeadingMatch + 1);

    if (!NO_DECISION_RE.test(block)) {
      if (!decisionsHaveUncommittedChanges(cwd)) {
        addWarning(data, {
          type: 'task_boundary_unrecorded',
          path_or_task: agentType,
          extra: { agent_type: agentType, task_summary: taskSummary },
        });
        changed = true;
        console.error(
          `[task-boundary-guard] agent_type=${agentType} の決定ブロックに内容がありますが、` +
            `decisions/配下に対応する変更が見当たりません。`
        );
      }
    }
  }

  if (changed) {
    writeWarnings(data, cwd);
  }

  process.exit(0);
}

main();
