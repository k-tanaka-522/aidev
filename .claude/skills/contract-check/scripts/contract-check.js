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
 * 【契約】欄の走査結果を、16.5.2節が要求する分類に振り分ける。
 * - `noTag`: 欄そのものが無い（新規実装がMUSTに追随していない）
 * - `covered`: MANIFESTの`target.module`がこのファイルに一致する契約を持つ（対象内・
 *   契約化済み）
 * - `outOfScope`: 本文冒頭が対象外判定の決まり文句で始まる（明示的に対象外と判定済み）
 * - `unregisteredRef`: CT-IDを参照しているがMANIFESTのactive契約に存在しない
 *   （ダングリング参照。存在するがこのファイルを対象としていないだけのCT-IDは
 *   含まない。後述のM-ctcheck修正参照）
 * - `unevaluated`: `covered`でも`outOfScope`でもない（契約化するかどうかの判定が
 *   まだ行われていない。16.10節が明記する限界の可視化そのもの）
 *
 * 【M-ctcheck修正（正規表現による偽陽性バグ、PMからの委譲）】
 * 旧実装は「本文中に`CT-\d{4}`が1件でも出現すれば、このファイルは契約を持つ」と
 * 判定していた。しかし`.claude/lib`・`.claude/hooks`配下の多くのファイルは【契約】欄に
 * 「M7（16.9節）時点では既存の登録済み契約4件（`CT-0001`〜`CT-0004`）のみが契約化
 * 済みである」という**定型の説明文**を持ち、これが正規表現に誤ってマッチしていた
 * （実測: 32ファイルがこの定型文だけで「契約あり」と誤判定され、未評価リストから
 * 除外されていた）。CT-0001・CT-0004はMANIFESTに実在する契約IDであるため、旧実装の
 * `missing`（MANIFEST未登録かどうか）チェックでも弾けず、可視化機構そのものが
 * 偽りの安心を与えていた。
 * 本修正は「このファイルに契約があるか」を**MANIFEST.jsonの`target.module`を正本として
 * 判定する**方式に変更する（正規表現で本文を舐めない）。`unregisteredRef`
 * （ダングリング参照、typo等でMANIFEST自体に存在しないCT-IDを自己言及している場合の
 * 検出）は引き続き正規表現でCT-ID候補を抽出するが、それが**MANIFEST全体にも存在しない**
 * 場合に限り報告する（「他ファイルの契約数についての説明文」で実在するCT-IDに言及して
 * いるだけのケースを誤検出しないため）。
 *
 * 【関連する二次的な偽陽性（同一原因・同一バグクラス、あわせて修正）】
 * 上記のMANIFEST module判定に切り替えた後も、`/対象外/.test(body)`（部分一致）が
 * 別の偽陽性を生んでいた。未判定ファイルの定型文は「本ファイルは**対象内・対象外**
 * いずれの判定もまだ行われていない」という**否定文**だが、この文字列にも部分文字列
 * 「対象外」が含まれるため、旧来の部分一致では「明示的に対象外と判定済み」と誤認して
 * `unevaluated`から除外してしまう（実測確認済み・設計側からの追加報告により判明。
 * 判定の意味が真逆になる）。`.claude/lib`・`.claude/hooks`配下の約28ファイルがこの
 * 定型文のみで「対象外判定済み」と誤分類されていた。
 * `/CT-\d{4}/g`と同じ「本文を正規表現で舐める」バグクラスであるため、同じ方針
 * （本文の自由な部分一致をやめ、構造的な位置に限定する）で是正する。本コードベースの
 * 【契約】欄の書式には`判定: 対象外`のようなkey:value構造化フィールドは存在しない
 * （issue-ledger.js等の真の対象外判定を実地調査した結果、いずれも本文の**先頭**が
 * `対象外。`または`対象外と判定した`という決まった言い回しで始まり、未判定ファイルは
 * 必ず`未設定。`で始まるという一貫した書式差があることを確認した）。この「本文冒頭の
 * 決まり文句」を判定を表す構造的フィールドとして扱い、`OUT_OF_SCOPE_PATTERN`
 * （先頭一致、`対象外。`／`対象外と判定した`の2パターンのみ）でのみ「対象外判定済み」と
 * 認定する。将来、この2パターンのいずれにも一致しない新しい言い回しで対象外を宣言する
 * ファイルが現れた場合は、判定が構造的に読み取れない＝**未判定として扱う（fail closed）**
 * （`unevaluated`側に残る。「対象外のつもりで書いたのに検出されない」場合はファイル側の
 * 表現を上記2パターンに合わせるか、本関数の`OUT_OF_SCOPE_PATTERN`をapp-architect経由で
 * 拡張する）。
 * 可視化の透明性を上げるため、「対象外判定済み」（`outOfScope`）も内訳として返す
 * （旧実装は対象外判定済みを暗黙にドロップし件数を報告しなかった。16.10節「契約が無い
 * ことを隠さない」の精神から、対象外の判定件数自体も可視化する）。
 */
const OUT_OF_SCOPE_PATTERN = /^対象外(?:。|と判定した)/;

function buildVisibilityReport(cwd) {
  const active = activeContracts(cwd);
  const manifestIds = new Set(active.map((c) => c.id));
  const manifestModules = new Set(active.map((c) => c.target && c.target.module).filter(Boolean));
  const files = collectTargetFiles(cwd);
  const noTag = [];
  const unregisteredRef = [];
  const unevaluated = [];
  const outOfScope = [];
  const covered = [];

  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const { hasTag, body } = scanContractTag(file);
    if (!hasTag) {
      noTag.push(rel);
      continue;
    }

    // MANIFESTを正本として「このファイルを対象とする契約が実在するか」を判定する
    // （本文中のCT-ID出現有無ではない）。
    if (manifestModules.has(rel)) {
      covered.push(rel);
      continue;
    }

    // このファイルを対象とする契約はMANIFESTに無い。本文が具体的なCT-IDを自己言及して
    // いる場合、そのID自体がMANIFESTに存在するかを確認する（存在しなければダングリング
    // 参照として報告する。存在するが対象moduleが一致しないだけの場合は他ファイルの
    // 契約数についての説明文である可能性が高く、ダングリング参照とは呼ばない）。
    const ctIds = Array.from(new Set((body.match(/CT-\d{4}/g) || [])));
    const dangling = ctIds.filter((id) => !manifestIds.has(id));
    if (dangling.length > 0) {
      unregisteredRef.push({ file: rel, missing: dangling, body });
      continue;
    }

    if (OUT_OF_SCOPE_PATTERN.test(body)) {
      // 本文冒頭が「対象外」判定の決まり文句で始まる場合のみ除外する（構造的マッチ、
      // 本文中のどこかに「対象外」という文字列が現れるだけでは除外しない）。
      outOfScope.push(rel);
      continue;
    }
    unevaluated.push({ file: rel, body });
  }

  return { noTag, unregisteredRef, unevaluated, outOfScope, covered };
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
          `契約あり（MANIFEST一致）=${output.visibility.covered.length}件, ` +
          `対象外判定済み=${output.visibility.outOfScope.length}件, ` +
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
