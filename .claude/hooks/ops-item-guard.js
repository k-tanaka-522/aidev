#!/usr/bin/env node
'use strict';

/**
 * ops-item-guard.js（M3本実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#9、04文書10章#6
 *
 * 【イベント】PostToolUse（Edit|Write, `infra/**` の監視・バックアップ・DR関連IaC
 *   定義ファイル、`src/**` のジョブスケジューラ定義ファイル）
 * 【検知内容】対応する `docs/00_.../00-04_運用項目一覧.md` のエントリが
 *   存在しない変更。
 * 【動作】警告のみ（exit 0）
 *
 * 【PMへの報告事項: 検知対象パターンが未確定（15章#21）】
 * 02文書15章#21は「監視・バックアップ・DR関連IaCファイル・ジョブスケジューラ定義
 * ファイルの具体的な命名規則例は04文書側へ申し送り」としており、本実装時点でも
 * 04文書から具体例は提供されていない。本実装は次の**暫定パターン**を採用する。
 *   - `infra/**` 配下: ファイル名またはパスに `monitor|alarm|cloudwatch|backup|snapshot|
 *     dr|disaster` のいずれか（大小文字無視）を含む
 *   - `src/**` 配下: ファイル名またはパスに `cron|schedule|scheduler|batch|job` の
 *     いずれか（大小文字無視）を含む
 * これは04文書からの正式なパターン提供までの暫定であり、確定次第差し替える必要がある
 * （PMへの報告事項）。
 *
 * 【影響範囲】
 * `infra/**` の監視・バックアップ・DR関連IaC定義ファイル、`src/**` の
 * ジョブスケジューラ定義ファイル。
 * 【前提条件・制約】
 * - `docs/00_.../00-04_運用項目一覧.md`の「根拠（決定ログID or 実装パス）」列
 *   （M2実装済みスキーマ、`.claude/lib`の他台帳と同型）に、変更されたファイルの相対パスが
 *   部分一致で含まれているかを確認する。含まれていなければ警告する。
 * - 決定ログ機構の`decision-warnings.json`（8.2.5節）とは別の関心事であり、02文書は
 *   本hookの警告を`decision-warnings.json`へ永続化するとは明記していないため、
 *   本実装はstderr出力のみに留める（sync-ledger-guard.js等と異なり永続化しない）。
 * - settings.json未登録のM3段階では発火しない。動作確認は
 *   `echo '<JSON>' | node ops-item-guard.js` で行う。
 */

const fs = require('fs');
const path = require('path');
const { readTableAsObjects } = require('../lib/markdown-table');
const { ledger0004Path } = require('../lib/ledger-paths');

/** 【暫定パターン、上部コメント参照】infra/** 配下の監視・バックアップ・DR関連ファイル判定。 */
const INFRA_OPS_PATTERN = /(monitor|alarm|cloudwatch|backup|snapshot|\bdr\b|disaster)/i;
/** 【暫定パターン、上部コメント参照】src/** 配下のジョブスケジューラ定義ファイル判定。 */
const SRC_JOB_PATTERN = /(cron|schedule|scheduler|batch|job)/i;

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

function classify(relPath) {
  if (/^infra\//.test(relPath) && INFRA_OPS_PATTERN.test(relPath)) return 'infra-ops';
  if (/^src\//.test(relPath) && SRC_JOB_PATTERN.test(relPath)) return 'src-job';
  return null;
}

function hasCorrespondingOpsItem(cwd, relPath) {
  const rows = readTableAsObjects(ledger0004Path(cwd));
  const col = '根拠（決定ログID or 実装パス）';
  return rows.some((r) => typeof r[col] === 'string' && r[col].includes(relPath));
}

function main() {
  const payload = readHookPayload();
  const cwd = process.cwd();

  const filePath = payload && payload.tool_input && payload.tool_input.file_path;
  if (!filePath) process.exit(0);

  const absTarget = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const relPath = path.relative(cwd, absTarget).replace(/\\/g, '/');

  const kind = classify(relPath);
  if (!kind) process.exit(0);

  if (hasCorrespondingOpsItem(cwd, relPath)) {
    process.exit(0);
  }

  console.error(
    `[ops-item-guard] ${relPath}（分類: ${kind}）の変更を検知しましたが、` +
      'docs/00_プロジェクト管理・ガバナンス/00-04_運用項目一覧.md に対応するエントリが' +
      '見つかりません（04文書10章#6、警告のみ・ブロックしません）。'
  );

  process.exit(0);
}

main();
