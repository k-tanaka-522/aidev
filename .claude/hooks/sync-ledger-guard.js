#!/usr/bin/env node
'use strict';

/**
 * sync-ledger-guard.js（新設、版1.5、M2実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#10・10.1.5節
 *
 * 【イベント】PostToolUse（Edit|Write,
 *   `docs/00_.../00-02_HBトレーサビリティ台帳.md`,
 *   `docs/00_.../00-03_バッチトレーサビリティ台帳.md`）
 * 【検知内容】`00-02`/`00-03`への追記（`HB-ID`/`API-ID`/`BAT-ID`の登録）に
 *   対応する `docs/00_.../00-05_同期点記録台帳.md` の追記が同一操作内に
 *   伴っていない場合を検知する。
 * 【動作】警告のみ（exit 0）。`.claude-state/decision-warnings.json` へ
 *   `{type: "sync_ledger_missing", ...}` を追記し8.2.5節の消し込み機構を共用する。
 * 【実装方針】01文書8.1節が同期点合意の証跡をIPA準拠主張の成立条件とするため、
 *   単なる注意書きに留めず検知機構化した（10.1.5節）。
 *
 * 【目的・理由】
 * `00-05`同期点記録台帳は`gate-check`が01文書7.6節の同期点由来分母の出典として
 * 読む唯一の台帳であるため、`00-02`/`00-03`への追記と同時に更新されないと
 * ゲート判定の分母が欠落する。
 * 【影響範囲】
 * `docs/00_プロジェクト管理・ガバナンス/00-02_HBトレーサビリティ台帳.md`、
 * `docs/00_プロジェクト管理・ガバナンス/00-03_バッチトレーサビリティ台帳.md` へのEdit|Write。
 * 【前提条件・制約】
 * - `sync-check.js`（M2実装）は00-02/00-03への追記と00-05への追記を同一プロセス実行内で
 *   ほぼ同時に行うため、正常系では両ファイルのmtimeの差はごく短時間になる。本フックは
 *   `decision-log-guard.js`（段1）と同じ「直近更新時刻の近接判定」方式を採用し、既定の
 *   判定窓を5分（環境変数 `SYNC_LEDGER_GUARD_WINDOW_MS` で上書き可）とした。
 *   `sync-check.js`経由の正常な追記であれば数秒〜数十ms差に収まるため誤検知しないが、
 *   人間が`00-02`/`00-03`を手動編集した場合（`sync-check`を経由しない直接Write）は
 *   `00-05`が更新されないため確実に警告される（意図した検知対象）。
 * - settings.json未登録のM0〜M2段階では発火しない（M3でsettings.jsonが昇格するまで無害）。
 *
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
 */

const fs = require('fs');
const path = require('path');
const { readWarnings, writeWarnings, addWarning } = require('../lib/warnings-store');
const { ledger0005Path } = require('../lib/ledger-paths');

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

/**
 * 対象パスが00-02/00-03台帳かどうかを判定する。
 * `architecture-patterns.js`（decision-log-guard.js等が使う分類器）とは検知対象パターンが
 * 異なる（あちらは「アーキテクチャ関連変更」、こちらは「トレーサビリティ台帳への追記」）ため
 * 専用の判定を持つ。
 */
function classifyLedger(relPath) {
  const p = String(relPath).replace(/\\/g, '/');
  if (p.endsWith('00-02_HBトレーサビリティ台帳.md')) return '00-02';
  if (p.endsWith('00-03_バッチトレーサビリティ台帳.md')) return '00-03';
  return null;
}

/** 00-05台帳が直近windowMs以内に更新されたかを確認する。 */
function ledger0005RecentlyUpdated(cwd, windowMs) {
  const p = ledger0005Path(cwd);
  try {
    const stat = fs.statSync(p);
    return Date.now() - stat.mtimeMs <= windowMs;
  } catch (_err) {
    return false;
  }
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

  const ledger = classifyLedger(relPath);
  if (!ledger) {
    process.exit(0);
  }

  const windowMs = Number(process.env.SYNC_LEDGER_GUARD_WINDOW_MS || 5 * 60 * 1000);
  if (ledger0005RecentlyUpdated(cwd, windowMs)) {
    process.exit(0);
  }

  const data = readWarnings(cwd);
  const entry = addWarning(data, {
    type: 'sync_ledger_missing',
    path_or_task: relPath,
    extra: { ledger, agent_type: payload.agent_type || null },
  });
  writeWarnings(data, cwd);

  console.error(
    `[sync-ledger-guard] ${relPath} への追記を検知しましたが、` +
      `直近${Math.round(windowMs / 60000)}分以内の00-05同期点記録台帳の更新が見つかりません。`
  );
  console.error(
    `[sync-ledger-guard] sync-checkを経由せず直接編集した可能性があります。00-05への追記を確認してください（警告のみ・ブロックしません）。 warning_id=${entry.id}`
  );

  process.exit(0);
}

main();
