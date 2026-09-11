#!/usr/bin/env node
'use strict';

/**
 * decision-log-guard.js（段1、M1実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#5・8.2.2節
 *
 * 【イベント】PostToolUse（Edit|Write, アーキテクチャ関連パターン:
 *   `infra/**`, `decisions/contracts/**`, `prototypes/**` の新規画面/帳票、外部連携設定）
 * 【検知内容】対応する決定ログが直近に追記されていない変更。
 * 【動作】警告のみ（exit 0）。あえてブロックしない
 *   （決定ログを書くべきかの判断自体にエージェントの裁量が必要な場面が多く、
 *   機械的な exit 2 は誤検知コストが高いため。8.2.2節）。
 *   `.claude-state/decision-warnings.json` へ
 *   `{id, type: "file_change", path_or_task, detected_at, resolved: false}` として永続化する。
 *
 * 【目的・理由】
 * 「なぜそう決めたか」は実物からは復元できないため、Zone0〜2の決定の書き漏らしを
 * ファイル変更をトリガに検知する（8章冒頭）。ただし8.2.1節が指摘する通り、
 * 会話のみで完結しファイル変更を伴わない決定には構造的に盲目である
 * （その補完は段3 = task-boundary-guard.js が担う）。
 * 【影響範囲】
 * `infra/**`, `decisions/contracts/**`, `prototypes/**`の新規画面/帳票ファイル、
 * 外部連携設定ファイル等へのEdit|Write。
 * 【前提条件・制約】
 * - 「直近」の具体的な時間閾値は設計書に明記が無いため、本実装は15分
 *   （環境変数 `DECISION_LOG_GUARD_WINDOW_MS` で上書き可能）を暫定値として採用した。
 *   これはPMへ報告する設計不足の一つとして扱う。
 * - 「外部連携設定ファイル」の具体パターンも設計書に無いため、
 *   `.claude/lib/architecture-patterns.js` の暫定パターンに従う（同ファイルのコメント参照）。
 * - `.claude-state/decision-warnings.json` が存在しない場合は新規作成する。
 * - settings.json未登録の段階では発火しない（M3でsettings.jsonが昇格するまで無害）。
 */

const fs = require('fs');
const path = require('path');
const { classifyPath } = require('../lib/architecture-patterns');
const { readWarnings, writeWarnings, addWarning } = require('../lib/warnings-store');

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
 * decisions/ 直下（contracts/ を除く）のMarkdownファイルのうち、
 * 直近 windowMs 以内に更新（mtime）されたものが1件でもあれば true を返す。
 * 「対応する決定ログが直近に追記されていない」の判定に使う近似実装であり、
 * 変更内容の意味的対応までは検証しない（8.2.2節が容認する誤検知コストの範囲）。
 */
function decisionsDirRecentlyUpdated(cwd, windowMs) {
  const dir = path.join(cwd, 'docs', '00_プロジェクト管理・ガバナンス', 'decisions');
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return false;
  }
  const now = Date.now();
  for (const e of entries) {
    if (!e.isFile() || !e.name.endsWith('.md')) continue;
    try {
      const stat = fs.statSync(path.join(dir, e.name));
      if (now - stat.mtimeMs <= windowMs) return true;
    } catch (_err) {
      /* 個別ファイルのstat失敗は無視して続行 */
    }
  }
  return false;
}

function main() {
  const payload = readHookPayload();
  const filePath = payload && payload.tool_input && payload.tool_input.file_path;
  if (!filePath) {
    process.exit(0);
  }

  const cwd = process.cwd();
  const absTarget = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const relPath = path.relative(cwd, absTarget).replace(/\\/g, '/');

  const kind = classifyPath(relPath);
  if (!kind) {
    process.exit(0);
  }

  const windowMs = Number(process.env.DECISION_LOG_GUARD_WINDOW_MS || 15 * 60 * 1000);
  if (decisionsDirRecentlyUpdated(cwd, windowMs)) {
    process.exit(0);
  }

  const data = readWarnings(cwd);
  const entry = addWarning(data, {
    type: 'file_change',
    path_or_task: relPath,
    extra: { kind, agent_type: payload.agent_type || null },
  });
  writeWarnings(data, cwd);

  console.error(
    `[decision-log-guard] ${relPath} はアーキテクチャ関連の変更（分類: ${kind}）ですが、` +
      `直近${Math.round(windowMs / 60000)}分以内の決定ログ更新が見つかりません。`
  );
  console.error(
    `[decision-log-guard] 対応する決定ログが必要か確認してください（警告のみ・ブロックしません）。 warning_id=${entry.id}`
  );

  process.exit(0);
}

main();
