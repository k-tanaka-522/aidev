#!/usr/bin/env node
'use strict';

/**
 * lint-guard.js（M3本実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#1・10.1.3節（版1.8で事後検知を追加）
 *
 * 【イベント】PostToolUse（Edit|Write）
 * 【検知内容】
 *   1. `prototypes/reports/**` への新規HTML追加時は`REPORT_ID_INDEX.md`への、
 *      それ以外の新規画面HTML（`prototypes/*.html`、`index.html`/`design-system.html`を
 *      除く）は`SCREEN_ID_INDEX.md`への登録漏れを検知する。
 *   2. 【版1.8で追加】索引ファイル（`SCREEN_ID_INDEX.md`/`REPORT_ID_INDEX.md`）への
 *      追記を検知した際、登録先の索引ファイルと登録対象HTMLの実パス
 *      （`prototypes/reports/**`の内外）が整合しているかを突合する事後検知
 *      （帳票/画面の取り違え検知、10.1.3節）。
 * 【動作】exit 2（ブロック）
 *
 * 【影響範囲】
 * `prototypes/**` への Edit|Write 操作全般（PostToolUse）。
 *
 * 【前提条件・制約】
 * - 検知1の判定は`.claude/lib/architecture-patterns.js`の`classifyPath`
 *   （'report-html'|'screen-html'|null）を流用し、`decision-log-guard.js`等と分類基準を
 *   共有する（実装の重複・食い違いを避ける）。
 * - 登録漏れ判定は「対象ファイル自体を書いたそのWrite/Edit操作の時点」で行う。
 *   `mockup-generate`（登録スクリプト`register-mockup.js`）はHTML作成の**後**に
 *   実行される運用のため、HTML新規作成の直後は必ずこのフックが「未登録」を検知して
 *   `exit 2`になる（設計上の想定どおり。Designerは本フックのエラーメッセージを見て
 *   `register-mockup.js`を実行する、という運用が前提。02文書7.3節#1はこれを
 *   「登録漏れの警告」として`exit 2`と明記しており、Write自体の巻き戻しは行わない
 *   ＝PostToolUseフックの一般的な性質として、既に書かれたファイルは残ったまま
 *   次ターンでの是正をエージェントに促す形になる）。
 * - 検知2（取り違え検知）は`SCREEN_ID_INDEX.md`/`REPORT_ID_INDEX.md`自体への
 *   Edit|Write（`register-mockup.js`によるappendRow）を対象にする。台帳の「ファイル」列
 *   を読み、各行の登録先索引と実パスの`prototypes/reports/**`内外が一致するかを検査する。
 * - settings.json未登録のM3段階では発火しない。動作確認は
 *   `echo '<JSON>' | node lint-guard.js` で行う。
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
const { classifyPath, PROTOTYPE_EXCLUDE } = require('../lib/architecture-patterns');
const { readTableAsObjects, findTable } = require('../lib/markdown-table');
const { screenIndexPath, reportIndexPath } = require('../lib/ledger-paths');

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

/** 台帳（indexPath）内に relFile を「ファイル」列として持つ行があるかを確認する。 */
function isRegistered(indexPath, relFile) {
  const rows = readTableAsObjects(indexPath);
  return rows.some((r) => r['ファイル'] === relFile);
}

/**
 * 検知1: 新規ハリボテHTML自体への書込を検知した場合、対応する索引への登録漏れを検査する。
 */
function checkNewMockupRegistration(cwd, relPath) {
  const kind = classifyPath(relPath);
  if (kind !== 'report-html' && kind !== 'screen-html') {
    return null; // 対象外（infra/contract/外部連携等、または index.html等の除外対象）
  }

  const isReport = kind === 'report-html';
  const indexPath = isReport ? reportIndexPath(cwd) : screenIndexPath(cwd);
  const indexRelPath = path.relative(cwd, indexPath).replace(/\\/g, '/');

  if (isRegistered(indexPath, relPath)) {
    return null; // 登録済み
  }

  return (
    `[lint-guard] ${relPath} は${isReport ? '帳票' : '画面'}ハリボテですが、` +
    `${indexRelPath} に未登録です。mockup-generate/register-mockup.js（--file=${relPath}）で登録してください（10.1.1節・10.1.3節）。`
  );
}

/**
 * 検知2（版1.8）: SCREEN_ID_INDEX.md / REPORT_ID_INDEX.md 自体への追記を検知した場合、
 * 索引の各行の「ファイル」列が、登録先索引の想定するディレクトリ配下と一致しているかを
 * 突合する（帳票/画面の取り違え事後検知）。
 */
function checkIndexConsistency(cwd, relPath, absTarget) {
  const screenIdx = path.relative(cwd, screenIndexPath(cwd)).replace(/\\/g, '/');
  const reportIdx = path.relative(cwd, reportIndexPath(cwd)).replace(/\\/g, '/');

  let expectUnderReports;
  if (relPath === screenIdx) {
    expectUnderReports = false;
  } else if (relPath === reportIdx) {
    expectUnderReports = true;
  } else {
    return null; // 索引ファイルへの書込ではない
  }

  let content;
  try {
    content = fs.readFileSync(absTarget, 'utf-8');
  } catch (_err) {
    return null;
  }
  const { header, rows } = findTable(content);
  if (!header) return null;
  const fileColIdx = header.indexOf('ファイル');
  if (fileColIdx === -1) return null;

  const mismatches = [];
  for (const row of rows) {
    const relFile = row[fileColIdx];
    if (!relFile) continue;
    const base = path.basename(relFile);
    if (PROTOTYPE_EXCLUDE.has(base)) continue;
    const underReports = /^prototypes\/reports\//.test(relFile);
    if (underReports !== expectUnderReports) {
      mismatches.push(relFile);
    }
  }

  if (mismatches.length === 0) return null;

  return (
    `[lint-guard] ${relPath}（${expectUnderReports ? 'RPT-ID' : 'SCR-ID'}台帳）に、` +
    `実パスが${expectUnderReports ? 'prototypes/reports/配下でない' : 'prototypes/reports/配下の'}` +
    `帳票/画面が取り違えて登録されています: ${mismatches.join(', ')}（10.1.3節、帳票/画面の取り違え事後検知）。`
  );
}

function main() {
  const payload = readHookPayload();
  const cwd = process.cwd();

  const filePath = payload && payload.tool_input && payload.tool_input.file_path;
  if (!filePath) process.exit(0);

  const absTarget = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const relPath = path.relative(cwd, absTarget).replace(/\\/g, '/');

  if (!/^prototypes\//.test(relPath)) {
    process.exit(0);
  }

  const errors = [];

  const regError = checkNewMockupRegistration(cwd, relPath);
  if (regError) errors.push(regError);

  const consistencyError = checkIndexConsistency(cwd, relPath, absTarget);
  if (consistencyError) errors.push(consistencyError);

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    process.exit(2);
  }

  process.exit(0);
}

main();
