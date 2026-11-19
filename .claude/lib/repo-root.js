'use strict';

/**
 * repo-root.js — git worktree の中から「本体の作業ツリー」と「記録フォルダ」を引く。
 *
 * 【目的・理由】
 * PM・サブエージェントは worktree（`.claude/worktrees/<名前>`）の中で動く。`.claude-state/` は
 * git 管理外なので worktree には無く、worktree ごとに普通のフォルダを作ると worktree の削除で
 * 記録が消える。そこで記録は1か所（本体の `.claude-state`、またはその先の実体）に集め、
 * 各 worktree の `.claude-state` はそこへのジャンクション（入口）にする（hooks/state-link-guard.js）。
 *
 * - mainWorktreeRoot: worktree の `.git` はファイルで `gitdir: <本体>/.git/worktrees/<名前>` を指す。
 *   そこから本体の作業ツリーの根を返す。worktree の外なら cwd をそのまま返す。
 * - stateRealDir: 本体の `.claude-state` の実体。本体の `.claude-state` をリポジトリの外
 *   （例: `../<リポジトリ名>-state`）へのジャンクションにしている場合はその先を返す
 *   （`git clean -x` や本体の作り直しでも記録が残る。README「記録フォルダ」参照）。
 *   ジャンクションでなければ本体の `.claude-state` をそのまま返す。
 * - relInMainState: 書く先が記録フォルダ（本体の入口・実体・この worktree の入口のどれ経由でも）の
 *   下なら、その中の相対パスを返す。hook が「`.claude-state/…` への書き込み」として同じ規則で
 *   判定するために使う（実体の絶対パスで書かれても判定を素通りさせない）。
 *
 * 【契約】
 * 対象外（PM の判断）。パスの解決だけで、分母・分子の集計や台帳の判定ロジックを持たない。
 * 判定不能（`.git` が読めない等）の時は cwd に倒し、worktree を使わない従来の動きと同じになる。
 */

const fs = require('fs');
const path = require('path');

function mainWorktreeRoot(cwd = process.cwd()) {
  try {
    const dotGit = path.join(cwd, '.git');
    if (!fs.statSync(dotGit).isFile()) return cwd;
    const m = /^gitdir:\s*(.+)$/m.exec(fs.readFileSync(dotGit, 'utf-8'));
    if (!m) return cwd;
    const gitDir = path.resolve(cwd, m[1].trim()).split(path.sep).join('/');
    const idx = gitDir.lastIndexOf('/.git/worktrees/');
    return idx >= 0 ? path.resolve(gitDir.slice(0, idx)) : cwd;
  } catch (_err) {
    return cwd;
  }
}

function stateRealDir(cwd = process.cwd()) {
  const linked = path.join(mainWorktreeRoot(cwd), '.claude-state');
  try {
    return fs.realpathSync(linked);
  } catch (_err) {
    return linked;
  }
}

function relInMainState(absTarget, cwd = process.cwd()) {
  const dirs = [path.join(mainWorktreeRoot(cwd), '.claude-state'), stateRealDir(cwd)];
  const local = path.join(cwd, '.claude-state');
  try { if (fs.lstatSync(local).isSymbolicLink()) dirs.push(local); } catch (_e) { /* 無い */ }
  for (const d of dirs) {
    const rel = path.relative(d, absTarget).split(path.sep).join('/');
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) return rel;
  }
  return null;
}

/** cwd が本体ではなく worktree の中か。 */
function isLinkedWorktree(cwd = process.cwd()) {
  return path.resolve(mainWorktreeRoot(cwd)) !== path.resolve(cwd);
}

module.exports = { mainWorktreeRoot, stateRealDir, relInMainState, isLinkedWorktree };
