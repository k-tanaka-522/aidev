#!/usr/bin/env node
'use strict';

/**
 * artifact-emptiness-guard.js（M0雛形）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 7.3節#8・9章・8.7節・4.2.1節
 *
 * 【イベント】定期実行（Routine）または PostToolUse
 *   （`docs/00-01_成果物構成カタログ.md` の完全性走査）
 * 【検知内容】`docs/02〜07`（01を除く。区分別のゾーン対応は4.2.1節の一覧表を参照。
 *   06_移行・導入はこの抑制対象から除外し別枠で扱う）のIPA成果物カタログ上の
 *   未生成項目。
 * 【動作】
 *   - `.claude-state/current-zone.json` の `zone` が3未満、かつ
 *     `.claude-state/process-option.json` の `mode` が `prototype-driven`（標準）
 *     なら**検知そのものを抑制**（通知しない）
 *   - `zone` が3以上、または `mode` が `requirements-first`（前倒し例外）なら
 *     通常どおり警告する
 * 【実装方針】M4で実装（リバース生成エンジンと同時期）。
 *
 * 【目的・理由】
 * v2最大の設計変更点である「Zone3まで docs/02〜07 が空であることを正常状態とする」
 * （2.2節・3.2節）を、hookが誤って警告しないよう機構的に担保する。
 * 【影響範囲】
 * `docs/02_要件定義/`〜`docs/07_運用・保守/`（`docs/01`は成果物を持たないため対象外、
 * `docs/00`は常時蓄積が正常であるため対象外）。
 * 【前提条件・制約】
 * `docs/06_移行・導入/` は「Zone3まで空が正常」の集合から除外され、
 * `GZ3`到達直前に`gate-check`が個別に確認する（4.2.1節備考）。
 * settings.json未登録のM0段階では発火しない。
 */

const fs = require('fs');

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
  const _payload = readHookPayload();

  // <!-- M4で実装: current-zone.json/process-option.jsonの参照、
  //      00-01成果物構成カタログ.mdの未生成項目走査、抑制条件の判定ロジック -->

  process.exit(0);
}

main();
