---
name: review-dispatch
description: クロスレビューの並列ファンアウトと指摘検証。各ゾーン/レーンのreview Skillをcontext:forkで並列起動し、指摘をfile:line単位で個別検証する。
disable-model-invocation: true
---

# review-dispatch（クロスレビュー統制）

> 版数: M0雛形（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.1節・11章）
> `disable-model-invocation: true` は設計書5.1節が定める本来の値。

## 責務

クロスレビューの並列ファンアウトと指摘検証（11章）。レビューのコンテキスト分離（`context: fork`）、Workflowツールによる並列ファンアウトと指摘の個別検証パイプライン、台帳ファイルによるセッションを跨いだ差し戻し回数の管理という設計思想を、ゾーン/レーンのreview Skill（5.3節・5.4節）に適用する。

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`
- 連携先: Workflow、各`review`、`gate-check`

## 実行フロー（11章のシーケンス図の要約）

```
orchestrate → レーンexecute/reverse-doc（warmup後に起動）
  → 成果物パス＋決定ブロックを返す
orchestrate → review-dispatch（成果物パスのみで起動）
  → review-dispatch → レビュアー1(context:fork)、レビュアー2(context:fork) を並列起動
  → 各レビュアーが指摘（file:line付）を返す
  → review-dispatchが指摘を個別検証（file:line再確認）
  → orchestrateへ検証済み指摘を返す
orchestrate → gate-check（ミニゲート or ゾーンゲート判定、独立コンテキスト）
```

<!-- M2/M3で実装: Workflowツールのpipeline/parallel構文を用いた並列ファンアウトの具体実装
     （構文の確定仕様は15章#5で要検証）、指摘の個別検証（file:line再確認）処理 -->

## 合格率のみの報告を受理しない方針

分母・分子の機械判定（grepと引き算）の例、合格率のみの報告を受理しない方針はv1版から変更しない。ただし分母の取得元は10.1節の通りゾーンによって切り替わる。
