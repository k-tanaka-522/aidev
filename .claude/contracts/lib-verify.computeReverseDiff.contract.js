#!/usr/bin/env node
'use strict';

/**
 * 契約ID: CT-0007
 * 対象: .claude/lib/verify.js の computeReverseDiff(cwd)
 * 出典MUST: 02文書10.1節・9.3節「逆差分検出: 実装 vs 合意媒体（ハリボテ・契約モック）の
 *   比較に限定し、実装にのみ存在する要素を検出する」。02文書10.2節はGZ3のGO条件に
 *   「逆差分0件」を含める（MUST）。「0件」という判定結果がGate通過条件に直結するため、
 *   実装側に本当に差分が無い場合と、走査対象ディレクトリが存在しない等で走査自体が
 *   無効化されている場合とを区別できないと、GZ3が誤ってGOしてしまう
 *   （16.6節(c)「複数エントリの横断集計」・(e)「無効化と正しく0件の区別不能性」に該当。
 *   CT-0004（`computeGenerationGaps`）と同型の懸念を、同じ`verify.js`内の兄弟関数に
 *   対して契約化するもの）。
 * 著者: app-architect（02文書16.4節の原則により実装者=coderは書かない）
 *
 * 【検証すること】
 * `prototypes/SCREEN_ID_INDEX.md`に登録されていない画面ルートが`src/frontend/`配下に
 * 実装されている場合（＝合意媒体に無いのに実装にのみ存在する要素）、`computeReverseDiff`の
 * `screens.onlyInImpl`はそれを1件以上報告しなければならない（0件に丸めてはならない）。
 * あわせて、登録済みの画面と一致する実装ルートは`onlyInImpl`に含まれてはならない
 * （未登録分だけを過不足なく検出できているかを合わせて確認する）。
 *
 * 【実行方法】
 *   node .claude/contracts/lib-verify.computeReverseDiff.contract.js
 *   exit code 0 = 合格
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeReverseDiff } = require('../lib/verify');

/**
 * `prototypes/SCREEN_ID_INDEX.md`に`dashboard`のみを登録し、`src/frontend/pages/`配下には
 * `dashboard.tsx`（登録済み・差分なし）と`login.tsx`（未登録・実装にのみ存在＝逆差分）の
 * 2ファイルを配置する。
 */
function makeFixture() {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-0007-'));
  const prototypesDir = path.join(cwd, 'prototypes');
  fs.mkdirSync(prototypesDir, { recursive: true });
  fs.writeFileSync(
    path.join(prototypesDir, 'SCREEN_ID_INDEX.md'),
    [
      '| SCR-ID | ファイル | 画面名 |',
      '|---|---|---|',
      '| SCR-0001 | prototypes/dashboard.html | ダッシュボード |',
      '',
    ].join('\n'),
    'utf-8'
  );

  const pagesDir = path.join(cwd, 'src', 'frontend', 'pages');
  fs.mkdirSync(pagesDir, { recursive: true });
  fs.writeFileSync(path.join(pagesDir, 'dashboard.tsx'), 'export default function Dashboard() { return null; }\n', 'utf-8');
  fs.writeFileSync(path.join(pagesDir, 'login.tsx'), 'export default function Login() { return null; }\n', 'utf-8');

  return cwd;
}

const cwd = makeFixture();
const diff = computeReverseDiff(cwd);

assert.ok(
  diff.screens.onlyInImpl.length >= 1,
  `合意媒体（SCREEN_ID_INDEX.md）に無い実装済み画面（login）があるのに、onlyInImplが${diff.screens.onlyInImpl.length}件（0件）になっている（逆差分検出の無効化・サイレント故障の疑い）`
);
assert.ok(
  diff.screens.onlyInImpl.includes('login'),
  `未登録の画面ルート(login)がonlyInImplに含まれていない: ${JSON.stringify(diff.screens.onlyInImpl)}`
);
assert.ok(
  !diff.screens.onlyInImpl.includes('dashboard'),
  '登録済みの画面(dashboard)まで誤ってonlyInImplに含まれている（過検出）'
);
assert.ok(
  diff.totalOnlyInImpl >= 1,
  `totalOnlyInImplが実際の逆差分を反映せず${diff.totalOnlyInImpl}件になっている`
);

console.log('OK: CT-0007 computeReverseDiff（未登録画面の逆差分を0件に丸めない）');
