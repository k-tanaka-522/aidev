#!/usr/bin/env node
'use strict';

/**
 * state-link-guard.js
 *
 * 【イベント】PreToolUse（Bash|PowerShell|Edit|Write|NotebookEdit）
 * 【目的】worktree の中にも `.claude-state` を記録フォルダ（本体の `.claude-state` の実体）への
 * ジャンクションとして置く。どの worktree で動くプログラム・エージェントが `.claude-state/` に
 * 相対パスで書いても1か所の記録フォルダに集まり、worktree の中に普通のフォルダの `.claude-state` が
 * できて worktree の削除で記録が消える、という漏れを構造で消す。
 * 【安全】Claude Code は worktree を消す時（ExitWorktree・自動の後片付け）、中のジャンクションは
 * リンクだけ消して先は残す。素の `git worktree remove` は先の中身まで消すので settings.json の deny で
 * 止め、`orchestrate/scripts/worktree-status.js --prune` は先にリンクを外してから消す。
 * 【判定不能時】何もしない（exit 0）。全部のツールを止めないため。
 *
 * 【契約】
 * 対象外（PM の判断）。ジャンクションを張るだけで、台帳・分母分子の判定ロジックを持たない。
 */

const fs = require('fs');
const path = require('path');
const { stateRealDir, isLinkedWorktree } = require('../lib/repo-root');

function main() {
  const cwd = process.cwd();
  let isWorktree = false;
  try { isWorktree = fs.statSync(path.join(cwd, '.git')).isFile(); } catch (_e) { /* git の外 */ }
  if (!isWorktree || !isLinkedWorktree(cwd)) process.exit(0);

  const link = path.join(cwd, '.claude-state');
  const target = stateRealDir(cwd);
  let st = null;
  try { st = fs.lstatSync(link); } catch (_e) { st = null; }

  if (st && st.isSymbolicLink()) process.exit(0);
  if (st) {
    console.error(
      `[state-link-guard] この worktree の ${link} が普通のフォルダになっている（記録が worktree ごと消える）。` +
        `中身を記録フォルダ ${target} へ移してからこのフォルダを消すこと。次のツールの実行で入口を張り直す。`
    );
    process.exit(2);
  }
  try {
    fs.mkdirSync(target, { recursive: true });
    fs.symlinkSync(target, link, 'junction');
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error(`[state-link-guard] 記録フォルダへの入口を張れなかった: ${err.message}`);
    }
  }
  process.exit(0);
}

main();
