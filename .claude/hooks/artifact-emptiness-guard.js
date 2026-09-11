#!/usr/bin/env node
'use strict';

/**
 * artifact-emptiness-guard.js（M3本実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#8・9章・8.7節・4.2.1節
 *
 * 【イベント】PostToolUse（`docs/00_プロジェクト管理・ガバナンス/00-01_成果物構成カタログ.md`
 *   の変更箇所のみを差分検査。版1.6で確定）
 * 【検知内容】`docs/02〜07`（01を除く。06_移行・導入はこの抑制対象から除外し別枠で扱う）の
 *   IPA成果物カタログ上の未生成項目。
 * 【動作】
 *   - `.claude-state/current-zone.json` の `zone` が 3 未満（0または1）、かつ
 *     `.claude-state/process-option.json` の `mode` が `prototype-driven`（既定）
 *     なら**検知そのものを抑制**（通知しない、exit 0で無音）
 *   - `zone` が 3 以上（3または4）、または `mode` が `requirements-first` なら
 *     通常どおり警告する（**警告のみ、exit 0**。02文書7.3節#8は他の`exit 2`系hookと違い
 *     明示的な`exit 2`の記載が無く、抑制ロジックの説明に終始するため、本実装は
 *     警告専用hookとして実装する。この解釈をPMへ報告する）。
 *
 * 【PMへの報告事項: `00-01`のスキーマが未定義】
 * 02文書は`00-01_成果物構成カタログ.md`を随所で参照するが、Markdownとしての具体的な
 * 列定義（テーブルスキーマ）をどの節にも与えていない（`current-zone.json`がM2時点で
 * 抱えていたのと同種の設計不足）。本実装は次の**暫定スキーマ**を採用する。
 *   `| 項番 | 成果物名 | 区分（02〜07） | 状態（未生成/生成済み/対象外） | 生成日時 |`
 * `docs/00_プロジェクト管理・ガバナンス/00-01_成果物構成カタログ.md`がこの列構成である
 * ことを前提に実装しており、実際のファイルが存在しない/この形式でない場合は
 * 検査を行わず終了する（誤検知よりも見逃しを優先する安全側設計）。
 *
 * 【影響範囲】
 * `docs/02_要件定義/`〜`docs/07_運用・保守/`（`docs/01`は成果物を持たないため対象外、
 * `docs/00`は常時蓄積が正常であるため対象外）。
 * 【前提条件・制約】
 * - 「変更箇所のみを差分検査」の要求（版1.6）に従い、Writeの場合は`tool_input.content`
 *   （新しいファイル全体）、Editの場合は`tool_input.new_string`（変更差分）のみを対象に
 *   走査する。ペイロードに無ければディスク上の現物を読む（テスト時のフォールバック）。
 * - settings.json未登録のM3段階では発火しない。動作確認は
 *   `echo '<JSON>' | node artifact-emptiness-guard.js` で行う。
 */

const fs = require('fs');
const path = require('path');
const { findTable } = require('../lib/markdown-table');
const { readZoneState } = require('../lib/zone-state');

const CATALOG_RELATIVE_PATH = path.join(
  'docs',
  '00_プロジェクト管理・ガバナンス',
  '00-01_成果物構成カタログ.md'
);

const PROCESS_OPTION_RELATIVE_PATH = path.join('.claude-state', 'process-option.json');

/** `.claude-state/process-option.json` を読む（8.7節）。無ければ既定 `prototype-driven`。 */
function readProcessOption(cwd) {
  try {
    const raw = fs.readFileSync(path.join(cwd, PROCESS_OPTION_RELATIVE_PATH), 'utf-8');
    const data = JSON.parse(raw);
    return data.mode === 'requirements-first' ? 'requirements-first' : 'prototype-driven';
  } catch (_err) {
    return 'prototype-driven';
  }
}

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

function main() {
  const payload = readHookPayload();
  const cwd = process.cwd();

  const filePath = payload && payload.tool_input && payload.tool_input.file_path;
  if (!filePath) process.exit(0);

  const absTarget = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const relPath = path.relative(cwd, absTarget).replace(/\\/g, '/');

  if (relPath !== CATALOG_RELATIVE_PATH.replace(/\\/g, '/')) {
    process.exit(0);
  }

  const zoneState = readZoneState(cwd);
  const mode = readProcessOption(cwd);

  const suppressed = zoneState.zone < 3 && mode === 'prototype-driven';
  if (suppressed) {
    // 検知そのものを抑制する（通知しない）。02文書7.3節#8・2.2節・3.2節が定める
    // 「Zone3まで docs/02〜07 が空であることを正常状態とする」を機構的に担保する。
    process.exit(0);
  }

  const changed =
    (payload.tool_input && payload.tool_input.content) ||
    (payload.tool_input && payload.tool_input.new_string) ||
    (() => {
      try {
        return fs.readFileSync(absTarget, 'utf-8');
      } catch (_err) {
        return null;
      }
    })();

  if (typeof changed !== 'string') {
    process.exit(0);
  }

  const { header, rows } = findTable(changed);
  if (!header) {
    process.exit(0); // 暫定スキーマのテーブルが見当たらない。誤検知を避け終了する。
  }

  const idxTask = header.indexOf('項番');
  const idxName = header.indexOf('成果物名');
  const idxKubun = header.indexOf('区分（02〜07）');
  const idxStatus = header.indexOf('状態（未生成/生成済み/対象外）');
  if (idxStatus === -1) {
    process.exit(0); // 想定と異なるスキーマ。誤検知回避のため終了する。
  }

  const ungenerated = rows.filter((r) => (r[idxStatus] || '').includes('未生成'));
  if (ungenerated.length === 0) {
    process.exit(0);
  }

  // 06_移行・導入は抑制対象から除外され別枠で扱われるが、`suppressed`がfalseの時点で
  // 既に全区分を警告対象にしているため、ここでは区分によらず一律に警告する。
  const lines = ungenerated.map((r) => {
    const task = idxTask !== -1 ? r[idxTask] : '?';
    const name = idxName !== -1 ? r[idxName] : '?';
    const kubun = idxKubun !== -1 ? r[idxKubun] : '?';
    return `  - [${task}] ${name}（区分:${kubun}）`;
  });

  console.error(
    `[artifact-emptiness-guard] docs/02〜07 に未生成のIPA成果物が ${ungenerated.length} 件あります` +
      `（zone=${zoneState.zone}, mode=${mode}）:`
  );
  for (const line of lines) console.error(line);

  process.exit(0);
}

main();
