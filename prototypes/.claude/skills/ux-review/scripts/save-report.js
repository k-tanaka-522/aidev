#!/usr/bin/env node
'use strict';

/**
 * save-report.js（ux-review Skill の結果の書き出し）
 *
 * 【目的】
 * ux-reviewer は Write/Edit を持たない（読むだけの役。prototypes/** を書き換えない）。結果のファイルだけは、
 * このスクリプトで標準入力から `.claude-state/ux-review/` の中に書く。ここの外・.md/.json 以外には書けない。
 *
 * 【使い方】（本文はヒアドキュメントで渡す。終わりの印は本文に出てこない語にする）
 *   node prototypes/.claude/skills/ux-review/scripts/save-report.js --out=2026-10-07-admin-x.draft.md <<'UXR_EOF'
 *   ...本文...
 *   UXR_EOF
 *   --append を付けると末尾に足す（却下の台帳 rejected.md に使う）。
 */

const fs = require('fs');
const lib = require('./lib');

function main() {
  const args = lib.parseArgs(process.argv.slice(2));
  let out = args.out && args.out !== true ? String(args.out) : null;
  if (!out) throw new Error('--out=<.claude-state/ux-review/ からの相対パス> を指定してください');
  out = out.replace(/^\.claude-state\/ux-review\//, '');
  if (!/\.(md|json)$/i.test(out)) throw new Error('書けるのは .md と .json だけです: ' + out);
  const body = fs.readFileSync(0, 'utf8');
  if (!body.trim()) throw new Error('本文が空です（標準入力で渡してください）');
  const abs = lib.resolveOut(out);
  if (args.append) fs.appendFileSync(abs, (fs.existsSync(abs) ? '\n' : '') + body);
  else fs.writeFileSync(abs, body);
  console.log(`${args.append ? '追記' : '保存'}: .claude-state/ux-review/${out}（${Buffer.byteLength(body)} バイト）`);
}

try { main(); } catch (e) { console.error('[ux-review/save-report] ' + e.message); process.exit(1); }
