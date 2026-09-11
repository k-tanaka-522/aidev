#!/usr/bin/env node
'use strict';

/**
 * check-links.js（doc-link-check Skill 同梱スクリプト）
 *
 * 【目的・理由】
 * 03文書8.2節・02文書9.6節が要求する文書間リンク検査を実装する。
 * (1) 相対リンクの参照切れ検知、(2) 項番言及があるのに実リンクが張られていない
 * 箇所（未リンク言及）の検出、の2種を行い、検出結果を`00-13_課題管理表.md`へ登録する。
 *
 * 【前提条件・制約】
 * - `docs/v2/*`（フレームワーク自身の設計書）と`docs/00_.../decisions/`配下は
 *   案件成果物のリンク検査の対象外とする（doc-header-guard.jsの対象範囲判定と
 *   整合させる。ただし外部リンク切れの実例が`docs/v2/`側にもあったため、
 *   `--include-framework-docs`指定時のみ`docs/v2/`も対象に含める）
 * - アンカー（`#section`）付きリンクは、ファイル存在確認のみ行いアンカー先の実在は
 *   検査しない（見出しIDの生成規則が本フレームワークの各所で統一されていないため。
 *   要検証として明示する）
 * - `http(s)://`で始まる外部リンクは実在確認をしない（本プロジェクトはネットワーク
 *   アクセスを要さない実行を優先するため。外部参照切れの実例は02文書14.2節M6で
 *   別途扱われる）
 *
 * 【M5修正】03文書版1.5・3.2.6節が`00-13_課題管理表.md`の列を正本化したため、
 * `.claude/lib/issue-ledger.js`（正本スキーマの共有実装）へ差し替えた。「参照切れ」は
 * 列挙値`リンク切れ`に、「未リンク言及」は列挙値に該当項目が無いため`その他`に対応させる。
 *
 * 【契約】
 * 対象外と判定した（coderの一次判定、PMへ報告）。`.claude/lib/issue-ledger.js`の
 * ヘッダーコメント【契約】欄で述べたのと同じ理由により、登録先の`00-13_課題管理表.md`
 * はいずれのGateからも読み取られず、GO/NG判定の分母・分子計算に組み込まれていない
 * （16.6節(a)非該当）。本ファイル自身の検出ロジック（相対リンクの存在確認・項番言及の
 * 正規表現抽出）も、複数エントリの横断集計（(c)）やバージョン分岐（(b)）を伴わない。
 */

const fs = require('fs');
const path = require('path');
const { registerIssue, KIND } = require('../../../lib/issue-ledger');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
    else if (/^--[^=]+$/.test(raw)) args[raw.slice(2)] = true;
  }
  return args;
}

function walkMarkdownFiles(dir, includeFrameworkDocs) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return results;
  }
  for (const e of entries) {
    if (e.name === '.claude') continue;
    if (!includeFrameworkDocs && e.name === 'v2') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) results.push(...walkMarkdownFiles(full, includeFrameworkDocs));
    else if (/\.md$/.test(e.name)) results.push(full);
  }
  return results;
}

/** 相対リンク [text](path) を抽出する（httpリンクは除外）。 */
function extractRelativeLinks(content) {
  const re = /\[([^\]]*)\]\(([^)]+)\)/g;
  const links = [];
  let m;
  while ((m = re.exec(content))) {
    const target = m[2];
    if (/^https?:\/\//.test(target) || target.startsWith('#')) continue;
    links.push({ text: m[1], target });
  }
  return links;
}

/**
 * 項番言及（例:「詳細はCRUD図（03-10）を参照」）を抽出する。
 * 単なる項番の出現（台帳テーブルのセル値等）と区別するため、直後・直前20文字以内に
 * 「参照」を伴う場合のみ言及とみなす（03文書8.2節の例「◯◯（項番）を参照」に対応）。
 */
function extractItemNumberMentions(content) {
  const re = /[（(](0[0-7]-\d{2}(?:-\d{2})?)[）)]/g;
  const mentions = new Set();
  let m;
  while ((m = re.exec(content))) {
    const windowText = content.slice(m.index, m.index + m[0].length + 20);
    if (windowText.includes('参照')) mentions.add(m[1]);
  }
  return Array.from(mentions);
}

function fileExists(baseDir, target) {
  const clean = target.split('#')[0];
  if (!clean) return true; // 同一ファイル内アンカーのみの場合は対象外
  const resolved = path.resolve(baseDir, clean);
  return fs.existsSync(resolved);
}

function registerLinkIssue(cwd, { kind, file, detail }) {
  registerIssue(cwd, {
    kind,
    detectedBy: 'doc-link-check',
    content: `${file}: ${detail}`,
    relatedIds: file,
  });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const targetDir = args.dir ? (path.isAbsolute(args.dir) ? args.dir : path.join(cwd, args.dir)) : path.join(cwd, 'docs');
  const includeFrameworkDocs = Boolean(args['include-framework-docs']);

  const files = walkMarkdownFiles(targetDir, includeFrameworkDocs);
  const brokenLinks = [];
  const unlinkedMentions = [];

  // ファイル名から項番を逆引きするための索引（未リンク言及の実ファイル存在確認に使う）。
  const itemNoToFile = {};
  for (const f of files) {
    const base = path.basename(f);
    const m = /^(0[0-7]-\d{2}(?:-\d{2})?)_/.exec(base);
    if (m) itemNoToFile[m[1]] = f;
  }

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf-8');
    const dir = path.dirname(file);

    for (const link of extractRelativeLinks(content)) {
      if (!fileExists(dir, link.target)) {
        brokenLinks.push({ file: path.relative(cwd, file), target: link.target, text: link.text });
      }
    }

    for (const itemNo of extractItemNumberMentions(content)) {
      const targetFile = itemNoToFile[itemNo];
      if (!targetFile) continue; // 対応する実ファイルが無い（別文書体系等）は対象外
      const relTarget = path.relative(dir, targetFile).replace(/\\/g, '/');
      const hasLink = content.includes(`](${relTarget})`) || content.includes(`](./${relTarget})`);
      if (!hasLink) {
        unlinkedMentions.push({ file: path.relative(cwd, file), itemNo, suggestedTarget: path.relative(cwd, targetFile) });
      }
    }
  }

  for (const b of brokenLinks) {
    // 【注意】detail文字列に`[text](target)`形式をそのまま書くと、00-13課題管理表.md
    // 自身が次回検査時に「参照切れリンクを含む文書」として再検出されてしまう
    // （自己言及によるノイズ）。角括弧を全角に変換して回避する。
    registerLinkIssue(cwd, { kind: KIND.BROKEN_LINK, file: b.file, detail: `リンク先が実在しない: ${b.text}（${b.target}）` });
  }
  for (const u of unlinkedMentions) {
    // 03文書3.2.6節の列挙値に「未リンク言及」に相当する専用項目が無いため`その他`を用いる。
    registerLinkIssue(cwd, { kind: KIND.OTHER, file: u.file, detail: `未リンク言及: 項番「${u.itemNo}」への言及があるが実リンクが無い（候補: ${u.suggestedTarget}）` });
  }

  console.log(
    JSON.stringify(
      { status: 'done', filesChecked: files.length, brokenLinks, unlinkedMentions },
      null,
      2
    )
  );
}

main();
