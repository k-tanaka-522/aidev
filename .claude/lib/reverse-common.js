#!/usr/bin/env node
'use strict';

/**
 * reverse-common.js（M4共有ライブラリ）
 *
 * 【目的・理由】
 * `docs/{02〜07}/.claude/skills/{reverse-doc,traceability-reverse}` はいずれも
 * 「(1) 00-01成果物構成カタログの当該行を更新する（03文書8.1節・02文書9.4節の分割生成・
 * 中断耐性の要求）、(2) 文書ヘッダーにdoc-style-guide必須フィールド＋`生成区分`を付与する
 * （02文書9.2節・03文書8.4節）、(3) `reverse-doc`経由生成である実行時マーカーを埋め込む
 * （doc-style-guide本文、9.2節）、(4) 決定ログから該当エントリを引用する「2.5 決定ログ
 * からの引用」節を作る（03文書8.4節）」という共通処理を持つ。各項番のreverse-doc実装ごとに
 * この共通処理を再実装すると、ヘッダー書式・マーカー方式が個別にずれるリスクが高いため
 * 1箇所に集約する。
 *
 * 【影響範囲】
 * `docs/{02,03,04,06,07}_(各項番名)/.claude/skills/reverse-doc/scripts/*.js`、
 * `docs/05_テスト/.claude/skills/traceability-reverse/scripts/*.js`。
 *
 * 【前提条件・制約】
 * - `00-01_成果物構成カタログ.md`の列スキーマは`artifact-emptiness-guard.js`（M3実装済み、
 *   変更不可）が前提とする暫定スキーマ
 *   `項番 | 成果物名 | 区分（02〜07） | 状態（未生成/生成済み/対象外） | 生成日時`
 *   に完全に合わせる（MUST）。列名を変えるとhookが誤動作せず単に検査対象から外れる
 *   （安全側フォールバックのため実害は無いが、hookの検知が機能しなくなる）。
 * - `生成区分`の値集合は`doc-header-guard.js`が検査する4値
 *   （`実装反映(as-built)` | `実装反映(as-built) - スナップショット版` |
 *   `事前設計(前倒し)` | `手動作成`）と一致させる（MUST）。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { upsertRow, readTableAsObjects } = require('./markdown-table');
const { ledger0001Path, ledger0002Path, ledger0003Path } = require('./ledger-paths');
const { decisionsDir, listDecisionFiles } = require('./decisions');
const { readZoneState } = require('./zone-state');

/** artifact-emptiness-guard.js（M3実装、変更不可）が前提とする00-01の列スキーマ。 */
const CATALOG_HEADER = ['項番', '成果物名', '区分（02〜07）', '状態（未生成/生成済み/対象外）', '生成日時'];

/** doc-header-guard.js（M3実装）が検査する`生成区分`の値集合。 */
const SEISEIKUBUN = {
  AS_BUILT: '実装反映(as-built)',
  AS_BUILT_SNAPSHOT: '実装反映(as-built) - スナップショット版',
  FRONT_LOADED: '事前設計(前倒し)',
  MANUAL: '手動作成',
};

/** doc-header-guard.js（M3実装）が検査する必須ヘッダーフィールド。 */
const REQUIRED_HEADER_FIELDS = [
  '文書番号',
  '文書名',
  '版数',
  '作成日',
  '最終更新日',
  '作成者',
  '承認者',
  '分類',
  '準拠規格',
  '生成区分',
];

/**
 * `reverse-doc`経由で生成されたことを示す実行時マーカー（9.2節、doc-style-guide本文）。
 * `reverse-doc`を経由せず直接`docs/02〜07`に書き込まれたファイルとの識別に用いる。
 * 【制約・doc-style-guideが明記する既知の限界】この識別方式は「マーカーが書いてあれば
 * reverse-doc経由とみなす」という自己申告に近い方式であり、手動でファイルを編集した際に
 * マーカーを消し忘れれば検知できない（更新漏れへの脆弱性、doc-style-guide/SKILL.md参照）。
 */
function buildExecutionMarker({ skill, generatedAt }) {
  return `<!-- reverse-doc-generated: skill=${skill}; generated_at=${generatedAt} -->`;
}

const EXECUTION_MARKER_RE = /<!--\s*reverse-doc-generated:/;

function hasExecutionMarker(content) {
  return EXECUTION_MARKER_RE.test(content);
}

/** 03文書8.4節のヘッダーテンプレートに従いfrontmatter文字列を組み立てる。 */
function buildDocHeader({
  docNo,
  docName,
  version = '1.0',
  createdDate,
  updatedDate,
  author,
  approver = 'PM',
  classification = '関係者限り',
  standard = 'IPA共通フレーム2013',
  seiseikubun,
}) {
  if (!Object.values(SEISEIKUBUN).includes(seiseikubun)) {
    throw new Error(`buildDocHeader: 不正な生成区分 "${seiseikubun}"`);
  }
  const today = new Date().toISOString().slice(0, 10);
  const lines = [
    '---',
    `文書番号: ${docNo}`,
    `文書名: ${docName}`,
    `版数: ${version}`,
    `作成日: ${createdDate || today}`,
    `最終更新日: ${updatedDate || today}`,
    `作成者: ${author}`,
    `承認者: ${approver}`,
    `分類: ${classification}`,
    `準拠規格: ${standard}`,
    `生成区分: ${seiseikubun}`,
    '---',
    '',
  ];
  return lines.join('\n');
}

/**
 * 00-01成果物構成カタログの当該行を更新する（03文書8.1節の状態遷移、02文書9.4節の
 * 分割生成・中断耐性）。生成のたびに都度呼ぶ（MUST、まとめ書き禁止の原則を
 * カタログの更新にも適用する）。
 */
function markCatalogGenerated(cwd, { itemNo, name, section, status = 'generated' }) {
  const statusLabel = status === 'generated' ? '生成済み' : status === 'excluded' ? '対象外' : '未生成';
  upsertRow(
    ledger0001Path(cwd),
    CATALOG_HEADER,
    '項番',
    itemNo,
    [itemNo, name, section, statusLabel, new Date().toISOString()],
    {
      title: '00-01 成果物構成カタログ',
      description:
        '> 列定義: `.claude/hooks/artifact-emptiness-guard.js`が前提とする暫定スキーマ（PMへの報告事項、M3）。\n' +
        '> 各reverse-doc実行が自身の担当行を都度更新する（03文書8.1節「自己申告、機械検査はgate-check/decision-check」）。',
    }
  );
}

/** 00-01カタログの現状を読む（INDEXの「状態」列集計等に使う）。 */
function readCatalog(cwd) {
  return readTableAsObjects(ledger0001Path(cwd));
}

/**
 * 決定ログから該当エントリを抜粋し、「2.5 決定ログからの引用」節（03文書8.4節）を作る。
 * 該当が無い場合は「未記載」と明記し実装から推測しない（MUST、02文書9.3節・8.6節）。
 */
function excerptDecisions(cwd, { categoryIncludes = [], hbIds = [], relatedText = [] } = {}) {
  const all = listDecisionFiles(cwd);
  const matched = all.filter((d) => {
    const cat = String(d.data['対象カテゴリ'] || '');
    const hb = String(d.data['関連HB-ID'] || '');
    const haystack = (d.body || '') + cat;
    if (categoryIncludes.some((c) => cat.includes(c))) return true;
    if (hbIds.some((id) => hb.includes(id))) return true;
    if (relatedText.some((t) => t && haystack.includes(t))) return true;
    return false;
  });

  const lines = ['## 2.5 決定ログからの引用', ''];
  if (matched.length === 0) {
    lines.push(
      '未記載（該当する決定ログが見つからなかった。実装からの推測で埋めることは禁止する。' +
        '02文書9.3節・8.6節）。',
      ''
    );
    return { section: lines.join('\n'), matched: [] };
  }
  for (const d of matched) {
    const content = (d.data['決定内容'] || '').trim();
    lines.push(`- **${d.data['決定ID'] || d.file}**（不可逆度: ${d.data['不可逆度'] || '?'}）: ${content}`);
  }
  lines.push('');
  return { section: lines.join('\n'), matched: matched.map((d) => d.data['決定ID'] || d.file) };
}

/** `.claude-state/current-zone.json`の`zone3_freeze_tag`（9.4.2節、コードフリーズ基準点）。 */
function getFreezeTag(cwd) {
  return readZoneState(cwd).zone3_freeze_tag || null;
}

/**
 * `git diff {freezeTag}..HEAD`の差分有無を確認する（9.4.2節「基準点更新が必要」警告）。
 * gitリポジトリでない・タグが存在しない等の場合は判定不能として`null`を返す
 * （誤検知よりも「わからない」ことを明示する方針、02文書9.3節の慎重さと同じ姿勢）。
 */
function checkFreezeTagDrift(cwd, freezeTag) {
  if (!freezeTag) return { checked: false, reason: 'zone3_freeze_tagが未設定' };
  try {
    const out = execSync(`git diff ${freezeTag}..HEAD --stat`, { cwd, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return { checked: true, hasDrift: out.trim().length > 0, diffStat: out.trim() };
  } catch (err) {
    return { checked: false, reason: `git diff失敗: ${err.message.split('\n')[0]}` };
  }
}

/**
 * 実行時マーカー・生成区分・ヘッダー必須フィールドをすべて満たすas-built文書を書き出す。
 * 9.4節「1セクション判明するごとに即座に追記する」原則により、呼び出し側は本文セクションを
 * 積み上げてから最後に1回このみを呼ぶのではなく、`upsertGeneratedDoc`を都度呼んで
 * 生成途中の内容を都度ディスクへ反映することを推奨する（中断耐性）。
 */
function writeGeneratedDoc(filePath, { header, marker, body }) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, header + marker + '\n\n' + body, 'utf-8');
}

/**
 * 01文書4.4.5節 手順8: `HB-ID`を正式要件ID（`F-{領域}-{連番}`）へ変換する。
 * 冪等（既に変換済みの行はスキップする）。生成DAG（02文書9.4.1節）「00-02 HB台帳
 * （正式ID変換前）→ 02-02 機能要件一覧」に対応し、`docs/02_要件定義/reverse-doc`が
 * `02-02`を生成する処理の一部として呼ぶ（MUST、この時点で初めて正式要件IDが定まる）。
 * `domain`は領域名（例: "FUNC"）。省略時は"FUNC"に固定する（案件別の領域分割は
 * 01文書に具体的な粒度規定が無いため、本実装は単一領域で機械的に採番する簡易版とし、
 * 領域分割が必要な場合は生成後に手動でリネームすることを許容する）。
 */
function convertHbIdsToFormalIds(cwd, domain = 'FUNC') {
  const rows = readTableAsObjects(ledger0002Path(cwd));
  const header = [
    'HB-ID',
    '経路（SCR-ID/RPT-ID/BAT-ID/API-ID）',
    '正式要件ID',
    '実装ファイル（逆引き）',
    'API-ID（逆引き）',
    'モジュール（逆引き）',
    '状態',
  ];
  const converted = [];
  let seq = 1;
  // 既存の変換済みIDの最大連番を引き継ぐ（再実行時の重複採番防止）。
  for (const r of rows) {
    const m = new RegExp(`F-${domain}-(\\d+)`).exec(r['正式要件ID'] || '');
    if (m) seq = Math.max(seq, parseInt(m[1], 10) + 1);
  }
  for (const r of rows) {
    let formalId = r['正式要件ID'];
    if (!formalId || formalId === '(Zone3で変換)') {
      formalId = `F-${domain}-${String(seq).padStart(4, '0')}`;
      seq += 1;
      upsertRow(
        ledger0002Path(cwd),
        header,
        'HB-ID',
        r['HB-ID'],
        [r['HB-ID'], r['経路（SCR-ID/RPT-ID/BAT-ID/API-ID）'], formalId, r['実装ファイル（逆引き）'] || '', r['API-ID（逆引き）'] || '', r['モジュール（逆引き）'] || '', r['状態'] || '']
      );
    }
    converted.push({ hbId: r['HB-ID'], formalId, route: r['経路（SCR-ID/RPT-ID/BAT-ID/API-ID）'] });
  }
  return converted;
}

/** 同様に`BAT-ID`を`F-BAT-{連番}`へ変換する（01文書4.4.5節、03文書3.2.3節版1.4）。 */
function convertBatIdsToFormalIds(cwd) {
  const rows = readTableAsObjects(ledger0003Path(cwd));
  const header = [
    'BAT-ID',
    'ジョブ名',
    '入出力仕様参照（decisions/配下）',
    '経由HB-ID（画面経由の場合）',
    '正式ID（F-BAT-{連番}）',
    '状態',
    '登録日時',
  ];
  const converted = [];
  let seq = 1;
  for (const r of rows) {
    const m = /F-BAT-(\d+)/.exec(r['正式ID（F-BAT-{連番}）'] || '');
    if (m) seq = Math.max(seq, parseInt(m[1], 10) + 1);
  }
  for (const r of rows) {
    let formalId = r['正式ID（F-BAT-{連番}）'];
    if (!formalId) {
      formalId = `F-BAT-${String(seq).padStart(4, '0')}`;
      seq += 1;
      upsertRow(ledger0003Path(cwd), header, 'BAT-ID', r['BAT-ID'], [
        r['BAT-ID'],
        r['ジョブ名'],
        r['入出力仕様参照（decisions/配下）'],
        r['経由HB-ID（画面経由の場合）'] || '',
        formalId,
        r['状態'] || '',
        r['登録日時'] || '',
      ]);
    }
    converted.push({ batId: r['BAT-ID'], formalId });
  }
  return converted;
}

module.exports = {
  CATALOG_HEADER,
  SEISEIKUBUN,
  REQUIRED_HEADER_FIELDS,
  buildExecutionMarker,
  hasExecutionMarker,
  buildDocHeader,
  markCatalogGenerated,
  readCatalog,
  excerptDecisions,
  getFreezeTag,
  checkFreezeTagDrift,
  writeGeneratedDoc,
  convertHbIdsToFormalIds,
  convertBatIdsToFormalIds,
  decisionsDir,
};
