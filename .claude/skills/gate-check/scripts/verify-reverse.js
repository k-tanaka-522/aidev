#!/usr/bin/env node
'use strict';

/**
 * verify-reverse.js（gate-check Skill 同梱スクリプト、M4新設）
 *
 * 【目的・理由】
 * `gate-check`本体（GO/NG/HOLD判定ロジック）はM3の実装対象として引き続き
 * `<!-- M3で実装 -->`のまま残っている（`.claude/skills/gate-check/SKILL.md`参照。
 * 本タスク（M4）の委譲範囲外のため完成させない）。しかし02文書14.2節M4の完了条件は
 * 「逆差分0件を確認」「生成漏れ検査が機能するか」を明示的に要求するため、
 * その判定に必要な**primitiveな検査ロジック**（`.claude/lib/verify.js`）をM4のうちに
 * 提供し、本スクリプトはそれをCLIから呼び出す薄いラッパーとする。GZ3のGO/NG判定
 * ロジック自体（差し戻しカウント、GZ{0,2,3}-99への記録等）はM3/gate-check本実装側で
 * 本スクリプトの出力を入力として利用することを想定する（統合はスコープ外）。
 *
 * 【使い方】
 *   node verify-reverse.js
 *
 * 【契約】
 * 対象内（委譲、部分カバー）と判定した（coderの一次判定、PMへ報告）。本ファイル自体は
 * JSON整形の薄いラッパーであり判定ロジックを持たないが、呼び出す`computeGenerationGaps`
 * （`.claude/lib/verify.js`）は既存の登録済み契約の対象になっている（`.claude/contracts/
 * MANIFEST.json`参照。16.6節(d)(e)相当）。一方、同じ`lib/verify.js`が持つ
 * `computeReverseDiff`は、複数のIDカタログ・実装ファイルを横断して逆差分を集計する
 * 処理であり16.6節(c)に該当しうるが未契約である（`reverseDiffZero`が「逆差分が本当に
 * 0件」なのか「走査が無効化されている」のかを出力だけから区別できるかは未検証であり、
 * (e)にも該当しうる）。この未契約部分についてはapp-architectへの発注として報告する。
 */

const { computeReverseDiff, computeGenerationGaps } = require('../../../lib/verify');

function main() {
  const cwd = process.cwd();
  const reverseDiff = computeReverseDiff(cwd);
  const generationGaps = computeGenerationGaps(cwd);

  const result = {
    reverseDiff,
    reverseDiffZero: reverseDiff.totalOnlyInImpl === 0,
    generationGaps,
    generationGapsZero: generationGaps.length === 0,
  };
  console.log(JSON.stringify(result, null, 2));
}

main();
