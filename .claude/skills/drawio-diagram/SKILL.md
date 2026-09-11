---
name: drawio-diagram
description: 03文書8.5.2節が定める第1段階Mermaidスケルトン→第2段階drawio別紙の二段階生成を行う。システム構成図・ネットワーク構成図・業務フロー図・運用フロー図が対象。
argument-hint: "[--nodes=<jsonファイル> --out=<出力先.drawio>]"
---

# drawio-diagram（drawio別紙生成、要検証）

> 版数: M4実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 9.7節、
> docs/v2/03_成果物体系定義書.md 8.5.2節・8.5.3節）

## 責務

8.5.1節でdrawioを形式と定めた図種別（システム構成図・ネットワーク構成図・
業務フロー図・運用フロー図）について、二段階生成を行う。

1. **第1段階（常に成功する）**: ノード・エッジのリストからMermaidスケルトンを生成し、
   文書本文にフォールバックとして残す（MUST、`.claude/lib/diagram-gen.js`の
   `buildMermaidFlowchart`）
2. **第2段階（drawio別紙）**: 同じノード・エッジのリストから簡易drawio XMLを生成する
   （`.claude/lib/diagram-gen.js`の`buildSimpleDrawioXml`）

## 導入状況・要検証事項（正直な限界表明、MUST）

`vidanov/aws-architecture-diagram-skill`（AWS4シェイプライブラリ準拠、doc-style-guideが
参照するルール）は、**ライセンス条件（商用利用・改変可否）が本セッションでは確認できな
かったため導入していない**（02文書9.7節「確認できるまで導入を保留する」に従う、
15章#17は未解消のまま残す）。本Skillが生成するdrawio XMLは、AWS4シェイプ等の意匠を
持たない素朴な矩形＋矢印（`mxGraph`形式）に留まる。

- **要検証（未解消）**: (a) `vidanov/aws-architecture-diagram-skill`のライセンス確認、
  (b) draw.io XML生成精度のAIによる直接生成での安定性
- **フォールバック（確保済み）**: 専用スキルが導入できない・簡易生成が不十分な場合でも、
  第1段階のMermaidスケルトンは必ず文書本文に残るため、内容の把握は可能である
  （03文書8.5.2節が定める縮退案そのもの、MUST）

## 呼び出し元

`docs/{02,03,04,07}` 配下の`reverse-doc`（該当図種別を生成する場合のみ）。

## 実行方法

```bash
# nodes.json: { "nodes": [{"id":"a","label":"A"}], "edges": [{"from":"a","to":"b"}] }
node .claude/skills/drawio-diagram/scripts/generate-drawio.js \
  --nodes=/path/to/nodes.json --out=docs/04_インフラ設計/04-01_システム構成図_別紙1.drawio
```

各`reverse-doc`スクリプトからは`.claude/lib/diagram-gen.js`を直接requireして呼ぶ運用でもよい
（本SKILL.mdはCLI経由の単独呼び出しにも対応するための薄いラッパーを提供する）。

## 動作確認（M4）

PMへの最終報告を参照。
