---
name: gate-check
description: ミニゲート/ゾーンゲート(GZ0/GZ2/GZ3)の機械判定。ゾーンに応じて判定基準を切り替える。PM・作成者から独立したコンテキストで実行する。
context: fork
allowed-tools: Read, Grep, Glob
disable-model-invocation: true
---

# gate-check（ゲート機械判定）

> 版数: M0雛形（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 10.2節・10.1.2節・10.1.5節）
> `context: fork` と `allowed-tools: Read, Grep, Glob` は設計書5.1節・10.2節が定める本来の値。
> `disable-model-invocation: true` はM0限定の安全策であり、M3でHooks/Permissions強制層が実装され次第、外すこと。

## 責務

ミニゲート/ゾーンゲート（`GZ0`/`GZ2`/`GZ3`）の機械判定。ゾーンに応じて判定基準を切り替える。判定はPMの主コンテキストとは独立したコンテキストで実行し、`gate-check`自身が分母・分子を`grep`して数える（自己申告に依存しない）。

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`
- 連携先: 台帳ファイル（`docs/00_.../00-02`〜`00-05`、`decisions/`、`GZ{0,2,3}-99_ゲート記録.md`）

## ゲート一覧と判定条件（10.2節）

| ゲート種別 | 正式名称 | 遷移 | 判定条件（概要） | 差し戻しカウント対象か |
|---|---|---|---|---|
| ゾーンゲート | `GZ0` | Zone0→Zone1 | 決定ログの必須項目充足（8.3節の分母。不可逆度:高の決定、案件類型判定、プロセス・オプション選択を含む） | 対象 |
| ミニゲート | （無番号） | レーンA⇄B⇄C（Zone1内、随時） | `sync-check`によるレーン間整合、`HB-ID`/`API-ID`/`BAT-ID`採番 | 対象外（戻りは正常系） |
| （準ゲート） | （無番号） | Zone1⇄Zone2（機能単位） | 契約モック・ハリボテが実装に置き換わる際の整合確認 | 対象外 |
| ゾーンゲート | `GZ2` | Zone2→Zone3（リリース候補確定＝コードフリーズ） | 全機能の硬化完了、トレーサビリティ充足、Critical/High指摘0件。GO時`orchestrate`がgit tagを打刻 | 対象 |
| （実行イベント） | リリース実施 | GZ2 GO後 | SRE主導dry-run→承認→本番実行の3ステップ。失敗時はコードフリーズ解除しZone2へ差し戻し | — |
| Zone3内ミニチケットのGate | （無番号） | Zone3内、随時 | 10.4節参照 | 対象外 |
| ゾーンゲート | `GZ3` | Zone3→Zone4 | IPA成果物の生成完了、逆差分0件、RTM充足、07番の生成完了 | 対象 |

差し戻し回数カウント（3回超でHOLD）は`GZ0`/`GZ2`/`GZ3`にのみ適用する。

## gate-checkの分母・分子（10.1.2節）

| ゾーン | 分母 | 分子 |
|---|---|---|
| Zone1〜2 | `HB-ID`全件＋`API-ID`全件＋`NFR-ID`全件＋画面非経由の`BAT-ID`全件 | E2Eは`tests/e2e/`docblockの`HB-ID`、ITは`tests/integration/`docblockの`API-ID`、STは非機能検証テストのdocblockの`NFR-ID`。`skip`/`fixme`/握りつぶしは分子に数えない |
| Zone3以降 | Zone3で生成されたRTM（正式要件ID起点） | 同上（要件ID化後） |

`00-05_同期点記録台帳.md`はミニゲート判定、および`GZ0`の分母集計（同期点由来の項目が含まれる場合）の出典として参照する（10.1.5節）。

## decision-checkとのインターフェース（M1で実装済み、M3で配線）

`GZ0`判定は`decision-check`が集計した決定ログの分母・分子を用いる（8.3節）。
`decision-check`（M1実装済み）は次のコマンドで機械可読なJSONレポートを返す。

```bash
node .claude/skills/decision-check/scripts/check.js --json
```

M3で`gate-check`本体を実装する際は、このJSONの`zone0.numerator`/`zone0.denominator`
（9項目充足数）、`hbId.numerator`/`hbId.denominator`（HB-ID単位4スロット）、
`decisionWarnings.unresolved`（未解消警告件数。0でなければ`GZ0`はGOと判定しない、
8.2.5節）、`processOption.consistent`（`false`の場合はブロック、8.7節）を入力として
GO/NG/HOLD判定を組み立てること。出力フィールドの詳細は
`.claude/skills/decision-check/SKILL.md`を参照。

<!-- M3で実装: 上記の分母・分子の実grep処理、GO/NG/HOLD判定ロジック、GZ{0,2,3}-99台帳への記録 -->

## 引数

`$ARGUMENTS`でゲート種別（`GZ0`/`GZ2`/`GZ3`/ミニゲート対象パス/`--kind=zone3-hotfix`）を受け取る。
