#!/usr/bin/env node
'use strict';

/**
 * dependency-update-check.js（routines Skill 同梱スクリプト、M5新設）
 *
 * 【目的・理由】
 * 02文書12章のRoutines一覧「依存更新チェック」を実装する。
 *
 * 【正直な限界表明（MUST）】
 * 依存更新チェックの正攻法（`npm outdated`/`pip list --outdated`等）はパッケージレジストリ
 * への外部ネットワークアクセスを要する。本タスクの実行環境がネットワーク制限下にあるか
 * 事前に確認できないため、本スクリプトは(1)まず`package.json`の存在を確認し、
 * (2) `npm outdated --json`をタイムアウト付きで試行し、(3) 失敗（ネットワーク不可・
 * npm未導入等）した場合は例外を握りつぶさず「実行できなかった」ことを明示する
 * （黙って「更新なし」と報告しない、MUST NOT）。
 *
 * 【影響範囲】読み取りのみ（`package.json`があるディレクトリに対し`npm outdated`を実行）。
 * ネットワークアクセスを伴う可能性があるため、CIやサンドボックスでの実行時は
 * `--offline`相当のフォールバック（存在確認のみ）を明示的に許容する。
 *
 * 【契約】
 * 対象内と判定した（coderの一次判定、PMへ報告）。ヘッダー冒頭の「正直な限界表明」が
 * 自己申告するとおり、`npm outdated`実行不可時に例外を握りつぶして「更新なし」（＝
 * 正常に0件だった状態）へフォールバックしないことを設計上のMUSTとしており、これは
 * 16.6節(d)「fail-closedの挙動」・(e)「無効化と正しく0件の区別不能性」に直接該当する。
 * 現時点で対応する契約テストは無い。ネットワーク不可時に本当に「実行できなかった」
 * ステータスを返し「0件」を返さないことを検証する契約をapp-architectへ発注することを
 * 提案する。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function findPackageJsonDirs(cwd) {
  const found = [];
  const stack = [cwd];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_err) {
      continue;
    }
    if (entries.some((e) => e.isFile() && e.name === 'package.json')) found.push(dir);
    for (const e of entries) {
      if (e.isDirectory() && !['node_modules', '.git', '.claude'].includes(e.name)) {
        stack.push(path.join(dir, e.name));
      }
    }
  }
  return found;
}

function main() {
  const cwd = process.cwd();
  const dirs = findPackageJsonDirs(cwd);
  if (dirs.length === 0) {
    console.log(JSON.stringify({ status: 'skipped', reason: 'package.json が見つからない（Node.jsプロジェクトではない、または未初期化）' }, null, 2));
    return;
  }

  const results = dirs.map((dir) => {
    try {
      const out = execFileSync('npm', ['outdated', '--json'], { cwd: dir, timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
      const text = out.toString('utf-8').trim();
      const outdated = text ? JSON.parse(text) : {};
      return { dir: path.relative(cwd, dir) || '.', status: 'checked', outdatedCount: Object.keys(outdated).length, outdated };
    } catch (err) {
      // npm outdated は更新対象がある場合、非0で終了する仕様（正常系）。stdoutにJSONが
      // 載っていればそれを解釈し、載っていなければ「実行不能」として明示する。
      const stdout = err.stdout ? err.stdout.toString('utf-8').trim() : '';
      if (stdout) {
        try {
          const outdated = JSON.parse(stdout);
          return { dir: path.relative(cwd, dir) || '.', status: 'checked', outdatedCount: Object.keys(outdated).length, outdated };
        } catch (_parseErr) {
          // fallthrough
        }
      }
      return {
        dir: path.relative(cwd, dir) || '.',
        status: 'unable-to-check',
        reason: `npm outdated 実行失敗（ネットワーク制限またはnpm未導入の可能性）: ${err.message}`,
      };
    }
  });

  console.log(JSON.stringify({ status: 'done', results }, null, 2));
}

main();
