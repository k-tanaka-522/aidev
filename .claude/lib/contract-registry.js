#!/usr/bin/env node
'use strict';

/**
 * contract-registry.js（M7新設・共有ライブラリ）
 *
 * 【目的・理由】
 * 設計⇔実装の契約検証機構（02文書16章）の中核である`.claude/contracts/MANIFEST.json`の
 * 読み込みと、個別契約（`.claude/contracts/*.contract.js`）の実行を1箇所に集約する。
 * `contract-drift-guard.js`（16.5.1節、差分実行）と`contract-check`Skill（16.5.2節、
 * 一括実行）はいずれも「対象module一致で契約を絞り込む」「`node <testFile>`を実行して
 * 合否を得る」という同じロジックを必要とするため、二重実装を避ける（9.1.2節が採った
 * 「静的解析基盤を共有する」設計判断と同型、16.5.2節がSHOULDとして明記）。
 *
 * 【影響範囲】
 * `.claude/hooks/contract-drift-guard.js`、`.claude/skills/contract-check/scripts/*.js`。
 *
 * 【前提条件・制約】
 * - `MANIFEST.json`の`status`が`active`の契約のみを実行対象とする（`deferred`は16.6節が
 *   定める「選別基準を満たすが理由付きで対応を見送り中」であり、実行しても無意味に不合格
 *   になるため除外する）。
 * - `runContract`は`node <testFile>`を子プロセスとして実行し、exit code 0を合格とする
 *   （16.3.1節「実行方式（MUST）」）。契約ファイル自体がNode.js組み込みモジュールのみで
 *   完結するため、本ライブラリは契約の中身（assertロジック）には一切関与しない。
 *
 * 【契約】
 * 対象外。本ファイルは契約検証機構自身の実行基盤（メタ層）であり、01/02文書のMUSTを
 * 実装するものではない（16.6節の5類型のいずれにも該当しない）。
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function manifestPath(cwd = process.cwd()) {
  return path.join(cwd, '.claude', 'contracts', 'MANIFEST.json');
}

/** MANIFEST.jsonを読む。存在しない/壊れている場合は空の状態を返す（例外を投げない）。 */
function readManifest(cwd = process.cwd()) {
  try {
    const raw = fs.readFileSync(manifestPath(cwd), 'utf-8');
    const data = JSON.parse(raw);
    if (!Array.isArray(data.contracts)) data.contracts = [];
    return data;
  } catch (_err) {
    return { contracts: [] };
  }
}

/** `status: active`の契約のみを返す。 */
function activeContracts(cwd = process.cwd()) {
  return readManifest(cwd).contracts.filter((c) => c.status === 'active');
}

/**
 * 指定した対象module（`target.module`、`.claude/lib/verify.js`のようなcwd相対パス、
 * `/`区切り）に一致する`active`契約を返す。`contract-drift-guard.js`が変更ファイルと
 * 突合する際に用いる（16.5.1節「対象module一致時のみ実行」）。完全一致のみ
 * （静的解析による依存関係追跡は行わない、16.10節の明記済み限界）。
 */
function contractsForModule(cwd, relModulePath) {
  const normalized = String(relModulePath).replace(/\\/g, '/');
  return activeContracts(cwd).filter((c) => c.target && c.target.module === normalized);
}

/**
 * 1件の契約テストを`node <testFile>`として実行する。
 * 戻り値: { pass: boolean, output: string }（`output`は合否に関わらずstdout+stderr）。
 * 例外は投げない（呼び出し側がexit codeを見て分岐できるよう、失敗もオブジェクトで返す）。
 */
function runContract(cwd, testFileRelPath) {
  const abs = path.isAbsolute(testFileRelPath) ? testFileRelPath : path.join(cwd, testFileRelPath);
  try {
    // stdio を明示的に 'pipe' にする（3ストリームとも）。指定しない場合、Node.jsの
    // execFileSync既定は stderr を親プロセスへ継承するため、契約失敗時の生スタック
    // トレースが呼び出し元hookの標準エラーへ二重出力される（捕捉したoutputでの
    // 整形出力と、素の継承出力の両方が表示されてしまう）。呼び出し側が出力内容を
    // 完全に制御できるよう、ここで明示的にpipeへ固定する。
    const output = execFileSync('node', [abs], { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { pass: true, output };
  } catch (err) {
    const output = [err.stdout, err.stderr, !err.stdout && !err.stderr ? err.message : null]
      .filter(Boolean)
      .join('\n');
    return { pass: false, output };
  }
}

/**
 * `runContract`が返す`output`（Node.jsのAssertionError生スタックトレースを含む）から、
 * 人間が読む1行サマリを抽出する。`AssertionError`行（assertメッセージそのもの）が
 * あればそれを使い、無ければ末尾の空でない行を使う（`console.error`メッセージ等）。
 */
function summarize(output) {
  const lines = String(output || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const assertionLine = lines.find((l) => l.includes('AssertionError'));
  if (assertionLine) return assertionLine;
  return lines.length ? lines[lines.length - 1] : '(詳細なし)';
}

module.exports = {
  manifestPath,
  readManifest,
  activeContracts,
  contractsForModule,
  runContract,
  summarize,
};
