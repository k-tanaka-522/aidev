#!/bin/bash
# force-terraform-plan.sh - Terraform applyを自動的にplanに変更

# 標準入力からツール情報を取得
INPUT=$(cat)

# terraform applyをterraform planに変更
cat << 'EOF'
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "command": "terraform plan"
    }
  }
}
EOF

exit 0
