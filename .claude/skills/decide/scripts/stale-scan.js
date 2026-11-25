#!/usr/bin/env node
'use strict';

/**
 * stale-scan.js（decide Skill 同梱スクリプト。由来: salon-booking-platform）
 *
 * 【目的・理由】
 * 新しいセッションは前の会話を覚えておらず、毎回最初に読む資料（CLAUDE.md・エージェント定義・
 * Skill・PM のメモの目次）と決定ログから状況をつかむ。古い決定を新しい決定が置き換えても、
 * 古い DL に印が無く、毎回読む資料も直っていないと、新しいセッションが古い方を信じる
 * （salon-booking-platform で、AI の呼び先を替えた後も CLAUDE.md が旧い呼び先のままで誤解した件）。
 * このスクリプトは、その2種類のズレの候補を機械で出す。直すか・どこまで覆ったかの判断はしない。
 *
 * 【出すもの】
 * 1. 印の付いていない置き換え: 新しい DL の「決定内容」に、古い DL を覆す・改める等と書かれて
 *    いるのに、古い DL の 置き換え先 にその新しい DL が無いもの。`DL-0154(3)` のように項を
 *    指していれば一部の置き換えの候補として出す。根拠・代替案の節は見ない（却下した案の言及が混ざるため）
 * 2. 覆った DL を指している毎回読む資料: 状態が 覆った の DL を名指ししている
 *    `.claude/CLAUDE.md`・`.claude/agents/*.md`・`.claude/docs/*.md`・リポジトリ内の全 `.claude/skills/**\/SKILL.md`
 *    （ディレクトリスコープの Skill を含む）・PM のメモの目次（MEMORY.md）の行。
 *    一部覆った の DL を指す行は、指している部分が今も生きていることが多いので別枠（参考）で出す
 *
 * 【使い方】
 *   node .claude/skills/decide/scripts/stale-scan.js          # 人が読む一覧
 *   node .claude/skills/decide/scripts/stale-scan.js --json   # 機械向け
 *   --since=DL-xxxx  1 の候補は、この DL より後に起票された DL だけを見る（前回の棚卸しで見た分を繰り返さない。
 *                    見た最後の DL は pmo が progress.md に残す）
 *   --memory=<MEMORY.md のパス>  メモの目次を明示する（省略時はホームの .claude/projects から探す）
 *
 * 印を付けるときは new-decision.js の supersedes（新しく起票する時）か、
 * 既存の DL どうしなら mark-superseded.js を使う。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { listDecisionFiles } = require('../../../lib/decisions');
const { splitList } = require('../../../lib/frontmatter');

const CHANGE_WORDS = /(覆|改め|置き換え|置換|撤回|取り消|取消|差し替え|上書き|廃止)/;
const REF = /DL-(\d{4})([(（][0-9０-９]+[)）])?/g;

/** 全角の項の指定「（３）」を半角「(3)」に揃える */
function normItem(s) {
  return (s || '').replace(/（/g, '(').replace(/）/g, ')').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)(?:=([\s\S]*))?$/.exec(raw);
    if (m) args[m[1]] = m[2] === undefined ? true : m[2];
  }
  return args;
}

/** 本文の「## 決定内容」節だけを取り出す（無ければ frontmatter の 決定内容）。 */
function decisionText(d) {
  const body = d.body || '';
  const start = body.indexOf('## 決定内容');
  if (start === -1) return d.data['決定内容'] || '';
  const rest = body.slice(start + '## 決定内容'.length);
  const end = rest.search(/\n## /);
  return (end === -1 ? rest : rest.slice(0, end)).trim() || d.data['決定内容'] || '';
}

function findUnmarkedSupersedes(decisions, since = '') {
  const byId = new Map(decisions.map((d) => [d.file.slice(0, 7), d]));
  const out = [];
  for (const d of decisions) {
    const selfId = d.file.slice(0, 7);
    if (since && selfId <= since) continue;
    const sentences = decisionText(d).split(/[。\n]/);
    const seen = new Set();
    for (const s of sentences) {
      if (!CHANGE_WORDS.test(s)) continue;
      for (const m of s.matchAll(REF)) {
        const oldId = `DL-${m[1]}`;
        const item = normItem(m[2]);
        const key = oldId + item;
        if (oldId >= selfId || seen.has(key)) continue;
        const old = byId.get(oldId);
        if (!old) continue;
        if (old.data['状態'] === '覆った') continue;
        const marked = splitList(old.data['置き換え先']).some((e) => e.startsWith(selfId));
        if (marked) continue;
        seen.add(key);
        out.push({
          old: oldId,
          item,
          oldStatus: old.data['状態'] || '',
          by: selfId,
          sentence: s.trim().slice(0, 160),
        });
      }
    }
  }
  return out;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude-state', 'cdk.out', 'dist', 'build', 'coverage']);

/** リポジトリ全体から .claude/skills/ 配下の SKILL.md を集める（ディレクトリスコープの Skill を含む） */
function walkSkillDocs(dir, acc) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_e) {
    return acc;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walkSkillDocs(full, acc);
    } else if (e.name === 'SKILL.md' && /[\\/]\.claude[\\/]skills[\\/]/.test(full)) {
      acc.push(full);
    }
  }
  return acc;
}

function defaultMemoryIndex() {
  const base = path.join(os.homedir(), '.claude', 'projects');
  let dirs;
  try {
    dirs = fs.readdirSync(base);
  } catch (_e) {
    return null;
  }
  // Claude Code はプロジェクトのパスの英数字以外を '-' にした名前でメモを置く（例: c--Users-me-proj）
  const want = process.cwd().replace(/[^A-Za-z0-9]/g, '-').toLowerCase();
  const hit = dirs.find((n) => n.toLowerCase() === want);
  if (!hit) return null;
  const p = path.join(base, hit, 'memory', 'MEMORY.md');
  return fs.existsSync(p) ? p : null;
}

function alwaysLoadedFiles(cwd, memoryIndex) {
  const files = [path.join(cwd, '.claude', 'CLAUDE.md')];
  const agents = path.join(cwd, '.claude', 'agents');
  try {
    for (const n of fs.readdirSync(agents)) if (n.endsWith('.md')) files.push(path.join(agents, n));
  } catch (_e) {
    /* agents が無い環境（テスト）では飛ばす */
  }
  // 全サブエージェントが読む共通原則（.claude/docs/*.md）
  const docs = path.join(cwd, '.claude', 'docs');
  try {
    for (const n of fs.readdirSync(docs)) if (n.endsWith('.md')) files.push(path.join(docs, n));
  } catch (_e) {
    /* 無ければ飛ばす */
  }
  walkSkillDocs(cwd, files);
  if (memoryIndex) files.push(memoryIndex);
  return files.filter((f) => fs.existsSync(f));
}

function findRefsToOverturned(cwd, decisions, memoryIndex) {
  const overturned = new Map(
    decisions
      .filter((d) => ['覆った', '一部覆った'].includes(d.data['状態']))
      .map((d) => [d.file.slice(0, 7), d])
  );
  const out = [];
  for (const f of alwaysLoadedFiles(cwd, memoryIndex)) {
    const lines = fs.readFileSync(f, 'utf-8').split(/\r?\n/);
    lines.forEach((line, i) => {
      for (const m of line.matchAll(REF)) {
        const id = `DL-${m[1]}`;
        const d = overturned.get(id);
        if (!d) continue;
        // 同じ行で置き換え先も名指ししていれば、経緯として書いているだけなので出さない
        const by = splitList(d.data['置き換え先']).map((e) => e.slice(0, 7));
        if (by.some((b) => line.includes(b))) continue;
        out.push({
          file: path.relative(cwd, f) || f,
          line: i + 1,
          ref: id,
          status: d.data['状態'],
          replacedBy: d.data['置き換え先'] || '',
          text: line.trim().slice(0, 160),
        });
      }
    });
  }
  return out;
}

function scan(cwd, opts = {}) {
  const decisions = listDecisionFiles(cwd);
  const memoryIndex = opts.memory === undefined ? defaultMemoryIndex() : opts.memory;
  const refs = findRefsToOverturned(cwd, decisions, memoryIndex);
  return {
    unmarkedSupersedes: findUnmarkedSupersedes(decisions, opts.since || ''),
    refsToOverturned: refs.filter((r) => r.status === '覆った'),
    refsToPartial: refs.filter((r) => r.status !== '覆った'),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = scan(process.cwd(), {
    memory: typeof args.memory === 'string' ? args.memory : undefined,
    since: typeof args.since === 'string' ? args.since : '',
  });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`## 印の付いていない置き換えの候補（${result.unmarkedSupersedes.length}件）`);
  for (const c of result.unmarkedSupersedes) {
    console.log(`- ${c.old}${c.item}（今: ${c.oldStatus}）← ${c.by}: ${c.sentence}`);
  }
  console.log('');
  console.log(`## 覆った DL を指している毎回読む資料（${result.refsToOverturned.length}件）`);
  for (const r of result.refsToOverturned) {
    console.log(`- ${r.file}:${r.line} ${r.ref}（${r.status}、置き換え先 ${r.replacedBy || '未記入'}）: ${r.text}`);
  }
  console.log('');
  console.log(`## 参考: 一部覆った DL を指している行（${result.refsToPartial.length}件。指す部分が今も生きていれば直さない）`);
  for (const r of result.refsToPartial) {
    console.log(`- ${r.file}:${r.line} ${r.ref}（置き換え先 ${r.replacedBy || '未記入'}）`);
  }
}

if (require.main === module) main();

module.exports = { scan, findUnmarkedSupersedes, decisionText };
