#!/usr/bin/env node
'use strict';

/**
 * ledger-paths.js（M2共有ライブラリ）
 *
 * 【目的・理由】
 * 6種ID体系（SCR/HB/RPT/BAT/API/NFR）の台帳ファイルパスは02文書4.2節・10.1.1節、
 * 列定義は03文書3.2.1節が正本である。パス文字列を各スクリプトに直書きすると、
 * ディレクトリ名（`00_プロジェクト管理・ガバナンス`等の日本語）のタイプミスで
 * 台帳が分裂するリスクがあるため1箇所に集約する（`decisions.js`と同じ設計判断）。
 *
 * 【影響範囲】
 * `prototypes/.claude/skills/{mockup-generate,mockup-update,mockup-extract}/scripts/*.js`、
 * `docs/00_.../decisions/contracts/.claude/skills/contract-design/scripts/*.js`、
 * `.claude/skills/sync-check/scripts/*.js`、`.claude/hooks/sync-ledger-guard.js`。
 *
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
 */

const path = require('path');
const { DECISIONS_DIR_SEGMENTS, decisionsDir } = require('./decisions');

// decisions.js（M1）が既に定義する DECISIONS_DIR_SEGMENTS（['docs', '00_...', 'decisions']）の
// 親2要素を再利用し、govDir（00番ディレクトリ）とdecisionsDirの定義がずれないようにする。
const GOV_DIR_SEGMENTS = DECISIONS_DIR_SEGMENTS.slice(0, -1);

function govDir(cwd = process.cwd()) {
  return path.join(cwd, ...GOV_DIR_SEGMENTS);
}

function contractsDir(cwd = process.cwd()) {
  return path.join(decisionsDir(cwd), 'contracts');
}

function ledger0001Path(cwd = process.cwd()) {
  return path.join(govDir(cwd), '00-01_成果物構成カタログ.md');
}

function ledger0002Path(cwd = process.cwd()) {
  return path.join(govDir(cwd), '00-02_HBトレーサビリティ台帳.md');
}

function ledger0003Path(cwd = process.cwd()) {
  return path.join(govDir(cwd), '00-03_バッチトレーサビリティ台帳.md');
}

function ledger0004Path(cwd = process.cwd()) {
  return path.join(govDir(cwd), '00-04_運用項目一覧.md');
}

function ledger0005Path(cwd = process.cwd()) {
  return path.join(govDir(cwd), '00-05_同期点記録台帳.md');
}

/**
 * 【M5追加】`00-13_課題管理表.md`・`00-14_変更管理台帳.md`は、M4までは各スクリプトが
 * `path.join(govDir(cwd), '00-13_課題管理表.md')`をその都度直書きしていた（`static-analysis-run.js`
 * `generate-rtm.js`・`check-links.js`等）。M5で`impact-analysis`/`ticket-triage`/
 * `gate-check`が新たに`00-14`（変更管理台帳、01文書5.2節手順6・02文書4.2節）へ書く必要が
 * 生じたため、他の台帳と同じくここに集約する（既存の直書き箇所は後方互換のため変更しない）。
 * `00-14`の列スキーマは02文書15章が「03文書の正本化対象から漏れている」と指摘済みの
 * 未確定事項であるため、本実装は`00-13`と同型の暫定スキーマを採用する（PMへ報告）。
 */
function ledger0013Path(cwd = process.cwd()) {
  return path.join(govDir(cwd), '00-13_課題管理表.md');
}

function ledger0014Path(cwd = process.cwd()) {
  return path.join(govDir(cwd), '00-14_変更管理台帳.md');
}

/** 02文書4.2節が挙げるリスク管理台帳。defer登録の確認先（01文書6.5節「分母-分子=defer件数」）。 */
function ledger0012Path(cwd = process.cwd()) {
  return path.join(govDir(cwd), '00-12_リスク管理台帳.md');
}

function prototypesDir(cwd = process.cwd()) {
  return path.join(cwd, 'prototypes');
}

function screenIndexPath(cwd = process.cwd()) {
  return path.join(prototypesDir(cwd), 'SCREEN_ID_INDEX.md');
}

function reportIndexPath(cwd = process.cwd()) {
  return path.join(prototypesDir(cwd), 'REPORT_ID_INDEX.md');
}

function reportsDir(cwd = process.cwd()) {
  return path.join(prototypesDir(cwd), 'reports');
}

function mockupSnapshotsDir(cwd = process.cwd()) {
  return path.join(cwd, '.claude-state', 'mockup-snapshots');
}

module.exports = {
  GOV_DIR_SEGMENTS,
  govDir,
  decisionsDir, // decisions.js からの再エクスポート（利用側の require 先を1本化するため）
  contractsDir,
  ledger0001Path,
  ledger0002Path,
  ledger0003Path,
  ledger0004Path,
  ledger0005Path,
  ledger0012Path,
  ledger0013Path,
  ledger0014Path,
  prototypesDir,
  screenIndexPath,
  reportIndexPath,
  reportsDir,
  mockupSnapshotsDir,
};
