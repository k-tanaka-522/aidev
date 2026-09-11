#!/usr/bin/env node
'use strict';

/**
 * task-payload-observer.js（M3新設・観測専用フック）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 15章#23・14.2節M3完了条件
 * （「実機でTask完了ペイロードのフィールド名を確認する」）
 *
 * 【イベント】PostToolUse（`Task`）
 * 【検知内容】なし（検知・判定は一切行わない）。
 * 【動作】常に exit 0。受け取ったペイロードをそのまま
 *   `.claude-state/hook-payload-samples/task-{ISO8601風タイムスタンプ}-{連番}.json`
 *   へ保存するだけの、副作用のない観測専用フックである。
 *
 * 【目的・理由】
 * `task-boundary-guard.js`（段3、8.2.4節）はTask完了報告テキストがPostToolUse(Task)
 * ペイロードのどのフィールドに載るかを実機確認できていない（15章#23、版1.7で追加）。
 * フィールド名を誤ると`task-boundary-guard.js`は常に誤検知し続けるため、まず実機の
 * ペイロード構造を無害な形で記録し、確認後に`task-boundary-guard.js`側の抽出ロジックを
 * 確定する必要がある。本フックはその実機観測のためだけに新設する（7.3節の10 hookとは
 * 別枠。恒久的な機構ではなく、フィールド名確定後は`.claude/settings.json`からの登録を
 * 外すことを想定した診断用フックである）。
 *
 * 【影響範囲】
 * `.claude-state/hook-payload-samples/` への新規ファイル作成のみ。既存ファイルの変更・
 * 削除は一切行わない。他のいかなる処理もブロックしない（常にexit 0）。
 *
 * 【前提条件・制約】
 * - 本フックは`.claude/settings.json`（M3の安全な有効化版）にのみ登録する。ブロックする
 *   hookではないため「安全な有効化」の対象に含めてよい、というPM指示（M3委譲）に従う。
 * - 【重要な制約・PMへの報告事項】本フックは「これから発生するTask呼び出し」しか観測
 *   できない。既に完了したTask呼び出し（例えば、本フックを登録する変更をコミットする前に
 *   完了していたTask、あるいは本フック自身を実装しているサブエージェント自身の
 *   Task完了）は原理的に観測できない。後者は「フックがsettings.jsonに登録された状態で
 *   起動された後続のTask呼び出しの完了時」にのみ発火するため、フックを実装した
 *   サブエージェント自身のセッションが終了する瞬間（＝PMからみたTask完了）を、
 *   当のサブエージェント自身が確認することはできない（セッションが先に終わるため）。
 *   PMが後続で何らかのサブエージェントをTask起動し、その完了後に本ディレクトリを
 *   確認する必要がある。
 * - 書込に失敗しても（ディレクトリ作成失敗等）例外を投げず、必ずexit 0で終了する
 *   （観測専用フックが本来の処理を妨げてはならないため）。
 */

const fs = require('fs');
const path = require('path');

const SAMPLES_DIR_RELATIVE = path.join('.claude-state', 'hook-payload-samples');

function readRawStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (_err) {
    return '';
  }
}

function main() {
  const cwd = process.cwd();
  const raw = readRawStdin();

  try {
    const dir = path.join(cwd, SAMPLES_DIR_RELATIVE);
    fs.mkdirSync(dir, { recursive: true });

    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const rand = Math.random().toString(36).slice(2, 8);
    const filePath = path.join(dir, `task-${ts}-${rand}.json`);

    // 受け取った生JSON文字列をそのまま保存する（パース失敗時のためにpretty-print
    // せず生データを優先する。パース可能なら整形版も併記する）。
    let pretty = null;
    try {
      pretty = JSON.stringify(JSON.parse(raw), null, 2);
    } catch (_err) {
      pretty = null;
    }

    const content = JSON.stringify(
      {
        observed_at: new Date().toISOString(),
        raw_stdin: raw,
        parsed: pretty ? JSON.parse(pretty) : null,
        top_level_keys: pretty ? Object.keys(JSON.parse(pretty)) : [],
      },
      null,
      2
    );
    fs.writeFileSync(filePath, content + '\n', 'utf-8');
  } catch (_err) {
    // 観測専用フックは本来の処理を妨げてはならない。書込失敗は握りつぶす。
  }

  process.exit(0);
}

main();
