#!/usr/bin/env node
'use strict';

/**
 * contract-check.js（contract-check Skill 同梱スクリプト、新設・版2.5、M7実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 16.5.2節
 *
 * 【目的・理由】
 * `.claude/contracts/MANIFEST.json`の`status: active`全件について`node <testFile>`を
 * 一括実行し、合格/不合格件数を集計する（一次証跡は自ら数える、01文書7.2節）。あわせて
 * `.claude/lib`・`.claude/hooks`・各Skill`scripts/`配下のヘッダーコメントを走査し、
 * `【契約】`欄はあるがMANIFESTに未登録のCT-IDを参照している関数、および`【契約】`欄はあるが
 * 「対象外」の宣言もCT-ID参照も無い（＝契約化の判定がまだ行われていない）関数の一覧を
 * 報告する（16.6節「選別自体が人間の判断であることの明記」、16.10節「契約が無いことを
 * 隠さない」ための可視化）。
 *
 * 【影響範囲】
 * 読み取り＋`node <testFile>`の子プロセス実行のみ。`.claude/contracts/**`・
 * `.claude/lib/**`・`.claude/hooks/**`・`.claude/skills/**`のいずれも書き換えない
 * （`contract-check`は`Write`/`Edit`を持たない、5.1節）。
 *
 * 【前提条件・制約】
 * - `deferred`（16.6節: 選別基準を満たすが理由付きで対応を見送り中）の契約は実行しない
 *   （`activeContracts`が`status: active`のみを返す）。
 * - 契約テストの実行そのものにNode.jsの子プロセス起動（`Bash`相当の権限）を要する
 *   （16.5.2節「`Bash`が必要な理由」）。
 *
 * 【使い方】
 *   node contract-check.js                # フルモード（全active契約 + 見える化レポート）
 *   node contract-check.js --json          # フルモードのJSON詳細のみ
 *   node contract-check.js --target=<path> # 指定パスに関連する契約のみ実行
 *
 * 【契約】
 * 対象外。本ファイルは契約検証機構自身の一括実行スクリプト（メタ層）であり、01/02文書の
 * MUSTを実装するものではない（16.6節の5類型のいずれにも該当しない）。
 */

const fs = require('fs');
const path = require('path');
const { activeContracts, runContract, summarize } = require('../../../lib/contract-registry');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
    else if (/^--[^=]+$/.test(raw)) args[raw.slice(2)] = true;
  }
  return args;
}

/** 対象ディレクトリ配下の`.js`ファイルを再帰的に集める（隠しディレクトリ以外）。 */
function walkJsFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return results;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...walkJsFiles(full));
    } else if (e.name.endsWith('.js')) {
      results.push(full);
    }
  }
  return results;
}

/**
 * 走査対象: `.claude/lib/**`・`.claude/hooks/**`・各Skillの`scripts/**`
 * （16.5.2節「.claude/lib・.claude/hooks・スキルscripts/配下のヘッダーコメント」）。
 * `.claude/contracts/**`自体は契約ファイルであり、見える化の走査対象には含めない
 * （契約ファイルに「このMUSTを契約化した」という自己言及は不要なため）。
 */
function collectTargetFiles(cwd) {
  const files = [];
  files.push(...walkJsFiles(path.join(cwd, '.claude', 'lib')));
  files.push(...walkJsFiles(path.join(cwd, '.claude', 'hooks')));
  const skillsDir = path.join(cwd, '.claude', 'skills');
  let skillEntries = [];
  try {
    skillEntries = fs.readdirSync(skillsDir, { withFileTypes: true });
  } catch (_err) {
    skillEntries = [];
  }
  for (const e of skillEntries) {
    if (!e.isDirectory()) continue;
    files.push(...walkJsFiles(path.join(skillsDir, e.name, 'scripts')));
  }
  return files;
}

/**
 * ファイル先頭の`/** ... *&#47;`ブロックから`【契約】`欄の本文を抽出する。
 * 戻り値: `{ hasTag: boolean, body: string|null }`。
 * `hasTag: false`はヘッダーに`【契約】`欄そのものが無いことを示す（16.3.3節が
 * MUSTとする「以後の新規実装・改修」にまだ追随していないファイル）。
 */
function scanContractTag(filePath) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf-8');
  } catch (_err) {
    return { hasTag: false, body: null };
  }
  const lines = text.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '/**') {
      start = i;
      break;
    }
  }
  if (start === -1) return { hasTag: false, body: null };
  let end = -1;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^ \*\/\s*$/.test(lines[i])) {
      end = i;
      break;
    }
  }
  if (end === -1) return { hasTag: false, body: null };
  const block = lines.slice(start + 1, end);
  const tagIdx = block.findIndex((l) => l.trim() === '* 【契約】');
  if (tagIdx === -1) return { hasTag: false, body: null };
  const bodyLines = [];
  for (let i = tagIdx + 1; i < block.length; i++) {
    const l = block[i];
    if (/^\s*\*\s*$/.test(l)) break; // 空行（次欄との区切り）
    if (/^\s*\*\s*【/.test(l)) break; // 次の見出し（別欄）
    bodyLines.push(l.replace(/^\s*\*\s?/, ''));
  }
  return { hasTag: true, body: bodyLines.join(' ').trim() };
}

/**
 * 【契約】欄の走査結果を、16.5.2節が要求する3分類に振り分ける。
 * - `noTag`: 欄そのものが無い（新規実装がMUSTに追随していない）
 * - `unregisteredRef`: CT-IDを参照しているがMANIFESTのactive契約に存在しない
 * - `unevaluated`: 「対象外」宣言もCT-ID参照も無い（契約化するかどうかの判定が
 *   まだ行われていない。16.10節が明記する限界の可視化そのもの）
 */
function buildVisibilityReport(cwd) {
  const manifestIds = new Set(activeContracts(cwd).map((c) => c.id));
  const files = collectTargetFiles(cwd);
  const noTag = [];
  const unregisteredRef = [];
  const unevaluated = [];

  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const { hasTag, body } = scanContractTag(file);
    if (!hasTag) {
      noTag.push(rel);
      continue;
    }
    const ctIds = Array.from(new Set((body.match(/CT-\d{4}/g) || [])));
    if (ctIds.length > 0) {
      const missing = ctIds.filter((id) => !manifestIds.has(id));
      if (missing.length > 0) {
        unregisteredRef.push({ file: rel, missing, body });
      }
      continue;
    }
    if (/対象外/.test(body)) {
      continue; // 明示的に対象外と判定済み。見える化の対象にしない。
    }
    unevaluated.push({ file: rel, body });
  }

  return { noTag, unregisteredRef, unevaluated };
}

/** `--target=<path>`向け: 指定パスに関連する契約を絞り込む（16.5.2節）。 */
function selectContracts(cwd, targetArg) {
  const all = activeContracts(cwd);
  if (!targetArg) return all;
  const absTarget = path.isAbsolute(targetArg) ? targetArg : path.resolve(cwd, targetArg);
  const relTarget = path.relative(cwd, absTarget).replace(/\\/g, '/');
  let isDir = false;
  try {
    isDir = fs.statSync(absTarget).isDirectory();
  } catch (_err) {
    isDir = false;
  }
  return all.filter((c) => {
    const mod = c.target && c.target.module;
    if (!mod) return false;
    if (isDir) return mod === relTarget || mod.startsWith(relTarget.replace(/\/$/, '') + '/');
    return mod === relTarget;
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();

  const contracts = selectContracts(cwd, args.target);
  const results = contracts.map((c) => {
    const r = runContract(cwd, c.testFile);
    return {
      id: c.id,
      testFile: c.testFile,
      targetModule: c.target.module,
      pass: r.pass,
      summary: r.pass ? null : summarize(r.output),
    };
  });

  const passCount = results.filter((r) => r.pass).length;
  const failCount = results.length - passCount;

  const output = {
    mode: args.target ? `target:${args.target}` : 'full',
    total: results.length,
    pass: passCount,
    fail: failCount,
    results,
  };

  // フルモード（--targetなし）のときのみ「見える化」レポートを付与する。
  // --targetモードは対象module限定の再実行が目的であり、可視化は主目的でないため
  // 走査コストを避ける（フルモードと同じ挙動にすると16.5.2節のtargetモードの
  // 意図（軽量な再実行）を損なう）。
  if (!args.target) {
    output.visibility = buildVisibilityReport(cwd);
  }

  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`[contract-check] mode=${output.mode} total=${output.total} pass=${output.pass} fail=${output.fail}`);
    for (const r of results) {
      console.log(`  - ${r.pass ? 'PASS' : 'FAIL'} ${r.id} (${r.targetModule})${r.pass ? '' : ` :: ${r.summary}`}`);
    }
    if (output.visibility) {
      console.log(
        `[contract-check] 見える化: タグ無し=${output.visibility.noTag.length}件, ` +
          `MANIFEST未登録参照=${output.visibility.unregisteredRef.length}件, ` +
          `未評価（対象内外いずれの判定も未了）=${output.visibility.unevaluated.length}件`
      );
      if (output.visibility.unregisteredRef.length > 0) {
        console.log('  [MANIFEST未登録参照]');
        for (const u of output.visibility.unregisteredRef) {
          console.log(`    - ${u.file}: ${u.missing.join(', ')}`);
        }
      }
    }
    console.log(JSON.stringify(output));
  }

  if (failCount > 0) process.exitCode = 1;
}

main();
