#!/usr/bin/env node
'use strict';

/**
 * architecture-patterns.js（決定ログ機構 共有ライブラリ）
 *
 * 【目的・理由】
 * decision-log-guard.js（段1）と decision-stop-check.js（段2）はいずれも
 * 「アーキテクチャに関わるファイル変更」（02文書7.3節#5: `infra/**`,
 * `decisions/contracts/**`, `prototypes/**` の新規画面/帳票ファイル、外部連携設定ファイル等）
 * を検知対象とする。判定ロジックが2つのhookで食い違うと警告の一貫性が崩れるため、
 * 1箇所に集約する。
 *
 * 【影響範囲】
 * `.claude/hooks/decision-log-guard.js`、`.claude/hooks/decision-stop-check.js`。
 *
 * 【前提条件・制約 / 設計書への申し送り事項】
 * 設計書は「外部連携設定ファイル等」とのみ記載し、具体的なファイル名パターンを
 * 与えていない（`ops-item-guard.js` の検知パターンが04文書へ明示的に発注されている
 * のとは対照的に、こちらは02文書15章の要検証項目にも計上されていない）。
 * 本実装は暫定パターン（ディレクトリ名に integrations/external を含む、
 * webhook を含む、`.env.external` 拡張子）を採用した。これはPMへの報告対象の
 * 設計不足として扱う。
 */

const path = require('path');

const PROTOTYPE_EXCLUDE = new Set(['index.html', 'design-system.html']);

/**
 * 相対パス（リポジトリルートからのスラッシュ区切りパス）を分類する。
 * 該当しない場合は null を返す。
 *
 * @returns {'infra'|'contract'|'report-html'|'screen-html'|'external-integration'|null}
 */
function classifyPath(relPath) {
  const p = String(relPath).replace(/\\/g, '/').replace(/^\.\//, '');

  if (/^infra\//.test(p)) return 'infra';

  if (/^docs\/00_プロジェクト管理・ガバナンス\/decisions\/contracts\//.test(p)) {
    return 'contract';
  }

  if (/^prototypes\/reports\/[^/]+\.html$/.test(p)) return 'report-html';

  if (/^prototypes\/[^/]+\.html$/.test(p)) {
    const base = path.basename(p);
    if (!PROTOTYPE_EXCLUDE.has(base)) return 'screen-html';
  }

  // 【暫定パターン。上記コメント参照】外部連携設定ファイル
  if (/(^|\/)(integrations?|external)\//i.test(p)) return 'external-integration';
  if (/webhook/i.test(p)) return 'external-integration';
  if (/\.env\.external$/i.test(p)) return 'external-integration';

  return null;
}

module.exports = { classifyPath, PROTOTYPE_EXCLUDE };
