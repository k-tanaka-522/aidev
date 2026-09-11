#!/usr/bin/env node
'use strict';

/**
 * iac-drift-check.js（routines Skill 同梱スクリプト、M5新設）
 *
 * 【目的・理由】
 * 02文書12章のRoutines一覧「IaCドリフト検知」を実装する。
 *
 * 【正直な限界表明（MUST）】
 * 本来のIaCドリフト検知（`cdk diff`/`terraform plan`で実クラウド環境と定義の差分を見る）は
 * 実クラウドAPIへの認証済みアクセスを要し、この実行環境で行うことはできない
 * （タスク指示: 実際にAPIを叩く必要はない、と同じ制約がAWS等のクラウドAPIにも当てはまる）。
 * 本スクリプトは代わりに、02文書9.4.2節が定める「コードフリーズ基準点（`zone3_freeze_tag`）
 * からの`git diff`」の仕組みを`infra/`に限定して転用し、**「コードフリーズ後に`infra/`が
 * 変更されたか」という構造的な代理指標**を提供するに留まる。これは実クラウドとの真の
 * ドリフト（手動コンソール操作によるドリフト等）を検知できない、名ばかりの代替である
 * ことを明示する（実装から真の可否を偽らない、MUST）。
 *
 * 【影響範囲】読み取りのみ（`git diff`、`.claude-state/current-zone.json`）。
 *
 * 【契約】
 * 対象内と判定した（coderの一次判定、PMへ報告）。`zone3_freeze_tag`が未設定の場合に
 * `status: "skipped"`を明示し、`git diff`が「差分0件」だった場合の`status`と区別して
 * いる（下記実装）。これは16.6節(e)「無効化（基準点が無く検査自体が成立していない
 * 状態）と、正しく0件（差分が本当に無い）の区別不能性」に直接該当する挙動であり、
 * 現状の実装は意図的にこれを区別しているが、対応する契約テストが無いため退行検知の
 * 保証が無い。(a)分母・分子集計そのものではないが、本質は登録済み契約の一つ
 * （`.claude/lib/verify.js`の`computeGenerationGaps`向け、`.claude/contracts/
 * MANIFEST.json`参照）と同型の観点である。app-architectへの発注として報告する。
 */

const { execFileSync } = require('child_process');
const { readZoneState } = require('../../../lib/zone-state');

function main() {
  const cwd = process.cwd();
  const zoneState = readZoneState(cwd);

  if (!zoneState.zone3_freeze_tag) {
    console.log(
      JSON.stringify(
        {
          status: 'skipped',
          reason: 'zone3_freeze_tag が未設定（GZ2未GOのため基準点が無い）。真のクラウドドリフト検知はこの環境では実施不可（実クラウドAPIアクセスが必要なため）。',
        },
        null,
        2
      )
    );
    return;
  }

  try {
    const out = execFileSync('git', ['diff', '--stat', `${zoneState.zone3_freeze_tag}..HEAD`, '--', 'infra/'], {
      cwd,
      timeout: 10000,
    }).toString('utf-8');
    console.log(
      JSON.stringify(
        {
          status: 'done',
          baseline: zoneState.zone3_freeze_tag,
          driftDetected: out.trim().length > 0,
          diffStat: out.trim(),
          caveat: 'これはgit差分による代理指標であり、実クラウド環境との真のドリフト（コンソール操作等）は検知できない。',
        },
        null,
        2
      )
    );
  } catch (err) {
    console.log(JSON.stringify({ status: 'unable-to-check', reason: `git diff 実行失敗: ${err.message}` }, null, 2));
  }
}

main();
