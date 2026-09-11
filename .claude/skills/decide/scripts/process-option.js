#!/usr/bin/env node
'use strict';

/**
 * process-option.js（decide Skill 同梱スクリプト）
 *
 * 【目的・理由】
 * プロセス・オプション（標準 `prototype-driven` / 例外 `requirements-first`）の
 * 選択を決定ログの正本エントリ `DL-0000_process-option.md` として起票すると同時に、
 * hook・gate-checkが参照する機械可読な鏡ファイル `.claude-state/process-option.json`
 * を**同一操作内で必ず同期**させる（02文書8.7節）。2箇所を別々に更新する運用にすると
 * 同期漏れが起きるため、1回の実行で両方を書く。
 *
 * 【影響範囲】
 * `docs/00_プロジェクト管理・ガバナンス/decisions/DL-0000_process-option.md`
 * （新規作成。既存の場合は上書き＝再選択を許容する）、
 * `.claude-state/process-option.json`。
 *
 * 【前提条件・制約】
 * DL-0000 は本スクリプト専用の予約IDであり、`new-decision.js` の通常連番採番
 * （0000を除外する仕様）とは独立して扱う。
 *
 * 【使い方】
 *   node process-option.js --mode=prototype-driven --decided-by=ユーザー --roles=consultant
 *   node process-option.js --mode=requirements-first --contract-form="準委任・中間検収あり" \
 *        --reason="契約上、要件定義書が中間検収物として指定されているため" \
 *        --scope="プロジェクト全体"
 *
 * 【契約】
 * 対象外と判定した（coderの一次判定、PMへ報告）。DL-0000と`process-option.json`の
 * 2ファイルを同一操作内で同期して書くだけの単純な処理であり、複数エントリを
 * 横断集計・解釈する判定ロジックを持たない。両者の整合性チェック（16.6節(b)〜(c)に
 * 近い性質）は`decision-check/scripts/check.js`の`computeProcessOption`側の責務で
 * あり、本ファイルではない。
 */

const fs = require('fs');
const path = require('path');
const { stringifyFrontmatter } = require('../../../lib/frontmatter');
const { decisionsDir } = require('../../../lib/decisions');

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
  const mode = args.mode;
  if (!['prototype-driven', 'requirements-first'].includes(mode)) {
    console.error('[process-option] --mode は prototype-driven|requirements-first のいずれかを指定すること');
    process.exit(1);
  }
  if (mode === 'requirements-first' && !args.reason) {
    console.error(
      '[process-option] requirements-first を選択する場合 --reason（選択理由）は必須（01文書4.10節「選択の記録」MUST）'
    );
    process.exit(1);
  }

  const cwd = process.cwd();
  const dir = decisionsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'DL-0000_process-option.md');
  const decidedAt = args['decided-at'] || new Date().toISOString();

  const fm = {
    決定ID: 'DL-0000',
    決定内容:
      mode === 'prototype-driven'
        ? '標準プロセス（ハリボテ駆動＋ローンチ時リバース）を適用する'
        : '要件定義前倒しオプション（requirements-first）を適用する',
    不可逆度: '高',
    状態: '確定',
    決定日時: decidedAt,
    決定者: args['decided-by'] || '(未記載)',
    決定に関与したロール: args.roles || '',
    影響レーン: 'A, B, C',
    対象カテゴリ: '前倒しオプション',
    モード: mode,
    契約形態: args['contract-form'] || '',
    適用範囲: args.scope || 'プロジェクト全体',
  };

  const bodyParts = [
    '# DL-0000: プロセス・オプション選択',
    '',
    '## 決定内容',
    fm['決定内容'],
    '',
    '## 根拠',
    args.reason || '(未記載。標準選択時も選定理由を残すことを推奨する)',
    '',
  ];
  if (mode === 'requirements-first') {
    bodyParts.push(
      '## 残課題: 二重メンテのリスク（01文書4.10節）',
      'Zone1完了時点で検収・確定した要件定義書と、Zone2以降で実装が進むにつれて生じる' +
        '実物との乖離という二重メンテナンスのリスクを負う。Zone3のローンチ時リバースにおいて、' +
        '前倒し版の要件定義書と実物から生成したas-built版との差分検査を必ず実施する（MUST、02文書9.5節）。',
      ''
    );
  }
  const body = bodyParts.join('\n') + '\n';
  fs.writeFileSync(filePath, stringifyFrontmatter(fm, body), 'utf-8');

  const stateDir = path.join(cwd, '.claude-state');
  fs.mkdirSync(stateDir, { recursive: true });
  const mirrorPath = path.join(stateDir, 'process-option.json');
  fs.writeFileSync(
    mirrorPath,
    JSON.stringify({ mode, decided_by: 'DL-0000', since: decidedAt }, null, 2) + '\n',
    'utf-8'
  );

  console.log(
    JSON.stringify(
      {
        file: path.relative(cwd, filePath),
        mirror: path.relative(cwd, mirrorPath),
        mode,
      },
      null,
      2
    )
  );
}

main();
