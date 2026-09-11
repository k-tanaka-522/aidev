---
name: gate-check
description: ミニゲート/ゾーンゲート(GZ0/GZ2/GZ3)、およびMode Bチケット/Zone3内ミニチケットのGate(--kind=ticket|zone3-hotfix)の機械判定。ゾーンに応じて判定基準を切り替える。PM・作成者から独立したコンテキストで実行する。
context: fork
allowed-tools: Read, Grep, Glob, Bash
disable-model-invocation: true
---

# gate-check（ゲート機械判定）

> 版数: M0雛形＋M5部分実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 10.2節・10.1.2節・
> 10.1.5節・10.4節・12章）
> `context: fork` と `allowed-tools` は設計書5.1節・10.2節が定める本来の値
> （`Bash`はM5で`node scripts/gate-check.js`を実行するために追加）。
> `disable-model-invocation: true` はM0限定の安全策であり、M3でHooks/Permissions強制層が
> 実装され次第、外すこと。
>
> **M5での実装範囲（重要）**: `GZ0`/`GZ2`/`GZ3`（ゾーンゲート、Mode A側）のGO/NG/HOLD判定
> 本体は、02文書14.2節の段階移行計画のどのマイルストーンにも実装担当が明記されておらず
> （SKILL.md旧版は「M3で実装」とコメントしていたが、M3の実スコープはHooks/Permissions
> 強制層でありgate-check本体は含まれない）、**M0から未実装のまま引き継がれている**。
> 本タスク（M5）はMode Bの実装が範囲であるため、`scripts/gate-check.js`は
> **`--kind=ticket`（Mode Bチケット）と`--kind=zone3-hotfix`（Zone3内ミニチケット）の
> 2種類のみ**を実装し、ゾーンゲート本体は未実装のまま次段（PMが判断する後続マイルストーン）
> へ申し送る（PMへ報告）。

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

## Mode Bチケット/Zone3内ミニチケットのGate（M5実装、`--kind=ticket|zone3-hotfix`）

`scripts/gate-check.js`が実装する。判定条件は01文書6.5節「Gate判定基準（全ゾーン共通）」を準用する。

1. Critical/High指摘が0件（`--findings=<JSON path>`で読み込む。`review-dispatch`がまだ
   file:line単位の指摘検証を実装していない《M0雛形のまま》ため、現時点は暫定レビュー結果
   （人手集計またはQAの報告）をJSONで渡す運用とする。未指定時は「未レビュー扱い」として
   全0で通す既定値を使うが、その旨を出力の`findings.source`に明記し隠さない）
2. Guardがpass（同上`--findings`の`guardPass`）
3. トレーサビリティ充足（回帰テスト）: 分母 = `impact-analysis`の直接影響＋連動影響HB-ID、
   分子 = `tests/e2e`・`tests/integration`のdocblock記載件数。分母−分子は
   `00-12_リスク管理台帳.md`のdefer登録（IDのgrep一致）と一致していなければNG
4. 差し戻し回数が3回以下。**`--kind=ticket`は`.claude-state/mode-b-ticket-retry.json`、
   `--kind=zone3-hotfix`は`.claude-state/zone3-hotfix-count.json`を使う。両者は完全に
   独立したカウンタであり、Zone3内ミニチケットの差し戻しはゾーンゲート側の累積カウンタ
   （`zone-gate-retry.json`）を一切汚染しない（01文書4.6.2節「差し戻し回数の累積対象外」
   の原則を機構的に担保する、02文書10.4節）**

HOLDへ遷移した瞬間（未HOLD→HOLD）、03文書版1.5・3.2.6節が定める`00-13_課題管理表.md`
（列定義の正本）へ種別`差し戻し（要注意）・HOLD対応`で1件登録する（`.claude/lib/issue-ledger.js`）。
`GZ{0,2,3}-99_ゲート記録.md`はゾーンゲート専用であり本kindには存在しないため、`00-13`が
Mode Bチケット/Zone3内ミニチケットのHOLD発生を追跡する唯一の記録先になる。

### 実行方法

```bash
node .claude/skills/gate-check/scripts/gate-check.js --kind=ticket --ref=TICKET-0001 \
  --ticket=TICKET-0001 --findings=.claude-state/reviews/TICKET-0001-findings.json

node .claude/skills/gate-check/scripts/gate-check.js --kind=zone3-hotfix --ref=ZH-0001 \
  --ids=HB-0002
```

戻り値のJSONは`judgement`（`GO`/`NG`/`HOLD`）、`reasons`、`denominator`/`numeratorCovered`/
`uncovered`、`retryState`を含む。`impact-analysis`側で`unresolved`が検出されている場合は
GOをブロックしないが`impactUnresolved`として明示し、人手確認を促す（黙って無視しない）。

### 動作確認（M5）

PMへの最終報告を参照。
