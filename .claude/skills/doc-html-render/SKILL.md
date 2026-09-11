---
name: doc-html-render
description: Markdown→HTML変換。docs/{項番}/reverse-doc完了後の後処理として、GZ3のローンチスナップショット生成時に一括実行する。
argument-hint: "[項番 or all]"
disable-model-invocation: true
---

# doc-html-render（Markdown→HTML変換）

> 版数: M0雛形（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.1節・9.6節。03文書8.3節への対応として新設）
> `disable-model-invocation: true` はM0限定の安全策。設計書5.1節の本来のfrontmatterは`argument-hint`のみ。
> M4でリバース生成エンジンが実装され次第、外すこと。

## 責務

Markdown→HTML変換（03文書8.3節への対応、9.6節）。`docs/{項番}/reverse-doc`完了後の後処理として、GZ3のローンチスナップショット生成時に一括実行する。

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`（GZ3到達時）
- 連携先: `doc-style-guide`

## 変換方式（9.6節）

- 第一候補: Bashツール経由で`pandoc`を呼び出す方式（汎用的でMermaidコードブロックの扱いにも拡張実績があるため）
- Mermaid図: `@mermaid-js/mermaid-cli`（`mmdc`）をBash経由で前処理として使い、画像化してからHTML変換する二段構成
- drawio別紙（9.7節）: エクスポート画像への変換または別紙リンクの埋め込みで対応

**要検証（15章#16）**: 実装可否・ツールの利用可能性（サンドボックス内でのインストール可否含む）。

<!-- M4で実装: pandoc/mmdc呼び出し処理、要検証事項（サンドボックス内インストール可否）の
     確認結果を踏まえた実装方式の確定 -->
