#!/usr/bin/env node
'use strict';

/**
 * mark-superseded.js（decide Skill 同梱スクリプト。由来: salon-booking-platform）
 *
 * 既に起票済みの DL どうしで、古い DL に「置き換えられた」印を付ける。
 * 新しく起票するときは new-decision.js の supersedes を使えばこれは要らない。
 * 全部覆ったか一部か（項の番号）の判断は呼ぶ側がする（stale-scan.js の候補は判断の材料）。
 *
 *   node .claude/skills/decide/scripts/mark-superseded.js --old=DL-0697 --by=DL-1073
 *   node .claude/skills/decide/scripts/mark-superseded.js --old="DL-0154(3)" --by=DL-0291
 */

const { listDecisionFiles, markSuperseded } = require('../../../lib/decisions');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.old || !/^DL-\d{4}$/.test(args.by || '')) {
    console.error('[mark-superseded] --old=DL-xxxx[(n)] と --by=DL-yyyy を指定すること');
    process.exit(1);
  }
  const cwd = process.cwd();
  if (!listDecisionFiles(cwd).some((d) => d.file.startsWith(`${args.by}_`))) {
    console.error(`[mark-superseded] 置き換え先の決定ログが見つかりません: ${args.by}`);
    process.exit(1);
  }
  try {
    console.log(JSON.stringify(markSuperseded(cwd, args.old, args.by)));
  } catch (e) {
    console.error(`[mark-superseded] ${e.message}`);
    process.exit(1);
  }
}

main();
