---
name: reverse-doc
description: infra/（IaC定義）と決定ログからインフラ設計書一式（04-01〜04-11）をas-built生成する。システム構成図・ネットワーク構成図はdrawio二段階生成の対象。
argument-hint: "[--scope=<ID>]"
---

# reverse-doc（docs/04_インフラ設計、Zone3リバース生成）

> 版数: M4実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 9章、
> docs/v2/03_成果物体系定義書.md 3.6節・8.5節）

## 責務

`infra/`（IaC定義）・決定ログから、インフラ設計書一式（`04-01`〜`04-11`）を
as-built生成する。`04-01`（システム構成図）・`04-02`（ネットワーク設計）はdrawio形式
（03文書8.5.1節）であり、二段階生成（第1段階Mermaidスケルトン→第2段階drawio別紙）を
適用する。

## IaCファイルの分類（暫定パターン、PMへの報告事項）

`ops-item-guard.js`（M3実装）と同様、04文書側からの正式なファイル命名規則例の提供が
無いため、本実装はファイル名・パスのキーワード一致による暫定分類を用いる
（`network|vpc|subnet` → ネットワーク、`monitor|alarm|cloudwatch` → 監視、
`backup|snapshot` → バックアップ、`dr|disaster` → DR、それ以外 → システム構成の
その他要素）。

## 実行方法

```bash
node docs/04_インフラ設計/.claude/skills/reverse-doc/scripts/reverse-doc.js
```

## 動作確認（M4）

PMへの最終報告を参照。
