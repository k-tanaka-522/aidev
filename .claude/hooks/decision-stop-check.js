#!/usr/bin/env node
'use strict';

/**
 * decision-stop-check.js（段2、M1実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#6・8.2.3節
 *
 * 【イベント】Stop
 * 【検知内容】セッション中の `git diff` 相当の変更差分と決定ログ追記を突合し、
 *   パターン該当なのに記録が無い変更を検知する。
 * 【動作】警告のみ（exit 0）。`.claude-state/decision-warnings.json` へ
 *   `{type: "stop_session", ...}` として永続化し、PMに一覧提示する
 *   （提示そのものはPM/orchestrateの責務。本hookは永続化のみ担う）。
 *
 * 【目的・理由】
 * decision-log-guard.js（段1）が捕捉しきれない、セッション終了時点での
 * 未記録の決定を最終確認する第2の網（8.2.3節）。
 * 【影響範囲】
 * セッション全体で変更されたファイル一覧（`git diff`相当）。
 * 【前提条件・制約】
 * 【要検証（15章#2）の検証結果】本ファイル単体をhookと同じ呼び出し方
 * （`echo '<JSON>' | node decision-stop-check.js`）で実行した場合に
 * `git diff --name-only HEAD` / `git ls-files --others --exclude-standard` が
 * 正しく取得できるかは動作確認済み（実行結果はPMへの報告参照）。
 * ただし「Stop hookが実際にどのcwd・どの権限で起動されるか」「セッション開始時点
 * からの差分を正確に切り出せるか（HEADとの差分は前セッションの未コミット変更も
 * 含んでしまう）」は、本スクリプト単体の実行では検証できない残課題として扱う。
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
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

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8' });
}

/**
 * git管理下の変更（追跡ファイルの差分 + 未追跡ファイル）の一覧を返す。
 * gitリポジトリでない、gitが使えない等の場合は {ok:false} を返し例外を投げない。
 */
function getSessionChangedFiles(cwd) {
  try {
    const tracked = git(['diff', '--name-only', 'HEAD'], cwd);
    const untracked = git(['ls-files', '--others', '--exclude-standard'], cwd);
    const set = new Set();
    for (const line of (tracked + '\n' + untracked).split(/\r?\n/)) {
      const t = line.trim();
      if (t) set.add(t);
    }
    return { ok: true, files: Array.from(set) };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err), files: [] };
  }
}

function main() {
  const _payload = readHookPayload();
  const cwd = process.cwd();

  const diff = getSessionChangedFiles(cwd);
  if (!diff.ok) {
    console.error(
      `[decision-stop-check] git差分の取得に失敗しました（要検証15章#2の該当事象）: ${diff.error}`
    );
    process.exit(0);
  }

  const archChanges = diff.files
    .map((f) => ({ file: f, kind: classifyPath(f) }))
    .filter((x) => x.kind);

  if (archChanges.length === 0) {
    process.exit(0);
  }

  const decisionsTouched = diff.files.some((f) =>
    /^docs\/00_プロジェクト管理・ガバナンス\/decisions\/DL-.*\.md$/.test(f)
  );
  if (decisionsTouched) {
    // セッション中にdecisions/への追記が何らか存在する場合はここでは許容する。
    // どのアーキテクチャ変更にどの決定ログが対応するかの1:1突合は行わない
    // （8.2.3節は「パターン該当なのに記録が全く無い」ケースの検知に留める）。
    process.exit(0);
  }

  const data = readWarnings(cwd);
  const existingUnresolvedPaths = new Set(
    data.warnings
      .filter((w) => !w.resolved && (w.type === 'stop_session' || w.type === 'file_change'))
      .map((w) => w.path_or_task)
  );

  const createdIds = [];
  for (const { file, kind } of archChanges) {
    if (existingUnresolvedPaths.has(file)) continue; // 段1で既に警告済みなら重複させない
    const entry = addWarning(data, { type: 'stop_session', path_or_task: file, extra: { kind } });
    createdIds.push(entry.id);
  }
  if (createdIds.length) {
    writeWarnings(data, cwd);
  }

  console.error(
    `[decision-stop-check] セッション中に決定ログ追記の無いアーキテクチャ関連変更が${archChanges.length}件見つかりました:`
  );
  for (const { file, kind } of archChanges) {
    console.error(`  - ${file} (${kind})`);
  }
  if (createdIds.length) {
    console.error(`[decision-stop-check] 新規警告: ${createdIds.join(', ')}`);
  }

  process.exit(0);
}

main();
