#!/usr/bin/env node
'use strict';

/**
 * contract-integrity-guard.js（新設・版2.5、M7実装）
 *
 * 設計書: docs/v2/02_実行基盤アーキテクチャ.md 16.4節・16.5.3節
 *
 * 【イベント】PreToolUse（Edit|Write, `.claude/contracts/**`）
 * 【検知内容】ペイロードのトップレベル`agent_id`/`agent_type`（7.4節で確定済みの方式A、
 *   `role-boundary-guard.js`と同じ読み取り方）を見て、`agent_type === "app-architect"`
 *   以外を拒否する。識別子が取得不能な場合も拒否する（fail closed、7.4節の既存原則を
 *   継承）。
 * 【動作】exit 2（ブロック）
 *
 * 【位置づけ】
 * 7.1.2節の役割別パス制御表は`docs/`・`src/`・`infra/`・`tests/`・`decisions/`・
 * `prototypes/`のみを対象とし`.claude/`配下を対象にしていない。本hookは7.1.2節の表を
 * 拡張するのではなく、`.claude/contracts/**`という1パスに限定した新規の狭い境界として
 * 独立に追加する（7.1.2節の表・`role-boundary-guard.js`本体には一切手を入れない、
 * MUST NOT改変）。
 *
 * 【目的・理由】
 * 02文書16.4節（★最重要の論点）: 契約（`.claude/contracts/*.contract.js`の内容、および
 * 対応するMANIFEST.jsonエントリ）はapp-architectが書く。coder（実装側）は契約に書かれた
 * 期待を満たすよう実装・修正する「通す側」に徹し、契約ファイル自体には書き込めない。
 * 実装者が自分の契約テストも書けば、既知4件のサイレント故障と同じ「思い込みごと通す」
 * 構造を温存してしまうため（16.4節・16.6節）。
 *
 * 【重要な注記（本フック自身について）】
 * 本フックはcoder（本タスクの実装者自身）による`.claude/contracts/**`への将来の書込を
 * 含め、app-architect以外の全ロールをブロックする対象とする。「自分に不利だから」と
 * 判定条件を緩めない（PMからの委譲指示のとおり）。
 *
 * 【影響範囲】
 * `.claude/contracts/**`へのWrite/Edit全般。
 *
 * 【前提条件・制約】
 * settings.json未登録の間は発火しない。動作確認は
 * `echo '<JSON>' | node .claude/hooks/contract-integrity-guard.js` で行う。
 *
 * 【契約】
 * 対象外。本ファイルは契約検証機構自身の書込境界フック（メタ層）であり、01/02文書の
 * MUSTを実装するものではない（16.6節の5類型のいずれにも該当しない）。
 */

const fs = require('fs');
const path = require('path');
const { matchGlob } = require('../lib/path-glob');

const CONTRACTS_GLOB = '.claude/contracts/**';
const ALLOWED_ROLE = 'app-architect';

function readHookPayload() {
  try {
    const raw = fs.readFileSync(0, 'utf-8');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (_err) {
    return {};
  }
}

function main() {
  const payload = readHookPayload();
  const cwd = process.cwd();

  const filePath = payload && payload.tool_input && payload.tool_input.file_path;
  if (!filePath) {
    // 対象ファイルパスを特定できない場合（ツール仕様の変化等）。誤ブロックを避け許可する
    // （role-boundary-guard.jsと同じ方針）。
    process.exit(0);
  }
  const absTarget = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
  const relPath = path.relative(cwd, absTarget).replace(/\\/g, '/');

  if (!matchGlob(CONTRACTS_GLOB, relPath)) {
    // .claude/contracts/**以外は本フックの対象外。
    process.exit(0);
  }

  const agentType = payload.agent_type;
  const agentId = payload.agent_id;

  if (agentType === ALLOWED_ROLE) {
    process.exit(0);
  }

  // fail closed: agent_typeが無い（PM/メインスレッド相当）・未知ロール・app-architect以外の
  // 既知ロールのいずれであっても拒否する（16.5.3節「識別子が取得不能な場合も拒否する」）。
  console.error(
    `[contract-integrity-guard] ${relPath} への書込はapp-architectのみに許可されています` +
      `（02文書16.4節）。agent_type=${JSON.stringify(agentType)}, agent_id=${JSON.stringify(agentId)} は許可されません。`
  );
  process.exit(2);
}

main();
