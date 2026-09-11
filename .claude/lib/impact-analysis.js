#!/usr/bin/env node
'use strict';

/**
 * impact-analysis.js（M5新設・共有ライブラリ）
 *
 * 【目的・理由】
 * 01文書5.2節「影響範囲分析の手順（必須・MUST）」は次を要求する。
 *   1. 対象IDの特定（Ticketの内容から要件ID・画面遷移ID・APIエンドポイントを特定）
 *   2. 正引き（対象IDからRTMの当該行 → 設計書項番・実装ファイル・テストIDを抽出）
 *   3. 逆引き（波及先の導出。実装ファイル・APIエンドポイントを検索キーに、RTM全体を
 *      逆引きして同一の実装ファイル・同一API・同一画面を共有する他の要件IDを機械抽出）
 *   4. 波及先の分類（直接影響／連動影響／非機能影響）
 *   5. 文書更新義務範囲の決定
 * さらに「実装を読んで『影響がありそうな箇所』を主観的に洗い出す方法は禁止する
 * （MUST NOT）」と明記する。本ライブラリは、この手順をRTM（`00-02`/`00-03`台帳、
 * および02文書9.1.1節の静的解析が書き戻した逆引き列）に対する機械的な検索として実装する。
 *
 * 【`unresolved`の扱い（タスク指示・02文書9.1.1節版2.1のMUSTを踏襲）】
 * 02文書9.1.1節が定める静的解析には対応できない範囲があり、その結果`00-02`台帳の逆引き列に
 * リテラル値`unresolved`が書き込まれる場合がある（`static-analysis-run.js`、M5でMUST化に
 * 対応）。本ライブラリは、対象IDの正引きが`unresolved`に当たった場合、および対象ID自体が
 * どの台帳にも見つからない場合を**沈黙させず**、結果オブジェクトの`unresolved`配列に理由
 * 付きで明示する（MUST）。これを怠ると「主観的な洗い出し」より悪い、**誤った完全性の主張**
 * になる（タスク指示のとおり）。
 *
 * 【できる範囲・できない範囲（正直な限界表明）】
 * - できる: `00-02`/`00-03`台帳・静的解析の逆引き列を検索キーにした機械的な正引き・逆引き
 * - できない: 01文書5.2節が要求する「設計書項番」の特定。`00-02`/`05-02`の列定義
 *   （03文書3.2.1節）には「設計書項番」列が存在せず、モジュール名からの逆引き検索
 *   （`docs/03_*`・`docs/04_*`・`docs/05_*`配下のファイル名・本文grep）で代替する
 *   近似値に留まる。一致が無い場合は`unresolved`として明示する（推測で埋めない）
 * - できない: 非機能影響（NFR-ID）の対象モジュールへの厳密な対応付け。決定ログの
 *   `NFR-ID`フィールドはHB-ID/モジュールとの構造的な関連付けを持たない（02文書10.1.1節）
 *   ため、決定ログ本文のテキスト一致という弱いヒューリスティックで候補を絞り込むに留まり、
 *   一致しない場合も「全NFR-ID一覧」を横断的な確認対象として別掲する（01文書5.2節手順4の
 *   「非機能影響」区分の趣旨に合わせる）
 *
 * 【影響範囲】
 * `.claude/skills/impact-analysis/scripts/impact-analysis.js`（CLIラッパー）。
 */

const fs = require('fs');
const path = require('path');
const { readTableAsObjects } = require('./markdown-table');
const { ledger0002Path, ledger0003Path, govDir } = require('./ledger-paths');
const { decisionsDir, listDecisionFiles } = require('./decisions');

const UNRESOLVED = 'unresolved';
const ID_PATTERN = /(HB|API|SCR|RPT|BAT|NFR)-\d{4}/g;

/** チケット本文（title+body）からID体系（10.1節の6種）の出現を抽出する。 */
function extractIdsFromText(text) {
  if (!text) return [];
  const found = new Set();
  let m;
  const re = new RegExp(ID_PATTERN);
  while ((m = re.exec(text))) found.add(m[0]);
  return Array.from(found);
}

/** バッククォートで囲まれたファイルパス片を抽出する（本文中の言及からの推測補助）。 */
function extractFilePathMentions(text) {
  if (!text) return [];
  const re = /`([^`]+\.(?:tsx?|jsx?|py|java|cs|go))`/g;
  const found = new Set();
  let m;
  while ((m = re.exec(text))) found.add(m[1]);
  return Array.from(found);
}

function loadLedgers(cwd) {
  const hbRows = readTableAsObjects(ledger0002Path(cwd));
  const batRows = readTableAsObjects(ledger0003Path(cwd));
  return { hbRows, batRows };
}

/** 経路欄（`SCR-ID/RPT-ID/BAT-ID/API-ID`をカンマ等で列挙）からID一覧を抽出する。 */
function parseRoute(routeCell) {
  if (!routeCell) return [];
  const re = new RegExp(ID_PATTERN);
  const found = [];
  let m;
  while ((m = re.exec(routeCell))) found.push(m[0]);
  return found;
}

/**
 * 対象ID配列を`00-02`/`00-03`に対して正引きする。
 * 戻り値: { resolved: [{targetId, hbId, row, kind}], unresolved: [{targetId, reason}] }
 */
function forwardLookup(targetIds, hbRows, batRows) {
  const resolved = [];
  const unresolved = [];

  for (const id of targetIds) {
    const prefix = id.split('-')[0];
    if (prefix === 'HB') {
      const row = hbRows.find((r) => r['HB-ID'] === id);
      if (row) resolved.push({ targetId: id, hbId: id, row, kind: 'HB' });
      else unresolved.push({ targetId: id, reason: '00-02台帳にHB-IDが見つからない' });
      continue;
    }
    if (prefix === 'BAT') {
      const row = batRows.find((r) => r['BAT-ID'] === id);
      if (row) resolved.push({ targetId: id, hbId: null, row, kind: 'BAT' });
      else unresolved.push({ targetId: id, reason: '00-03台帳にBAT-IDが見つからない' });
      continue;
    }
    if (['SCR', 'RPT', 'API'].includes(prefix)) {
      // 経路欄、またはAPI-ID逆引き列にIDが含まれるHB-ID行を検索する。
      const rows = hbRows.filter(
        (r) => parseRoute(r['経路（SCR-ID/RPT-ID/BAT-ID/API-ID）']).includes(id) || r['API-ID（逆引き）'] === id
      );
      if (rows.length > 0) {
        for (const row of rows) resolved.push({ targetId: id, hbId: row['HB-ID'], row, kind: prefix });
      } else {
        unresolved.push({ targetId: id, reason: `${prefix}-IDを経路として持つHB-IDが00-02に見つからない（sync-check未実施、または静的解析未到達の可能性）` });
      }
      continue;
    }
    if (prefix === 'NFR') {
      // NFR-IDは決定ログのfrontmatterに存在するかのみ確認する（HB-IDとの構造的関連は無い）。
      resolved.push({ targetId: id, hbId: null, row: null, kind: 'NFR' });
      continue;
    }
    unresolved.push({ targetId: id, reason: '未知のID接頭辞（10.1節の6種ID体系に該当しない）' });
  }

  return { resolved, unresolved };
}

/** `00-02`全行から、実装ファイル/API-ID/モジュールをキーにした逆引き索引を構築する。 */
function buildReverseIndex(hbRows) {
  const byFile = new Map();
  const byApi = new Map();
  const byModule = new Map();
  for (const row of hbRows) {
    const hbId = row['HB-ID'];
    if (!hbId) continue;
    for (const [col, map] of [
      ['実装ファイル（逆引き）', byFile],
      ['API-ID（逆引き）', byApi],
      ['モジュール（逆引き）', byModule],
    ]) {
      const val = row[col];
      if (!val || val === UNRESOLVED) continue;
      if (!map.has(val)) map.set(val, new Set());
      map.get(val).add(hbId);
    }
  }
  return { byFile, byApi, byModule };
}

/**
 * 波及先（連動影響）を導出する（01文書5.2節手順3）。
 * 直接影響を受けるHB-IDが共有する実装ファイル・API-ID・モジュールを検索キーに、
 * 他のHB-IDを機械抽出する。
 */
function reverseLookup(directHbIds, hbRowsByHbId, index) {
  const indirect = new Map(); // hbId -> Set(共有キーの理由)
  for (const hbId of directHbIds) {
    const row = hbRowsByHbId.get(hbId);
    if (!row) continue;
    for (const [col, map, label] of [
      ['実装ファイル（逆引き）', index.byFile, '実装ファイル共有'],
      ['API-ID（逆引き）', index.byApi, 'API共有'],
      ['モジュール（逆引き）', index.byModule, 'モジュール共有'],
    ]) {
      const val = row[col];
      if (!val || val === UNRESOLVED) continue;
      const sharing = map.get(val) || new Set();
      for (const other of sharing) {
        if (directHbIds.has(other)) continue;
        if (!indirect.has(other)) indirect.set(other, new Set());
        indirect.get(other).add(`${label}(${val})`);
      }
    }
  }
  return indirect;
}

/** モジュール名／HB-IDから設計書候補ファイルを近似検索する（できない範囲、grepベース近似）。 */
function findDesignDocCandidates(cwd, keyword) {
  if (!keyword) return [];
  const roots = ['docs/03_アプリケーション設計', 'docs/04_インフラ設計', 'docs/05_テスト'];
  const candidates = [];
  for (const root of roots) {
    const dir = path.join(cwd, root);
    let stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(cur, { withFileTypes: true });
      } catch (_err) {
        continue;
      }
      for (const e of entries) {
        if (e.name === '.claude') continue;
        const full = path.join(cur, e.name);
        if (e.isDirectory()) {
          stack.push(full);
        } else if (/\.md$/.test(e.name)) {
          let text = '';
          try {
            text = fs.readFileSync(full, 'utf-8');
          } catch (_err) {
            text = '';
          }
          if (e.name.includes(keyword) || text.includes(keyword)) {
            candidates.push(path.relative(cwd, full));
          }
        }
      }
    }
  }
  return candidates;
}

/** 決定ログからNFR-ID一覧、およびキーワード一致する候補を抽出する（弱いヒューリスティック）。 */
function findNfrCandidates(cwd, keywords) {
  const files = listDecisionFiles(cwd);
  const all = [];
  const matched = [];
  for (const f of files) {
    const nfrId = f.data['NFR-ID'];
    if (!nfrId) continue;
    all.push({ nfrId, file: f.file, category: f.data['対象カテゴリ'] || '' });
    const haystack = `${f.body || ''} ${f.data['対象カテゴリ'] || ''} ${f.data['影響レーン'] || ''}`;
    if (keywords.some((k) => k && haystack.includes(k))) {
      matched.push({ nfrId, file: f.file });
    }
  }
  return { all, matched };
}

/**
 * 影響範囲分析の本体（01文書5.2節手順1〜5）。
 * `input.text`: チケットのtitle+body、`input.explicitIds`: 明示指定ID配列、
 * `input.mode`: 'mode-b' | 'zone3-hotfix'（10.4節、軽量モードはID種別をHB/SCR/API/NFRに限定）。
 */
function analyzeImpact(cwd, input) {
  const mode = input.mode === 'zone3-hotfix' ? 'zone3-hotfix' : 'mode-b';
  const textIds = extractIdsFromText(input.text);
  const explicitIds = input.explicitIds || [];
  let targetIds = Array.from(new Set([...textIds, ...explicitIds]));

  const allowedPrefixes = mode === 'zone3-hotfix' ? ['HB', 'SCR', 'API', 'NFR'] : ['HB', 'SCR', 'API', 'RPT', 'BAT', 'NFR'];
  const excludedByMode = targetIds.filter((id) => !allowedPrefixes.includes(id.split('-')[0]));
  targetIds = targetIds.filter((id) => allowedPrefixes.includes(id.split('-')[0]));

  const { hbRows, batRows } = loadLedgers(cwd);
  const hbRowsByHbId = new Map(hbRows.filter((r) => r['HB-ID']).map((r) => [r['HB-ID'], r]));

  const { resolved, unresolved } = forwardLookup(targetIds, hbRows, batRows);

  const directHbIds = new Set(resolved.filter((r) => r.hbId).map((r) => r.hbId));

  // 正引きできたが静的解析側がunresolvedだった項目を明示する（9.1.1節版2.1のMUST）。
  const staticUnresolved = [];
  for (const r of resolved) {
    if (!r.row) continue;
    const cols = ['実装ファイル（逆引き）', 'API-ID（逆引き）', 'モジュール（逆引き）'];
    for (const col of cols) {
      const v = r.row[col];
      if (v === UNRESOLVED) {
        staticUnresolved.push({
          targetId: r.targetId,
          hbId: r.hbId,
          reason: `静的解析が「${col}」を解決できていない（00-02に unresolved と明記済み。02文書9.1.1節の対応範囲外の可能性）`,
        });
      }
    }
  }

  const index = buildReverseIndex(hbRows);
  const indirectMap = reverseLookup(directHbIds, hbRowsByHbId, index);

  const filePathMentions = extractFilePathMentions(input.text);
  const unmatchedFileMentions = filePathMentions.filter(
    (p) => !hbRows.some((r) => (r['実装ファイル（逆引き）'] || '').includes(p))
  );

  // 非機能影響（できない範囲: 厳密な対応付けは不可、弱いヒューリスティックのみ）。
  const moduleKeywords = resolved
    .map((r) => r.row && r.row['モジュール（逆引き）'])
    .filter((v) => v && v !== UNRESOLVED);
  const nfr = findNfrCandidates(cwd, moduleKeywords);

  // 設計書候補（できない範囲: 00-02にはRTM上の「設計書項番」列が存在しないための近似）。
  const designDocCandidates = {};
  for (const hbId of directHbIds) {
    const row = hbRowsByHbId.get(hbId);
    const moduleName = row && row['モジュール（逆引き）'];
    const keyword = moduleName && moduleName !== UNRESOLVED ? path.basename(moduleName) : hbId;
    designDocCandidates[hbId] = findDesignDocCandidates(cwd, keyword);
  }

  const directImpacts = Array.from(directHbIds).map((hbId) => ({
    hbId,
    row: hbRowsByHbId.get(hbId),
    designDocCandidates: designDocCandidates[hbId] || [],
    docUpdateRequired: true,
  }));

  const indirectImpacts = Array.from(indirectMap.entries()).map(([hbId, reasons]) => ({
    hbId,
    sharedVia: Array.from(reasons),
    regressionTestRequired: true,
    docUpdateRequired: false,
    rtmReferenceAppendRequired: true,
  }));

  const allUnresolved = []
    .concat(unresolved)
    .concat(staticUnresolved)
    .concat(
      excludedByMode.map((id) => ({
        targetId: id,
        reason: `${mode}モードの対象ID種別（${allowedPrefixes.join('/')}）に含まれないため対象外（02文書10.4節）`,
      }))
    )
    .concat(
      unmatchedFileMentions.map((p) => ({
        targetId: p,
        reason: 'チケット本文中のファイルパス言及が00-02の実装ファイル（逆引き）列と一致しない（静的解析の対応外、または未resolveの可能性）',
      }))
    )
    .concat(
      directImpacts
        .filter((d) => d.designDocCandidates.length === 0)
        .map((d) => ({
          targetId: d.hbId,
          reason: '対応する設計書ファイルをキーワード近似検索でも特定できない（00-02/05-02に「設計書項番」列が存在しないための構造的な限界、人手確認が必要）',
        }))
    );

  return {
    mode,
    targetIds,
    directImpacts,
    indirectImpacts,
    nonFunctionalImpacts: {
      matched: nfr.matched,
      allNfrIds: nfr.all,
      note: '対象モジュールとNFR-IDの厳密な対応付けは構造的に不可能なため、決定ログ本文とのテキスト一致による弱いヒューリスティックで絞り込んだ候補（matched）と、横断確認用の全件（allNfrIds）を併記する。Guard（6章）の対象範囲確認は人手で行うこと。',
    },
    unresolved: allUnresolved,
    batContext: mode === 'mode-b' ? resolved.filter((r) => r.kind === 'BAT') : [],
    documentUpdateObligation: {
      mustRevise: directImpacts.map((d) => ({ hbId: d.hbId, candidates: d.designDocCandidates })),
      mustAppendRtmReference: indirectImpacts.map((d) => d.hbId),
    },
  };
}

module.exports = {
  UNRESOLVED,
  extractIdsFromText,
  extractFilePathMentions,
  parseRoute,
  forwardLookup,
  buildReverseIndex,
  reverseLookup,
  findDesignDocCandidates,
  findNfrCandidates,
  analyzeImpact,
};
