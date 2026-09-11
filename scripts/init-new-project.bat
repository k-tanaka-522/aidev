@echo off
REM ============================================
REM aiDev v2 - New Project Initialization Script (Windows)
REM ============================================
REM
REM 前提: aiDev v2 は新規案件立ち上げ専用である
REM （docs/v2/02_実行基盤アーキテクチャ.md 14.3節）。v1で進行中の案件をv2へ
REM 移行する経路は提供しない。
REM
REM このスクリプトが変更しないもの（意図的）: .claude/, docs/v2/,
REM docs/00_プロジェクト管理・ガバナンス/, prototypes/, src/, infra/, tests/
REM 配下は、クローン直後の時点で既にv2の「Zone0未着手」の空スケルトンに
REM なっているため触れない。既に実案件を進めてしまっていた場合は、公式配布元の
REM クリーンな状態から再度cloneすることを推奨する。

echo ========================================
echo aiDev v2 - New Project Initialization
echo ========================================
echo.

REM 確認プロンプト
echo This script will:
echo   1. Delete .git directory (remove git history)
echo   2. Remove aiDev framework's own planning docs (docs/01-04, v1-era self-history)
echo      (docs/v2/ framework design docs are kept)
echo   3. Reset .claude-state/ (decision log warnings, zone state, etc.)
echo   4. Initialize new git repository
echo   5. Create initial commit
echo.
echo Note: docs/00_.../, prototypes/, src/, infra/, tests/ are left as-is
echo       (already a fresh v2 skeleton; Zone0 not yet started).
echo.
set /p CONFIRM="Are you sure you want to initialize a new project? (yes/no): "

if /i not "%CONFIRM%"=="yes" (
    echo Initialization cancelled.
    exit /b 1
)

echo.
echo Starting initialization...
echo.

REM 1. .git ディレクトリを削除
echo [1/5] Removing .git directory...
if exist ".git" (
    rmdir /s /q ".git"
    echo   - .git directory removed
) else (
    echo   - .git directory not found (skipped)
)

REM 2. aiDevフレームワーク自身の企画書・要件定義書・設計書（v1時代の自己文書）を削除する。
REM    docs\v2\*.md（フレームワークの設計書、利用者の参照用マニュアル）は削除しない。
echo [2/5] Removing aiDev framework's own v1-era self-documentation...
if exist "docs\01_企画書.md" (
    del /q "docs\01_企画書.md"
    echo   - removed: docs\01_企画書.md
)
if exist "docs\02_要件定義書.md" (
    del /q "docs\02_要件定義書.md"
    echo   - removed: docs\02_要件定義書.md
)
if exist "docs\03_設計書.md" (
    del /q "docs\03_設計書.md"
    echo   - removed: docs\03_設計書.md
)
if exist "docs\04_IPA対応表.md" (
    del /q "docs\04_IPA対応表.md"
    echo   - removed: docs\04_IPA対応表.md
)

REM 3. .claude-state/ を空にリセットする（v2のランタイム状態は各Skill/hookが
REM    ファイル欠損時に既定値を返す設計のため、事前生成は不要）。
echo [3/5] Resetting .claude-state\ (v2 runtime state)...
if exist ".claude-state" rmdir /s /q ".claude-state"
mkdir ".claude-state"
type nul > ".claude-state\.gitkeep"
echo   - .claude-state\ reset to empty (Zone0 not started; current-zone.json etc. will be created on first use)

REM 4. git init で新規リポジトリ化
echo [4/5] Initializing new git repository...
git init
echo   - New git repository initialized

REM 5. 初回コミットを作成
echo [5/5] Creating initial commit...
git add .
git commit -m "Initial commit: New project initialized with aiDev v2" -m "🤖 Generated with [Claude Code](https://claude.com/claude-code)" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
echo   - Initial commit created

echo.
echo ========================================
echo Initialization Complete!
echo ========================================
echo.
echo Your new project is ready to start (Zone 0: 不可逆決定から).
echo.
echo Next steps:
echo   1. Open Claude Code
echo   2. Run /init
echo   3. Tell Claude what you want to build - the facilitated development
echo      process (Zone 0 hearing) will begin
echo.
echo Note: You can now connect to your own remote repository:
echo   git remote add origin YOUR_REPOSITORY_URL
echo   git push -u origin main
echo.
