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
 * 【`00-01`のスキーマ: 02文書9.4.3節（版1.9）の9列スキーマへ追随済み（本タスクで是正）】
 * `docs/00_プロジェクト管理・ガバナンス/00-01_成果物構成カタログ.md`の列定義は
 * 02文書9.4.3節（版1.9）が正本化した9列スキーマ
 *   `| 文書番号 | 文書名 | 生成ゾーン | 生成主体 | 生成方式 | 必須区分 | IPA対応 | 想定分量 | 生成状態 |`
 * （「生成状態」列は`未生成|生成中|as-built生成済|前倒し作成|省略`の5値）を一次スキーマとする。
 * 旧M3実装はこの節が未定義だった時点で暫定採用した5列スキーマ
 *   `| 項番 | 成果物名 | 区分（02〜07） | 状態（未生成/生成済み/対象外） | 生成日時 |`
 * のままだったため、9列スキーマのカタログを渡すと列が一致せず**検査そのものが黙って
 * スキップされる**不整合があった（実測確認済み、`.claude/lib/zone-gate-conditions.js`の
 * `checkCatalogSection`と同種の不整合。PMへの報告事項）。本実装は9列スキーマを優先して
 * 検査し、旧5列スキーマのカタログを検知した場合は後方互換で検査を継続しつつ
 * `console.error`で移行が必要な旨を明示的に警告する（黙ってスキップしない）。
 * いずれの列構成にも一致しない場合のみ、検査を行わず終了する（誤検知よりも見逃しを
 * 優先する安全側設計、旧実装からの方針を維持）。
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
    process.exit(0); // テーブルが見当たらない。誤検知を避け終了する。
  }

  // `文書番号`（例: "06-01"）から区分（"06"等の2桁）を前方一致で導出する。
  // `.claude/lib/zone-gate-conditions.js`の`deriveSectionFromDocNo`と同じロジック
  // （このhookは軽量に保つため独立した子プロセスとして起動されるhookの性質上、
  // 重い依存を持つ`zone-gate-conditions.js`を直接requireせず同ロジックを複製する）。
  function deriveSectionFromDocNo(docNo) {
    const m = /^(\d{2})-/.exec(String(docNo || '').trim());
    return m ? m[1] : '';
  }

  const idxDocNo9 = header.indexOf('文書番号');
  const idxDocName9 = header.indexOf('文書名');
  const idxStatus9 = header.indexOf('生成状態');

  let ungenerated;
  let lines;

  if (idxStatus9 !== -1) {
    // 9列スキーマ（02文書9.4.3節・版1.9が正本）。「生成状態」が厳密に`未生成`の行のみを
    // 警告する（`生成中`は着手済みのため対象外。従来実装の「未生成のみ検知する」意図を
    // 5値スキーマへそのまま引き継ぐ）。
    ungenerated = rows.filter((r) => (r[idxStatus9] || '').trim() === '未生成');
    if (ungenerated.length === 0) process.exit(0);
    lines = ungenerated.map((r) => {
      const docNo = idxDocNo9 !== -1 ? r[idxDocNo9] : '?';
      const name = idxDocName9 !== -1 ? r[idxDocName9] : '?';
      const kubun = deriveSectionFromDocNo(docNo) || '?';
      return `  - [${docNo}] ${name}（区分:${kubun}）`;
    });
  } else {
    // 9列スキーマの`生成状態`列が無い。M3暫定の5列スキーマ（後方互換）かを確認する。
    const idxTask = header.indexOf('項番');
    const idxName = header.indexOf('成果物名');
    const idxKubun = header.indexOf('区分（02〜07）');
    const idxStatusLegacy = header.indexOf('状態（未生成/生成済み/対象外）');
    if (idxStatusLegacy === -1) {
      process.exit(0); // いずれのスキーマにも一致しない。誤検知回避のため終了する。
    }
    console.error(
      '[artifact-emptiness-guard] 00-01成果物構成カタログが旧スキーマ（5列、M3暫定）のまま' +
        'です。02文書9.4.3節（版1.9）が定める9列スキーマへの移行が必要です' +
        '（互換ロジックで検査は継続します。黙ってスキップしません）。'
    );
    ungenerated = rows.filter((r) => (r[idxStatusLegacy] || '').includes('未生成'));
    if (ungenerated.length === 0) process.exit(0);
    lines = ungenerated.map((r) => {
      const task = idxTask !== -1 ? r[idxTask] : '?';
      const name = idxName !== -1 ? r[idxName] : '?';
      const kubun = idxKubun !== -1 ? r[idxKubun] : '?';
      return `  - [${task}] ${name}（区分:${kubun}）`;
    });
  }

  // 06_移行・導入は抑制対象から除外され別枠で扱われるが、`suppressed`がfalseの時点で
  // 既に全区分を警告対象にしているため、ここでは区分によらず一律に警告する。
  console.error(
    `[artifact-emptiness-guard] docs/02〜07 に未生成のIPA成果物が ${ungenerated.length} 件あります` +
      `（zone=${zoneState.zone}, mode=${mode}）:`
  );
  for (const line of lines) console.error(line);

  process.exit(0);
}

main();
