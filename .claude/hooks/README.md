# Hooks - 品質ゲート・自動化

## 概要

`.claude/hooks/` は、様々なイベント発生時に自動実行されるスクリプトです。
機密情報の漏洩防止、コード品質の自動チェック、権限管理の自動化などを行います。

Claude Code は **10種類のHookタイプ**をサポートしており、開発ワークフローの様々な段階で介入できます。

---

## 10種類のHookタイプ

### 1. PreToolUse
**発火タイミング**: ツール実行直前
**matcher**: あり（ツール名でフィルタ可）
**主な用途**:
- ファイル書き込み前の機密情報チェック
- 破壊的コマンドの検証
- ツール入力の動的修正（`updatedInput`機能）

**実装サンプル**: [pre-write-check.py](pre-write-check.py)

---

### 2. PostToolUse
**発火タイミング**: ツール実行直後
**matcher**: あり（ツール名でフィルタ可）
**主な用途**:
- コードフォーマット自動適用
- ファイル書き込み後の後処理
- ログ記録

**実装サンプル**: [post-write-format.sh](post-write-format.sh)

---

### 3. Stop
**発火タイミング**: セッション終了時
**matcher**: なし
**主な用途**:
- 品質ゲート（lint, test実行）
- タスク完了検証
- クリーンアップ処理

**実装サンプル**: [quality-gate.sh](quality-gate.sh)

---

### 4. PermissionRequest
**発火タイミング**: 権限ダイアログ表示時
**matcher**: あり（ツール名でフィルタ可）
**主な用途**:
- 権限の自動許可/拒否
- 条件付き承認ロジック
- 監査ログ記録

**設定例**:
```json
{
  "PermissionRequest": [{
    "matcher": "Bash(git push:*)",
    "hooks": [{
      "type": "command",
      "command": ".claude/hooks/examples/permission-auto-approve.sh"
    }]
  }]
}
```

**実装サンプル**: [examples/permission-request-auto-approve.json](examples/permission-request-auto-approve.json)

---

### 5. Notification
**発火タイミング**: 通知送信時
**matcher**: あり（通知タイプでフィルタ可）
**主な用途**:
- デスクトップ通知のカスタマイズ
- Slack/Teams等への通知転送
- 通知の抑制

**設定例**:
```json
{
  "Notification": [{
    "matcher": "task_complete",
    "hooks": [{
      "type": "command",
      "command": ".claude/hooks/send-slack-notification.sh"
    }]
  }]
}
```

---

### 6. UserPromptSubmit
**発火タイミング**: ユーザープロンプト送信時
**matcher**: なし
**主な用途**:
- プロンプト検証（長さ、内容チェック）
- コンテキスト自動追加
- プロンプトテンプレート適用

**設定例**:
```json
{
  "UserPromptSubmit": [{
    "hooks": [{
      "type": "command",
      "command": ".claude/hooks/add-context.sh"
    }]
  }]
}
```

---

### 7. SubagentStop
**発火タイミング**: サブエージェント完了時
**matcher**: なし
**主な用途**:
- サブタスク完了検証
- サブエージェント出力の検証
- レポート生成

**設定例**:
```json
{
  "SubagentStop": [{
    "hooks": [{
      "type": "command",
      "command": ".claude/hooks/verify-subagent-output.sh"
    }]
  }]
}
```

---

### 8. PreCompact
**発火タイミング**: コンテキストコンパクション直前
**matcher**: なし
**主な用途**:
- トランスクリプトのバックアップ
- 重要情報の保存
- 監査ログ記録

**設定例**:
```json
{
  "PreCompact": [{
    "hooks": [{
      "type": "command",
      "command": ".claude/hooks/backup-transcript.sh"
    }]
  }]
}
```

---

### 9. SessionStart
**発火タイミング**: セッション開始/再開時
**matcher**: なし
**主な用途**:
- 環境変数のロード
- 初期コンテキストの設定
- セットアップスクリプト実行

**実装サンプル**: [examples/session-start-env-setup.sh](examples/session-start-env-setup.sh)

**設定例**:
```json
{
  "SessionStart": [{
    "hooks": [{
      "type": "command",
      "command": ".claude/hooks/examples/session-start-env-setup.sh"
    }]
  }]
}
```

---

### 10. SessionEnd
**発火タイミング**: セッション終了時
**matcher**: なし
**主な用途**:
- クリーンアップ処理
- セッションログの保存
- リソース解放

**設定例**:
```json
{
  "SessionEnd": [{
    "hooks": [{
      "type": "command",
      "command": ".claude/hooks/cleanup.sh"
    }]
  }]
}
```

---

## 高度な機能

### prompt型Hooks（LLMベース判断）

Hookスクリプトの代わりにLLMを使用して動的に判断できます。

**設定例**:
```json
{
  "Stop": [{
    "hooks": [{
      "type": "prompt",
      "prompt": "タスクが完全に完了したか評価してください。未完了の場合は具体的な残タスクを列挙してください。",
      "model": "haiku"
    }]
  }]
}
```

**実装サンプル**: [examples/prompt-task-validation.json](examples/prompt-task-validation.json)

**メリット**:
- 複雑な判断ロジックをスクリプト化不要
- 自然言語で条件指定
- コンテキストを考慮した柔軟な判断

---

### updatedInput機能（v2.0.10+）

PreToolUseでツール入力を透過的に修正できます。

**ユースケース**:
- `terraform apply` を `terraform apply --dry-run` に自動変更
- `git push` に `--no-verify` を自動追加
- パスの正規化

**設定例**:
```json
{
  "PreToolUse": [{
    "matcher": "Bash(terraform apply:*)",
    "hooks": [{
      "type": "command",
      "command": ".claude/hooks/force-terraform-plan.sh"
    }]
  }]
}
```

**実装サンプル**: [examples/pre-tool-use-updated-input.json](examples/pre-tool-use-updated-input.json)

**スクリプト戻り値例**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "command": "terraform plan"
    }
  }
}
```

---

## Hook戻り値仕様

### 終了コード

| 終了コード | 意味 | 動作 |
|-----------|------|------|
| `0` | 成功 | 処理続行、stdoutを処理 |
| `2` | ブロッキングエラー | **処理停止**、stderrをClaudeにフィードバック |
| その他 | 非ブロッキングエラー | 処理続行、stderrをユーザー表示 |

### 標準出力（JSON形式）

**PermissionRequestの場合**:
```json
{
  "decision": "allow"  // or "deny" or "ask"
}
```

**PreToolUseの場合（updatedInput使用時）**:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "updatedInput": {
      "command": "modified-command"
    }
  }
}
```

**一般的なブロック**:
```json
{
  "decision": "block",
  "reason": "理由の説明"
}
```

---

## 実装されているHooks

### 現在の実装状況

| Hook | タイプ | 実装状況 |
|------|--------|---------|
| [pre-write-check.py](pre-write-check.py) | PreToolUse | ✅ 実装済み（機密情報保護） |
| [post-write-format.sh](post-write-format.sh) | PostToolUse | ⏳ 空実装（フォーマット自動適用） |
| [quality-gate.sh](quality-gate.sh) | Stop | ⏳ 空実装（品質チェック） |

### サンプル実装

[examples/](examples/) ディレクトリに追加のサンプルを用意：
- `permission-request-auto-approve.json` - 権限自動許可
- `session-start-env-setup.sh` - セッション開始時の環境設定
- `prompt-task-validation.json` - prompt型Hook例
- `pre-tool-use-updated-input.json` - updatedInput例

---

## 設定方法

`.claude/settings.json` でHooksを有効化：

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [{
          "type": "command",
          "command": "python .claude/hooks/pre-write-check.py",
          "timeout": 10
        }]
      }
    ],
    "PermissionRequest": [
      {
        "matcher": "Bash(git push:*)",
        "hooks": [{
          "type": "command",
          "command": ".claude/hooks/auto-approve-git-push.sh",
          "timeout": 5
        }]
      }
    ],
    "Stop": [
      {
        "hooks": [{
          "type": "prompt",
          "prompt": "タスクが完了したか評価してください",
          "model": "haiku"
        }]
      }
    ]
  }
}
```

---

## ベストプラクティス

### 1. matcher活用
- 必要なツールのみにHookを限定（パフォーマンス向上）
- 正規表現で柔軟なフィルタ

### 2. timeout設定
- 軽量チェック: 5-10秒
- フォーマット・lint: 30秒
- テスト実行: 120秒

### 3. エラーハンドリング
- exit 2 でブロッキングエラー
- stderrに詳細なエラーメッセージ

### 4. セキュリティ
- PreToolUseで機密情報保護は必須
- deny配列と併用

### 5. パフォーマンス
- 不要なHookは無効化
- prompt型Hooksは軽量モデル（haiku）使用

---

## トラブルシューティング

### Hook実行でエラーが出る
- スクリプトに実行権限があるか確認: `chmod +x .claude/hooks/*.sh`
- Python環境が正しいか確認: `python --version`
- シェバン（`#!/bin/bash`等）が正しいか確認

### Hook処理が遅い
- timeout値を調整: `.claude/settings.json` の `timeout` パラメータ
- 重い処理はバックグラウンド実行検討

### Hookを一時的に無効化したい
- `.claude/settings.json` の該当Hook設定をコメントアウト
- または `"hooks": {}` で全無効化

### updatedInputが反映されない
- Claude Codeのバージョン確認（v2.0.10+）
- JSON形式が正しいか確認
- `hookEventName: "PreToolUse"` が必須

---

## 参考リンク

- [公式ドキュメント - Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)
- [サンプルHooks集](examples/)
- [設定ファイル仕様](../settings.json)
