#!/usr/bin/env node
'use strict';

/**
 * static-analysis.js（M4新設・共有ライブラリ）
 *
 * 【目的・理由】
 * 02文書9.1.1節（Mode B入口ゲート向けRTM逆引き列の機械生成）・9.1.2節（CRUD図の静的解析
 * 生成）・03文書3.11節が要求する「`src/`の静的解析からHB-ID→実装ファイル→API→モジュールの
 * 列、およびテーブル×機能のCRUD図を機械生成する」機構を1箇所に集約する。
 * `traceability-reverse`（05番）と`reverse-doc`（03-10 CRUD図）が抽出基盤を共有する
 * （02文書10.3節「9.1.2節と抽出基盤を共有してよい」、SHOULD）。
 *
 * 【正直な限界表明（MUST、タスク指示・02文書9.1.1節「限界」節を踏襲）】
 * 本モジュールはAST解析（ts-morph等）を用いず、正規表現ベースの軽量抽出に留める
 * （このリポジトリにts-morph等の外部依存が導入されていないため。`package.json`不在、
 * `field-extract.js`と同じ制約）。したがって以下のフレームワーク・記法のみを
 * 「アダプタ」として対応し、それ以外は自動生成を諦め、結果に`unresolved`として
 * 列挙する（MUST、02文書9.1.1節「フォールバックの許容」）。
 *
 * 対応アダプタ（対応できる範囲）:
 *   - フロントエンド ルーティング: (a) Next.js風のファイルベースルーティング
 *     （`pages/**` or `app/**\/page.*`）、(b) React Router風 `<Route path="...">`
 *   - フロントエンド API呼び出し: `fetch('...')` / `axios.get/post/put/delete('...')`
 *     の文字列リテラル引数（テンプレートリテラルの変数展開は不可、後述）
 *   - バックエンド ルーティング: (a) Express風 `router.get('...', handler)`、
 *     (b) FastAPI風 `@app.get("...")` / `@router.post("...")`
 *   - ORM定義: (a) TypeORM風 `@Entity()` クラス、(b) Sequelize風 `.define('Table', ...)`、
 *     (c) Django風 `class X(models.Model)`、(d) SQLAlchemy風 `__tablename__ = '...'`
 *   - E2Eテストのdocblock: `HB-ID: HB-0001` 形式のコメント＋`page.goto('/path')`風の
 *     ナビゲーション呼び出し
 *
 * 対応できない範囲（明示的にunresolvedとする。実装から推測しない）:
 *   - 動的なURL生成（文字列結合・テンプレートリテラルの変数展開によるパス組み立て）
 *   - 上記アダプタに無いフレームワーク（Vue Router、Django REST Framework、
 *     GraphQL、gRPC等）
 *   - リポジトリ層メソッドを呼び出す先（呼び出し元）のファイルをまたいだ関数呼び出しの
 *     追跡（コールグラフ解析）。CRUD操作は「そのメソッドを直接呼んでいる同一ファイル」
 *     までしか機能単位に紐づけない
 *
 * 【影響範囲】
 * `docs/05_テスト/.claude/skills/traceability-reverse/scripts/*.js`、
 * `docs/03_アプリケーション設計/.claude/skills/reverse-doc/scripts/crud-diagram.js`。
 *
 * 【契約】
 * 未設定。16.6節の選別基準（分母・分子集計への関与／入力形式のバージョン分岐／複数エントリの
 * 横断集計／fail-closedの挙動／「無効化」と「正しく0件」の区別不能性）に該当するかどうかの
 * 判定はapp-architectの所管であり、M7（16.9節）時点ではCT-0001〜CT-0004の4件のみが契約化
 * 済みである。本ファイルは対象内・対象外いずれの判定もまだ行われていない（契約が無いことを
 * 隠さないための明記、16.3.3節・16.10節）。
 */

const fs = require('fs');
const path = require('path');

/** ディレクトリを再帰的に走査し、拡張子フィルタに一致する全ファイルの絶対パスを返す。 */
function walkFiles(dir, extFilter) {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_err) {
    return results;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name.startsWith('.claude')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...walkFiles(full, extFilter));
    } else if (!extFilter || extFilter.test(e.name)) {
      results.push(full);
    }
  }
  return results;
}

function readSafe(file) {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch (_err) {
    return '';
  }
}

/**
 * 03文書5.1節のモジュール定義（ディレクトリ境界＝実装上の単位）に従い、ファイルパスから
 * モジュールIDを導出する。フロントエンドは1画面/コンポーネント境界、バックエンドは
 * サービスクラス群のディレクトリ境界を単位とする。本実装は「ファイルが属する直近の
 * 意味のあるディレクトリ」を機械的に採用する簡易版であり、5.1節が定める厳密な
 * 独立性判定（依存の単方向性等）は行わない（03文書10章残課題#2が要検証とする領域）。
 */
function deriveModuleId(cwd, filePath) {
  const rel = path.relative(cwd, filePath).replace(/\\/g, '/');
  const parts = rel.split('/');
  // src/backend/services/order/xxx.ts -> services/order 等、src/{layer}/ の次の1〜2階層を採用する。
  const srcIdx = parts.indexOf('src');
  if (srcIdx !== -1 && parts.length > srcIdx + 2) {
    return parts.slice(srcIdx + 1, srcIdx + 4).join('/').replace(/\.[^/.]+$/, '');
  }
  return path.dirname(rel);
}

// ---------------------------------------------------------------------------
// フロントエンド: ルーティング定義
// ---------------------------------------------------------------------------

/**
 * フロントエンドのルーティング定義を抽出する。
 * 戻り値: [{ routePath, file, kind }]
 */
function scanFrontendRoutes(cwd) {
  const feDir = path.join(cwd, 'src', 'frontend');
  const files = walkFiles(feDir, /\.(tsx?|jsx?)$/);
  const routes = [];

  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const text = readSafe(file);

    // (a) Next.js風ファイルベースルーティング: pages/**, app/**/page.*
    const pagesMatch = /\/(pages)\/(.+?)\.(tsx?|jsx?)$/.exec(rel);
    const appMatch = /\/(app)\/(.+?)\/page\.(tsx?|jsx?)$/.exec(rel);
    if (pagesMatch) {
      let p = '/' + pagesMatch[2].replace(/\/index$/, '').replace(/\[([^\]]+)\]/g, ':$1');
      if (p === '/') p = '/';
      routes.push({ routePath: p || '/', file: rel, kind: 'nextjs-pages' });
    } else if (appMatch) {
      const p = '/' + appMatch[2].replace(/\[([^\]]+)\]/g, ':$1');
      routes.push({ routePath: p, file: rel, kind: 'nextjs-app' });
    }

    // (b) React Router風 <Route path="...">
    const routeRe = /<Route\b[^>]*\bpath=["']([^"']+)["']/g;
    let m;
    while ((m = routeRe.exec(text))) {
      routes.push({ routePath: m[1], file: rel, kind: 'react-router' });
    }
  }
  return routes;
}

/** フロントエンドのAPI呼び出し（fetch/axios）を抽出する。戻り値: [{ file, path, method }] */
function scanFrontendApiCalls(cwd) {
  const feDir = path.join(cwd, 'src', 'frontend');
  const files = walkFiles(feDir, /\.(tsx?|jsx?)$/);
  const calls = [];
  const fetchRe = /fetch\(\s*["'`]([^"'`]+)["'`]/g;
  const axiosRe = /axios\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/g;
  const templateLiteralWarnRe = /fetch\(\s*`[^`]*\$\{/g;

  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const text = readSafe(file);
    let m;
    while ((m = fetchRe.exec(text))) {
      calls.push({ file: rel, path: m[1], method: null });
    }
    while ((m = axiosRe.exec(text))) {
      calls.push({ file: rel, path: m[2], method: m[1].toUpperCase() });
    }
    // 動的パス（テンプレートリテラルの変数展開）は解決不能。件数のみ記録する。
    const dynMatches = text.match(templateLiteralWarnRe);
    if (dynMatches) {
      calls.push({ file: rel, path: null, method: null, unresolved: true, count: dynMatches.length });
    }
  }
  return calls;
}

// ---------------------------------------------------------------------------
// バックエンド: ルーティング定義
// ---------------------------------------------------------------------------

/** バックエンドのルーティング定義を抽出する。戻り値: [{ method, routePath, file }] */
function scanBackendRoutes(cwd) {
  const beDir = path.join(cwd, 'src', 'backend');
  const files = walkFiles(beDir, /\.(tsx?|jsx?|py)$/);
  const routes = [];
  // Express風: router.get('/path', handler) / app.post("/path", ...)
  const expressRe = /\b(?:router|app)\.(get|post|put|delete|patch)\(\s*["'`]([^"'`]+)["'`]/g;
  // FastAPI/Flask風: @app.get("/path") / @router.post("/path")
  const fastapiRe = /@(?:app|router)\.(get|post|put|delete|patch)\(\s*["']([^"']+)["']/g;

  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const text = readSafe(file);
    let m;
    while ((m = expressRe.exec(text))) {
      routes.push({ method: m[1].toUpperCase(), routePath: m[2], file: rel, kind: 'express' });
    }
    while ((m = fastapiRe.exec(text))) {
      routes.push({ method: m[1].toUpperCase(), routePath: m[2], file: rel, kind: 'fastapi' });
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// 契約モック: パス→API-ID の対応
// ---------------------------------------------------------------------------

/**
 * `decisions/contracts/*.openapi.yaml` からパス・メソッド・operationId・x-api-idの
 * 対応を抽出する。戻り値: [{ routePath, method, operationId, apiId, file }]
 */
function scanContractApiIds(cwd) {
  const dir = path.join(cwd, 'docs', '00_プロジェクト管理・ガバナンス', 'decisions', 'contracts');
  const files = walkFiles(dir, /\.ya?ml$/);
  const results = [];
  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const text = readSafe(file);
    const lines = text.split(/\r?\n/);
    let currentPath = null;
    let pathIndent = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const pathMatch = /^(\s*)(\/[^\s:]*):\s*$/.exec(line);
      if (pathMatch && /^\s*paths:\s*$/.test(lines[Math.max(0, i - 1)] || '') === false) {
        // パス行はpaths:直下の1段インデントのみを対象とする（メソッド行と区別するため
        // インデント量を記録し、より深いインデントの行のみメソッド候補として扱う）。
      }
      if (pathMatch) {
        currentPath = pathMatch[2];
        pathIndent = pathMatch[1].length;
        continue;
      }
      const methodMatch = /^(\s*)(get|post|put|delete|patch):\s*$/.exec(line);
      if (methodMatch && currentPath && methodMatch[1].length > pathIndent) {
        const method = methodMatch[2].toUpperCase();
        const blockIndent = methodMatch[1].length;
        let operationId = null;
        let apiId = null;
        for (let j = i + 1; j < lines.length; j++) {
          const nextIndentMatch = /^(\s*)\S/.exec(lines[j]);
          if (!nextIndentMatch) continue;
          if (nextIndentMatch[1].length <= blockIndent) break;
          const opMatch = /operationId:\s*(\S+)/.exec(lines[j]);
          if (opMatch) operationId = opMatch[1];
          const apiIdMatch = /x-api-id:\s*(API-\d+)/.exec(lines[j]);
          if (apiIdMatch) apiId = apiIdMatch[1];
        }
        results.push({ routePath: currentPath, method, operationId, apiId, file: rel });
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// gate-check向け: skip/fixme/握りつぶし検知（本タスクで新設）
// ---------------------------------------------------------------------------

/**
 * 01文書6.5節「skip/fixme、例外処理の握りつぶしを含むテストは分子に数えない（MUST NOT）」
 * を機械的に判定する。AST解析を持たない本プロジェクトの制約（static-analysis.js冒頭の
 * 【正直な限界表明】参照）を踏まえ、正規表現ベースのヒューリスティックとする。
 *
 * 判定方法:
 * 1. ファイル内の全テスト宣言（`test`/`it`/`describe`とその`.skip`/`.fixme`/`.todo`修飾子、
 *    および`xit`/`xdescribe`）を収集する
 * 2. `idIndex`（IDのdocblockマッチ位置）に最も近いテスト宣言を「そのIDが属するテスト」と
 *    みなす（docblockがテスト宣言の直前・直後どちらに置かれる書き方でも拾えるよう、
 *    前後どちらの宣言も候補にする簡易な近傍ヒューリスティック。複数テストが密集するファイルでは
 *    誤対応の余地があることを明記する、限界として15章相当の要検証事項）
 * 3. 最寄りのテスト宣言が`.skip`/`.fixme`/`.todo`/`x`接頭辞であれば除外対象とする
 * 4. `idIndex`の前後2000文字以内に空の`catch`ブロック（例外の握りつぶし。
 *    `catch (e) {}` / `catch (e) => {}` 等）があれば、テスト宣言の状態にかかわらず除外対象とする
 *
 * 戻り値: 除外すべきなら`true`。
 */
function isDeadTestContext(text, idIndex) {
  const declRe = /\b(test|it|describe)(\.(skip|fixme|todo|only))?\s*\(/g;
  const xDeclRe = /\b(xit|xdescribe|xtest)\s*\(/g;
  const decls = [];
  let m;
  while ((m = declRe.exec(text))) {
    const modifier = m[3];
    decls.push({ start: m.index, skip: modifier === 'skip' || modifier === 'fixme' || modifier === 'todo' });
  }
  while ((m = xDeclRe.exec(text))) {
    decls.push({ start: m.index, skip: true });
  }
  let nearest = null;
  let nearestDist = Infinity;
  for (const d of decls) {
    const dist = Math.abs(d.start - idIndex);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = d;
    }
  }
  if (nearest && nearest.skip) return true;

  const swallowRe = /catch\s*\([^)]*\)\s*(=>)?\s*\{\s*\}/g;
  while ((m = swallowRe.exec(text))) {
    if (Math.abs(m.index - idIndex) <= 2000) return true;
  }
  return false;
}

/** `excluded: true`（skip/fixme/握りつぶし判定済み）の要素を除外した配列を返す。 */
function filterExecutable(list) {
  return list.filter((item) => !item.excluded);
}

// ---------------------------------------------------------------------------
// E2Eテスト: HB-IDのdocblockとナビゲーション先
// ---------------------------------------------------------------------------

/**
 * `tests/e2e/`のdocblock（`HB-ID: HB-0001`形式のコメント）と、直後の
 * ナビゲーション呼び出し（`page.goto('/path')`, `cy.visit('/path')`等）を抽出する。
 * 戻り値: [{ hbId, urlPath, file }]
 */
function scanE2eHbLinks(cwd) {
  const dir = path.join(cwd, 'tests', 'e2e');
  const files = walkFiles(dir, /\.(spec|test)\.(tsx?|jsx?|py)$/);
  const results = [];
  const hbRe = /HB-ID:\s*(HB-\d+)/g;
  const navRe = /(?:page\.goto|cy\.visit|browser\.get)\(\s*["'`]([^"'`]+)["'`]/g;

  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const text = readSafe(file);
    let hbMatch;
    const hbPositions = [];
    while ((hbMatch = hbRe.exec(text))) hbPositions.push({ hbId: hbMatch[1], index: hbMatch.index });
    if (hbPositions.length === 0) continue;

    const navPositions = [];
    let navMatch;
    while ((navMatch = navRe.exec(text))) navPositions.push({ urlPath: navMatch[1], index: navMatch.index });

    // 各HB-ID出現位置の直後に現れる最初のナビゲーション呼び出しを対応付ける
    // （同一テストブロック内にある、という簡易な位置関係のヒューリスティック）。
    for (const hb of hbPositions) {
      const nav = navPositions.find((n) => n.index > hb.index);
      results.push({ hbId: hb.hbId, urlPath: nav ? nav.urlPath : null, file: rel, excluded: isDeadTestContext(text, hb.index) });
    }
  }
  return results;
}

/** `tests/integration/`のdocblock（`API-ID: API-0001`）を抽出する。 */
function scanIntegrationApiLinks(cwd) {
  const dir = path.join(cwd, 'tests', 'integration');
  const files = walkFiles(dir, /\.(spec|test)\.(tsx?|jsx?|py)$/);
  const results = [];
  const apiRe = /API-ID:\s*(API-\d+)/g;
  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const text = readSafe(file);
    let m;
    while ((m = apiRe.exec(text))) results.push({ apiId: m[1], file: rel, excluded: isDeadTestContext(text, m.index) });
  }
  return results;
}

/**
 * ST（システムテスト、非機能検証）向け: `tests/`配下全体から`NFR-ID: NFR-0001`形式の
 * docblockを抽出する。02文書10.1.2節「STは非機能検証テストのdocblockのNFR-ID」を数える
 * ための分子集計に用いる。専用ディレクトリ（`tests/nfr/`等）を設計書は指定していないため、
 * `tests/`全体を対象とする（本タスクの実装判断としてPMへ報告する）。
 */
function scanNfrTestLinks(cwd) {
  const dir = path.join(cwd, 'tests');
  const files = walkFiles(dir, /\.(spec|test)\.(tsx?|jsx?|py)$/);
  const results = [];
  const nfrRe = /NFR-ID:\s*(NFR-\d+)/g;
  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const text = readSafe(file);
    let m;
    while ((m = nfrRe.exec(text))) results.push({ nfrId: m[1], file: rel, excluded: isDeadTestContext(text, m.index) });
  }
  return results;
}

/**
 * 画面非経由の`BAT-ID`向け: `tests/`配下全体から`BAT-ID: BAT-0001`形式のdocblockを抽出する。
 * 専用ディレクトリ（`tests/batch/`等）を設計書は指定していないため、`tests/`全体を対象とする
 * （NFR同様、本タスクの実装判断としてPMへ報告する）。
 */
function scanBatTestLinks(cwd) {
  const dir = path.join(cwd, 'tests');
  const files = walkFiles(dir, /\.(spec|test)\.(tsx?|jsx?|py)$/);
  const results = [];
  const batRe = /BAT-ID:\s*(BAT-\d+)/g;
  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const text = readSafe(file);
    let m;
    while ((m = batRe.exec(text))) results.push({ batId: m[1], file: rel, excluded: isDeadTestContext(text, m.index) });
  }
  return results;
}

// ---------------------------------------------------------------------------
// 9.1.1節: HB-ID → 実装ファイル → API-ID → モジュール の逆引き列
// ---------------------------------------------------------------------------

/**
 * 02文書9.1.1節の手順1〜3を実行し、HB-IDごとの逆引き情報を組み立てる。
 * 戻り値: { links: [{ hbId, implFile, apiId, module, confidence }], unresolved: [...] }
 */
function buildHbReverseLinks(cwd) {
  const e2eLinks = scanE2eHbLinks(cwd);
  const feRoutes = scanFrontendRoutes(cwd);
  const feApiCalls = scanFrontendApiCalls(cwd);
  const beRoutes = scanBackendRoutes(cwd);
  const contractApiIds = scanContractApiIds(cwd);

  const links = [];
  const unresolved = [];

  for (const e2e of e2eLinks) {
    if (!e2e.urlPath) {
      unresolved.push({ hbId: e2e.hbId, reason: 'E2Eテストにナビゲーション先URLが見つからない（対応アダプタ外の可能性）', file: e2e.file });
      continue;
    }
    // 手順1: HB-ID → 実装ファイル（フロントエンドのルーティング定義と突合）
    const route = feRoutes.find((r) => r.routePath === e2e.urlPath) ||
      feRoutes.find((r) => paramMatch(r.routePath, e2e.urlPath));
    if (!route) {
      unresolved.push({ hbId: e2e.hbId, reason: `URL "${e2e.urlPath}" に一致するフロントエンドルーティング定義が見つからない`, file: e2e.file });
      continue;
    }
    const implFile = route.file;

    // 手順2: 実装ファイル → API（同一ファイル内のAPI呼び出しをバックエンドルーティングと突合）
    const callsInFile = feApiCalls.filter((c) => c.file === implFile && c.path);
    let apiId = null;
    let backendFile = null;
    for (const call of callsInFile) {
      const beRoute = beRoutes.find((r) => r.routePath === call.path) || beRoutes.find((r) => paramMatch(r.routePath, call.path));
      if (beRoute) {
        const contract = contractApiIds.find((c) => c.routePath === beRoute.routePath || paramMatch(c.routePath, beRoute.routePath));
        apiId = contract ? contract.apiId : null;
        backendFile = beRoute.file;
        break;
      }
    }

    // 手順3: API → モジュール（バックエンドハンドラの属するディレクトリ）
    const module = backendFile ? deriveModuleId(cwd, path.join(cwd, backendFile)) : null;

    links.push({
      hbId: e2e.hbId,
      implFile,
      apiId: apiId || '',
      module: module || '',
      backendFile: backendFile || '',
      confidence: apiId ? 'high' : backendFile ? 'medium' : 'low',
    });
    if (!apiId) {
      unresolved.push({
        hbId: e2e.hbId,
        reason: backendFile
          ? 'バックエンドルートは特定できたがAPI-ID（契約モックのx-api-id）に対応が無い'
          : 'フロントエンドのAPI呼び出しがバックエンドルーティング定義と一致しない（動的パス生成の可能性）',
        file: implFile,
      });
    }
  }

  return { links, unresolved };
}

/** Express/React Router風の `:param` プレースホルダを考慮した緩やかなパス一致判定。 */
function paramMatch(pattern, actual) {
  if (!pattern || !actual) return false;
  const patternParts = pattern.split('/');
  const actualParts = actual.split('/');
  if (patternParts.length !== actualParts.length) return false;
  return patternParts.every((p, i) => p.startsWith(':') || p === actualParts[i]);
}

// ---------------------------------------------------------------------------
// 9.1.2節 / 03文書3.11節: CRUD図
// ---------------------------------------------------------------------------

/** ORM定義からテーブル一覧を抽出する。戻り値: [{ table, file, kind }] */
function scanOrmTables(cwd) {
  const beDir = path.join(cwd, 'src', 'backend');
  const files = walkFiles(beDir, /\.(tsx?|jsx?|py)$/);
  const tables = [];
  const typeormRe = /@Entity\(\s*(?:["']([^"']+)["'])?\s*\)\s*\r?\nexport\s+class\s+(\w+)/g;
  const sequelizeRe = /\.define\(\s*["']([^"']+)["']/g;
  const djangoRe = /class\s+(\w+)\(models\.Model\)/g;
  const sqlalchemyRe = /__tablename__\s*=\s*["']([^"']+)["']/g;

  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const text = readSafe(file);
    let m;
    while ((m = typeormRe.exec(text))) tables.push({ table: m[1] || m[2], file: rel, kind: 'typeorm' });
    while ((m = sequelizeRe.exec(text))) tables.push({ table: m[1], file: rel, kind: 'sequelize' });
    while ((m = djangoRe.exec(text))) tables.push({ table: m[1], file: rel, kind: 'django' });
    while ((m = sqlalchemyRe.exec(text))) tables.push({ table: m[1], file: rel, kind: 'sqlalchemy' });
  }
  return tables;
}

/**
 * データアクセス層（Repository/DAO相当）のCRUD操作を抽出する。
 * 命名規則ベース（`create`/`find`|`get`|`read`/`update`/`delete`|`remove`）。
 * 呼び出し元との紐づけは「同一ファイル内で当該メソッドを呼んでいるハンドラ」までとし
 * （コールグラフ解析は行わない、上部コメント参照）、戻り値にfileを含めることで
 * reverse-doc側がバックエンドルーティング定義と突合できるようにする。
 * 戻り値: [{ table, operation, file }]
 */
function scanRepositoryCrud(cwd) {
  const beDir = path.join(cwd, 'src', 'backend');
  const files = walkFiles(beDir, /\.(tsx?|jsx?|py)$/);
  const ops = [];
  const tables = scanOrmTables(cwd).map((t) => t.table);
  const opPatterns = [
    { re: /\b(create|insert|save)\w*\s*\(/gi, op: 'C' },
    { re: /\b(find|get|read|select)\w*\s*\(/gi, op: 'R' },
    { re: /\b(update|patch)\w*\s*\(/gi, op: 'U' },
    { re: /\b(delete|remove|destroy)\w*\s*\(/gi, op: 'D' },
  ];
  for (const file of files) {
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    const text = readSafe(file);
    for (const table of tables) {
      // ファイル内に当該テーブル名（モデル名）への言及が無ければスキップ（誤検知回避）。
      if (!text.includes(table)) continue;
      for (const { re, op } of opPatterns) {
        if (re.test(text)) ops.push({ table, operation: op, file: rel });
        re.lastIndex = 0;
      }
    }
  }
  return ops;
}

/** テーブル×機能（HB-ID/API-ID/BAT-ID）のCRUDマトリクスを組み立てる。 */
function buildCrudMatrix(cwd) {
  const crudOps = scanRepositoryCrud(cwd);
  const beRoutes = scanBackendRoutes(cwd);
  const contractApiIds = scanContractApiIds(cwd);

  const matrix = {}; // { table: { featureId: Set('C','R','U','D') } }
  const unresolved = [];

  // CRUD操作種別からHTTPメソッドを推測する簡易マッピング（同一ファイルに複数エンドポイント
  // （GET/POST等）が定義されている場合の誤対応付けを避けるため）。R→GET、それ以外→
  // GET以外、という粗い区分に留まる（POST/PUT/DELETEの区別まではしない、限界として明示）。
  const opToMethodHint = { R: 'GET', C: 'POST', U: 'PUT', D: 'DELETE' };

  for (const op of crudOps) {
    const routesInFile = beRoutes.filter((r) => r.file === op.file);
    const methodHint = opToMethodHint[op.operation];
    const route =
      routesInFile.find((r) => r.method === methodHint) ||
      routesInFile.find((r) => (methodHint === 'GET' ? r.method === 'GET' : r.method !== 'GET')) ||
      routesInFile[0];
    let featureId = null;
    if (route) {
      const contract = contractApiIds.find(
        (c) => (c.routePath === route.routePath || paramMatch(c.routePath, route.routePath)) && c.method === route.method
      ) || contractApiIds.find((c) => c.routePath === route.routePath || paramMatch(c.routePath, route.routePath));
      featureId = contract && contract.apiId ? contract.apiId : null;
    }
    if (!featureId) {
      unresolved.push({ table: op.table, operation: op.operation, file: op.file, reason: '同一ファイル内にバックエンドルート定義が無い、またはAPI-IDが未採番' });
      featureId = `(未特定:${op.file})`;
    }
    matrix[op.table] = matrix[op.table] || {};
    matrix[op.table][featureId] = matrix[op.table][featureId] || new Set();
    matrix[op.table][featureId].add(op.operation);
  }
  return { matrix, unresolved };
}

module.exports = {
  walkFiles,
  deriveModuleId,
  scanFrontendRoutes,
  scanFrontendApiCalls,
  scanBackendRoutes,
  scanContractApiIds,
  scanE2eHbLinks,
  scanIntegrationApiLinks,
  scanNfrTestLinks,
  scanBatTestLinks,
  isDeadTestContext,
  filterExecutable,
  buildHbReverseLinks,
  scanOrmTables,
  scanRepositoryCrud,
  buildCrudMatrix,
};
