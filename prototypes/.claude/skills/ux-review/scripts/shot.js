#!/usr/bin/env node
'use strict';

/**
 * shot.js（ux-review Skill の撮影・事実の取り出し）
 *
 * 【目的】
 * ウォークスルーの回と検証の回で、指摘の「場所」と「確かめられる事実」を自分の目で確かめるために使う。
 *  - 要素1つを撮る（--selector）。あわせて、その要素の HTML・位置と大きさ・文字の大きさと色・背景色・中の文字を標準出力に出す
 *  - 最初の画面（スクロールしない範囲）だけを撮る（--viewport）。最初に目に入るもの・片手で届く範囲を見る
 *  - --click で、押したあとの状態（ダイアログ・次の段）を撮る
 * スクショはページの中身だけが写る（ブラウザの枠・OS の部品は写らない）。
 *
 * 【影響範囲】対象 HTML は読むだけ。書くのは `.claude-state/ux-review/{日付}-{対象}/` の中だけ。
 *
 * 【使い方】
 *   node prototypes/.claude/skills/ux-review/scripts/shot.js --file=prototypes/x.html --selector="#dlg-on-go" < /dev/null
 *   node prototypes/.claude/skills/ux-review/scripts/shot.js --file=prototypes/x.html --viewport --width=390 < /dev/null
 *   任意: --width=390（既定）  --query=...  --click=<セレクタ>（複数可）  --label=<名前>  --name  --date  --pad=16
 *   出力: {dir}/el-{label}-{幅}.png または {dir}/view-{label}-{幅}.png、標準出力に事実（JSON）
 */

const lib = require('./lib');

/** 最初の画面に入っている見出し・押せるものを上から順に（目に入る順の手がかり。順番そのものは目で確かめる）。 */
function firstView() {
  const vh = innerHeight;
  const out = [];
  for (const el of document.querySelectorAll('h1, h2, h3, [role=heading], button, a[href], input, select, textarea, .badge, .badge-status, .alert, .warn-banner')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    if (r.width === 0 || r.height === 0 || r.top >= vh || r.bottom <= 0 || cs.visibility === 'hidden' || el.closest('[hidden]')) continue;
    if (el.closest('[data-proto-bar], [data-proto-only]')) continue;
    out.push({ tag: el.tagName.toLowerCase(), text: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 40), top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), fontSize: cs.fontSize, fontWeight: cs.fontWeight });
  }
  return out.sort((a, b) => a.top - b.top || a.left - b.left).slice(0, 40);
}

/** 要素の事実（ブラウザで実行）。 */
function elementFacts(node) {
  const r = node.getBoundingClientRect();
  const cs = getComputedStyle(node);
  let bg = null;
  for (let p = node; p && p.nodeType === 1; p = p.parentElement) {
    const c = getComputedStyle(p).backgroundColor;
    if (c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') { bg = c; break; }
  }
  return {
    visible: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
    rectViewport: { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) },
    rectPage: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) },
    style: { fontSize: cs.fontSize, fontWeight: cs.fontWeight, color: cs.color, backgroundColor: bg, padding: cs.padding, margin: cs.margin, border: cs.border, position: cs.position },
    attrs: Object.fromEntries([...node.attributes].map((a) => [a.name, a.value.slice(0, 120)])),
    text: (node.innerText || node.value || '').replace(/\s+/g, ' ').trim().slice(0, 300),
    html: node.outerHTML.slice(0, 1200),
  };
}

async function main() {
  const args = lib.parseArgs(process.argv.slice(2));
  const target = lib.resolveTarget(args.file);
  const name = args.name && args.name !== true ? lib.slugOf(args.name) : lib.slugOf(target.rel);
  const date = args.date && args.date !== true ? String(args.date) : lib.todayJst();
  const width = Number(args.width) || 390;
  const height = width < 768 ? 844 : 900;
  const query = args.query && args.query !== true ? String(args.query) : null;
  const selector = args.selector && args.selector !== true ? String(args.selector) : null;
  if (!selector && !args.viewport) throw new Error('--selector=<セレクタ> か --viewport のどちらかを指定してください');
  const label = lib.slugOf(args.label && args.label !== true ? args.label : (selector || 'first'));
  const pad = Number(args.pad) || 16;
  const dir = `${date}-${name}`;

  const { playwright } = lib.loadPlaywright();
  const browser = await playwright.chromium.launch();
  try {
    const { page, loadNote } = await lib.openPage(browser, lib.fileUrl(target.abs, query), width, height, args.wait);
    const clickFailed = await lib.runClicks(page, lib.list(args.click));
    const facts = { target: target.rel, query, width, clicks: lib.list(args.click), clickFailed, loadNote };
    if (args.viewport) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const rel = `${dir}/view-${label}-${width}.png`;
      await page.screenshot({ path: lib.resolveOut(rel), fullPage: false });
      facts.screenshot = `.claude-state/ux-review/${rel}`;
      facts.firstView = await page.evaluate(firstView);
    } else {
      const loc = page.locator(selector);
      facts.selector = selector;
      facts.matched = await loc.count();
      if (!facts.matched) {
        facts.error = 'セレクタに当たる要素がない（指摘の場所が誤っている可能性）';
      } else {
        const el = loc.first();
        await el.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        facts.element = await el.evaluate(elementFacts);
        const box = await el.boundingBox();
        const vp = page.viewportSize();
        if (box) {
          const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad) };
          clip.width = Math.min(vp.width - clip.x, box.width + pad * 2);
          clip.height = Math.min(vp.height - clip.y, box.height + pad * 2);
          if (clip.width > 0 && clip.height > 0) {
            const rel = `${dir}/el-${label}-${width}.png`;
            await page.screenshot({ path: lib.resolveOut(rel), clip });
            facts.screenshot = `.claude-state/ux-review/${rel}`;
          }
        }
      }
    }
    console.log(JSON.stringify(facts, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error('[ux-review/shot] ' + e.message); process.exit(1); });
