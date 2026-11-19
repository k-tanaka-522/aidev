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
 * worktree の中に普通のフォルダの `.claude-state` が既にある（入口を張る前に何かが書いた・この仕組みより
 * 前に作った worktree）ときは、中身を記録フォルダへ移してから入口を張る。同じ名前の物が記録フォルダに
 * あれば上書きせず、名前に `.from-<worktree名>` を付けて置く。
 * 【安全】Claude Code は worktree を消す時（ExitWorktree・自動の後片付け）、中のジャンクションは
 * リンクだけ消して先は残す。消し方や git の版によっては先まで消えることがあるので、素の
 * `git worktree remove` は settings.json の deny で止め、`orchestrate/scripts/worktree-status.js --prune` は
 * 先にリンクを外してから消す。
 * 【判定不能時・失敗時】止めない（exit 0、標準エラーに理由）。止めると、直すための Bash まで使えなくなる。
 *
 * 【契約】
 * 対象外（PM の判断）。ジャンクションを張るだけで、台帳・分母分子の判定ロジックを持たない。
 */

const fs = require('fs');
const path = require('path');
const { stateRealDir, isLinkedWorktree } = require('../lib/repo-root');

/** src の中身を dst へ移す。同じ名前のファイルは上書きせず suffix を付ける。 */
function mergeMove(src, dst, suffix) {
  fs.mkdirSync(dst, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    let to = path.join(dst, name);
    const st = fs.lstatSync(from);
    if (st.isDirectory() && fs.existsSync(to) && fs.statSync(to).isDirectory()) {
      mergeMove(from, to, suffix);
      fs.rmdirSync(from);
      continue;
    }
    if (fs.existsSync(to)) {
      to = `${to}.from-${suffix}`;
      for (let i = 2; fs.existsSync(to); i += 1) to = `${path.join(dst, name)}.from-${suffix}-${i}`;
    }
    try {
      fs.renameSync(from, to);
    } catch (_e) {
      fs.cpSync(from, to, { recursive: true });
      fs.rmSync(from, { recursive: true, force: true });
    }
  }
}

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

  try {
    fs.mkdirSync(target, { recursive: true });
    if (st) {
      // 同じメッセージの複数のツールで hook が同時に走ることがある。先に自分だけの名前へ1回で移し、
      // 負けた方は ENOENT で何もしない（入口を張った後の .claude-state を「移す元」と取り違えて、
      // 記録フォルダの中身を自分自身と衝突させて改名しないため）
      if (fs.realpathSync(link) === fs.realpathSync(target)) process.exit(0);
      const work = `${link}.migrating-${process.pid}`;
      try {
        fs.renameSync(link, work);
      } catch (e) {
        if (e.code === 'ENOENT' || e.code === 'EPERM' || e.code === 'EBUSY') process.exit(0);
        throw e;
      }
      mergeMove(work, target, path.basename(cwd));
      fs.rmdirSync(work);
      console.error(`[state-link-guard] この worktree の普通のフォルダの .claude-state の中身を記録フォルダ ${target} へ移した。`);
    }
    fs.symlinkSync(target, link, 'junction');
  } catch (err) {
    if (err.code !== 'EEXIST') {
      console.error(
        `[state-link-guard] 記録フォルダへの入口を張れなかった（${err.message}）。この worktree の .claude-state に書いた物は、` +
          `worktree を消すと消える。中身を ${target} へ移してから、.claude-state を消すこと。`
      );
    }
  }
  process.exit(0);
}

main();
