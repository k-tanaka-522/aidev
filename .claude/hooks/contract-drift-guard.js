#!/usr/bin/env node
'use strict';

/**
 * contract-drift-guard.js（新設・版2.5、M7実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 16.5.1節
 *
 * 【イベント】PostToolUse（Edit|Write, `.claude/lib/**`, `.claude/hooks/**`,
 *   `.claude/skills/<name>/scripts/**`）
 * 【検知内容】変更されたファイルパスを`.claude/contracts/MANIFEST.json`の`target.module`と
 *   完全一致で突合し、一致する`status: active`の契約のみを`node <testFile>`で実行する
 *   （該当が無ければ何もしない）。
 * 【動作】警告のみ（exit 0）。不合格の場合`.claude-state/decision-warnings.json`へ
 *   `{type: "contract_broken", contractId, testFile, targetModule, detail}`を追記する
 *   （8.2.5節の既存スキーマを再利用）。
 * 【ブロックしない理由】16.5.1節: 契約の合否自体は決定論的だが、1ファイルの編集は
 *   通常複数回のEdit呼び出しに分かれ、作業途中の中間状態で一時的に契約を破ることは
 *   正常にありうる（段1と同じ設計判断）。
 *
 * 【目的・理由】
 * 実例1〜4（サイレント故障4件）はいずれも「実装を変更したとき」に壊れた。契約対象
 * moduleへの変更を検知した瞬間に該当契約を再実行し、再発を機械的に検出し続ける。
 *
 * 【影響範囲】
 * `.claude/lib/**`, `.claude/hooks/**`, `.claude/skills/<name>/scripts/**`へのEdit/Write。
 *
 * 【前提条件・制約】
 * - `.claude/contracts/MANIFEST.json`の`target.module`と完全一致する場合のみ実行する
 *   （静的解析による依存関係追跡は行わない、16.10節の明記済み限界。関数Aが関数Bを内部で
 *   呼び出しており、Bのみが変更された場合、Aの契約は自動実行されない）。
 * - settings.json未登録の間は発火しない。動作確認は
 *   `echo '<JSON>' | node .claude/hooks/contract-drift-guard.js` で行う。
 *
 * 【契約】
 * 対象外。本ファイルは契約検証機構自身の実行フック（メタ層）であり、01/02文書のMUSTを
 * 実装するものではない（16.6節の5類型のいずれにも該当しない）。
 */

const fs = require('fs');
const path = require('path');
const { contractsForModule, runContract, summarize } = require('../lib/contract-registry');
const { readWarnings, writeWarnings, addWarning } = require('../lib/warnings-store');

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

/** 消し込み: 同一contractIdの未解消contract_broken警告をresolved:trueにする（16.5.1節）。 */
function resolveContractWarnings(cwd, contractId) {
  const data = readWarnings(cwd);
  let changed = false;
  for (const w of data.warnings) {
    if (w.type === 'contract_broken' && w.contractId === contractId && !w.resolved) {
      w.resolved = true;
      w.resolved_by = 'contract-drift-guard.js(再実行合格)';
      changed = true;
    }
  }
  if (changed) writeWarnings(data, cwd);
}

function main() {
  const payload = readHookPayload();
  const filePath = payload && payload.tool_input && payload.tool_input.file_path;
  if (!filePath) {
    process.exit(0);
  }

  const cwd = process.cwd();
  const absTarget = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const relPath = path.relative(cwd, absTarget).replace(/\\/g, '/');

  const matched = contractsForModule(cwd, relPath);
  if (matched.length === 0) {
    process.exit(0);
  }

  for (const contract of matched) {
    const result = runContract(cwd, contract.testFile);
    if (result.pass) {
      resolveContractWarnings(cwd, contract.id);
      continue;
    }
    const data = readWarnings(cwd);
    const entry = addWarning(data, {
      type: 'contract_broken',
      path_or_task: relPath,
      extra: {
        contractId: contract.id,
        testFile: contract.testFile,
        targetModule: contract.target.module,
        detail: result.output.trim().slice(0, 2000),
      },
    });
    writeWarnings(data, cwd);
    console.error(
      `[contract-drift-guard] ${relPath} の変更により契約 ${contract.id}（${contract.testFile}）が` +
        `不合格になりました（警告のみ・ブロックしません）。 warning_id=${entry.id}`
    );
    console.error(`[contract-drift-guard] 詳細: ${summarize(result.output)}`);
  }

  process.exit(0);
}

main();
