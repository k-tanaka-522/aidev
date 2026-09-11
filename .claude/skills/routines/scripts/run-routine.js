#!/usr/bin/env node
'use strict';

/**
 * run-routine.js（routines Skill 同梱スクリプト、M5新設）
 *
 * 【目的・理由】
 * 02文書12章が定めるRoutines（定期タスク）の起動契機（cron相当）はこの実行環境では
 * 使えるとは限らない（タスク指示）。そのため、スケジュール定義（`routines.json`）と
 * 実行スクリプト（`scripts/*.js`）を分離し、スケジューラの有無に関わらず**手動で**
 * 個々のRoutineを実行できるランナーを用意する。実際にスケジューラ（cron等）が
 * 利用可能な環境では、`routines.json`の`schedule`フィールドを読んで外部スケジューラへ
 * 登録する橋渡しスクリプトを追加すればよい設計とし、本ランナー自体はスケジューラの有無に
 * 依存しない（MUST）。
 *
 * 【使い方】
 *   node run-routine.js --list                 # 定義済みRoutine一覧を表示
 *   node run-routine.js --name=doc-link-check   # 指定Routineを1件実行
 *   node run-routine.js --all                   # 定義済み全Routineを順に実行（重複スクリプトは1回のみ）
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function loadRoutines() {
  const p = path.join(__dirname, '..', 'routines.json');
  return JSON.parse(fs.readFileSync(p, 'utf-8'));
}

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
    else if (/^--[^=]+$/.test(raw)) args[raw.slice(2)] = true;
  }
  return args;
}

function runOne(routine, cwd) {
  const scriptPath = path.resolve(__dirname, '..', routine.script);
  const args = routine.args || [];
  try {
    const out = execFileSync('node', [scriptPath, ...args], { cwd, timeout: 30000 }).toString('utf-8');
    let parsed;
    try {
      parsed = JSON.parse(out);
    } catch (_err) {
      parsed = { raw: out };
    }
    return { name: routine.name, status: 'executed', output: parsed };
  } catch (err) {
    const stdout = err.stdout ? err.stdout.toString('utf-8') : '';
    return { name: routine.name, status: 'error', message: err.message, stdout };
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const { routines } = loadRoutines();

  if (args.list) {
    console.log(JSON.stringify(routines.map((r) => ({ name: r.name, schedule: r.schedule, description: r.description })), null, 2));
    return;
  }

  if (args.all) {
    const executedScripts = new Set();
    const results = [];
    for (const r of routines) {
      if (executedScripts.has(r.script)) {
        results.push({ name: r.name, status: 'skipped', reason: `スクリプトを共用する別Routine（sharesScriptWith）で実行済み` });
        continue;
      }
      executedScripts.add(r.script);
      results.push(runOne(r, cwd));
    }
    console.log(JSON.stringify({ status: 'done', results }, null, 2));
    return;
  }

  if (!args.name) {
    console.error('[run-routine] --name=<routine名> または --all または --list を指定すること。');
    process.exit(2);
  }

  const routine = routines.find((r) => r.name === args.name);
  if (!routine) {
    console.error(`[run-routine] 未定義のRoutine名: ${args.name}`);
    process.exit(2);
  }
  console.log(JSON.stringify(runOne(routine, cwd), null, 2));
}

main();
