---
name: review
description: バックエンド実装の実装可能性・規約準拠・決定ログ（および契約モックとの整合）を独立コンテキストで検証する。
context: fork
---

# review（src/backend、Zone2レビュー）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.3節）

## 責務

`execute`が生成した実装について、実装可能性・規約準拠・決定ログとの整合・契約モックとの
整合を`context: fork`の独立コンテキストで検証する。特にAPIレスポンス形状が契約モックの
schemaと一致しているかを重点確認する（`sync-check --source=impl`と相補的な人手レビュー）。

## 検証観点

1. `code-style-guide`（言語規約）・`code-style-guide/data/DATABASE_STANDARD.md`への準拠
2. `security-style-guide`のセキュリティ標準への準拠（SQLインジェクション対策等）
3. 決定ログとの整合
4. 契約モック（operationId・schema）との整合
5. UTのカバレッジ・異常系テストの有無

## ツール権限

`context: fork`内での実行のため`Write`/`Edit`は持たない（`Read`/`Grep`/`Glob`のみ）。

## 動作確認（M2）

- SKILL.mdがディレクトリスコープSkillとして配置されていることを確認済み。
