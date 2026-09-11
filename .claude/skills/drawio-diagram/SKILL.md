---
name: drawio-diagram
description: drawio別紙生成（要検証）。docs/{02,03,04,07}のreverse-doc、業務フロー図・運用フロー図生成時に呼ばれる。
argument-hint: "[文書項番 or 対象図の種類]"
disable-model-invocation: true
---

# drawio-diagram（drawio作図、要検証）

> 版数: M0雛形（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.1節・9.7節。03文書8.5.3節への対応として新設）
> `disable-model-invocation: true` はM0限定の安全策。設計書5.1節の本来のfrontmatterは`argument-hint`のみ。
> M4でリバース生成エンジンが実装され次第、外すこと（ただし本Skill自体が要検証項目を含むため
> M4完了後も条件付きで無効化が継続する可能性がある。9.7節参照）。

## 責務

drawio別紙生成（03文書8.5.3節への対応）。

## 呼び出し元・連携先

- 呼び出し元（主）: `docs/04_.../reverse-doc`
- 呼び出し元（業務フロー図・運用フロー図生成時）: `docs/02_.../reverse-doc`、`docs/03_.../reverse-doc`、`docs/07_.../reverse-doc`

## 入力・準拠ルール（9.7節）

- 入力: 03文書8.5.2節が定める第1段階Mermaidスケルトンと、実物（`infra/`のIaC定義）
- 準拠ルール: draw.ioのAWS4シェイプライブラリを使用し、`vidanov/aws-architecture-diagram-skill`（draw.io XMLを出力し`npx skills add`で導入可能）に準拠する
- 導入方式: `npx skills add vidanov/aws-architecture-diagram-skill`相当のコマンドで導入し、版を固定する（導入時のコミットハッシュを`doc-style-guide`の参考文献欄に記録し、無断で最新版に追随しない、MUST）

## 要検証項目（15章#17、導入前に必ず確認すること）

1. 当該スキルのライセンス条件（本書執筆時点で未確認）。商用利用・改変の可否を確認してから導入すること（MUST、確認できるまで導入を保留する）
2. draw.io XMLの生成精度（座標・接続関係の構造化）がAIによる直接生成でどこまで安定するか
3. 導入できない、またはライセンス条件が合わない場合の縮退案として、03文書8.5.2節が既に定める「第1段階のMermaidスケルトンのみで運用する」構成をそのまま最終形として採用する

<!-- M4で実装: 上記要検証項目の確認結果を踏まえた導入可否判断、導入後の作図処理実装 -->
