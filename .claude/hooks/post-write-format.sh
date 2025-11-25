#!/bin/bash
# post-write-format.sh - ファイル書き込み後のフォーマット自動適用Hook
#
# 目的: コードフォーマッターを自動実行
#
# 対応言語:
# - Python: Black
# - TypeScript/JavaScript: Prettier
# - Go: gofmt
# - C#: dotnet format
#
# 現状: 空実装（将来拡張）
#
# 使い方:
# 1. 各フォーマッターをインストール
# 2. 以下のコメントを外して有効化

# 標準入力からファイルパスを取得
# INPUT=$(cat)
# FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path')

# Python
# if [[ "$FILE_PATH" == *.py ]]; then
#     black "$FILE_PATH" 2>/dev/null
# fi

# TypeScript/JavaScript
# if [[ "$FILE_PATH" == *.ts ]] || [[ "$FILE_PATH" == *.tsx ]] || [[ "$FILE_PATH" == *.js ]] || [[ "$FILE_PATH" == *.jsx ]]; then
#     npx prettier --write "$FILE_PATH" 2>/dev/null
# fi

# Go
# if [[ "$FILE_PATH" == *.go ]]; then
#     gofmt -w "$FILE_PATH" 2>/dev/null
# fi

# C#
# if [[ "$FILE_PATH" == *.cs ]]; then
#     dotnet format "$FILE_PATH" 2>/dev/null
# fi

# 空実装: 常に成功
exit 0
