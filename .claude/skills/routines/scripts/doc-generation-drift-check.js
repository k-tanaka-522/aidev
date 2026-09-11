#!/usr/bin/env node
'use strict';

/**
 * doc-generation-drift-check.js（routines Skill 同梱スクリプト、M5新設）
 *
 * 【目的・理由】
 * 02文書12章のRoutines一覧が挙げる「文書陳腐化チェック（reverse-docの差分検出モードを
 * 定期実行）」「生成可能性検査（reverse-doc差分検査モードの定期実行、四半期、03文書5.4節）」
 * の2エントリは、いずれも9.3節が定める「差分検査モード」（`reverse-doc`を引数無しで
 * 起動した場合、生成せず既存文書と実装のズレの一覧のみを出す）を指している。
 * M4は`.claude/lib/verify.js`に(1)逆差分検出（`computeReverseDiff`）、(2)生成漏れ検査
 * （`computeGenerationGaps`）を既に実装済みであり、これは9.3節の差分検査モードの
 * primitiveそのものである（`gate-check/scripts/verify-reverse.js`が薄いラッパーとして
 * 存在する）。文書陳腐化チェック・生成可能性検査の両エントリを別々に再実装すると
 * 抽出基盤の二重実装になるため（9.1.1節・10.3節が既に確立した「抽出基盤は共有してよい」
 * 方針、SHOULD）、本スクリプトを両エントリの実行主体として共用する。
 *
 * 【影響範囲】読み取りのみ（`.claude/lib/verify.js`が読む範囲と同一）。
 */

const { computeReverseDiff, computeGenerationGaps } = require('../../../lib/verify');

function main() {
  const cwd = process.cwd();
  const reverseDiff = computeReverseDiff(cwd);
  const generationGaps = computeGenerationGaps(cwd);

  console.log(
    JSON.stringify(
      {
        status: 'done',
        note: '02文書9.3節の差分検査モード（reverse-docを引数無しで起動した場合の挙動）を、Routine手動実行用に切り出したもの。「文書陳腐化チェック」「生成可能性検査」の両Routineエントリが本スクリプトを共用する。',
        reverseDiffZero: reverseDiff.totalOnlyInImpl === 0,
        reverseDiff,
        generationGapsZero: generationGaps.length === 0,
        generationGaps,
      },
      null,
      2
    )
  );
}

main();
