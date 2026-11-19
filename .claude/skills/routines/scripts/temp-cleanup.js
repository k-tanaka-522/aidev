#!/usr/bin/env node
'use strict';

/**
 * temp-cleanup.js — OS の一時フォルダ（%TEMP%）の古い物を消す（routines の temp-cleanup）。
 *
 * 【目的・理由】
 * Playwright・ブラウザの使い捨てプロファイル、試験の出力、インストーラの残りが %TEMP% に溜まる
 * （派生案件で 87.6GB になった）。溜まる前に定期で消す。
 *
 * 【使い方】
 *   node temp-cleanup.js            # 消す候補の一覧と件数だけ（既定は消さない）
 *   node temp-cleanup.js --apply    # 実際に消す
 *   node temp-cleanup.js --days=3   # 「古い」の境目を変える（既定は DEFAULT_DAYS）
 *
 * 消すのは %TEMP% 直下で、最終更新が境目より古い物だけ。次は消さない:
 * - claude（動いている Claude Code のセッションの出力・作業用フォルダ）
 * - 境目より新しい物（使っている途中の物）
 * 使用中で消せない物は読み飛ばして、残った件数を出す。
 *
 * 【契約】
 * 対象外（PM の判断）。PC の後片付けで、設計・実装の契約・台帳の分母分子に関わらない。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_DAYS = 2;
const KEEP = new Set(['claude']);

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

function removeEntry(full, isDir) {
  try {
    if (isDir && process.platform === 'win32') {
      // fs.rmSync は長いパスや読み取り専用で止まりやすいので、Windows では rd に任せる
      execFileSync('cmd', ['/c', 'rd', '/s', '/q', full], { stdio: 'ignore', timeout: 300000 });
    } else {
      fs.rmSync(full, { recursive: true, force: true });
    }
  } catch (_e) { /* 使用中など。下で残ったかを見る */ }
  return !fs.existsSync(full);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === true;
  const days = Number(args.days || DEFAULT_DAYS);
  if (!(days > 0)) {
    console.error('[temp-cleanup] --days は正の数で指定すること');
    process.exit(2);
  }
  const root = os.tmpdir();
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const targets = [];
  for (const name of fs.readdirSync(root)) {
    if (KEEP.has(name.toLowerCase())) continue;
    const full = path.join(root, name);
    let st;
    try { st = fs.lstatSync(full); } catch (_e) { continue; }
    if (st.mtimeMs >= cutoff) continue;
    targets.push({ name, full, isDir: st.isDirectory() });
  }

  let removed = 0;
  const left = [];
  if (apply) {
    for (const t of targets) {
      if (removeEntry(t.full, t.isDir)) removed += 1;
      else left.push(t.name);
    }
  }

  console.log(JSON.stringify({
    tempDir: root,
    olderThanDays: days,
    mode: apply ? 'apply' : 'dry-run',
    candidates: targets.length,
    sample: targets.slice(0, 20).map((t) => t.name),
    removed: apply ? removed : 0,
    left: apply ? left.length : 0,
    leftSample: left.slice(0, 20),
  }, null, 2));
}

main();
