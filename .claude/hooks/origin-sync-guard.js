#!/usr/bin/env node
'use strict';

/**
 * origin-sync-guard.js
 *
 * 【イベント】SessionStart / PreToolUse（EnterWorktree|Agent）
 * 【目的】手元の古い main を読む・古い main から worktree を作る、を構造で消す。
 * main の正本は GitHub 側で、取り込みは PR で行う。本体の作業ツリーの main は GitHub の main を
 * 取り込むだけの写しなので、放っておくと遅れる。遅れた main のまま台帳・決定ログを読むと
 * 説明が食い違う（派生案件で、本体の main が100コミット以上遅れたまま台帳を読み、説明を誤った）。
 * 「会話の始めに揃える」という決まりは飛ばされたので hook で強制する。
 * 【動き】
 * - SessionStart: `git fetch origin main`。本体の作業ツリーが main にいれば
 *   `git merge --ff-only origin/main` で揃える。揃えられない（未コミットの変更とぶつかる等）
 *   ときと、worktree のブランチが遅れているときは、遅れのコミット数を文脈に出す。
 * - PreToolUse（新しく作る EnterWorktree・isolation: "worktree" の Agent）: fetch してから通す。
 *   worktree は settings.json の worktree.baseRef=fresh で origin/main から作られるので、
 *   fetch に失敗したら古い origin/main から作らないよう止める（exit 2）。ただし手元に origin/main が
 *   あれば（オフライン・VPN 等）、古いかもしれないと知らせて通す（作業そのものを止めないため）。
 * 【判定不能時】止めない（exit 0）。origin の無いリポジトリ（作ったばかり）でも止めない。
 *
 * 【契約】
 * 対象外（PM の判断）。git の取り込みだけで、台帳・分母分子の判定ロジックを持たない。
 */

const fs = require('fs');
const { execFileSync } = require('child_process');
const { isLinkedWorktree } = require('../lib/repo-root');

function readHookPayload() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf-8') || '{}');
  } catch (_e) {
    return {};
  }
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf-8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function hasOrigin(cwd) {
  try {
    git(['remote', 'get-url', 'origin'], cwd);
    return true;
  } catch (_e) {
    return false;
  }
}

function behindCount(ref, cwd) {
  try {
    return Number(git(['rev-list', '--count', `${ref}..origin/main`], cwd)) || 0;
  } catch (_e) {
    return 0;
  }
}

function onPreToolUse(payload, cwd) {
  const tool = payload.tool_name;
  const input = payload.tool_input || {};
  const createsWorktree =
    (tool === 'EnterWorktree' && !input.path) || (tool === 'Agent' && input.isolation === 'worktree');
  if (!createsWorktree || !hasOrigin(cwd)) return 0;
  try {
    git(['fetch', '-q', 'origin', 'main'], cwd);
  } catch (e) {
    let hasLocal = false;
    try { git(['rev-parse', '--verify', '-q', 'refs/remotes/origin/main'], cwd); hasLocal = true; } catch (_e) { /* 無い */ }
    if (hasLocal) {
      console.log(JSON.stringify({
        systemMessage: '[origin-sync-guard] git fetch origin main に失敗した。手元の origin/main（古いかもしれない）から worktree を作る。つながったら取り込み直すこと。',
      }));
      return 0;
    }
    console.error(
      '[origin-sync-guard] git fetch origin main に失敗した。古い origin/main から worktree を作らないよう止めた。' +
        `ネットワークを確かめてやり直すこと。（${String(e.message).split('\n')[0]}）`
    );
    return 2;
  }
  return 0;
}

// SessionStart の標準出力は会話の文脈に入る
function onSessionStart(cwd) {
  if (!hasOrigin(cwd)) return 0;
  try {
    git(['fetch', '-q', 'origin', 'main'], cwd);
  } catch (_e) {
    console.log('[origin-sync-guard] git fetch origin main に失敗した。手元の main は古いかもしれない。台帳を読む前に揃えること。');
    return 0;
  }

  let branch = '';
  try { branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd); } catch (_e) { return 0; }

  if (!isLinkedWorktree(cwd) && branch === 'main') {
    const n = behindCount('main', cwd);
    if (n === 0) return 0;
    try {
      git(['merge', '--ff-only', '-q', 'origin/main'], cwd);
      console.log(`[origin-sync-guard] 本体の main を origin/main に揃えた（${n} コミット進めた）。`);
    } catch (_e) {
      console.log(
        `[origin-sync-guard] 本体の main が origin/main より ${n} コミット遅れていて、自動で揃えられなかった（未コミットの変更とぶつかる等）。` +
          '台帳は worktree か `git show origin/main:<パス>` で読むこと。'
      );
    }
    return 0;
  }

  const n = behindCount('HEAD', cwd);
  if (n > 0) {
    console.log(`[origin-sync-guard] このブランチ（${branch}）は origin/main より ${n} コミット遅れている。台帳は origin/main の版も確かめること。`);
  }
  return 0;
}

function main() {
  const payload = readHookPayload();
  const cwd = payload.cwd || process.cwd();
  const code = payload.hook_event_name === 'PreToolUse' ? onPreToolUse(payload, cwd) : onSessionStart(cwd);
  process.exit(code);
}

main();
