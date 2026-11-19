#!/usr/bin/env node
'use strict';

/**
 * worktree-status.js — worktree ごとの取り込み漏れの一覧と、作業の残っていない worktree の後片付け。
 *
 * 使い方:
 *   node .claude/skills/orchestrate/scripts/worktree-status.js          一覧だけ（消す候補に印を付ける）
 *   node .claude/skills/orchestrate/scripts/worktree-status.js --prune  消してよい物を消す（routines の worktree-prune）
 *
 * 【目的・理由】
 * エージェントに1回頼むたびに worktree が1個でき、試験を流した物は node_modules（数百MB）を持つ。
 * 放っておくと1週間で十数GB溜まる（派生案件で worktree 271 個・約100GB になった）。
 * 一方で、生きているセッションの worktree や、まだ取り込んでいない作業を消してはいけない。
 *
 * 見るもの: 未コミット・origin/main に無いコミット・未 push・PR の状態。
 * 消すのは `.claude/worktrees/` の下で、ロックされておらず、今のセッションの worktree でない物のうち:
 * - merge 済み（未コミット無し・origin/main に無いコミット無し・PR が merge 済み）で MERGED_IDLE_DAYS 動きが無い物。
 *   手元に失う物が無いので早めに消す（node_modules が溜まって容量を食う）
 * - 空（未コミット無し・コミット無し・PR 無し）で EMPTY_IDLE_DAYS 動きが無い物。
 *   作ったばかりで別のセッションが使っている途中かもしれないので、しばらく残す
 * - それ以外（未コミット・未 push・PR が閉じた・detached 等）で ABANDONED_IDLE_DAYS 動きが無い物は中身ごと消す。
 *   それだけ動きの無い作業は、掘り起こすより作り直す方が安い。ただしブランチは、そのコミットが origin のどこかに
 *   入っていなければ残す（ブランチを消しても容量は空かず、コミットを失うだけなので）
 * 「動き」は、最後のコミット・worktree を作った時刻（`.git` ファイルの更新時刻）・本当に変わったファイルの更新時刻の新しい方。
 * 改行コードだけの差分（Windows の autocrlf で中身が同じでも「変更あり」になる）は未コミットに数えない
 * （数えると、どの worktree も「作業中」になって後片付けを逃れる。派生案件で溜まった原因）。
 *
 * 消さない物（迷ったら残す）:
 * - 状態が読めない物（git status・git cherry が失敗した、フォルダが無い）。「手で確認」と出す
 * - 既定のブランチ（main・master）と、本体の作業ツリーが使っているブランチの worktree
 * - git が無視しているファイルのうち、作り直せる物（依存・ビルド・試験の出力。REBUILDABLE）以外がある物
 *   （.env・手元の DB・メモ等は git の差分に出ないまま消えるため）
 * - `.claude-state` が入口（ジャンクション）でなく普通のフォルダになっている物（記録が入っているかもしれない）
 *
 * 消し方: 先に worktree の中の `.claude-state`（記録フォルダへのジャンクション）を外す。
 * 消し方や git の版によってはジャンクションの先の記録フォルダの中身まで消えることがあるため
 * （派生案件で記録が消えかけた。素の `git worktree remove` は settings.json で禁止している）。
 * Windows では node_modules の長いパスで git が途中で止まり、登録だけ外れて中身が残ることがある。
 * 入口は先に外してあるので、残った中身は `rd /s /q` で消してよい。
 *
 * 本体の作業ツリーで流したときは、本体を GitHub の main に揃える（追跡対象に変更が無く main にいる時だけ）。
 * 記録フォルダ自身が git の根なら控え（コミット）を取る（消えた・上書きした記録を git log から戻せる）。
 *
 * 試験用: 環境変数 WORKTREE_STATUS_GH に node のスクリプトを指すと、`gh` の代わりにそれを呼ぶ。
 *
 * 【契約】
 * 対象外（PM の判断）。PC の後片付けで、設計・実装の契約・台帳の分母分子に関わらない。
 * 消してはいけない物を消さないことは同じフォルダの worktree-status.test.js で確かめる。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { mainWorktreeRoot, stateRealDir } = require('../../../lib/repo-root');

const DAY_MS = 24 * 60 * 60 * 1000;
const MERGED_IDLE_DAYS = 1;
const EMPTY_IDLE_DAYS = 7;
const ABANDONED_IDLE_DAYS = 14;
const PROTECTED_BRANCHES = new Set(['main', 'master']);
// 消しても作り直せる無視ファイル（パスのどこかにこの名前のフォルダがあれば作り直せるとみなす）
const REBUILDABLE = new Set([
  'node_modules', 'dist', 'build', 'out', 'coverage', '.nyc_output', 'cdk.out', '.next', '.nuxt', '.turbo', '.cache',
  '.vite', '.parcel-cache', 'test-results', 'playwright-report', 'blob-report', '__pycache__', '.pytest_cache',
  '.venv', 'venv', '.terraform', 'target', '.gradle', 'tmp', 'temp', 'review-temp', '.claude-state',
]);
const REBUILDABLE_FILE = /\.(log|tsbuildinfo|pyc|tmp|tfplan)$/i;

function run(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 120000 }).trim();
  } catch (_err) {
    return null;
  }
}

/** git の出力を NUL 区切りで受け取る（日本語などのファイル名が引用符・8進数に化けないように）。失敗は null。 */
function gitZ(args, cwd) {
  const out = run('git', ['-c', 'core.quotePath=false', ...args], cwd);
  return out === null ? null : out.split('\0').filter(Boolean);
}

function gh(args, cwd) {
  const stub = process.env.WORKTREE_STATUS_GH;
  return stub ? run(process.execPath, [stub, ...args], cwd) : run('gh', args, cwd);
}

function listWorktrees(cwd) {
  const out = run('git', ['worktree', 'list', '--porcelain'], cwd) || '';
  const items = [];
  let cur = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9).trim() }; items.push(cur); }
    else if (cur && line.startsWith('branch ')) cur.branch = line.slice(7).trim().replace('refs/heads/', '');
    else if (cur && line === 'detached') cur.branch = '(detached)';
    else if (cur && line.startsWith('locked')) cur.locked = true;
  }
  return items;
}

function prState(branch, cwd) {
  const out = gh(['pr', 'list', '--head', branch, '--state', 'all', '--json', 'number,state', '--limit', '1'], cwd);
  if (!out) return null;
  try { const a = JSON.parse(out); return a.length ? `#${a[0].number} ${a[0].state}` : 'なし'; } catch (_err) { return null; }
}

/** 比べるためのパス。Windows の短い名前（KATSUY~1 等）と長い名前を揃えるため、在る物は実体のパスに直す。 */
function norm(p) {
  let full = path.resolve(p);
  try { full = fs.realpathSync.native(full); } catch (_e) { /* 消えた・無い */ }
  return full.split(path.sep).join('/').toLowerCase();
}

function syncMainTree(cwd, mainRoot) {
  if (norm(cwd) !== norm(mainRoot)) return;
  console.log('⚠ 今のセッションは本体の作業ツリーにいる。作業は EnterWorktree で自分の worktree に入ってから');
  const tracked = run('git', ['status', '--porcelain', '--untracked-files=no'], mainRoot);
  const branch = run('git', ['branch', '--show-current'], mainRoot);
  if (tracked === '' && branch === 'main') {
    const merged = run('git', ['merge', '--ff-only', '-q', 'origin/main'], mainRoot);
    console.log(merged === null ? '⚠ 本体を GitHub の main に揃えられなかった（手で確認）' : '本体を GitHub の main に揃えた');
  }
}

function snapshotState(cwd) {
  const stateDir = stateRealDir(cwd);
  if (!fs.existsSync(stateDir)) return;
  // 記録フォルダ自身が git の根の時だけ控えを取る。`.claude-state` がリポジトリの中の普通のフォルダだと
  // `git -C` は親のリポジトリを拾い、作業中の変更を丸ごと「控え」としてコミットしてしまう
  const top = run('git', ['-C', stateDir, 'rev-parse', '--show-toplevel'], cwd);
  if (top === null || norm(top) !== norm(stateDir)) {
    console.log(`記録フォルダ ${stateDir} に履歴（git）が無い。控えを取るなら git init する（README「記録フォルダをリポジトリの外に置く」）`);
    return;
  }
  run('git', ['-C', stateDir, 'add', '-A'], cwd);
  const committed = run('git', ['-C', stateDir, '-c', 'user.name=pm', '-c', 'user.email=noreply@localhost', 'commit', '-q', '-m', `控え ${new Date().toISOString()}`], cwd);
  console.log(committed === null ? '記録フォルダ: 変更なし' : '記録フォルダの控えを取った');
}

/**
 * 未コミットの数と、本当に変わったファイル（未追跡＋改行コード以外の差分がある物）の一覧。
 * 改行コードだけの差分は数えず、eolOnly で印だけ付ける。読めなければ dirty は '?'。
 */
function inspectDirty(p) {
  const status = gitZ(['status', '--porcelain', '--no-renames', '-z'], p);
  if (status === null) return { dirty: '?', eolOnly: false, changed: [] };
  if (status.length === 0) return { dirty: 0, eolOnly: false, changed: [] };
  const untracked = gitZ(['ls-files', '-z', '--others', '--exclude-standard'], p);
  // --numstat は改行だけの差分の物も「0 0」で出すことがあるので、増減のある行だけを拾う（バイナリは「- -」）
  const numstat = gitZ(['diff', 'HEAD', '-z', '--no-renames', '--ignore-cr-at-eol', '--numstat'], p);
  if (untracked === null || numstat === null) return { dirty: '?', eolOnly: false, changed: [] };
  const modified = numstat
    .map((l) => l.split('\t'))
    .filter(([a, d]) => a === '-' || d === '-' || Number(a) + Number(d) > 0)
    .map((cols) => cols.slice(2).join('\t'));
  const changed = [...new Set([...untracked, ...modified])];
  return { dirty: changed.length, eolOnly: changed.length < status.length, changed };
}

/**
 * 最後の動き（ミリ秒）。最後のコミット・worktree を作った時刻・本当に変わったファイルの更新時刻の新しい方。
 * 在るのに更新時刻を読めないファイルがあれば、今触っているものとみなす（迷ったら残す）。
 */
function lastTouchMs(p, changed) {
  let last = Number(run('git', ['log', '-1', '--format=%ct'], p) || 0) * 1000;
  try { last = Math.max(last, fs.statSync(path.join(p, '.git')).mtimeMs); } catch (_e) { /* 無い */ }
  // 未コミットのファイルを触っている途中のセッションを守るため、その更新時刻も動きに数える
  for (const rel of changed) {
    const full = path.join(p, rel);
    try {
      last = Math.max(last, fs.statSync(full).mtimeMs);
    } catch (_e) {
      let present = true;
      try { fs.lstatSync(full); } catch (_e2) { present = false; }
      if (present) return Date.now(); // 在るのに読めない
      // 消したファイル（削除の差分）。中身は HEAD にある
    }
  }
  return last;
}

/** git が無視しているファイルのうち、作り直せない物（.env・手元の DB・メモ等）。読めなければ null。 */
function precious(p) {
  const ignored = gitZ(['status', '--porcelain', '--ignored', '--untracked-files=normal', '-z'], p);
  if (ignored === null) return null;
  return ignored
    .filter((l) => l.startsWith('!! '))
    .map((l) => l.slice(3).replace(/\/$/, ''))
    .filter((rel) => !rel.split('/').some((seg) => REBUILDABLE.has(seg)) && !REBUILDABLE_FILE.test(rel));
}

/** このブランチの先端が origin のどこかのブランチに入っているか（消してもコミットを失わないか）。 */
function tipOnOrigin(branch, cwd) {
  const out = run('git', ['branch', '-r', '--contains', `refs/heads/${branch}`], cwd);
  return out !== null && out.split('\n').some((l) => l.trim().startsWith('origin/'));
}

function removeWorktree(wt, p, mainRoot, opts) {
  const link = path.join(p, '.claude-state');
  try { if (fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link); } catch (_e) { /* 無い */ }
  let linkLeft = false;
  try { fs.lstatSync(link); linkLeft = true; } catch (_e) { /* 外れた */ }
  if (linkLeft) {
    // 普通のフォルダの .claude-state が残っている。記録が入っているかもしれないので消さない
    console.log('  → .claude-state が普通のフォルダか、入口を外せなかったので残す（手で確認）');
    return;
  }
  const removed = run('git', ['worktree', 'remove', ...(opts.force ? ['--force'] : []), p], mainRoot) !== null;
  const listed = (run('git', ['worktree', 'list', '--porcelain'], mainRoot) || '').split('\n')
    .filter((l) => l.startsWith('worktree ')).map((l) => norm(l.slice(9).trim()));
  const deregistered = !listed.includes(norm(p));
  if (deregistered && fs.existsSync(p)) {
    if (process.platform === 'win32') run('cmd', ['/c', 'rd', '/s', '/q', p], mainRoot);
    else { try { fs.rmSync(p, { recursive: true, force: true }); } catch (_e) { /* 下で残ったかを見る */ } }
  }
  const gone = deregistered && !fs.existsSync(p);
  let note = '';
  if (gone && opts.deleteBranch) run('git', ['branch', '-D', wt.branch], mainRoot);
  else if (gone && opts.keptBranchReason) note = `（ブランチ ${wt.branch} は残した: ${opts.keptBranchReason}）`;
  console.log(gone ? `  → 消した${note}` : removed ? '  → 登録は外れたが中身が残った（手で確認）' : '  → 消せなかった（手で確認）');
}

function main() {
  const cwd = process.cwd();
  const prune = process.argv.includes('--prune');
  const mainRoot = path.resolve(mainWorktreeRoot(cwd));
  run('git', ['fetch', '-q', '--prune', 'origin'], cwd);

  syncMainTree(cwd, mainRoot);
  snapshotState(cwd);

  const mainBranch = run('git', ['branch', '--show-current'], mainRoot);
  const managed = norm(path.join(mainRoot, '.claude', 'worktrees'));
  for (const wt of listWorktrees(cwd)) {
    const p = path.resolve(wt.path);
    const isMain = norm(p) === norm(mainRoot);
    const exists = fs.existsSync(p);
    const { dirty, eolOnly, changed } = exists ? inspectDirty(p) : { dirty: '?', eolOnly: false, changed: [] };
    // 中身が origin/main に入っていないコミットの数（cherry-pick・squash 済みの物は数えない）
    const cherry = exists ? run('git', ['cherry', 'origin/main', 'HEAD'], p) : null;
    const ahead = cherry === null ? null : String(cherry.split('\n').filter((l) => l.startsWith('+')).length);
    const upstream = exists ? run('git', ['rev-parse', '--abbrev-ref', '@{u}'], p) : null;
    const unpushed = upstream ? run('git', ['rev-list', '--count', '@{u}..HEAD'], p) : ahead;
    const hasBranch = wt.branch && wt.branch !== '(detached)';
    const protectedBranch = hasBranch && (PROTECTED_BRANCHES.has(wt.branch) || wt.branch === mainBranch);
    // PR は push 先のブランチ名で探す（ローカルと名前が違うことがある）
    const remoteBranch = upstream && upstream.startsWith('origin/') ? upstream.slice('origin/'.length) : wt.branch;
    const pr = isMain || !hasBranch || protectedBranch || !exists ? '-' : prState(remoteBranch, p);

    let verdict;
    if (isMain) verdict = Number(ahead) > 0 || dirty ? '本体に GitHub の main に無い変更あり（PR に移す）' : '本体（GitHub の main を取り込むだけ）';
    else if (!exists || dirty === '?' || ahead === null) verdict = '状態を読めない（手で確認）';
    else if (protectedBranch) verdict = `既定・本体のブランチ（${wt.branch}）の worktree（消さない）`;
    else if (dirty === 0 && ahead === '0' && pr && pr.endsWith('MERGED')) verdict = '消してよい';
    else if (dirty === 0 && ahead === '0' && pr === 'なし') verdict = '空';
    else verdict = '作業中・取り込み待ち';

    if (!isMain && exists) {
      try {
        if (!fs.lstatSync(path.join(p, '.claude-state')).isSymbolicLink()) {
          console.log(`⚠ ${wt.path} の .claude-state が普通のフォルダ（記録が worktree ごと消える。記録フォルダへ移す）`);
        }
      } catch (_e) { /* 無い（まだツールが動いていない）*/ }
    }
    console.log(`- ${wt.path} [${wt.branch || '?'}] 未コミット=${dirty}${eolOnly ? '（改行だけの差分あり）' : ''} mainに無い=${ahead ?? '?'} 未push=${unpushed ?? '?'} PR=${pr ?? '?'} → ${verdict}`);
    if (!['消してよい', '空', '作業中・取り込み待ち'].includes(verdict)) continue;

    const inManaged = norm(p).startsWith(managed + '/');
    const idle = Date.now() - lastTouchMs(p, changed);
    const abandoned = verdict === '作業中・取り込み待ち' && idle > ABANDONED_IDLE_DAYS * DAY_MS;
    const limitDays = verdict === '消してよい' ? MERGED_IDLE_DAYS : EMPTY_IDLE_DAYS;
    const stale = abandoned || ((verdict === '消してよい' || verdict === '空') && idle > limitDays * DAY_MS);
    const removable = stale && inManaged && !wt.locked && norm(p) !== norm(cwd);
    if (prune && (verdict === '消してよい' || verdict === '空') && !stale) console.log(`  → ${limitDays}日以内に動きがあるので残す`);
    if (!removable) continue;

    const keep = precious(p);
    if (keep === null || keep.length > 0) {
      console.log(`  → git が無視している作り直せないファイルがあるので残す（手で確認）: ${keep === null ? '読めない' : keep.slice(0, 5).join(', ')}`);
      continue;
    }
    if (!prune) {
      console.log(abandoned ? `  → --prune で消す候補（${ABANDONED_IDLE_DAYS}日動きが無いので中身ごと）` : '  → --prune で消す候補');
      continue;
    }
    // detached の worktree はブランチで守れないので、origin に無いコミットがあれば消さない
    if (abandoned && !hasBranch && ahead !== '0') {
      console.log('  → detached で origin/main に無いコミットがあるので残す（手で確認）');
      continue;
    }
    // ブランチは、そのコミットが origin/main（merge 済み・空）か origin のどこかに入っている時だけ消す
    const safeBranch = hasBranch && (!abandoned || tipOnOrigin(wt.branch, mainRoot));
    removeWorktree(wt, p, mainRoot, {
      force: eolOnly || abandoned,
      deleteBranch: safeBranch,
      keptBranchReason: hasBranch && !safeBranch ? 'origin に無いコミットがある' : '',
    });
  }
}

main();
