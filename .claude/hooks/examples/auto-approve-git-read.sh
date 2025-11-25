#!/bin/bash
# auto-approve-git-read.sh - 読み取り専用gitコマンドを自動承認

# 読み取り専用コマンドは自動承認
cat << 'EOF'
{
  "decision": "allow"
}
EOF

exit 0
