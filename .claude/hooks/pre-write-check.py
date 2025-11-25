#!/usr/bin/env python3
"""
pre-write-check.py - 機密情報書き込み防止Hook

目的: ファイル書き込み前に機密情報を検出し、書き込みをブロックする

チェック項目:
1. 保護ファイルパターン (.env, secrets/, .pem, .key)
2. 機密情報パターン (API key, password, private key)

出力:
- JSON形式で decision ("deny" or なし) を返す
- deny時は reason を含む
"""

import json
import sys
import re

def main():
    # 標準入力から tool_input を受け取る
    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError:
        # JSONが読めない場合は許可（安全側に倒す）
        sys.exit(0)

    tool_input = input_data.get("tool_input", {})
    file_path = tool_input.get("file_path", "")
    content = tool_input.get("content", "") or tool_input.get("new_string", "")

    # 1. 保護ファイルパターンチェック
    protected_patterns = [
        (r'\.env', ".env file"),
        (r'secrets/', "secrets directory"),
        (r'\.pem$', ".pem file (private key)"),
        (r'\.key$', ".key file (private key)"),
        (r'credentials\.json', "credentials.json"),
    ]

    for pattern, name in protected_patterns:
        if re.search(pattern, file_path, re.IGNORECASE):
            deny(f"Protected file: {name} - use environment variables or secret manager instead")

    # 2. 機密情報パターンチェック
    sensitive_patterns = [
        (r'api[_-]?key\s*[:=]\s*["\']?\w{20,}', "API key"),
        (r'password\s*[:=]\s*["\'][^"\']{3,}', "Password"),
        (r'secret[_-]?key\s*[:=]\s*["\']?\w{20,}', "Secret key"),
        (r'-----BEGIN.*PRIVATE KEY', "Private key (PEM format)"),
        (r'aws[_-]?access[_-]?key[_-]?id\s*[:=]', "AWS access key"),
        (r'aws[_-]?secret[_-]?access[_-]?key\s*[:=]', "AWS secret key"),
    ]

    for pattern, name in sensitive_patterns:
        if re.search(pattern, content, re.IGNORECASE | re.MULTILINE):
            deny(f"Sensitive data detected: {name} - use environment variables or secret manager instead")

    # すべてのチェックを通過 → 許可
    sys.exit(0)

def deny(reason):
    """書き込みを拒否"""
    result = {
        "decision": "deny",
        "reason": reason
    }
    print(json.dumps(result))
    sys.exit(0)

if __name__ == "__main__":
    main()
