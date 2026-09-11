---
name: ticket-triage
description: Mode BにおけるGitHub Issueの一次仕分け。
argument-hint: "[Issue番号 or all]"
disable-model-invocation: true
---

# ticket-triage（チケット一次仕分け）

> 版数: M0雛形（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.1節・12章）
> `disable-model-invocation: true` はM0限定の安全策。設計書5.1節の本来のfrontmatterは`argument-hint`のみ。
> M5でMode B機構が実装され次第、外すこと。

## 責務

Mode B: Issueの一次仕分け。

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`（Mode B）
- 連携先: `impact-analysis`

## Mode Bフロー内の位置づけ（12章）

```
GitHub Issue → ticket-triage → impact-analysis → src/*:execute → Pull Request → /code-review → CI → gate-check → merge
```

<!-- M5で実装: Issue一次仕分けの具体的な判定基準（バグ/機能追加/技術的負債等の分類、
     優先度判定、担当レーンの割当）、GitHub MCP経由でのIssue取得処理 -->
