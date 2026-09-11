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
 *
 * 【M-dup修正（重複蓄積バグ、PMからの委譲）】
 * 同一ファイルへの複数回のEdit呼び出しのたびに無条件で`addWarning`していたため、
 * `decision-warnings.json`の未解消件数（`decision-check`が8.3節の分母計算に組み込む、
 * 8.2.5節）が同一原因で水増しされていた。`.claude/lib/warnings-store.js`の
 * `findUnresolvedWarning`で同一`type`・同一`path_or_task`の未解消警告の有無を確認し、
 * あれば再利用（新規追加しない）するよう修正した。
 *
 * 【契約】
 * 対象外と判定した（coderの一次判定、PMへ報告）。本ファイル自体は`addWarning`を呼ぶ
 * 側であり分母計算そのものは行わない（分母計算は`decision-check`/`zone-gate.js`側、
 * `.claude/lib/warnings-store.js`のヘッダーコメント【契約】参照）。16.6節の選別基準の
 * 他項目（b〜e）にも該当しない。M7（16.9節）時点では既存の登録済み契約4件
 * （`.claude/contracts/MANIFEST.json`参照）のみが契約化済みである。
 */

const fs = require('fs');
const path = require('path');
const { classifyPath } = require('../lib/architecture-patterns');
const { readWarnings, writeWarnings, addWarning, findUnresolvedWarning } = require('../lib/warnings-store');

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

  // 【M-dup修正・重複蓄積バグ】同一ファイルへの複数回のEdit呼び出し（1つの変更を完成
  // させる過程でありがちな挙動）のたびに無条件でaddWarningすると、decision-checkの
  // 8.3節分母計算（8.2.5節）が同一原因の警告で水増しされる（issue-ledger.jsの00-13と
  // 同型のバグ、PMからの委譲で発見・是正）。同一type・同一pathの未解消警告が既にあれば
  // 新規追加せず、既存warning_idを再利用する。
  const existing = findUnresolvedWarning(data, { type: 'file_change', path_or_task: relPath });
  const entry =
    existing ||
    addWarning(data, {
      type: 'file_change',
      path_or_task: relPath,
      extra: { kind, agent_type: payload.agent_type || null },
    });
  if (!existing) {
    writeWarnings(data, cwd);
  }

  console.error(
    `[decision-log-guard] ${relPath} はアーキテクチャ関連の変更（分類: ${kind}）ですが、` +
      `直近${Math.round(windowMs / 60000)}分以内の決定ログ更新が見つかりません。`
  );
  console.error(
    `[decision-log-guard] 対応する決定ログが必要か確認してください（警告のみ・ブロックしません）。 warning_id=${entry.id}` +
      (existing ? '（既存の未解消警告を再利用。重複登録はしていない）' : '')
  );

  process.exit(0);
}

main();
