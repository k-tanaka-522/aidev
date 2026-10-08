#!/usr/bin/env node
'use strict';

/**
 * check.js（ux-review Skill の機械検査）
 *
 * 【目的】
 * ハリボテ1画面を Playwright（npx キャッシュの 1.63 と Chromium）で 390px と 1440px に開き、
 * 人や AI の目で判断する前に、数えれば分かることを数える。結果は指摘ではなく「事実」であり、
 * どれを指摘にするか・重大度はレビューの回（SKILL.md の手順3〜5）で決める。
 *
 * 【測るもの】
 *  1. 押せる範囲の大きさ: 24px 未満（WCAG 2.2 の 2.5.8。間隔の例外・文中のリンクの例外を判定）と
 *     44px 未満（本プロジェクトの基準、UIUX_STANDARD.md「使い勝手の観点」）。390px では画面の縦の位置（上・中・下）も記録する
 *  2. 危険な操作の近さ: 削除・解約・停止などの文言のボタンと、隣の押せるものとの間隔（8px 未満を記録）
 *  3. 文字のコントラスト（WCAG 1.4.3。背景画像・グラデーションの上は「要目視」）と、入力欄の枠のコントラスト（1.4.11、3:1）
 *  4. 入力欄の数（form・ダイアログごと。無ければ画面全体）、必須・任意の表示
 *  5. ラベルの位置（上・左・なし・placeholder だけ）
 *  6. input の type・inputmode・autocomplete と、ラベルの言葉から期待される型
 *  7. 横のはみ出し（document の scrollWidth と clientWidth の比較、はみ出している要素、内側の横スクロール）
 *  あわせて各幅の全体のスクショを撮る。
 *
 * 【測らないもの】ハリボテの確認用バー（[data-proto-bar]・[data-proto-only]、「確認用」と書いた操作）。
 *   画面の一部ではないため数えない（除外した件数は記録する）。
 *
 * 【影響範囲】対象 HTML は読むだけ。書くのは `.claude-state/ux-review/{日付}-{対象}/` の中だけ。
 *
 * 【使い方】
 *   node prototypes/.claude/skills/ux-review/scripts/check.js --file=prototypes/admin-nomination-settings.html < /dev/null
 *   任意: --query=role=staff（確認用の状態）  --click=<セレクタ>（押してから測る。複数可）
 *         --name=<対象名>（既定はファイル名）  --date=YYYY-MM-DD  --widths=390,1440  --wait=600（ms）
 *         --label=<状態名>（同じ画面の別の状態を測るとき、ファイル名に付ける。例: dialog-on）
 *   出力: {dir}/check{-label}.json、{dir}/shot{-label}-390.png、{dir}/shot{-label}-1440.png、標準出力に要約
 */

const fs = require('fs');
const lib = require('./lib');

const MIN_WCAG = 24; // WCAG 2.2 SC 2.5.8 Target Size (Minimum)
const MIN_PROJECT = 44; // 本プロジェクトの基準（Apple HIG・WCAG 2.5.5 AAA と同じ値）
const DANGER_GAP = 8;

/** ページの中で測る関数（ブラウザで実行される）。 */
function measure(opts) {
  const { MIN_WCAG, MIN_PROJECT, DANGER_GAP } = opts;
  const EXCLUDE_SEL = '[data-proto-bar], [data-proto-only]';
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;

  const cssPath = (el) => {
    if (el.id) return '#' + CSS.escape(el.id);
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 5) {
      let s = cur.tagName.toLowerCase();
      if (cur.id) { parts.unshift('#' + CSS.escape(cur.id)); break; }
      const cls = [...cur.classList].filter((c) => /^[A-Za-z][\w-]*$/.test(c)).slice(0, 2);
      if (cls.length) s += '.' + cls.join('.');
      const p = cur.parentElement;
      if (p) {
        const same = [...p.children].filter((c) => c.tagName === cur.tagName);
        if (same.length > 1) s += `:nth-of-type(${same.indexOf(cur) + 1})`;
      }
      parts.unshift(s);
      cur = p;
    }
    return parts.join(' > ');
  };
  const textOf = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.getAttribute('title') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const visible = (el) => {
    if (el.closest('[hidden]')) return false;
    // 閉じた dialog の中身（daisyUI の .modal は閉じていても描画上は残る）は見えないものとする
    const dlg = el.closest('dialog');
    if (dlg && !dlg.open) return false;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    for (let p = el; p && p.nodeType === 1; p = p.parentElement) if (Number(getComputedStyle(p).opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const isProtoOnly = (el) => {
    if (el.closest(EXCLUDE_SEL)) return true;
    // 「（確認用）」のラベルが付いた操作（ハリボテの切り替え）
    const p = el.parentElement;
    if (p && (p.innerText || '').length < 200 && /確認用/.test(p.innerText || '')) return true;
    if (el.id) { const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`); if (l && /確認用/.test(l.innerText)) return true; }
    return false;
  };
  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) };
  };
  const inFixed = (el) => { if (el.closest('dialog[open]')) return true; for (let p = el; p && p.nodeType === 1; p = p.parentElement) if (getComputedStyle(p).position === 'fixed') return true; return false; };
  const vzone = (rc) => {
    // 最初の画面（スクロールしない位置）での縦の位置。片手で届く範囲の目安（Hoober: 中央が押しやすく、上の隅が遠い）
    const cy = rc.y + rc.h / 2;
    if (cy > vh) return 'below-fold';
    if (cy < vh / 3) return 'top';
    if (cy < (vh * 2) / 3) return 'middle';
    return 'bottom';
  };

  // ---- 色 ----
  const parseColor = (s) => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const blend = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  /** 背景色を祖先へたどって重ねる。背景画像・グラデーションがあれば image=true。 */
  const bgOf = (el) => {
    const layers = [];
    let image = false;
    for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
      const cs = getComputedStyle(cur);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') image = true;
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    return { bg, image };
  };
  const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

  // ---- 1. 押せる範囲 ----
  const TARGET_SEL = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=switch], [role=checkbox], [role=radio], [onclick], [tabindex]:not([tabindex="-1"])';
  let excluded = 0;
  const all = [...document.querySelectorAll(TARGET_SEL)].filter(visible);
  const targets = [];
  for (const el of all) {
    if (isProtoOnly(el)) { excluded++; continue; }
    // ラベルで包まれた・ラベルの付いたチェックボックス等は、ラベルを含めた範囲を押せる範囲とみなす
    let box = el.getBoundingClientRect();
    let via = null;
    if (el.matches('input[type=checkbox], input[type=radio]')) {
      const lab = el.closest('label') || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
      if (lab && visible(lab)) {
        const lr = lab.getBoundingClientRect();
        const l = Math.min(box.left, lr.left), t = Math.min(box.top, lr.top);
        const r = Math.max(box.right, lr.right), b = Math.max(box.bottom, lr.bottom);
        box = { left: l, top: t, width: r - l, height: b - t };
        via = 'label';
      }
    }
    // 文中のリンク（2.5.8 の例外）: 前後に文字がある段落の中の a
    let inline = false;
    if (el.tagName === 'A' && getComputedStyle(el).display === 'inline') {
      const p = el.parentElement;
      const pt = (p && p.innerText) || '';
      inline = pt.replace(/\s+/g, '').length > textOf(el).replace(/\s+/g, '').length + 4;
    }
    targets.push({ el, box: { left: box.left, top: box.top, width: box.width, height: box.height }, via, inline });
  }
  // 押せるものの入れ子（button の中の span[onclick] 等）は外側を優先する
  const tset = new Set(targets.map((t) => t.el));
  const flat = targets.filter((t) => { for (let p = t.el.parentElement; p; p = p.parentElement) if (tset.has(p)) return false; return true; });

  const center = (b) => ({ x: b.left + b.width / 2, y: b.top + b.height / 2 });
  const circleHitsRect = (c, r, b) => {
    const nx = Math.max(b.left, Math.min(c.x, b.left + b.width));
    const ny = Math.max(b.top, Math.min(c.y, b.top + b.height));
    return (c.x - nx) ** 2 + (c.y - ny) ** 2 < r * r;
  };
  const small = [];
  const under44 = [];
  for (const t of flat) {
    const w = Math.round(t.box.width), h = Math.round(t.box.height);
    const rec = { selector: cssPath(t.el), tag: t.el.tagName.toLowerCase(), text: textOf(t.el), w, h, rect: { x: Math.round(t.box.left + scrollX), y: Math.round(t.box.top + scrollY), w, h }, via: t.via };
    // ダイアログ・固定表示の中は画面に対する位置で見る（ページのスクロール量を足さない）
    rec.zone = vzone(inFixed(t.el) ? { y: t.box.top, h: t.box.height } : rec.rect);
    if (w < MIN_WCAG || h < MIN_WCAG) {
      if (t.inline) { rec.exception = 'inline（文中のリンク。2.5.8 の例外）'; }
      else {
        // 間隔の例外: 24px の円（中心は押せる範囲の中心）が、他の押せる範囲にも、他の小さな押せるものの円にも重ならない
        const c = center(t.box);
        const hit = flat.find((o) => {
          if (o === t) return false;
          if (o.box.width < MIN_WCAG || o.box.height < MIN_WCAG) { const oc = center(o.box); return (c.x - oc.x) ** 2 + (c.y - oc.y) ** 2 < MIN_WCAG * MIN_WCAG; }
          return circleHitsRect(c, MIN_WCAG / 2, o.box);
        });
        rec.exception = hit ? null : 'spacing（間隔の例外を満たす）';
        if (hit) rec.overlapsWith = cssPath(hit.el);
      }
      small.push(rec);
    } else if (w < MIN_PROJECT || h < MIN_PROJECT) {
      under44.push(rec);
    }
  }

  // ---- 2. 危険な操作の近さ ----
  const DANGER_RE = /削除|消す|取り消|取消|解約|退会|停止|止める|無効|OFF|オフ|リセット|やり直|破棄|キャンセル/;
  const danger = [];
  for (const t of flat) {
    if (!t.el.matches('button, [role=button], a[href], input[type=submit], input[type=button]')) continue;
    const dtext = textOf(t.el);
    // 規約・説明へのリンク（「キャンセルポリシー」等）は操作ではないので除く。長い文も除く
    if (!DANGER_RE.test(dtext) || /ポリシー|規約|について|とは/.test(dtext) || dtext.length > 20) continue;
    let nearest = null;
    for (const o of flat) {
      if (o === t) continue;
      const dx = Math.max(0, o.box.left - (t.box.left + t.box.width), t.box.left - (o.box.left + o.box.width));
      const dy = Math.max(0, o.box.top - (t.box.top + t.box.height), t.box.top - (o.box.top + o.box.height));
      const gap = Math.round(Math.hypot(dx, dy));
      if (!nearest || gap < nearest.gap) nearest = { gap, selector: cssPath(o.el), text: textOf(o.el) };
    }
    danger.push({ selector: cssPath(t.el), text: textOf(t.el), rect: rectOf(t.el), nearest, close: !!(nearest && nearest.gap < DANGER_GAP) });
  }

  // ---- 3. コントラスト ----
  const contrastFails = [];
  const contrastManual = [];
  let textChecked = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.nodeValue.trim()) continue;
    const el = n.parentElement;
    if (!el || seen.has(el) || el.closest('script, style, noscript, svg') || !visible(el) || isProtoOnly(el)) continue;
    seen.add(el);
    textChecked++;
    const cs = getComputedStyle(el);
    const fg0 = parseColor(cs.color);
    if (!fg0) continue;
    const { bg, image } = bgOf(el);
    const fg = blend(fg0, bg);
    const r = ratio(fg, bg);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const need = large ? 3 : 4.5;
    const disabled = !!el.closest('[disabled], [aria-disabled="true"]');
    if (r < need) {
      const rec = { selector: cssPath(el), text: n.nodeValue.trim().slice(0, 30), ratio: Math.round(r * 100) / 100, need, fg: hex(fg), bg: hex(bg), fontSize: size, bold, rect: rectOf(el) };
      if (image) { rec.note = '背景画像・グラデーションの上（要目視）'; contrastManual.push(rec); }
      else if (disabled) { rec.note = '無効状態（1.4.3 の対象外。押せないと分かるかは目視）'; contrastManual.push(rec); }
      else contrastFails.push(rec);
    }
  }
  // 入力欄の枠（1.4.11 非テキストのコントラスト 3:1。枠か塗りのどちらかで見分けられればよい）
  const borderFails = [];
  const FIELD_SEL = 'input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=reset]):not([type=image]), select, textarea';
  const fields = [...document.querySelectorAll(FIELD_SEL)].filter((el) => visible(el) && !isProtoOnly(el));
  for (const el of fields) {
    if (el.matches('[type=checkbox],[type=radio],[type=range],[type=color],[type=file]')) continue;
    const cs = getComputedStyle(el);
    const bw = parseFloat(cs.borderBottomWidth);
    const bc = parseColor(cs.borderBottomColor);
    const { bg } = bgOf(el.parentElement || el);
    const fillC = parseColor(cs.backgroundColor);
    const fill = fillC && fillC.a > 0 ? blend(fillC, bg) : bg;
    const borderR = bw > 0 && bc ? ratio(blend(bc, bg), bg) : 0;
    const best = Math.max(borderR, ratio(fill, bg));
    if (best < 3) borderFails.push({ selector: cssPath(el), border: bc ? hex(blend(bc, bg)) : null, borderWidth: bw, bg: hex(bg), ratio: Math.round(best * 100) / 100, need: 3, rect: rectOf(el) });
  }

  // ---- 4〜6. フォーム ----
  const labelOf = (el) => {
    let lab = null;
    if (el.id) lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (!lab) lab = el.closest('label');
    const lb = el.getAttribute('aria-labelledby');
    const lbEl = lb ? document.getElementById(lb.split(/\s+/)[0]) : null;
    return { lab, lbEl, aria: el.getAttribute('aria-label') };
  };
  const labelPos = (el, labEl) => {
    if (!labEl || !visible(labEl)) return null;
    const a = labEl.getBoundingClientRect(), b = el.getBoundingClientRect();
    if (labEl.contains(el)) return a.top < b.top - 4 ? 'above' : 'inline（ラベルが入力欄を包む）';
    if (a.bottom <= b.top + 4 && a.right > b.left && a.left < b.right) return 'above';
    if (a.right <= b.left + 4 && Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < Math.max(a.height, b.height)) return 'left';
    if (a.left >= b.right - 4 && Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < Math.max(a.height, b.height)) return 'right';
    if (a.top >= b.bottom - 4) return 'below';
    return 'other';
  };
  const EXPECT = [
    { re: /電話|tel|携帯/i, type: 'tel', autocomplete: 'tel' },
    { re: /メール|e-?mail/i, type: 'email', autocomplete: 'email' },
    { re: /郵便|〒|postal|zip/i, inputmode: 'numeric', autocomplete: 'postal-code' },
    { re: /URL|ホームページのアドレス|ウェブサイト/i, type: 'url' },
    { re: /パスワード|password/i, type: 'password' },
    { re: /認証コード|確認コード|ワンタイム/, inputmode: 'numeric', autocomplete: 'one-time-code' },
    { re: /金額|料金|価格|円|人数|席数|件数|分数|所要|回数/, inputmode: 'numeric' },
  ];
  const forms = [];
  const groups = new Map();
  for (const el of fields) {
    const f = el.closest('form, dialog, [role=dialog], .modal-box') || document.body;
    if (!groups.has(f)) groups.set(f, []);
    groups.get(f).push(el);
  }
  for (const [f, els] of groups) {
    const items = [];
    const radioNames = new Set();
    for (const el of els) {
      // 同じ name のラジオは1項目として数える
      if (el.type === 'radio' && el.name) { if (radioNames.has(el.name)) continue; radioNames.add(el.name); }
      const { lab, lbEl, aria } = labelOf(el);
      const labEl = lab || lbEl;
      const labText = ((labEl && labEl.innerText) || aria || '').replace(/\s+/g, ' ').trim();
      const wrap = el.closest('fieldset, .form-control, .field') || el.parentElement;
      const around = ((wrap && wrap.innerText) || '').slice(0, 120);
      const hint = [labText, el.getAttribute('placeholder') || '', el.name || '', el.id || ''].join(' ');
      const required = el.required || el.getAttribute('aria-required') === 'true';
      let pos = labelPos(el, labEl);
      if (!pos) pos = aria ? 'aria-label-only' : (el.getAttribute('placeholder') ? 'placeholder-only' : 'none');
      const exp = el.tagName === 'INPUT' && !['checkbox', 'radio'].includes(el.type) ? EXPECT.find((e) => e.re.test(hint)) : null;
      const typeIssue = [];
      if (exp) {
        if (exp.type && el.type !== exp.type) typeIssue.push(`type=${el.type}（期待 ${exp.type}）`);
        if (exp.inputmode && el.type !== 'number' && el.getAttribute('inputmode') !== exp.inputmode) typeIssue.push(`inputmode=${el.getAttribute('inputmode') || 'なし'}（期待 ${exp.inputmode}）`);
        if (exp.autocomplete && el.getAttribute('autocomplete') !== exp.autocomplete) typeIssue.push(`autocomplete=${el.getAttribute('autocomplete') || 'なし'}（期待 ${exp.autocomplete}）`);
      }
      items.push({
        selector: cssPath(el), tag: el.tagName.toLowerCase(), type: el.type || null, inputmode: el.getAttribute('inputmode'), autocomplete: el.getAttribute('autocomplete'),
        label: labText.slice(0, 40) || null, labelPosition: pos, required, markRequired: /必須|＊|\*/.test(labText + around), markOptional: /任意/.test(labText + around), typeIssue, rect: rectOf(el),
      });
    }
    forms.push({
      container: f === document.body ? '(画面全体)' : cssPath(f),
      count: items.length,
      requiredCount: items.filter((i) => i.required || i.markRequired).length,
      optionalMarked: items.filter((i) => i.markOptional).length,
      fields: items,
    });
  }

  // ---- 7. 横のはみ出し ----
  const de = document.documentElement;
  const overflow = { scrollWidth: de.scrollWidth, clientWidth: de.clientWidth, overflowing: de.scrollWidth > de.clientWidth + 1, offenders: [], innerScrollers: [] };
  const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { if (getComputedStyle(p).overflowX !== 'visible') return true; } return false; };
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.right + scrollX > de.clientWidth + 1 && cs.position !== 'fixed' && !clipped(el)) {
      overflow.offenders.push({ selector: cssPath(el), right: Math.round(r.right + scrollX), width: Math.round(r.width) });
    }
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
      overflow.innerScrollers.push({ selector: cssPath(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
  }
  // 子孫もはみ出しているときは、いちばん深いものだけを残す
  overflow.offenders = overflow.offenders.filter((o, i, arr) => !arr.some((p, j) => j !== i && p.selector.startsWith(o.selector + ' > '))).slice(0, 20);
  overflow.innerScrollers = overflow.innerScrollers.slice(0, 20);

  return {
    viewport: { width: vw, height: vh },
    page: { title: document.title, lang: de.lang || null, viewportMeta: (document.querySelector('meta[name=viewport]') || {}).content || null, height: de.scrollHeight },
    excludedProtoControls: excluded,
    targets: { counted: flat.length, under24: small, under44, danger },
    contrast: { textElementsChecked: textChecked, fails: contrastFails, manual: contrastManual, fieldBorderFails: borderFails },
    forms,
    overflow,
  };
}

function summarize(res) {
  const lines = [];
  const t = res.targets;
  const v24 = t.under24.filter((x) => !x.exception);
  lines.push(`[${res.viewport.width}px] 押せるもの ${t.counted} 件 / 24px 未満 ${t.under24.length} 件（うち例外に当たらない ${v24.length} 件）/ 24〜44px 未満 ${t.under44.length} 件`);
  if (res.viewport.width < 768) {
    const z = {};
    for (const x of [...t.under24, ...t.under44]) z[x.zone] = (z[x.zone] || 0) + 1;
    lines.push(`  44px 未満の縦の位置: ${JSON.stringify(z)}`);
  }
  const close = t.danger.filter((d) => d.close);
  lines.push(`  危険な操作の文言のボタン ${t.danger.length} 件（隣と ${DANGER_GAP}px 未満 ${close.length} 件）`);
  lines.push(`  文字のコントラスト不足 ${res.contrast.fails.length} 件 / 要目視 ${res.contrast.manual.length} 件 / 入力欄の枠 3:1 未満 ${res.contrast.fieldBorderFails.length} 件（文字の要素 ${res.contrast.textElementsChecked} 件を確認）`);
  if (!res.forms.length) lines.push('  入力欄: なし');
  for (const f of res.forms) {
    const pos = {};
    for (const x of f.fields) pos[x.labelPosition] = (pos[x.labelPosition] || 0) + 1;
    const typeIssues = f.fields.filter((x) => x.typeIssue.length).length;
    lines.push(`  入力欄 ${f.container}: ${f.count} 項目（必須 ${f.requiredCount}・任意の表示 ${f.optionalMarked}）ラベルの位置 ${JSON.stringify(pos)} 型の候補 ${typeIssues} 件`);
  }
  const o = res.overflow;
  lines.push(`  横のはみ出し: scrollWidth ${o.scrollWidth} / clientWidth ${o.clientWidth}${o.overflowing ? '（はみ出しあり）' : '（なし）'}、はみ出す要素 ${o.offenders.length} 件、内側の横スクロール ${o.innerScrollers.length} 件`);
  lines.push(`  除外した確認用の操作: ${res.excludedProtoControls} 件`);
  return lines.join('\n');
}

async function main() {
  const args = lib.parseArgs(process.argv.slice(2));
  const target = lib.resolveTarget(args.file);
  const name = args.name && args.name !== true ? lib.slugOf(args.name) : lib.slugOf(target.rel);
  const date = args.date && args.date !== true ? String(args.date) : lib.todayJst();
  const label = args.label && args.label !== true ? '-' + lib.slugOf(args.label) : '';
  const widths = (args.widths && args.widths !== true ? String(args.widths) : '390,1440').split(',').map(Number).filter(Boolean);
  const clicks = lib.list(args.click);
  const query = args.query && args.query !== true ? String(args.query) : null;
  const dir = `${date}-${name}`;

  const { playwright, version } = lib.loadPlaywright();
  const browser = await playwright.chromium.launch();
  const out = {
    tool: 'ux-review/check.js', playwright: version, target: target.rel, query, clicks, label: label.slice(1) || null,
    measuredAt: new Date().toISOString(), thresholds: { wcag258: MIN_WCAG, project: MIN_PROJECT, dangerGap: DANGER_GAP }, results: [],
  };
  try {
    for (const w of widths) {
      const h = w < 768 ? 844 : 900;
      const { context, page, loadNote } = await lib.openPage(browser, lib.fileUrl(target.abs, query), w, h, args.wait);
      const clickFailed = await lib.runClicks(page, clicks);
      const res = await page.evaluate(measure, { MIN_WCAG, MIN_PROJECT, DANGER_GAP });
      res.loadNote = loadNote;
      res.clickFailed = clickFailed;
      const rel = `${dir}/shot${label}-${w}.png`;
      await page.screenshot({ path: lib.resolveOut(rel), fullPage: true });
      res.screenshot = `.claude-state/ux-review/${rel}`;
      out.results.push(res);
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(lib.resolveOut(`${dir}/check${label}.json`), JSON.stringify(out, null, 2));
  console.log(`対象: ${target.rel}${query ? '?' + query : ''}${clicks.length ? '（押した: ' + clicks.join(' → ') + '）' : ''}  Playwright ${version}`);
  for (const r of out.results) {
    console.log(summarize(r));
    if (r.loadNote !== 'ok') console.log('  注意: ' + r.loadNote);
    if (r.clickFailed.length) console.log('  押せなかった: ' + JSON.stringify(r.clickFailed));
    console.log('  スクショ: ' + r.screenshot);
  }
  console.log(`結果: .claude-state/ux-review/${dir}/check${label}.json`);
}

main().catch((e) => { console.error('[ux-review/check] ' + e.message); process.exit(1); });
