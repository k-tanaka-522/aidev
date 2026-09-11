#!/bin/bash

# ============================================
# aiDev v2 - 新規プロジェクト初期化スクリプト (Mac/Linux)
# ============================================
#
# 【前提】aiDev v2 は新規案件立ち上げ専用である
# （docs/v2/02_実行基盤アーキテクチャ.md 14.3節）。v1で進行中の案件をv2へ
# 移行する経路は提供しない。本スクリプトはこのリポジトリを「aiDevというツール
# 自体の開発履歴」から切り離し、v2のゾーン/レーン型プロセス（Zone0未着手）で
# 新しい案件を開始できる状態にする。
#
# 【このスクリプトが変更しないもの（意図的）】
# `.claude/`（skills/hooks/agents/settings.json等）、`docs/v2/`（aiDevフレーム
# ワーク自身の設計書）、`docs/00_プロジェクト管理・ガバナンス/`・`prototypes/`・
# `src/`・`infra/`・`tests/`配下のディレクトリスコープSkill（`.claude/skills/`）
# および既存の空の台帳・索引ファイル（`00-02`〜`00-05`、`SCREEN_ID_INDEX.md`等）は、
# クローン直後の時点で既にv2の「Zone0未着手」の空スケルトンになっている
# （docs/v2/02_実行基盤アーキテクチャ.md 4章が定めるレイアウトそのもの）ため、
# このスクリプトは触れない。もしこのリポジトリで既に実際の案件を進めてしまって
# いた場合（`docs/00_.../decisions/`に決定ログが増えている、`src/`にコードが
# ある等）、本スクリプトはそれらを自動では除去しない。その場合は公式配布元の
# クリーンな状態から再度cloneすることを推奨する。
#
set -e

echo "========================================"
echo "aiDev v2 - New Project Initialization"
echo "========================================"
echo ""

# 確認プロンプト
echo "This script will:"
echo "  1. Delete .git directory (remove git history)"
echo "  2. Remove aiDev framework's own planning docs (docs/01〜04, v1-era self-history)"
echo "     (docs/v2/ framework design docs are kept)"
echo "  3. Reset .claude-state/ (decision log warnings, zone state, etc.)"
echo "  4. Initialize new git repository"
echo "  5. Create initial commit"
echo ""
echo "Note: docs/00_.../, prototypes/, src/, infra/, tests/ are left as-is"
echo "      (already a fresh v2 skeleton; Zone0 not yet started)."
echo ""
read -p "Are you sure you want to initialize a new project? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Initialization cancelled."
    exit 1
fi

echo ""
echo "Starting initialization..."
echo ""

# 1. .git ディレクトリを削除
echo "[1/5] Removing .git directory..."
if [ -d ".git" ]; then
    rm -rf .git
    echo "  - .git directory removed"
else
    echo "  - .git directory not found (skipped)"
fi

# 2. aiDevフレームワーク自身の企画書・要件定義書・設計書（v1時代の自己文書）を削除する。
#    docs/v2/*.md（フレームワークの設計書、利用者の参照用マニュアル）は削除しない。
echo "[2/5] Removing aiDev framework's own v1-era self-documentation..."
for f in "docs/01_企画書.md" "docs/02_要件定義書.md" "docs/03_設計書.md" "docs/04_IPA対応表.md"; do
    if [ -f "$f" ]; then
        rm -f "$f"
        echo "  - removed: $f"
    fi
done

# 3. .claude-state/ を空にリセットする（v2のランタイム状態は各Skill/hookが
#    ファイル欠損時に既定値を返す設計のため、事前生成は不要。決定ログ警告・
#    ゾーン状態・診断用サンプル等、前の利用実績を新規案件に持ち込まない）。
echo "[3/5] Resetting .claude-state/ (v2 runtime state)..."
rm -rf .claude-state
mkdir -p .claude-state
touch .claude-state/.gitkeep
echo "  - .claude-state/ reset to empty (Zone0 not started; current-zone.json etc. will be created on first use)"

# 4. git init で新規リポジトリ化
echo "[4/5] Initializing new git repository..."
git init
echo "  - New git repository initialized"

# 5. 初回コミットを作成
echo "[5/5] Creating initial commit..."
git add .
git commit -m "$(cat <<'COMMIT_EOF'
Initial commit: New project initialized with aiDev v2

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>
COMMIT_EOF
)"
echo "  - Initial commit created"

echo ""
echo "========================================"
echo "Initialization Complete!"
echo "========================================"
echo ""
echo "Your new project is ready to start (Zone 0: 不可逆決定から)."
echo ""
echo "Next steps:"
echo "  1. Open Claude Code"
echo "  2. Run /init"
echo "  3. Tell Claude what you want to build - the facilitated development"
echo "     process (Zone 0 hearing) will begin"
echo ""
echo "Note: You can now connect to your own remote repository:"
echo "  git remote add origin YOUR_REPOSITORY_URL"
echo "  git push -u origin main"
echo ""
