#!/usr/bin/env node
'use strict';

/**
 * new-decision.js（decide Skill 同梱スクリプト）
 *
 * 【目的・理由】
 * 決定ログ（`DL-{4桁}_{タイトルkebab}.md`）を 02_実行基盤アーキテクチャ 8.1節の書式に
 * 従って機械的に生成する。decide Skillを実行するエージェント（LLM）が人手でMarkdownを
 * 組み立てると、frontmatterのキー抜け・ID重複・カンマ区切り記法の不統一など、
 * decision-check の機械集計を壊す誤りが生じやすい。生成をスクリプト化することで
 * 書式を固定し、8.3節が要求する「grepで機械的に数えられる」frontmatterを保証する。
 *
 * 【影響範囲】
 * `docs/00_プロジェクト管理・ガバナンス/decisions/` 配下への新規ファイル作成。
 * `.claude-state/decision-warnings.json` の消し込み（該当する警告があれば）。
 *
 * 【前提条件・制約】
 * - 実行時のcwdはリポジトリルート（またはテスト用の疑似ルート）を想定する。
 * - `DL-0000` は本スクリプトの対象外（process-option.js が専用に扱う、8.7節）。
 * - 入力は `--input=<jsonファイルパス>` を推奨する（日本語の長文・改行を含むフィールドを
 *   シェル引数で渡すのは事故りやすいため）。単純なケース向けに個別フラグも受け付ける。
 *
 * 【使い方】
 *   node new-decision.js --input=/path/to/decision.json
 *   node new-decision.js --category=事業背景 --title=... --content=... --irreversibility=高
 *
 * --input=<json> が受け付けるフィールド:
 *   category (必須, 対象カテゴリ)
 *   title (必須)
 *   slug (省略時 "untitled". ファイル名に使うASCII kebab-case)
 *   content (必須, 決定内容)
 *   rationale (根拠)
 *   alternatives (検討した代替案と却下理由)
 *   irreversibility (必須, "高"|"中"|"低")
 *   irreversibilityReason (不可逆性の理由)
 *   disposition (覆す場合の扱い。01文書4.8節のどの戻りパターンに該当するか)
 *   status ("確定"|"仮"|"覆った". 既定"確定")
 *   decidedAt (ISO8601. 省略時は実行時刻)
 *   decidedBy (決定者)
 *   roles (配列。決定に関与したロール)
 *   lanes (配列。影響レーン A/B/C)
 *   relatedHb (配列。関連HB-ID)
 *   slots (文字列。"業務ルール=あり, 異常系=該当なし" 形式。HB-ID単位分母用、8.3節(b))
 *   nfrId (NFR-ID。非機能決定の場合)
 *   opsCode (運用項目コード。B1〜B6/I1〜I7/M1〜M10)
 *   opsHearing ({escalation, businessImpactCriteria, externalReporting,
 *                prodChangeApprover, disposalTrigger}. 条件B相当決定時、04文書6.3節の5項目)
 *   resolve (配列。明示的に消し込む decision-warnings.json の警告ID)
 *
 * 【契約】
 * 対象外と判定した（coderの一次判定、PMへ報告。02文書16.3.3節の対象拡張に伴う
 * 判定、以後同様）。本ファイルは決定ログ1件を指定書式で新規作成する単純な
 * writerであり、複数エントリを横断集計する処理（16.6節(c)）ではない
 * （集計側は`decision-check/scripts/check.js`に分離されている）。分母・分子計算
 * （(a)）・入力形式のバージョン分岐（(b)）・fail-closed判定（(d)）・無効化と
 * 正常0件の区別不能性（(e)）のいずれにも該当しない。`resolve`引数による
 * `decision-warnings.json`の消し込みは指定IDの`resolved`更新のみで判定ロジックを
 * 持たない。
 */

const fs = require('fs');
const path = require('path');
const { stringifyFrontmatter } = require('../../../lib/frontmatter');
const { decisionsDir, nextDecisionId } = require('../../../lib/decisions');
const { readWarnings, writeWarnings } = require('../../../lib/warnings-store');

function parseArgs(argv) {
  const args = {};
  for (const raw of argv) {
    const m = /^--([^=]+)=([\s\S]*)$/.exec(raw);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function toArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v;
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function loadInput(args) {
  if (args.input) {
    const raw = fs.readFileSync(args.input, 'utf-8');
    const json = JSON.parse(raw);
    json.roles = toArray(json.roles);
    json.lanes = toArray(json.lanes);
    json.relatedHb = toArray(json.relatedHb);
    json.resolve = toArray(json.resolve);
    return json;
  }
  return {
    category: args.category,
    title: args.title,
    slug: args.slug,
    content: args.content,
    rationale: args.rationale,
    alternatives: args.alternatives,
    irreversibility: args.irreversibility,
    irreversibilityReason: args['irreversibility-reason'],
    disposition: args.disposition,
    status: args.status || '確定',
    decidedAt: args['decided-at'],
    decidedBy: args['decided-by'],
    roles: toArray(args.roles),
    lanes: toArray(args.lanes),
    relatedHb: toArray(args['related-hb']),
    slots: args.slots,
    nfrId: args['nfr-id'],
    opsCode: args['ops-code'],
    opsHearing: args['ops-hearing'] ? JSON.parse(args['ops-hearing']) : undefined,
    resolve: toArray(args.resolve),
  };
}

function requireFields(input, fields) {
  const missing = fields.filter((f) => !input[f]);
  if (missing.length) {
    console.error(`[new-decision] 必須項目が不足しています: ${missing.join(', ')}`);
    process.exit(1);
  }
}

function buildBody(input) {
  const parts = [];
  parts.push(`# ${input.decisionId}: ${input.title}`, '');
  parts.push('## 決定内容', input.content || '(未記載)', '');
  parts.push('## 根拠', input.rationale || '(未記載)', '');
  parts.push('## 検討した代替案と却下理由', input.alternatives || '(未記載)', '');
  parts.push('## 不可逆性の理由', input.irreversibilityReason || '(未記載)', '');
  parts.push(
    '## 覆す場合の扱い',
    input.disposition || '(01文書4.8節のゾーン別戻りコスト表の該当区分に従う)',
    ''
  );
  if (input.opsHearing) {
    parts.push('## 運用ヒアリング項目（04文書6.3節、条件B該当決定に必須）', '');
    parts.push(
      `1. 重大インシデント発生時の一次対応者・エスカレーション先: ${
        input.opsHearing.escalation || '(未記載)'
      }`
    );
    parts.push(`2. 事業影響の判断基準: ${input.opsHearing.businessImpactCriteria || '(未記載)'}`);
    parts.push(
      `3. 対外報告義務の有無と、報告先・期限: ${input.opsHearing.externalReporting || '(未記載)'}`
    );
    parts.push(`4. 本番変更の最終承認者: ${input.opsHearing.prodChangeApprover || '(未記載)'}`);
    parts.push(
      `5. データ廃棄・システム廃止の判断トリガとなる条件: ${
        input.opsHearing.disposalTrigger || '(未記載)'
      }`,
      ''
    );
  }
  return parts.join('\n') + '\n';
}

function slugify(raw) {
  const base = (raw || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'untitled';
}

/**
 * decision-warnings.json の消し込み処理（8.2.5節）。
 * 1. `input.resolve` に明示的な警告IDがあれば、それらのみを解決する
 *    （「orchestrateが警告IDを明示的に引数として渡す方式」）。
 * 2. 無ければ「パス・タイムスタンプの近接一致」で自動解決を試みる：
 *    - file_change / stop_session: 警告のpath_or_task（basename）が生成した決定ログの
 *      本文に含まれ、かつ検知から24時間以内であれば一致とみなす
 *    - task_boundary_missing / task_boundary_unrecorded: 警告のagent_typeが
 *      今回の「決定に関与したロール」に含まれ、かつ検知から24時間以内であれば一致とみなす
 * この近接一致は完全ではない（02文書15章が要検証とする領域と同種の限界を持つ）。
 * 一致しなかった警告は decision-check 実行時に一覧化され、手動解消を促す（8.2.5節）。
 */
function resolveWarnings(cwd, input, fileContent, decisionId) {
  const data = readWarnings(cwd);
  const resolvedIds = [];
  const now = Date.now();

  if (input.resolve && input.resolve.length) {
    for (const w of data.warnings) {
      if (input.resolve.includes(w.id) && !w.resolved) {
        w.resolved = true;
        w.resolved_by = decisionId;
        resolvedIds.push(w.id);
      }
    }
  } else {
    const haystack = fileContent.toLowerCase();
    const roles = (input.roles || []).map((r) => r.toLowerCase());
    for (const w of data.warnings) {
      if (w.resolved) continue;
      const detected = Date.parse(w.detected_at || '');
      const withinWindow = isNaN(detected) ? true : now - detected <= 24 * 3600 * 1000;
      if (!withinWindow) continue;

      let matched = false;
      if ((w.type === 'file_change' || w.type === 'stop_session') && w.path_or_task) {
        const base = path.basename(String(w.path_or_task)).toLowerCase();
        if (base && haystack.includes(base)) matched = true;
      } else if (w.type === 'task_boundary_missing' || w.type === 'task_boundary_unrecorded') {
        const agentType = String(w.agent_type || w.path_or_task || '').toLowerCase();
        if (agentType && roles.includes(agentType)) matched = true;
      }
      if (matched) {
        w.resolved = true;
        w.resolved_by = decisionId;
        resolvedIds.push(w.id);
      }
    }
  }

  writeWarnings(data, cwd);
  return resolvedIds;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = loadInput(args);
  requireFields(input, ['category', 'title', 'content', 'irreversibility']);

  if (!['高', '中', '低'].includes(input.irreversibility)) {
    console.error('[new-decision] --irreversibility は 高|中|低 のいずれかを指定すること');
    process.exit(1);
  }

  const cwd = process.cwd();
  const id = 'DL-' + nextDecisionId(cwd);
  input.decisionId = id;

  const slug = slugify(input.slug || input.title);
  const fileName = `${id}_${slug}.md`;
  const dir = decisionsDir(cwd);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, fileName);

  if (fs.existsSync(filePath)) {
    console.error(`[new-decision] 既に同名のファイルが存在します: ${filePath}`);
    process.exit(1);
  }

  const fm = {
    決定ID: id,
    決定内容: input.content,
    不可逆度: input.irreversibility,
    状態: input.status || '確定',
    決定日時: input.decidedAt || new Date().toISOString(),
    決定者: input.decidedBy || '(未記載)',
    決定に関与したロール: (input.roles || []).join(', '),
    影響レーン: (input.lanes || []).join(', '),
    対象カテゴリ: input.category,
    '関連HB-ID': (input.relatedHb || []).join(', '),
    対象スロット: input.slots || '',
    'NFR-ID': input.nfrId || '',
    運用項目コード: input.opsCode || '',
  };

  const body = buildBody(input);
  const fileContent = stringifyFrontmatter(fm, body);
  fs.writeFileSync(filePath, fileContent, 'utf-8');

  const resolvedWarnings = resolveWarnings(cwd, input, fileContent, id);

  console.log(
    JSON.stringify(
      {
        file: path.relative(cwd, filePath),
        id,
        resolvedWarnings,
      },
      null,
      2
    )
  );
}

main();
