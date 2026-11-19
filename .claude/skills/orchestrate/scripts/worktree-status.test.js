#!/usr/bin/env node
'use strict';

/**
 * worktree-status.test.js — worktree-status.js --prune を、使い捨てのリポジトリとダミーの worktree で確かめる。
 *
 * 使い方: node .claude/skills/orchestrate/scripts/worktree-status.test.js
 *
 * 確かめること:
 *   1. merge 済みで動きの無い物が消える
 *   2. 作ったばかりの空の物が残る（最後のコミットが古くても、worktree を作った時刻を動きに数える）
 *   3. 放置日数を超えた未コミットの物が中身ごと消える
 *   4. 消した後も記録フォルダ（.claude-state の実体）の中身が残っている（worktree の中の入口から書いた物も含む）
 *   ほかに: 最近触った未コミットの物は残る／空で古い物は消える／改行コードだけの差分は未コミットに数えない
 *
 * 本物のリポジトリには触らない。OS の一時フォルダに origin（bare）・本体・記録フォルダを作り、最後に消す。
 * 本物の .gitignore を写して使う（worktree の中の .claude-state の入口が「未コミット」に数えられないことも確かめる）。
 * PR の状態は WORKTREE_STATUS_GH に渡す差し替えスクリプトで返す（GitHub に触らない）。
 *
 * 【契約】
 * 対象外（PM の判断）。worktree-status.js の後片付けの試験で、台帳の分母分子に関わらない。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..', '..', '..');
const SCRIPT = path.join(__dirname, 'worktree-status.js');
const LINK_GUARD = path.join(REPO, '.claude', 'hooks', 'state-link-guard.js');
const DAY = 24 * 60 * 60 * 1000;

function sh(cmd, args, cwd, env = {}) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } }).trim();
}
const git = (args, cwd, env) => sh('git', args, cwd, env);
const dateEnv = (ms) => {
  const d = new Date(ms).toISOString();
  return { GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d };
};
const setMtime = (p, ms) => fs.utimesSync(p, new Date(ms), new Date(ms));

function main() {
  const now = Date.now();
  const tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'wt-status-test-')));
  const origin = path.join(tmp, 'origin.git');
  const proj = path.join(tmp, 'proj');
  const stateReal = path.join(tmp, 'proj-state');
  const junctions = [];
  const results = [];
  const check = (name, fn) => {
    try { fn(); results.push({ name, ok: true }); } catch (e) { results.push({ name, ok: false, err: e.message }); }
  };

  try {
    git(['init', '-q', '--bare', '-b', 'main', origin], tmp);
    git(['clone', '-q', origin, proj], tmp);
    git(['config', 'user.name', 'test'], proj);
    git(['config', 'user.email', 'test@example.invalid'], proj);
    git(['config', 'core.autocrlf', 'true'], proj);
    fs.copyFileSync(path.join(REPO, '.gitignore'), path.join(proj, '.gitignore'));
    fs.writeFileSync(path.join(proj, 'README.md'), 'line1\nline2\n');
    git(['add', '-A'], proj);
    git(['commit', '-q', '-m', 'init'], proj, dateEnv(now - 20 * DAY));
    git(['push', '-q', 'origin', 'main'], proj);
    const initSha = git(['rev-parse', 'HEAD'], proj);

    // 本体の .claude-state はリポジトリの外の記録フォルダへのジャンクション（README「記録フォルダ」の形）
    fs.mkdirSync(stateReal);
    fs.writeFileSync(path.join(stateReal, 'progress.md'), '# 進捗\n');
    fs.symlinkSync(stateReal, path.join(proj, '.claude-state'), 'junction');
    junctions.push(path.join(proj, '.claude-state'));
    git(['init', '-q', stateReal], tmp);

    const wtRoot = path.join(proj, '.claude', 'worktrees');
    const mk = (name, base = initSha) => {
      const p = path.join(wtRoot, name);
      git(['worktree', 'add', '-q', '-b', name, p, base], proj);
      // 最初のツールの実行で張られる入口（state-link-guard）を張り、入口から記録を書く
      sh(process.execPath, [LINK_GUARD], p);
      junctions.push(path.join(p, '.claude-state'));
      fs.writeFileSync(path.join(p, '.claude-state', `from-${name}.md`), `${name} の記録\n`);
      return p;
    };
    const age = (p, days) => setMtime(path.join(p, '.git'), now - days * DAY);

    // 1. merge 済み・3日前
    const merged = mk('wt-merged');
    fs.writeFileSync(path.join(merged, 'feature.txt'), 'done\n');
    git(['add', 'feature.txt'], merged);
    git(['commit', '-q', '-m', 'feature'], merged, dateEnv(now - 3 * DAY));
    git(['merge', '-q', '--ff-only', 'wt-merged'], proj);
    git(['push', '-q', 'origin', 'main'], proj);
    age(merged, 3);

    // 2. 空・作ったばかり（最後のコミットは20日前）
    const emptyNew = mk('wt-empty-new');

    // 3. 未コミット・20日前
    const dirtyOld = mk('wt-dirty-old');
    fs.writeFileSync(path.join(dirtyOld, 'work.txt'), 'wip\n');
    setMtime(path.join(dirtyOld, 'work.txt'), now - 20 * DAY);
    age(dirtyOld, 20);

    // ほか: 未コミット・今日触った（.git は20日前）
    const dirtyNew = mk('wt-dirty-new');
    fs.writeFileSync(path.join(dirtyNew, 'work.txt'), 'wip\n');
    age(dirtyNew, 20);

    // ほか: 空・10日前
    const emptyOld = mk('wt-empty-old');
    age(emptyOld, 10);

    // ほか: 改行コードだけの差分・10日前（空とみなされ消える）
    const eolOnly = mk('wt-eol-only');
    fs.writeFileSync(path.join(eolOnly, 'README.md'), 'line1\r\nline2\r\n');
    git(['config', 'core.autocrlf', 'false'], eolOnly);
    setMtime(path.join(eolOnly, 'README.md'), now - 10 * DAY);
    age(eolOnly, 10);

    const stub = path.join(tmp, 'gh-stub.js');
    fs.writeFileSync(stub, [
      "const a = process.argv.slice(2); const head = a[a.indexOf('--head') + 1];",
      "console.log(JSON.stringify(head === 'wt-merged' ? [{ number: 1, state: 'MERGED' }] : []));",
    ].join('\n'));

    const out = sh(process.execPath, [SCRIPT, '--prune'], proj, { WORKTREE_STATUS_GH: stub });
    console.log('--- worktree-status.js --prune の出力 ---');
    console.log(out.split(tmp).join('<tmp>'));
    console.log('---');

    const exists = (p) => fs.existsSync(p);
    const branches = git(['branch', '--format=%(refname:short)'], proj).split('\n');
    check('1. merge 済み（3日動き無し）が消える', () => { assert.ok(!exists(merged)); assert.ok(!branches.includes('wt-merged')); });
    check('2. 作ったばかりの空の物が残る', () => assert.ok(exists(emptyNew)));
    check('3. 20日動きの無い未コミットの物が中身ごと消える', () => assert.ok(!exists(dirtyOld)));
    check('4. 記録フォルダの中身が残っている', () => {
      for (const f of ['progress.md', 'from-wt-merged.md', 'from-wt-empty-new.md', 'from-wt-dirty-old.md', 'from-wt-empty-old.md', 'from-wt-eol-only.md']) {
        assert.ok(exists(path.join(stateReal, f)), `${f} が無い`);
      }
    });
    check('今日触った未コミットの物が残る', () => assert.ok(exists(dirtyNew)));
    check('10日動きの無い空の物が消える', () => assert.ok(!exists(emptyOld)));
    check('改行コードだけの差分は未コミットに数えない（10日で消える）', () => assert.ok(!exists(eolOnly)));
    check('worktree の .claude-state の入口が未コミットに数えられない', () => assert.ok(/wt-empty-new\] 未コミット=0[ （]/.test(out)));
    check('記録フォルダの控えを取った', () => assert.ok(git(['log', '--oneline'], stateReal).includes('控え')));

    // 記録フォルダがリポジトリの中の普通のフォルダ（git 無し）の時、親のリポジトリにコミットしない
    const plain = path.join(tmp, 'plain');
    git(['init', '-q', '-b', 'main', plain], tmp);
    git(['config', 'user.name', 'test'], plain);
    git(['config', 'user.email', 'test@example.invalid'], plain);
    fs.writeFileSync(path.join(plain, 'a.txt'), 'a\n');
    git(['add', '-A'], plain);
    git(['commit', '-q', '-m', 'init'], plain);
    fs.mkdirSync(path.join(plain, '.claude-state'));
    fs.writeFileSync(path.join(plain, '.claude-state', 'progress.md'), 'x\n');
    fs.writeFileSync(path.join(plain, 'a.txt'), 'changed\n');
    const plainOut = sh(process.execPath, [SCRIPT], plain, { WORKTREE_STATUS_GH: stub });
    check('記録フォルダに git が無い時、親のリポジトリに控えをコミットしない', () => {
      assert.strictEqual(git(['rev-list', '--count', 'HEAD'], plain), '1');
      assert.ok(git(['status', '--porcelain'], plain).includes('a.txt'));
      assert.ok(plainOut.includes('履歴（git）が無い'));
    });
  } finally {
    for (const j of junctions) { try { if (fs.lstatSync(j).isSymbolicLink()) fs.unlinkSync(j); } catch (_e) { /* 消えた */ } }
    try {
      if (process.platform === 'win32') execFileSync('cmd', ['/c', 'rd', '/s', '/q', tmp], { stdio: 'ignore' });
      else fs.rmSync(tmp, { recursive: true, force: true });
    } catch (_e) { /* 残っても OS の一時フォルダ */ }
  }

  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}${r.ok ? '' : ` — ${r.err}`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} pass`);
  process.exit(failed ? 1 : 0);
}

main();
