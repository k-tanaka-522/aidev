#!/usr/bin/env node
'use strict';

/**
 * path-glob.js（M3新設・共有ライブラリ）
 *
 * 【目的・理由】
 * `role-boundary-guard.js`（7.1.2節）は「許可される書込パス」を `docs/00_.../**`、
 * `decisions/**` のような glob パターンの表として持つ。本プロジェクトには
 * minimatch/micromatch 等の外部依存が導入されていない（package.json 不在、
 * `.claude/lib/frontmatter.js`・`field-extract.js`と同じ制約）ため、本ライブラリで
 * 必要最小限の glob マッチャーを自前実装する。
 *
 * 【影響範囲】
 * `.claude/hooks/role-boundary-guard.js`。将来的に他のパスパターン判定にも流用可能。
 *
 * 【前提条件・制約】
 * - サポートするワイルドカードは `**`（0階層以上、`/`を含む任意文字列）と
 *   `*`（`/`を含まない任意文字列）のみ。`?`・文字クラス（`[abc]`）等は非サポート
 *   （本プロジェクトの許可パス表がこの2種類のみで表現できるため、9.2節・5章冒頭が
 *   `paths` frontmatterについて指摘した「書式は推測せず実装で確認する」の教訓を踏まえ、
 *   サポート範囲を明示的に絞り、曖昧な拡張はしない）。
 * - パス区切りは `/` に正規化されていることを呼び出し側が保証する
 *   （`role-boundary-guard.js`は`path.relative`後に`replace(/\\/g, '/')`する）。
 *
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
 */

/** globパターン文字列を正規表現に変換する。 */
function globToRegExp(glob) {
  let re = '';
  const g = String(glob);
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        re += '.*';
        i++; // 連続する`**`をまとめて1トークンとして消費する
      } else {
        re += '[^/]*';
      }
    } else if ('.+^${}()|[]\\'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

/** globパターンにパス文字列がマッチするかを判定する。 */
function matchGlob(glob, targetPath) {
  return globToRegExp(glob).test(String(targetPath));
}

/** いずれかのglobパターンにマッチするかを判定する。 */
function matchAnyGlob(globs, targetPath) {
  return (globs || []).some((g) => matchGlob(g, targetPath));
}

module.exports = { globToRegExp, matchGlob, matchAnyGlob };
