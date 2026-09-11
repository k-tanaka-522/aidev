---
name: review
description: IaC実装可能性・規約準拠・決定ログとの整合を独立コンテキストで検証する。
context: fork
---

# review（infra/cdk、レーンCレビュー）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.3節）

## 責務

`execute`が生成したIaC実装について、実装可能性・`iac-style-guide`準拠・決定ログとの整合を
`context: fork`の独立コンテキストで検証する。

## 検証観点

1. `iac-style-guide`（IAM最小権限、暗号化デフォルト、タグ必須等）への準拠
2. `security-style-guide`のセキュリティ標準への準拠
3. 決定ログ（非機能骨格・アーキ土台）との整合
4. `iac-style-guide/testing/INFRA_TEST_STANDARD.md`が定めるテスト計画の妥当性

## ツール権限

`context: fork`内での実行のため`Write`/`Edit`は持たない（`Read`/`Grep`/`Glob`のみ）。

## 動作確認（M2）

- SKILL.mdがディレクトリスコープSkillとして配置されていることを確認済み。
