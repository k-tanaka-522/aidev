---
name: contract-design
description: ハリボテ・決定ログを入力に、OpenAPI等の契約モックを作成する。実装（src/）には一切触れない。確定した契約モックはsync-checkの突合対象になり、確定時点でApp-ArchitectがoperationIdごとにAPI-IDを採番する。
argument-hint: "[API名]"
---

# contract-design（契約モック設計・Zone1レーンB）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.3節・10.1.1節・10.1節）
> 01文書版1.3の4.4.1節・4.4.4節により、レーンBのZone1成果物は「決定ログ＋契約モック
> （OpenAPI等）」に限定される。本Skillはこの契約モック作成を担う（**新設**、M1では
> `docs/00_.../decisions/contracts/`ディレクトリ自体が未設置のまま残っていた）。

## 責務

1. ハリボテ・決定ログを入力に、OpenAPI等の契約モックを作成する
2. **実装（`src/`）には一切触れない（MUST NOT）**。Zone1のうちに`src/`へ書き込む導線を
   物理的に作らない設計（02文書4.3節・5.3節の判断をそのまま踏襲）
3. 確定した契約モックは`sync-check`（10.3節）の突合対象になる
4. **確定時点でApp-Architectがoperationidごとに`API-ID`を採番する**（01文書4.4.5節、
   `register-api.js`を使用）

## 手順（MUST）

```
1. ウォームアップ: decisions/contracts/配下の既存ファイルを1つReadする（無ければ本ディレクトリで
   最初のファイルを新規作成する）
2. API_DESIGN_STANDARD.md（自動参照。RESTful原則・バージョニング・OpenAPI提供方針）を確認する
3. データ形状決定時は code-style-guide/data/DATABASE_STANDARD.md（副、02文書4.4節）も参照する
4. security-style-guide（paths自動参照）で認証・認可の実装規約を確認する
5. mockup-extract の出力（decisions/DL-xxxx_screen-data-{screen}.md）、またはハリボテの
   直接確認により、必要なエンドポイント・入出力形状を把握する
6. decisions/contracts/{api-name}.openapi.yaml を Write/Edit する
   （OpenAPI 3.0形式。operationId・requestBody/responsesのschema.propertiesを明記すること。
   sync-checkがproperties配下のキーをフィールド一覧として抽出するため、10.3節の突合が
   機能する形式で書くこと）
7. node .../contract-design/scripts/register-api.js --file=<書いたyamlの相対パス>
   を実行し、未採番のoperationIdに`API-ID`を自動付与する（`x-api-id`拡張フィールドとして
   YAML内に埋め込む。MUST。手動でIDを書かない）
```

## 契約モックの位置づけ（01文書4.4.4節、記述系文書ではない）

契約モックはAPIの入出力形状という**合意の媒体**であり、レビュー用の説明文書ではないため、
01文書4.4.4節が禁止する「Zone1の記述系文書」には該当しない。API仕様書としての記述
（エンドポイントの説明文・エラーケースの文章化等）は、従来どおりZone3のリバース
（`03-04_API設計`）を待つ。

## API-IDの採番・保持先（10.1.1節・03文書3.10.3節）

`API-ID`は契約モックYAML自体に`x-api-id`拡張フィールドとして埋め込む（台帳を分離しない、
YAML自体が台帳を兼ねる設計）。画面を経由するAPIは、`sync-check`実行時に対応する`HB-ID`の
経路情報として`00-02`台帳の経路欄にも追記される（本Skillの責務ではなく`sync-check`の責務）。

## ツール権限

`Write`/`Edit`は`decisions/**`のみ（`role-boundary-guard.js`がM3で強制。それまでは
実行者が自律的にパスを守ること）。`src/**`への書き込みは行わない（MUST NOT）。

## 動作確認（M2）

- OpenAPI YAML作成→`register-api.js`実行→`x-api-id`付与を確認済み
- 同一ファイル内の複数operationIdへの連番採番（重複なし）を確認済み
- 既にx-api-idが付与済みのoperationIdへの再採番を行わない（冪等）ことを確認済み
- `decisions/contracts/`以外のパスを指定した場合の拒否を確認済み

詳細な確認手順・結果はPMへの報告（本タスクの最終回答）を参照。
