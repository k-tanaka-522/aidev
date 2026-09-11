---
name: doc-html-render
description: docs/{02〜07}のMarkdown文書をHTMLへ変換する。GZ3のローンチスナップショット生成時に一括実行する。読み手は開発者に限らず顧客・監査人・引き継ぎ先を含む。
argument-hint: "[--dir=<docs配下のパス> | --all]"
---

# doc-html-render（Markdown→HTML変換）

> 版数: M4実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 9.6節、
> docs/v2/03_成果物体系定義書.md 8.3節）

## 責務

`reverse-doc`完了後の後処理として、`docs/{項番}/*.md`をHTMLへ変換する。GZ3の
ローンチスナップショット生成時に一括実行する（MUST）。以降のZone4オンデマンド生成物は
既定でHTML化しない（MAY、必要な場合のみ都度変換）。

## 実装可否の実測結果（要検証、02文書15章#16への回答、PMへの報告事項）

本セッションの環境を実測した結果、**`pandoc`・`mmdc`（`@mermaid-js/mermaid-cli`）は
いずれも導入されていない**ことを確認した（`which pandoc` / `which mmdc` とも非0終了）。
したがって次の二段構成を採る（`.claude/lib/md-to-html.js`が実装を持つ）。

1. `pandoc`が`PATH`に存在する環境では、それを優先的に使う経路を残す（将来の導入を妨げない）
2. 存在しない場合のフォールバックとして、フルスペックのCommonMarkではなく本フレームワークが
   生成する文書の範囲（見出し・段落・GFMテーブル・コードフェンス・リンク・強調）に限定した
   自前の軽量Markdown→HTML変換を用いる

**Mermaid図の扱い（限界の明示）**: `mmdc`による画像化の代わりに、HTML側でmermaid.js
（CDN経由）を読み込みブラウザ側でレンダリングする方式を採る。**この方式はHTMLを開く
端末がインターネットに到達できることを前提とする**（完全オフライン環境では図が表示
されない）。完全オフラインでの画像化が必要な場合は`mmdc`相当のツール導入が別途必要で
あり、本実装はそれを代替しない（15章#16は「導入済み」ではなく「未導入・代替手段で
運用」として引き続き要検証の状態で報告する）。drawio別紙（`.drawio`）はHTML変換の対象と
せず、別紙ファイルへの相対リンクをそのまま埋め込む（画像変換は将来の課題とする）。

## 実行方法

```bash
node .claude/skills/doc-html-render/scripts/render.js --dir=docs/02_要件定義
node .claude/skills/doc-html-render/scripts/render.js --all
```

## 命名規則（doc-style-guide、03文書9.3.1節）

`{項番}_{文書名}.html`をMarkdown原本と同一ディレクトリに配置する。

## 動作確認（M4）

PMへの最終報告を参照。
