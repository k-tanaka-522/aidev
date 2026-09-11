#!/usr/bin/env bash
#
# cutover-v2.sh — v1 → v2 セッション制御の切替スクリプト
#
# ============================================================================
# 【最重要警告】
# このスクリプトを実行すると、いま動いているPMセッション自身を制御している
# `.claude/CLAUDE.md`・`.claude/agents/*`・`.claude/settings.json` が
# v2の完全版に置き換わる。実行直後から:
#   - PMの権限（permissions）が変わる
#   - `role-boundary-guard.js` 等、`exit 2` でブロックするhooksが実際に発火し始める
#   - サブエージェントの定義（tools/model/frontmatter）が総入れ替えになる
# 想定外の副作用が起きた場合、その場で自分自身の書込み能力が失われて
# 復旧できなくなるおそれがある（このスクリプト自体が壊れた設定の下でしか
# 動かせなくなるリスクを含む）。
#
# したがって:
#   - 必ず `--dry-run` で影響を確認してから実行すること
#   - 実行前に `git status` が clean であることを確認すること（このスクリプトは
#     未コミットの変更があると中断する）
#   - 実行後は最初の数回のツール呼び出しをPM自身が慎重に確認すること
#     （docs/v2/02_実行基盤アーキテクチャ.md 14.2節M6、.claude/v2-staging/README.md
#     「段階2」参照）
#
# 【戻し方】
# このスクリプトはGitワークツリーの変更のみを行う（コミットはしない）。
# 想定外のブロックが多発した場合は、次のいずれかで戻すこと。
#   git status                  # 何が変更されたか確認する
#   git diff --stat             # 変更ファイル一覧
#   git checkout -- .claude/CLAUDE.md .claude/settings.json .claude/settings.local.json
#   git checkout -- .claude/agents/                    # 削除された v1 AGENT.md を復元
#                                                       # （このスクリプトは削除も行うため、
#                                                       #   `git checkout --` だけでは新規移動した
#                                                       #   .claude/agents/<name>.md が残る点に注意。
#                                                       #   完全に戻す場合は
#                                                       #   `git clean -fd .claude/agents/` も検討する。
#                                                       #   ただし `git clean` は追跡外ファイルを
#                                                       #   問答無用で消すため、実行前に必ず
#                                                       #   `git status`/`git clean -n -d` で対象を
#                                                       #   確認すること）
#   git checkout -- .claude/hooks/prevent-pm-layer-violation.sh   # 削除した場合の復元
# `.claude/v2-staging/` 配下は変更・削除しないため、再実行前の状態確認は
# 常にそこから可能である。
#
# ============================================================================
#
# 実行内容（段階2、docs/v2/02_実行基盤アーキテクチャ.md 14.2節M6 /
# .claude/v2-staging/README.md「段階2: 完全版への切替」の手順を機械化したもの）:
#   1. 前提条件チェック（必要なstagingファイルが揃っているか）
#   2. `.claude/agents/<name>/AGENT.md`（v1）を削除し、
#      `.claude/v2-staging/agents/<name>.md` を `.claude/agents/<name>.md` へ移動
#   3. `.claude/settings.json` を `.claude/v2-staging/settings.json` の内容で全面差し替え
#   4. `.claude/CLAUDE.md` を `.claude/v2-staging/CLAUDE.md` の内容で全面差し替え
#   5. v1専用hook `.claude/hooks/prevent-pm-layer-violation.sh` の登録を
#      `.claude/settings.local.json` から除去し、hook本体を削除
#      （v2側は `role-boundary-guard.js` が同等の機構を担うため）
#
# このスクリプトが行わないこと（実行者＝PMが別途判断すること）:
#   - git add / git commit（禁止事項。PMが行う）
#   - `.claude/docs/10_facilitation/`・`.claude/docs/40_standards/` 等の残存確認
#     （M6タスクの一部として別途Coderが確認済みのはず。本スクリプトは再確認しない）
#   - 前提条件チェックのうち、実機動作確認（M4/M5完了確認、`agentType`実測等）は
#     このスクリプトでは検証できない。README記載のチェックリストを目視確認すること
#
# 使い方:
#   scripts/cutover-v2.sh --dry-run   # 何が起きるかを表示するだけ（何も変更しない）
#   scripts/cutover-v2.sh             # 実際に切り替える
#
set -euo pipefail

# ----------------------------------------------------------------------------
# 準備
# ----------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${REPO_ROOT}"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run)
      DRY_RUN=1
      ;;
    *)
      echo "不明な引数: $arg" >&2
      echo "使い方: $0 [--dry-run]" >&2
      exit 1
      ;;
  esac
done

log() {
  echo "[cutover-v2] $*"
}

run() {
  # dry-runモードでは「何をするか」を表示するだけで実行しない。
  # 実行モードでは実際にコマンドを実行し、実行前後で必ずログを出す。
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] would run: $*"
  else
    echo "  実行前: $*"
    "$@"
    echo "  実行後: 完了 -> $*"
  fi
}

STAGING="${REPO_ROOT}/.claude/v2-staging"
AGENTS_DIR="${REPO_ROOT}/.claude/agents"

log "======================================================================"
log "aiDev v2 カットオーバー・スクリプト"
log "モード: $([ "$DRY_RUN" -eq 1 ] && echo 'dry-run（変更なし）' || echo '本実行（.claude/ を書き換えます）')"
log "======================================================================"

if [ "$DRY_RUN" -eq 0 ]; then
  echo
  echo "警告: このまま実行すると、いま動いているセッションの制御が v2 に切り替わります。"
  echo "続行しますか？ よろしければ 'yes' と入力してください。"
  read -r CONFIRM
  if [ "$CONFIRM" != "yes" ]; then
    log "中断しました（ユーザーがyes以外を入力）。"
    exit 1
  fi
fi

# ----------------------------------------------------------------------------
# ステップ0: 前提条件の確認
# ----------------------------------------------------------------------------
log "----------------------------------------------------------------------"
log "ステップ0: 前提条件の確認"
log "----------------------------------------------------------------------"

FAIL=0

check_exists() {
  local path="$1"
  local desc="$2"
  if [ -e "$path" ]; then
    log "OK: ${desc} が存在します（${path}）"
  else
    log "NG: ${desc} が見つかりません（${path}）"
    FAIL=1
  fi
}

# git status が clean であることを確認する（未コミットの変更が残ったまま
# 切り替えると、問題発生時に「切替前の状態」と「切替と無関係な変更」の
# 切り分けができなくなるため）。
if [ -n "$(git status --porcelain)" ]; then
  log "NG: git の作業ツリーに未コミットの変更があります。"
  log "    先にコミットするか、変更を退避してから再実行してください。"
  FAIL=1
else
  log "OK: git の作業ツリーはclean です。"
fi

check_exists "${STAGING}/CLAUDE.md" "v2軽量CLAUDE.md（staging）"
check_exists "${STAGING}/settings.json" "v2完全版settings.json（staging）"
check_exists "${STAGING}/agents" "v2エージェント定義ディレクトリ（staging）"

for name in consultant app-architect infra-architect designer coder qa sre; do
  check_exists "${STAGING}/agents/${name}.md" "v2エージェント定義 ${name}.md（staging）"
done

check_exists "${AGENTS_DIR}" ".claude/agents ディレクトリ"

# hooksが実体として揃っているか（settings.jsonが参照するファイルが無いと
# 登録した瞬間にhookが空振りする）。
for hook in role-boundary-guard.js gate-transition-guard.js doc-header-guard.js \
            lint-guard.js decision-log-guard.js ops-item-guard.js sync-ledger-guard.js \
            artifact-emptiness-guard.js task-boundary-guard.js decision-stop-check.js; do
  check_exists "${REPO_ROOT}/.claude/hooks/${hook}" "hook実体 ${hook}"
done

if [ "$FAIL" -ne 0 ]; then
  log "前提条件チェックに失敗しました。上記のNG項目を解消してから再実行してください。"
  exit 1
fi

log "前提条件チェック: すべてOK"
log ""
log "【目視確認事項（このスクリプトでは自動検証できない、README記載のMAY/MUST項目）】"
log "  - M4・M5が完了し、artifact-emptiness-guard.js が reverse-doc 群と組み合わせて"
log "    動作確認済みであること"
log "  - task-boundary-guard.js が v2固有エージェント名（consultant/app-architect/"
log "    infra-architect/designer/coder/qa/sre のいずれか）を tool_response.agentType"
log "    として実際に観測できることを再確認していること"
log "  （.claude/v2-staging/README.md「段階2」手順1を参照。本スクリプトは通過を強制しない）"

# ----------------------------------------------------------------------------
# ステップ1: .claude/agents/ の昇格
# ----------------------------------------------------------------------------
log "----------------------------------------------------------------------"
log "ステップ1: .claude/agents/ の昇格（v1ディレクトリ形式の削除 → v2フラット形式への移動）"
log "----------------------------------------------------------------------"

for name in consultant app-architect infra-architect designer coder qa sre; do
  v1_dir="${AGENTS_DIR}/${name}"
  v2_src="${STAGING}/agents/${name}.md"
  v2_dst="${AGENTS_DIR}/${name}.md"

  if [ -d "$v1_dir" ]; then
    log "v1版削除: ${v1_dir}/AGENT.md（ディレクトリ形式）"
    run rm -rf "$v1_dir"
  else
    log "v1版は既に存在しません（スキップ）: ${v1_dir}"
  fi

  log "v2版昇格: ${v2_src} -> ${v2_dst}"
  run cp "$v2_src" "$v2_dst"
done

# v1のオーケストレーション設計文書（.claude/agents/ORCHESTRATION_DESIGN.md）は
# 14.1節の資産一覧に明示の記載が無いが、削除する各v1 AGENT.mdからのみ参照されて
# いた文書であるため、AGENT.md群と運命を共にするものとしてここで併せて削除する。
# （この判断はPMへの報告事項とする。docs/v2/02文書14.1節に明記が無いため。）
if [ -f "${AGENTS_DIR}/ORCHESTRATION_DESIGN.md" ]; then
  log "v1オーケストレーション設計文書を削除: ${AGENTS_DIR}/ORCHESTRATION_DESIGN.md"
  run rm -f "${AGENTS_DIR}/ORCHESTRATION_DESIGN.md"
fi

# ----------------------------------------------------------------------------
# ステップ2: .claude/settings.json の全面差し替え
# ----------------------------------------------------------------------------
log "----------------------------------------------------------------------"
log "ステップ2: .claude/settings.json の全面差し替え（M3安全版 → M6完全版）"
log "----------------------------------------------------------------------"

SETTINGS_BACKUP="${REPO_ROOT}/.claude/settings.json.pre-v2-cutover.bak"
log "念のためのバックアップ作成: .claude/settings.json -> $(basename "$SETTINGS_BACKUP")"
run cp "${REPO_ROOT}/.claude/settings.json" "$SETTINGS_BACKUP"

log "完全版で差し替え: ${STAGING}/settings.json -> .claude/settings.json"
run cp "${STAGING}/settings.json" "${REPO_ROOT}/.claude/settings.json"

# ----------------------------------------------------------------------------
# ステップ3: .claude/CLAUDE.md の置き換え
# ----------------------------------------------------------------------------
log "----------------------------------------------------------------------"
log "ステップ3: .claude/CLAUDE.md の置き換え（v1フェーズ順次型 → v2軽量ゾーンマップ）"
log "----------------------------------------------------------------------"

CLAUDE_MD_BACKUP="${REPO_ROOT}/.claude/CLAUDE.md.pre-v2-cutover.bak"
log "念のためのバックアップ作成: .claude/CLAUDE.md -> $(basename "$CLAUDE_MD_BACKUP")"
run cp "${REPO_ROOT}/.claude/CLAUDE.md" "$CLAUDE_MD_BACKUP"

log "v2版で差し替え: ${STAGING}/CLAUDE.md -> .claude/CLAUDE.md"
run cp "${STAGING}/CLAUDE.md" "${REPO_ROOT}/.claude/CLAUDE.md"

# ----------------------------------------------------------------------------
# ステップ4: v1ロール境界hookの無効化
# ----------------------------------------------------------------------------
log "----------------------------------------------------------------------"
log "ステップ4: v1ロール境界hook（prevent-pm-layer-violation.sh）の無効化"
log "----------------------------------------------------------------------"

LOCAL_SETTINGS="${REPO_ROOT}/.claude/settings.local.json"
V1_HOOK="${REPO_ROOT}/.claude/hooks/prevent-pm-layer-violation.sh"

if [ -f "$LOCAL_SETTINGS" ]; then
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  [dry-run] would remove prevent-pm-layer-violation.sh entries from $(basename "$LOCAL_SETTINGS")"
  else
    echo "  実行前: settings.local.json から v1 hook 登録を除去"
    node -e '
      const fs = require("fs");
      const p = process.argv[1];
      const data = JSON.parse(fs.readFileSync(p, "utf-8"));
      if (data.hooks && Array.isArray(data.hooks.PreToolUse)) {
        data.hooks.PreToolUse = data.hooks.PreToolUse
          .map((entry) => {
            if (!Array.isArray(entry.hooks)) return entry;
            entry.hooks = entry.hooks.filter(
              (h) => !(typeof h.command === "string" && h.command.includes("prevent-pm-layer-violation.sh"))
            );
            return entry;
          })
          .filter((entry) => Array.isArray(entry.hooks) && entry.hooks.length > 0);
        if (data.hooks.PreToolUse.length === 0) delete data.hooks.PreToolUse;
        if (Object.keys(data.hooks).length === 0) delete data.hooks;
      }
      fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf-8");
    ' "$LOCAL_SETTINGS"
    echo "  実行後: 完了 -> settings.local.json から v1 hook 登録を除去"
  fi
else
  log "settings.local.json が存在しません（スキップ）"
fi

if [ -f "$V1_HOOK" ]; then
  log "v1 hook本体を削除: ${V1_HOOK}"
  run rm -f "$V1_HOOK"
else
  log "v1 hook本体は既に存在しません（スキップ）: ${V1_HOOK}"
fi

# ----------------------------------------------------------------------------
# 完了
# ----------------------------------------------------------------------------
log "----------------------------------------------------------------------"
if [ "$DRY_RUN" -eq 1 ]; then
  log "dry-run 完了。上記は予定される変更の一覧であり、実際には何も変更していません。"
  log "本実行する場合: scripts/cutover-v2.sh"
else
  log "切替が完了しました。"
  log "次にやること（.claude/v2-staging/README.md「段階2」参照）:"
  log "  1. 最初の数回のツール呼び出しを慎重に確認する"
  log "     （role-boundary-guard.js が意図せずPM自身のdocs/00_.../書込までブロックしていないか等）"
  log "  2. 問題が無ければ、.claude/docs/10_facilitation/・.claude/docs/40_standards/ 等の"
  log "     残存v1資産削除（M6タスクで完了済みのはず）と合わせてPMがコミットする"
  log "  3. 想定外のブロックが多発した場合は、本ファイル冒頭の「戻し方」を参照して復元する"
fi
log "----------------------------------------------------------------------"
