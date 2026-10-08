#!/usr/bin/env node
'use strict';

/**
 * role-bash-guard.js
 *
 * 【イベント】PreToolUse（Bash|PowerShell）
 * 【目的】
 * role-boundary-guard.js は Edit|Write だけを見るため、Bash でのファイル書き込みはすり抜ける
 * 。読むだけの役（現在は ux-reviewer）について、
 * Bash で許すコマンドを決め打ちの許可リストに絞り、書き込みを構造的に防ぐ。
 * 許可リストに無い役（PM・他のエージェント）は今までどおり何もしない（exit 0）。
 *
 * 【ux-reviewer に許すもの（「読むだけ」の役）】
 *  - ux-review Skill の同梱スクリプト: node prototypes/.claude/skills/ux-review/scripts/{check,shot,save-report}.js
 *    （書き出し先は各スクリプトが `.claude-state/ux-review/**` に限る。save-report.js だけヒアドキュメントで本文を渡せる）
 *  - Playwright の準備: npx -y playwright@1.63.0 --version / install chromium
 *  - 読むだけのコマンド: ls cat head tail wc grep rg sort uniq cut tr find git（読む系の副コマンドのみ） sed（-n の行の表示のみ）
 *    jq diff stat file basename dirname pwd cd echo date test true
 * 【拒否するもの】
 *  - 許可リストに無いコマンド（rm・mv・cp・tee・touch・mkdir・npm・curl・python・awk・xargs 等）
 *  - 出力のリダイレクト（> と >>。ただし 2>&1・>/dev/null・2>/dev/null は可）
 *  - コマンド置換（$(...)・バッククォート）。中で何が動くか判定できないため
 *  - find の -exec・-delete 等、git の書き込み系の副コマンドと --output、sed -i、sort -o
 *  - PowerShell（ux-reviewer の tools に無い。あっても使わせない）
 *
 * 【判定不能時】コマンドが取れない入力は許可する（ツール仕様の変化で全部止めないため。role-boundary-guard.js と同じ）。
 * 【動作確認】echo '{"tool_name":"Bash","agent_type":"ux-reviewer","tool_input":{"command":"rm -rf x"}}' | node .claude/hooks/role-bash-guard.js
 */

const fs = require('fs');

const BS = String.fromCharCode(92); // 逆斜線（書き込み経路で二重の逆斜線が潰れるため文字コードで持つ）

const UX_SCRIPT_RE = /(^|\/)prototypes\/\.claude\/skills\/ux-review\/scripts\/(check|shot|save-report)\.js$/;
const READ_ONLY = new Set(['ls', 'cat', 'head', 'tail', 'wc', 'grep', 'rg', 'sort', 'uniq', 'cut', 'tr', 'find', 'git', 'sed', 'jq', 'diff', 'stat', 'file', 'basename', 'dirname', 'pwd', 'cd', 'echo', 'date', 'test', 'true', 'node', 'npx']);
const GIT_READ = new Set(['log', 'show', 'diff', 'status', 'grep', 'ls-files', 'blame', 'rev-parse', 'cat-file', 'shortlog']);
const FIND_DENY = new Set(['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprint', '-fprint0', '-fprintf', '-fls']);
const ALLOWED_REDIRECTS = new Set(['2>&1', '>&2', '1>&2', '2>/dev/null', '>/dev/null', '1>/dev/null', '&>/dev/null']);

/** 役ごとの規則。ここに無い役は対象外。 */
const ROLE_BASH_RULES = {
  'ux-reviewer': { checkSegment: checkUxReviewerSegment, allowHeredocFor: (tokens) => tokens[0] === 'node' && UX_SCRIPT_RE.test(norm(tokens[1] || '')) && /save-report\.js$/.test(tokens[1] || '') },
};

function norm(p) { return String(p).split(BS).join('/'); }

/**
 * コマンド文字列を、引用符の外の区切り（&& || ; | & 改行）で区切る。
 * あわせて、リダイレクト・コマンド置換・ヒアドキュメントを拾う（ヒアドキュメントの本文は判定から外す）。
 */
function scan(cmd) {
  const segments = [];
  let cur = '';
  let quote = null;
  let substitution = false;
  const redirects = [];
  const heredocs = []; // { segIndex, tag }
  let pendingHeredoc = null;
  for (let i = 0; i < cmd.length; i++) {
    const ch = cmd[i];
    const next = cmd[i + 1];
    if (quote === "'") { cur += ch; if (ch === "'") quote = null; continue; }
    if (ch === BS) { cur += ch + (next || ''); i++; continue; }
    if (quote === '"') {
      if (ch === '`' || (ch === '$' && next === '(')) substitution = true;
      cur += ch; if (ch === '"') quote = null; continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '`' || (ch === '$' && next === '(')) { substitution = true; cur += ch; continue; }
    if (ch === '<' && next === '<' && cmd[i + 2] !== '<') {
      // ヒアドキュメント: <<TAG / <<'TAG' / <<"TAG" / <<-TAG
      const m = /^<<-?\s*(['"]?)([A-Za-z_][A-Za-z0-9_]*)\1/.exec(cmd.slice(i));
      if (m) { pendingHeredoc = m[2]; heredocs.push({ segIndex: segments.length, tag: m[2] }); cur += m[0]; i += m[0].length - 1; continue; }
    }
    if (ch === '>' || (ch === '&' && next === '>')) {
      // 直前の数字（2> など）も含めて、リダイレクトの字句を取る
      let start = cur.length;
      while (start > 0 && /[0-9]/.test(cur[start - 1])) start--;
      const prefix = cur.slice(start);
      cur = cur.slice(0, start);
      const m = /^(&?>>?)(&[0-9]|\s*[^\s;&|<>]+)?/.exec(cmd.slice(i));
      const tok = (prefix + (m ? m[1] + (m[2] || '').trim() : ch));
      redirects.push(tok);
      i += (m ? m[0].length : 1) - 1;
      continue;
    }
    if (ch === '\n' && pendingHeredoc) {
      // 本文を読み飛ばす（終わりの印の行まで）
      const tag = pendingHeredoc;
      pendingHeredoc = null;
      const lines = cmd.slice(i + 1).split('\n');
      let consumed = 0;
      let k = 0;
      for (; k < lines.length; k++) { consumed += lines[k].length + 1; if (lines[k].trim() === tag) break; }
      i += consumed;
      segments.push(cur); cur = '';
      continue;
    }
    const two = ch + (next || '');
    if (two === '&&' || two === '||') { segments.push(cur); cur = ''; i++; continue; }
    if (ch === ';' || ch === '|' || ch === '&' || ch === '\n') { segments.push(cur); cur = ''; continue; }
    cur += ch;
  }
  segments.push(cur);
  return { segments: segments.map((s) => s.trim()).filter(Boolean), redirects, substitution, heredocs };
}

/** 空白で区切り、引用符を外す（簡易）。先頭の VAR=値 と time は飛ばす。 */
function tokensOf(seg) {
  const out = [];
  const re = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let m;
  while ((m = re.exec(seg))) out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  while (out.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(out[0]) || out[0] === 'time')) out.shift();
  return out;
}

function checkUxReviewerSegment(tokens) {
  const cmd = tokens[0];
  if (!READ_ONLY.has(cmd)) return `「${cmd}」は ux-reviewer の Bash では使えません（読むだけの役。使えるのはスクショ・機械検査の同梱スクリプトと読むだけのコマンド）`;
  if (cmd === 'node') {
    if (!UX_SCRIPT_RE.test(norm(tokens[1] || ''))) return 'node で動かせるのは prototypes/.claude/skills/ux-review/scripts/ の check.js・shot.js・save-report.js だけです';
  }
  if (cmd === 'npx') {
    const rest = tokens.slice(1).filter((t) => t !== '-y' && t !== '--yes').join(' ');
    if (!/^playwright@1\.63\.0 (--version|install chromium)$/.test(rest)) return 'npx は「npx -y playwright@1.63.0 --version」「… install chromium」だけです';
  }
  if (cmd === 'git') {
    const sub = tokens.slice(1).find((t) => !t.startsWith('-'));
    if (tokens.includes('-c') || !GIT_READ.has(sub)) return `git ${sub || ''} は使えません（log・show・diff・status・grep・ls-files・blame だけ）`;
    if (tokens.some((t) => t.startsWith('--output'))) return 'git の --output は使えません';
  }
  if (cmd === 'find' && tokens.some((t) => FIND_DENY.has(t))) return 'find の -exec・-delete 等は使えません';
  if (cmd === 'sed' && (tokens.some((t) => t.startsWith('-i') || t.startsWith('--in-place')) || !tokens.includes('-n'))) return 'sed は -n の表示（例: sed -n 1,40p ファイル）だけです';
  if (cmd === 'sort' && tokens.some((t) => t === '-o' || t.startsWith('--output'))) return 'sort -o は使えません';
  return null;
}

function decide(roleKey, command) {
  const rule = ROLE_BASH_RULES[roleKey];
  if (!rule) return null;
  const s = scan(command);
  if (s.substitution) return 'コマンド置換（$(...)・バッククォート）は使えません';
  const badRedirect = s.redirects.find((r) => !ALLOWED_REDIRECTS.has(r.replace(/\s+/g, '')));
  if (badRedirect) return `出力のリダイレクト（${badRedirect}）は使えません。結果は save-report.js で .claude-state/ux-review/ に書いてください`;
  for (let idx = 0; idx < s.segments.length; idx++) {
    const tokens = tokensOf(s.segments[idx]);
    if (!tokens.length) continue;
    const reason = rule.checkSegment(tokens);
    if (reason) return reason;
  }
  for (const h of s.heredocs) {
    const tokens = tokensOf(s.segments[h.segIndex] || '');
    if (!rule.allowHeredocFor(tokens)) return 'ヒアドキュメントは save-report.js に本文を渡すときだけ使えます';
  }
  return null;
}

function main() {
  let payload = {};
  try { payload = JSON.parse(fs.readFileSync(0, 'utf-8') || '{}'); } catch (_) { payload = {}; }
  const roleKey = payload.agent_type;
  if (!roleKey || !ROLE_BASH_RULES[roleKey]) process.exit(0);
  if (payload.tool_name === 'PowerShell') {
    console.error(`[role-bash-guard] role=${roleKey} は PowerShell を使えません（Bash の許可リストの範囲で作業してください）。`);
    process.exit(2);
  }
  const command = payload.tool_input && payload.tool_input.command;
  if (typeof command !== 'string' || !command.trim()) process.exit(0);
  const reason = decide(roleKey, command);
  if (reason) {
    console.error(`[role-bash-guard] role=${roleKey}: ${reason}（ux-reviewer は読むだけで、書いてよいのは .claude-state/ux-review/** の結果だけ）。`);
    process.exit(2);
  }
  process.exit(0);
}

if (require.main === module) main();
module.exports = { scan, decide };
