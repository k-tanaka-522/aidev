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
  prototypesDir,
  screenIndexPath,
  reportIndexPath,
  reportsDir,
  mockupSnapshotsDir,
};
