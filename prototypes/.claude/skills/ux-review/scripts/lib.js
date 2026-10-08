'use strict';

/**
 * lib.js（ux-review Skill 同梱スクリプトの共通部品）
 *
 * 【目的】
 * check.js・shot.js・save-report.js が使う共通の処理をまとめる。
 * - npx キャッシュにある Playwright 1.63 の場所を探す（package.json に依存を足さない。demo-video と同じやり方）
 * - 書き出し先を `.claude-state/ux-review/**` に限る（ux-reviewer は prototypes/** を書き換えない）
 * - 引数の読み取り、日付（日本時間）、対象名の作り方
 *
 * 【影響範囲】読み取りと `.claude-state/ux-review/**` への書き出しのみ。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRequire } = require('module');

/** バックスラッシュ（Windows のパス区切り）。書き込み経路で二重の逆斜線が潰れるため文字コードで持つ（.claude/tools/screenshot.js と同じ）。 */
const BS = String.fromCharCode(92);

/** リポジトリの根（prototypes/.claude/skills/ux-review/scripts から5つ上）。 */
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..');
/** 結果の置き場。ここの外には書かない。 */
const OUT_ROOT = path.join(REPO, '.claude-state', 'ux-review');

function parseArgs(argv) {
  const args = { _: [] };
  for (const a of argv) {
    const m = /^--([^=]+)(?:=([\s\S]*))?$/.exec(a);
    if (!m) { args._.push(a); continue; }
    const k = m[1];
    const v = m[2] === undefined ? true : m[2];
    if (args[k] === undefined) args[k] = v;
    else args[k] = [].concat(args[k], v);
  }
  return args;
}

/** 同じ引数を何度も付けられるもの（--click 等）を配列にする。 */
function list(v) {
  if (v === undefined || v === true) return [];
  return [].concat(v);
}

/** 日本時間の YYYY-MM-DD。 */
function todayJst() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

/** ファイル名から対象名を作る（prototypes/admin-nomination-settings.html → admin-nomination-settings）。 */
function slugOf(file) {
  return path.basename(String(file)).replace(/\.html?$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-');
}

/**
 * `.claude-state/ux-review/` からの相対パスを絶対パスにする。外に出るパスは拒否する。
 * 例: resolveOut('2026-10-07-admin-x/check.json')
 */
function resolveOut(rel) {
  const abs = path.resolve(OUT_ROOT, String(rel));
  const r = path.relative(OUT_ROOT, abs);
  if (!r || r.startsWith('..') || path.isAbsolute(r)) {
    throw new Error(`書き出し先は .claude-state/ux-review/ の中に限ります: ${rel}`);
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  return abs;
}

/** 対象の HTML を prototypes/ 配下に限って解決する（dev の実画面は qa の担当）。 */
function resolveTarget(file) {
  if (!file || file === true) throw new Error('--file=prototypes/<画面>.html を指定してください');
  const abs = path.resolve(REPO, String(file));
  const rel = path.relative(REPO, abs).split(BS).join('/');
  if (!rel.startsWith('prototypes/') || !/\.html?$/i.test(rel)) {
    throw new Error(`対象は prototypes/ 配下の HTML に限ります: ${file}`);
  }
  if (!fs.existsSync(abs)) throw new Error(`見つかりません: ${rel}`);
  return { abs, rel };
}

/** file:// の URL。--query=role=staff のように付けると、ハリボテの確認用の状態を切り替えて開ける。 */
function fileUrl(abs, query) {
  const u = 'file:///' + abs.split(BS).join('/').replace(/^\/+/, '');
  if (!query || query === true) return u;
  return u + '?' + String(query).replace(/^\?/, '');
}

/** npx キャッシュ（または PW_DIR）から playwright を探して読み込む。1.63.0 を優先する。 */
function loadPlaywright() {
  const cands = [];
  if (process.env.PW_DIR) cands.push(process.env.PW_DIR);
  const npx = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData/Local'), 'npm-cache/_npx');
  if (fs.existsSync(npx)) for (const d of fs.readdirSync(npx)) cands.push(path.join(npx, d));
  const ver = (c) => {
    try { return JSON.parse(fs.readFileSync(path.join(c, 'node_modules/playwright/package.json'), 'utf8')).version; } catch (_) { return null; }
  };
  const hits = cands.filter((c) => ver(c));
  hits.sort((a, b) => (ver(b) === '1.63.0') - (ver(a) === '1.63.0'));
  if (!hits.length) {
    throw new Error('playwright が見つかりません。先に `npx -y playwright@1.63.0 --version` を実行してください（Chromium が無ければ `npx -y playwright@1.63.0 install chromium`）');
  }
  const req = createRequire(path.join(hits[0], 'x.js'));
  return { playwright: req('playwright'), version: ver(hits[0]) };
}

/** 画面を開いて描画が落ち着くまで待つ（Tailwind・daisyUI の CDN が効くまで）。 */
async function openPage(browser, url, width, height, waitMs) {
  const mobile = width < 768;
  const context = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile, locale: 'ja-JP',
  });
  const page = await context.newPage();
  let loadNote = 'ok';
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  } catch (e) {
    loadNote = 'networkidle を待てなかった（CDN に届かない可能性。見た目の数値は参考扱い）: ' + String(e.message).split('\n')[0];
    try { await page.goto(url, { waitUntil: 'load', timeout: 30000 }); } catch (_) { /* そのまま測る */ }
  }
  await page.waitForTimeout(Number(waitMs) || 600);
  return { context, page, loadNote };
}

/** --click=<セレクタ> を順に押す（確認ダイアログ等を開いた状態を測る・撮るため）。押せなかったものは返す。 */
async function runClicks(page, clicks) {
  const failed = [];
  for (const sel of clicks) {
    try {
      await page.locator(sel).first().click({ timeout: 5000 });
      await page.waitForTimeout(400);
    } catch (e) {
      failed.push({ selector: sel, error: String(e.message).split('\n')[0] });
    }
  }
  return failed;
}

module.exports = {
  REPO, OUT_ROOT, parseArgs, list, todayJst, slugOf, resolveOut, resolveTarget, fileUrl, loadPlaywright, openPage, runClicks,
};
