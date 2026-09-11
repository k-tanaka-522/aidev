#!/usr/bin/env node
'use strict';

/**
 * register-api.js（contract-design Skill 同梱スクリプト）
 *
 * 【目的・理由】
 * OpenAPI定義のoperationIdが確定した時点でApp-Architectが`API-{連番}`を採番する
 * （01文書4.4.5節、02文書10.1.1節）。契約モック（`decisions/contracts/*.openapi.yaml`）
 * 自体が台帳を兼ねる設計（03文書3.10.3節）のため、YAML内に`x-api-id`拡張フィールドとして
 * 直接埋め込む方式を採る（OpenAPI 3.0は`x-`接頭辞の拡張フィールドを許容する仕様）。
 *
 * 【影響範囲】
 * `docs/00_プロジェクト管理・ガバナンス/decisions/contracts/{api-name}.openapi.yaml`への
 * in-place編集（operationId直後にx-api-id行を挿入）。
 *
 * 【前提条件・制約】
 * - フルスペックのYAMLパーサーは使わない（`field-extract.js`と同じ判断。02文書10.3節が
 *   「grepで機械的に抽出する」前提であるため、行ベースのインデント解析で足りると判断した）。
 * - 既に`x-api-id`が付与済みのoperationIdは再採番しない（冪等）。
 * - API-IDの一意性は`decisions/contracts/`配下の全`.openapi.yaml`ファイルを走査して担保する
 *   （複数ファイルにまたがるAPI群でもID重複が生じないようにするため）。
 *
 * 【使い方】
 *   node register-api.js --file=decisions/contracts/users.openapi.yaml
 *   node register-api.js --file=decisions/contracts/users.openapi.yaml --operation=getUser
 */

const fs = require('fs');
const path = require('path');
const { extractOperationIds } = require('../../../../../../../../.claude/lib/field-extract');
const { injectApiId } = require('../../../../../../../../.claude/lib/field-extract');
const { nextIdFromDir } = require('../../../../../../../../.claude/lib/id-registry');
const { contractsDir } = require('../../../../../../../../.claude/lib/ledger-paths');

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
  if (!args.file) {
    console.error('[register-api] --file は必須です（decisions/contracts/配下のOpenAPI定義）');
    process.exit(1);
  }

  const cwd = process.cwd();
  const absFile = path.isAbsolute(args.file) ? args.file : path.resolve(cwd, args.file);
  const relFile = path.relative(cwd, absFile).replace(/\\/g, '/');

  if (!fs.existsSync(absFile)) {
    console.error(`[register-api] 対象ファイルが存在しません: ${relFile}`);
    process.exit(1);
  }
  const contractsDirPath = contractsDir(cwd);
  if (!absFile.startsWith(contractsDirPath)) {
    console.error(
      `[register-api] 対象ファイルは decisions/contracts/ 配下に置くこと（契約モックの配置先、02文書4.2節）: ${relFile}`
    );
    process.exit(1);
  }

  let yamlText = fs.readFileSync(absFile, 'utf-8');
  const operations = extractOperationIds(yamlText);
  if (!operations.length) {
    console.error(`[register-api] operationId が見つかりませんでした: ${relFile}`);
    process.exit(1);
  }

  const targets = args.operation
    ? operations.filter((o) => o.operationId === args.operation)
    : operations.filter((o) => !o.apiId);

  if (args.operation && !targets.length) {
    console.error(`[register-api] 指定された operationId が見つかりません: ${args.operation}`);
    process.exit(1);
  }

  // nextIdFromDir はディスク上の内容を走査するため、同一実行内で複数件を新規採番する場合に
  // 「書き込みがまだ反映されていないディスクを毎回読み直す」と同じ番号を重複採番してしまう。
  // そのため、ディスクから読んだ初期値をシードにローカルカウンタを回す（1採番=1インクリメント）。
  let nextNum = parseInt(nextIdFromDir('API', contractsDirPath, '.openapi.yaml'), 10);

  const assigned = [];
  for (const op of targets) {
    if (op.apiId) {
      assigned.push({ operationId: op.operationId, apiId: op.apiId, newlyAssigned: false });
      continue;
    }
    const apiId = 'API-' + String(nextNum).padStart(4, '0');
    nextNum += 1;
    yamlText = injectApiId(yamlText, op.operationId, apiId);
    assigned.push({ operationId: op.operationId, apiId, newlyAssigned: true });
  }

  fs.writeFileSync(absFile, yamlText, 'utf-8');

  console.log(JSON.stringify({ file: relFile, assigned }, null, 2));
}

main();
