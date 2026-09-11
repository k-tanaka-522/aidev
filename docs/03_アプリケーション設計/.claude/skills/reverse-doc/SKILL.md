---
name: reverse-doc
description: 実物（src/backend、src/frontend、prototypes）と決定ログからアプリケーション設計書一式（03-01〜03-10）をas-built生成する。CRUD図の静的解析生成、drawio二段階生成（Mermaidスケルトン→drawio別紙）を含む。
argument-hint: "[--scope=<ID>]"
---

# reverse-doc（docs/03_アプリケーション設計、Zone3リバース生成）

> 版数: M4実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 9.1.2節・9章、
> docs/v2/03_成果物体系定義書.md 3.5節・3.11節・8.5節）

## 責務

`src/backend`・`src/frontend`・`prototypes/`確定版＋`SCREEN_ID_INDEX.md`／
`REPORT_ID_INDEX.md`・決定ログから、アプリケーション設計書一式をas-built生成する。

| 文書 | 必須区分（03文書4.3節・7章の一般則。案件ごとの確定は4章の判断基準に従う） |
|---|---|
| 03-01 アーキテクチャ概要 | 必須 |
| 03-02 コンポーネント設計 | 必須 |
| 03-03 データモデル設計（ER図） | 必須 |
| 03-04 API設計 | 条件付き必須（APIを持つ案件のみ） |
| 03-05 画面設計 | 条件付き必須（UIを持つ案件のみ） |
| 03-06 セキュリティ設計（アプリ層） | 必須 |
| 03-07 実装方針 | 必須 |
| 03-08 帳票設計 | 条件付き必須（帳票出力機能を持つ案件のみ） |
| 03-09 バッチ設計 | 条件付き必須（バッチ処理を持つ案件のみ） |
| 03-10 CRUD図 | 必須（永続データを持つ全案件） |

条件付き必須の判定は、実物の有無（`decisions/contracts/*.openapi.yaml`の存在、
`prototypes/SCREEN_ID_INDEX.md`の行数、`prototypes/REPORT_ID_INDEX.md`の行数、
`00-03`台帳の行数）から機械的に行う（該当が0件なら00-01カタログを「対象外」とし、
空文書を生成しない、03文書4.5節に準じる）。

## 9.1.2節: CRUD図の静的解析生成

`.claude/lib/static-analysis.js`の`buildCrudMatrix`を用い、`src/backend/models/`の
ORM定義からテーブル一覧を抽出し、データアクセス層のCRUD操作を機能単位（API-ID）に
紐づける（9.1.1節と抽出基盤を共有、SHOULD）。呼び出し元をまたぐコールグラフ解析は
行わない（同一ファイル内の対応づけに限定、正直な限界表明はSKILL.md本文・スクリプト
コメントを参照）。

## 8.5節: drawio二段階生成（03-01システム構成図相当のコンポーネント図 等）

第1段階としてMermaidスケルトンを常に本文中に生成する（MUST）。第2段階のdrawio別紙は
`drawio-diagram` Skill（`.claude/skills/drawio-diagram/`）を呼び出す。**drawio作図の
専用スキル（`vidanov/aws-architecture-diagram-skill`相当）は本リポジトリに未導入であり、
ライセンス確認前の無断導入を避けるため、本実装は自前の簡易drawio XML生成にとどめる
（AWS4シェイプ等の高度な意匠は持たない、要検証のまま）。生成できない・低品質な場合でも
Mermaidスケルトンが必ず本文に残るためフォールバックが常に確保される（MUST）。**

## 実行方法

```bash
node docs/03_アプリケーション設計/.claude/skills/reverse-doc/scripts/reverse-doc.js
```

## 動作確認（M4）

PMへの最終報告を参照。
