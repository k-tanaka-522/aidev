---
name: review
description: RTM・テスト方針の完全性、決定ログとの整合、逆差分の有無を独立コンテキストで検証する。
context: fork
---

# review（docs/05_テスト、Zone3レビュー）

> 版数: M4実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 11章）

## 責務

`traceability-reverse`が生成したRTM（`05-02`）・テスト方針（`05-01`）について、
`context: fork`の独立コンテキストで以下を検証する。

1. `HB-ID`全件・`API-ID`全件（画面非経由分を含む）が`05-02`に反映されているか
2. 静的解析の`unresolved`一覧（`00-13_課題管理表.md`）が放置されていないか
3. IT対応確認欄が「要確認」のまま残っている項目について、`tests/integration/`側の
   docblock追加漏れが無いか
4. `.claude/lib/static-analysis.js`のアダプタ範囲外（対応外フレームワーク）である旨が
   正直に明示されているか（実装から推測して埋めていないか）

## ツール権限

`context: fork`内での実行のため`Write`/`Edit`は持たない（`Read`/`Grep`/`Glob`のみ）。

## 動作確認（M4）

PMへの最終報告を参照。
