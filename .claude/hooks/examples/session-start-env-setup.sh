#!/bin/bash
# session-start-env-setup.sh - セッション開始時の環境変数ロード

# .envファイルがあればロード（機密情報は含まないものを想定）
if [ -f ".env.session" ]; then
    source ".env.session"
    echo "Session environment variables loaded from .env.session" >&2
fi

# プロジェクト固有の初期化
if [ -f ".claude/init-session.sh" ]; then
    bash ".claude/init-session.sh" >&2
fi

# セッション開始ログ
echo "[$(date)] Session started" >> .claude/.session-log

exit 0
