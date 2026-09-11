#!/usr/bin/env node
'use strict';

/**
 * md-to-html.js（M4新設・共有ライブラリ）
 *
 * 【目的・理由】
 * 03文書8.3節「Markdown→HTML変換」の実装方式として、02文書9.6節はpandoc + mermaid-cli
 * （`mmdc`）を第一候補とするとしていたが、本セッションの環境を実測した結果、
 * **`pandoc`・`mmdc`のいずれも導入されていない**ことを確認した（PMへの報告事項、
 * 02文書15章#16「要検証」への回答）。したがって以下の二段構成を採る。
 *
 * 1. `pandoc`が`PATH`に存在すれば`doc-html-render`（呼び出し元スクリプト）がそちらを
 *    優先的に使う（将来pandocが導入された環境向けの経路として残す）
 * 2. 存在しない場合のフォールバックとして、本モジュールが提供する**自前の最小限
 *    Markdown→HTML変換**を用いる。フルスペックのCommonMark実装ではなく、本フレームワークが
 *    生成する文書（見出し・段落・GFMテーブル・コードフェンス・リンク・強調のみ）に
 *    範囲を絞った軽量変換である
 *
 * 【Mermaid図の扱い（正直な限界表明）】
 * `mmdc`（画像化）が使えないため、Mermaidコードフェンスは`<pre class="mermaid">`要素として
 * 出力し、HTML側でmermaid.js（CDN経由）を読み込んでブラウザ側でレンダリングする方式を
 * 採る。**この方式はHTMLを開く端末がインターネットに到達できることを前提とする**
 * （オフライン環境では図が表示されない）。完全オフラインでの画像化が必要な場合は、
 * `mmdc`相当のツール導入が別途必要であり、本実装はそれを代替しない（要検証のまま）。
 *
 * 【影響範囲】
 * `.claude/skills/doc-html-render/scripts/render.js`。
 */

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function inlineFormat(text) {
  let t = escapeHtml(text);
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

function isTableSeparator(line) {
  return /^\s*\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?\s*$/.test(line);
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * 文書冒頭の`---`区切りfrontmatter（doc-style-guide必須ヘッダー、03文書8.4節）を検出し、
 * 定義リスト（`<dl>`）として整形する。frontmatterが無ければ`null`を返す。
 */
function extractFrontmatterHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  if (lines[0] !== '---') return { html: null, rest: markdown };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') {
      end = i;
      break;
    }
  }
  if (end === -1) return { html: null, rest: markdown };
  const rows = lines.slice(1, end).map((l) => {
    const idx = l.indexOf(':');
    if (idx === -1) return null;
    return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
  }).filter(Boolean);
  const dl = ['<dl class="doc-header">', ...rows.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd>`), '</dl>'].join('\n');
  return { html: dl, rest: lines.slice(end + 1).join('\n') };
}

/** 最小限のMarkdown→HTML変換（本フレームワークが生成する文書の範囲に限定）。 */
function markdownToHtml(markdownRaw, { title } = {}) {
  const { html: fmHtml, rest } = extractFrontmatterHtml(markdownRaw);
  const markdown = rest;
  const lines = markdown.split(/\r?\n/);
  const out = fmHtml ? [fmHtml] : [];
  let i = 0;
  let inCodeFence = false;
  let codeFenceLang = '';
  let codeBuf = [];
  let inList = false;

  function closeList() {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  }

  while (i < lines.length) {
    const line = lines[i];

    const fenceMatch = /^```(\w*)\s*$/.exec(line);
    if (fenceMatch) {
      if (!inCodeFence) {
        inCodeFence = true;
        codeFenceLang = fenceMatch[1] || '';
        codeBuf = [];
      } else {
        inCodeFence = false;
        if (codeFenceLang === 'mermaid') {
          out.push(`<pre class="mermaid">\n${escapeHtml(codeBuf.join('\n'))}\n</pre>`);
        } else {
          out.push(`<pre><code class="language-${escapeHtml(codeFenceLang)}">${escapeHtml(codeBuf.join('\n'))}</code></pre>`);
        }
      }
      i += 1;
      continue;
    }
    if (inCodeFence) {
      codeBuf.push(line);
      i += 1;
      continue;
    }

    const headingMatch = /^(#{1,6})\s+(.*)$/.exec(line);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${inlineFormat(headingMatch[2])}</h${level}>`);
      i += 1;
      continue;
    }

    if (line.trim().startsWith('|') && lines[i + 1] && isTableSeparator(lines[i + 1])) {
      closeList();
      const header = splitRow(line);
      out.push('<table><thead><tr>' + header.map((h) => `<th>${inlineFormat(h)}</th>`).join('') + '</tr></thead><tbody>');
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = splitRow(lines[i]);
        out.push('<tr>' + cells.map((c) => `<td>${inlineFormat(c)}</td>`).join('') + '</tr>');
        i += 1;
      }
      out.push('</tbody></table>');
      continue;
    }

    const listMatch = /^[-*]\s+(.*)$/.exec(line);
    if (listMatch) {
      if (!inList) {
        out.push('<ul>');
        inList = true;
      }
      out.push(`<li>${inlineFormat(listMatch[1])}</li>`);
      i += 1;
      continue;
    }
    closeList();

    if (line.trim() === '') {
      i += 1;
      continue;
    }

    // reverse-doc実行時マーカー（9.2節）は機械可読のための注記であり、人間の読み手
    // （顧客・監査人を含む、03文書8.3節）向けのHTMLには表示しない。
    if (/^<!--\s*reverse-doc-generated:/.test(line.trim())) {
      i += 1;
      continue;
    }

    out.push(`<p>${inlineFormat(line)}</p>`);
    i += 1;
  }
  closeList();

  const bodyHtml = out.join('\n');
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title || '')}</title>
<style>
body { font-family: sans-serif; max-width: 900px; margin: 2em auto; line-height: 1.7; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ccc; padding: 4px 8px; }
pre { background: #f5f5f5; padding: 1em; overflow-x: auto; }
</style>
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<script>window.addEventListener('DOMContentLoaded', () => { if (window.mermaid) mermaid.initialize({ startOnLoad: true }); });</script>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

module.exports = { markdownToHtml };
