#!/usr/bin/env node
'use strict';

/**
 * next-nfr-id.js（decide Skill 同梱スクリプト、M2で新設）
 *
 * 【目的・理由】
 * `NFR-{連番}`はZone0決定ログの非機能要件エントリ確定時にConsultant/Infra-Architectが
 * 付与する（01文書4.4.5節、02文書10.1.1節）。M1時点の`new-decision.js`は`--nfr-id`を
 * 受け取るのみで採番ロジックを持たず、呼び出し側（LLM）が手で連番を管理する必要があり
 * ID重複のリスクがあった。M2でこの採番経路（6種ID体系のうち残っていた1つ）を実装する。
 *
 * 【影響範囲】
 * 読み取りのみ（`decisions/DL-*.md`のfrontmatter `NFR-ID` フィールドを走査する）。
 * `new-decision.js`自体は変更しない（既存呼び出し規約を壊さないため、本スクリプトは
 * 「次のNFR-IDを教えてくれるツール」として追加し、`decide`実行者が
 * `--nfr-id=$(node next-nfr-id.js)`のように連携する運用とする）。
 *
 * 【前提条件・制約】
 * `decisions/`配下のfrontmatterを全走査するため、決定ログ件数が多い場合は相応の
 * I/Oが発生するが、Zone0〜2の決定ログ件数は数百件程度を想定しており実用上問題ない
 * （`decision-check`の`check.js`も同様の全走査を行っている）。
 *
 * 【使い方】
 *   node next-nfr-id.js
 *   → "NFR-0001" のように次のIDのみを標準出力する
 *
 * 【契約】
 * 対象外と判定した（coderの一次判定、PMへ報告）。既存の最大連番+1を返すだけの
 * ID採番ユーティリティであり（`.claude/lib/issue-ledger.js`の`nextIssueId`等と
 * 同型）、Gate判定の分母・分子集計そのもの（16.6節(a)）ではない。入力形式のバージョン
 * 分岐・fail-closed・無効化と正常0件の区別不能性のいずれにも該当しない。
 */

const { listDecisionFiles } = require('../../../lib/decisions');
const { nextIdFromTexts } = require('../../../lib/id-registry');

function main() {
  const cwd = process.cwd();
  const files = listDecisionFiles(cwd);
  const texts = files.map((f) => `NFR-ID: ${f.data['NFR-ID'] || ''}`);
  const next = nextIdFromTexts('NFR', texts);
  console.log('NFR-' + next);
}

main();
