#!/usr/bin/env node
'use strict';

/**
 * render.js（doc-html-render Skill 同梱スクリプト）
 *
 * 【使い方】
 *   node render.js --dir=docs/02_要件定義
 *   node render.js --all
 *
 * 【実装方針】SKILL.md「実装可否の実測結果」を参照。pandocが使えればそちらを優先し、
 * 無ければ`.claude/lib/md-to-html.js`の自前変換を使う。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { markdownToHtml } = require('../../../lib/md-to-html');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
    else if (/^--[^=]+$/.test(raw)) args[raw.slice(2)] = true;
  }
  return args;
}

function pandocAvailable() {
  try {
    execSync('pandoc --version', { stdio: 'ignore' });
    return true;
  } catch (_err) {
    return false;
  }
}

function findMarkdownFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return results;
  }
  for (const e of entries) {
    if (e.name === '.claude') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...findMarkdownFiles(full));
    else if (/\.md$/.test(e.name)) results.push(full);
  }
  return results;
}

function renderOne(mdPath, usePandoc) {
  const htmlPath = mdPath.replace(/\.md$/, '.html');
  if (usePandoc) {
    try {
      execSync(`pandoc "${mdPath}" -o "${htmlPath}" --standalone`, { stdio: 'ignore' });
      return { file: htmlPath, engine: 'pandoc' };
    } catch (_err) {
      // pandoc実行に失敗した場合は自前変換にフォールバックする。
    }
  }
  const md = fs.readFileSync(mdPath, 'utf-8');
  const title = path.basename(mdPath, '.md');
  const html = markdownToHtml(md, { title });
  fs.writeFileSync(htmlPath, html, 'utf-8');
  return { file: htmlPath, engine: 'fallback' };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const usePandoc = pandocAvailable();

  let targets = [];
  if (args.all) {
    for (const zone of ['02_要件定義', '03_アプリケーション設計', '04_インフラ設計', '05_テスト', '06_移行・導入', '07_運用・保守']) {
      targets.push(...findMarkdownFiles(path.join(cwd, 'docs', zone)));
    }
  } else if (args.dir) {
    targets = findMarkdownFiles(path.isAbsolute(args.dir) ? args.dir : path.join(cwd, args.dir));
  } else {
    console.error('[doc-html-render] --dir=<パス> または --all を指定してください');
    process.exit(1);
  }

  const results = targets.map((f) => renderOne(f, usePandoc));
  console.log(JSON.stringify({ status: 'done', pandocAvailable: usePandoc, count: results.length, results }, null, 2));
}

main();
