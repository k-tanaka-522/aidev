---
name: sync-check
description: レーンA(画面)/レーンB(契約モック・決定ログ内データモデルメモ)/レーンC(インフラ制約)のミニゲート整合確認。通過時にHB-ID/API-ID/BAT-IDを採番し、00-02/00-03/00-05台帳へ登録する。
argument-hint: "[--kind=batch] [screen名 or api名]"
---

# sync-check（レーン間ミニゲート）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.5節・10.1.4節・10.1.5節・10.3節）
> `disable-model-invocation: true`はM2で解除した（レーン/ゾーンSkillが実装され、
> orchestrateから実際に呼ばれる想定になったため）。

## 責務

レーンA（画面）とレーンB（契約モック／決定ログ内データモデルメモ）の機械的突合、レーンC（インフラ制約）との整合確認を行う（版1.4でレーンBの突合対象を`src/backend/models/`から契約モックへ変更、10.3節）。

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`（レーン同期時）
- 連携先: `gate-check`、`docs/00_.../00-02`・`00-03`・`00-05`

## 実装構成（M2で新設）

`decide`/`decision-check`と同じ設計判断（Markdown/台帳生成をLLMの自由記述に任せると
書式が壊れる）により、突合・採番・台帳追記の実処理をスクリプト化している。

```
.claude/skills/sync-check/scripts/
└── sync-check.js   # 通常モード（画面⇔契約モック）とバッチモード（--kind=batch）の両方を扱う
```

### 呼び出し例（通常モード）

```bash
node .claude/skills/sync-check/scripts/sync-check.js \
  --screen=prototypes/login.html \
  --contract=decisions/contracts/auth.openapi.yaml
```

契約モックが未確定の場合（Zone1初期）は`--contract`を省略でき、対応する
`decisions/DL-*_screen-data-{screen}.md`（`mockup-extract`出力）を自動探索して代替の
突合対象とする。差分が検出された場合は`HB-ID`を採番せず差分レポートのみを返す
（`--force`指定時は差分ありのまま通過できる。緊急時のエスケープハッチ、MAY）。

### 呼び出し例（バッチモード）

```bash
node .claude/skills/sync-check/scripts/sync-check.js --kind=batch \
  --job-name=nightly-batch --spec=decisions/DL-0010_batch-spec-nightly.md [--hb-id=HB-0001]
```

## 突合手順（10.3節、M2で実装）

1. `prototypes/{screen}.html`の`<input name="...">`等から入力フィールド名の一覧を抽出する
2. `decisions/contracts/{api-name}.openapi.yaml`のリクエスト/レスポンススキーマ定義
   （`properties`のキー）からフィールド名の一覧を抽出する。契約モックがまだ存在しない場合
   （Zone1初期）は、レーンBの決定ログ内データモデルメモ（`DL-xxxx_screen-data-{screen}.md`、
   `mockup-extract`出力）を代替の突合対象とする
3. 両者の差分（画面にあって契約モック/データモデルメモに無い、逆も同様）を報告する。
   命名ゆらぎ（snake_case⇔camelCase等）は正規化して比較する（`canonicalizeFieldName`、
   `.claude/lib/field-extract.js`）。**意味的な対応までは検出できない**（10.3節の限界、
   15章#3として要検証のまま）
4. **整合が確認できた時点で`HB-ID`を採番**し、経由する`SCR-ID`／`RPT-ID`一覧、および関連する
   `API-ID`とともに`docs/00_.../00-02_HBトレーサビリティ台帳.md`へ登録する（QA実施、10.1節）
5. 上記4と同一操作の一部として、`docs/00_.../00-05_同期点記録台帳.md`へ通過日時・参加レーン・
   確認項目・関連ID（`DL-`/`HB-`/`SCR-`/`API-`）を追記する（MUST、10.1.5節）

**実装判断（設計書に明記が無いためPMへ報告）**: 「整合が確認できた時点で」という文言を、
「差分ゼロ（または`--force`指定）をHB-ID採番の前提条件とする」という具体的な判定条件として
実装した。差分がある状態でのHB-ID採番は既定では拒否する。

Zone2に入り`src/backend/`に実装が生じた後は、突合対象を契約モックから実装（`src/backend/models/`）へ切り替える運用パラメータ（`--source=contract|impl`）を持たせ、`.claude-state/current-zone.json`を参照して自動選択する（MUST）。`current-zone.json`の具体的なJSONスキーマは設計書のどの節にも明記が無いため、`.claude/lib/zone-state.js`が暫定スキーマ`{zone, updated_at, updated_by}`を定義した（PMへ報告）。

## API-IDの紐づけ

HB-IDへ紐づける`API-ID`は、ハリボテHTMLのヘッダーコメント内に置く`使用API:`宣言行を正とする。

```html
<!--
  画面: 設定画面
  使用API: API-0014, API-0015, API-0016
-->
```

- 半角/全角コロンのどちらでもよい。複数行に分けて書いた場合は全行を合算する（`extractDeclaredApiIds`）
- **宣言行に無い`API-ID`は、同じ契約ファイルに定義されていてもその画面は呼ばないと解釈する**。
  宣言行以外の本文に現れる`API-ID`への言及（説明文など）は拾わない
- 宣言行を持たない画面は、従来どおり契約ファイル内の全`API-ID`を紐づける（後方互換）
- 画面が宣言した`API-ID`が契約側に無い場合は報告の`apiIdsNotInContract`に出すが、採番はブロックしない

この方式にした理由は、契約ファイル内の全`API-ID`を無条件にコピーすると、1契約が複数画面を
カバーする構成（例: 1契約24本で6画面分）で1画面あたり24本が付き、
Zone3のRTMとMode Bの`impact-analysis`が実態と乖離するためである（salon-booking-platform での実例）。

## 既知の制約: `--source=impl` はTypeScriptを読めない

実装からのフィールド抽出はクオート付きキー（`'foo':`）のみを対象とする正規表現であり、
TypeScriptの非クオートキー（`foo:`）に当たらない（実例: 実装全体から2語しか拾えなかった）ため、
Zone2以降も当面は`--source=contract`を明示して契約モックと突合すること。
Zone3の`traceability-reverse`（9.1.1節の静的解析）までに対応が要る。

実装ディレクトリの自動判定は「存在する」ではなく「ソースファイルを実際に含む」を条件とする
（`resolveImplRoots`）。候補は`src/backend`・`services`の順。`src/backend/`は空の雛形として
残っているため、存在チェックだけだと実装ゼロ件をレーンB側の正しい抽出結果と取り違える。

## バッチ版（`--kind=batch`、10.1.4節、M2で実装）

`BAT-ID`は画面を持たないため通常の突合（HTML入力項目とORMフィールドの突合）は適用できない。レーンB（App-Architect）が確定した入出力仕様書（決定ログのサブフォーマット）とサンプルデータを入力に、QAが`BAT-ID`を採番し`00-03_バッチトレーサビリティ台帳.md`へ登録する。画面を経由するバッチ（`--hb-id`指定時）は`00-02`台帳の経路欄にも追記する**べきだが、既存行の書き換えロジックはM2では未実装**（`markdown-table.js`が単純追記のみをサポートするため）。この場合は警告を出し、手動確認を促す（既知の制約としてPMへ報告）。

## 同期点記録台帳（00-05）への記録（10.1.5節、MUST、M2で実装）

`sync-check`は手順4（またはバッチ版のBAT-ID採番）と同一操作の一部として、`00-05`へ次を追記する。

- 通過日時
- 同期点種別（A⇔B/B⇔C/A⇔C、バッチ版は`batch`）
- 参加レーン（担当エージェント）
- 確認項目（01文書4.4.2節の「確認内容」列に対応する具体的なチェック結果）
- 関連する`DL-ID`/`HB-ID`/`SCR-ID`/`RPT-ID`/`API-ID`の一覧

## 動作確認（M2）

- 画面フィールドと契約モックのフィールドが一致する場合にHB-IDが採番され、00-02・00-05へ
  同時に追記されることを確認済み
- 画面フィールドと契約モックのフィールドに差分がある場合、HB-ID採番が拒否され差分レポートが
  返ることを確認済み
- 命名ゆらぎ（`user_name`⇔`userName`）が正規化により一致と判定されることを確認済み
- 契約モック未確定時に`mockup-extract`出力（screen-dataメモ）を自動探索することを確認済み
- バッチモードでBAT-IDが採番され00-03・00-05へ追記されることを確認済み

詳細な確認手順・結果はPMへの報告（本タスクの最終回答）を参照。
