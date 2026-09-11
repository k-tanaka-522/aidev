#!/usr/bin/env node
'use strict';

/**
 * task-boundary-guard.js（段3、新設・最重要、M1実装 → M3で実機確認済みの確定実装に更新）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#7・8.2.4節
 *
 * 【イベント】PostToolUse（サブエージェント呼び出しツール。実機確認の結果、
 *   `tool_name` は `"Task"` ではなく **`"Agent"`** であった。M3でPMが
 *   `task-payload-observer.js`により実機のペイロードを取得して確認した事実であり、
 *   推測ではない。matcherは`settings.json`側で`"Task|Agent"`として両対応させている
 *   ため、本ファイルは`tool_name`の値そのものでは分岐しない）
 * 【検知内容】
 *   1. サブエージェント完了時の返り値テキストに `## 決定ブロック` 見出しが存在するかを
 *      正規表現で検査する。存在しなければ警告し `decision-warnings.json` へ
 *      `{type: "task_boundary_missing", agent_type, task_summary, timestamp}` を追記する
 *   2. 見出しが存在し内容が「決定なし」以外の場合、decisions/ 配下に未コミットの
 *      新規/変更ファイルが存在するか（git相当）を確認し、無ければ
 *      `{type: "task_boundary_unrecorded", ...}` を追記する
 * 【動作】警告のみ（exit 0）。ブロックしない理由は段1と同じ
 *   （判断の裁量、誤検知コスト）。
 *
 * 【目的・理由】
 * ファイル変更ではなく Task（Agent）境界という会話内の出来事を検知対象にする点が
 * 段1・段2と根本的に異なり、8.2.1節で指摘した構造的な盲点
 * （会話のみで完結しファイル変更を伴わない決定）を直接埋める。
 * orchestrate自身の「決定ブロックが空でない場合は次Task起動前にdecideを呼ぶ」
 * という遵守（8.2.4節）は自己申告であり検証手段が無いため、これを機構的に補強する。
 * 【影響範囲】
 * 全Subagentへの `Agent` ツール呼び出し完了。
 * 【前提条件・制約】
 * - 【実機確認済み・M3、推測ではない】`task-payload-observer.js`が記録した実サンプル
 *   （`.claude-state/hook-payload-samples/task-2026-09-11T03-34-55-464Z-z9pqb0.json`）
 *   により、次のフィールド構造を確定した。
 *     - `tool_name`: `"Agent"`（`"Task"`ではない）
 *     - `tool_response.status`: `"completed"` 等
 *     - `tool_response.agentId` / `tool_response.agentType`: **camelCase**。
 *       02文書7.4節が言う`agent_id`/`agent_type`（snake_case・ペイロード直下）は
 *       実際には存在せず、`tool_response`配下にcamelCaseで入っていた
 *       （02文書側の記述誤りとしてPM経由でApp-Architectへ報告済み）
 *     - `tool_response.content`: 配列。要素は`{type: "text", text: "..."}`の形。
 *       **完了報告テキストの本体はここに入る**
 *     - `tool_input.subagent_type`: サブエージェント種別（`tool_response.agentType`と
 *       同値になることを確認済み。フォールバックとして利用する）
 *   これに基づき、旧実装の防御的多候補抽出（`tool_response`直接文字列化、`result`、
 *   `output`等）を廃止し、`tool_response.content`を正とする確定実装に変更した。
 * - 【要検証（15章#20）】サブエージェントが見出しの書式を微妙に変えて返した場合の
 *   検出漏れ。本実装は `#`〜`###` の見出しレベル・前後の空白揺れは吸収するが、
 *   「決定ブロック」という文言自体の表記揺れ（英語表記等）までは吸収しない。
 * - 【残る未確認事項】実機確認は`subagent_type: "Explore"`という汎用エージェントの
 *   1件のみで行った。v2固有のエージェント（`coder`/`app-architect`等、
 *   `.claude/v2-staging/agents/*.md`の`name`フロントマター）を実際に`Agent`ツールで
 *   呼び出した際も`tool_response.agentType`に同じ値（例: `"coder"`）が載るかは
 *   引き続き実機確認が必要（M6の`.claude/agents/`昇格時に再確認すべき事項）。
 * - decisions/ 配下の「Task完了以降に新規追加されたか」は、正確な開始時刻を
 *   hookペイロードから取得できないため、「現時点でdecisions/配下に未コミットの
 *   変更が存在するか」で近似する（15章#20と同種の精度限界）。
 *
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
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
 * PostToolUse(Agent) ペイロードから、Subagentが返したテキストを取り出す。
 * 【前提条件・制約】上部のコメント参照。`tool_response.content`（配列、要素は
 * `{type, text}`）を正としつつ、実機確認していない将来のバリエーション
 * （contentが文字列そのものの場合等）にも最小限のフォールバックで対応する。
 */
function extractTaskResultText(payload) {
  const content = payload && payload.tool_response && payload.tool_response.content;

  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        return '';
      })
      .join('\n');
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

  // 【実機確認済み・M3】agent_type/agent_id（snake_case・ペイロード直下）は存在しない。
  // tool_response.agentType（camelCase）を正とし、tool_input.subagent_type
  // （実機確認でtool_response.agentTypeと同値であることを確認済み）をフォールバックとする。
  const agentType =
    (payload.tool_response && payload.tool_response.agentType) ||
    (payload.tool_input && payload.tool_input.subagent_type) ||
    'unknown';
  const agentId = (payload.tool_response && payload.tool_response.agentId) || null;
  const taskSummary = ((payload.tool_input && payload.tool_input.description) || '').slice(0, 200);
  const text = extractTaskResultText(payload);

  const data = readWarnings(cwd);
  let changed = false;

  if (!HEADING_RE.test(text)) {
    addWarning(data, {
      type: 'task_boundary_missing',
      path_or_task: agentType,
      extra: { agent_type: agentType, agent_id: agentId, task_summary: taskSummary },
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
          extra: { agent_type: agentType, agent_id: agentId, task_summary: taskSummary },
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
