---
name: review
description: フロントエンド実装の実装可能性・規約準拠・決定ログ（および契約モックとの整合）を独立コンテキストで検証する。
context: fork
---

# review（src/frontend、Zone2レビュー）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.3節）

## 責務

`execute`が生成した実装について、実装可能性・規約準拠（`code-style-guide`）・決定ログとの
整合・契約モックとの整合を`context: fork`の独立コンテキストで検証する。**作成者はレビュアに
なれない**（01文書7.1節、実装者から独立したロールが実施）。

## 検証観点

1. `code-style-guide`（言語規約・フレームワーク規約）への準拠
2. `security-style-guide`のセキュリティ標準への準拠
3. 決定ログ（`decisions/DL-*.md`）との整合（決定が実装に反映されているか）
4. 契約モック（`decisions/contracts/*.openapi.yaml`）との整合（レスポンス形状の一致等）
5. UTのカバレッジ・異常系テストの有無

## ツール権限

`context: fork`内での実行のため`Write`/`Edit`は持たない（`Read`/`Grep`/`Glob`のみ）。

## 動作確認（M2）

- SKILL.mdがディレクトリスコープSkillとして配置されていることを確認済み。実機での
  `context: fork`起動確認はM3以降（role-boundary-guard・orchestrateとの配線後）に行う。
