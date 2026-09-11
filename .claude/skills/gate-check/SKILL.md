---
name: gate-check
description: ミニゲート/ゾーンゲート(GZ0/GZ2/GZ3)、およびMode Bチケット/Zone3内ミニチケットのGate(--kind=ticket|zone3-hotfix)の機械判定。ゾーンに応じて判定基準を切り替える。PM・作成者から独立したコンテキストで実行する。
context: fork
allowed-tools: Read, Grep, Glob, Bash
disable-model-invocation: true
---

# gate-check（ゲート機械判定）

> 版数: M0雛形＋M5（Mode B部分実装）＋本タスク（ゾーンゲート本体実装）
> （実装対象: docs/v2/02_実行基盤アーキテクチャ.md 10.2節・10.2.1節・10.2.2節・10.1.2節・
> 10.1.5節・10.4節・12章、01文書6.5節・7.2節・7.4節・7.6節）
> `context: fork` と `allowed-tools` は設計書5.1節・10.2節が定める本来の値
> （`Bash`はM5で`node scripts/gate-check.js`を実行するために追加）。
> `disable-model-invocation: true` はM0限定の安全策として維持している。`.claude/settings.json`
> は現時点で「M3安全な有効化」版（`_note`参照）であり、`role-boundary-guard.js`・
> `gate-transition-guard.js`等のブロック系hookはM6の本切替まで実際には登録されていない。
> したがって本フラグはM6でHooks/Permissionsが本切替されるまで維持する（本タスクでは変更しない）。
>
> **経緯（重要）**: `GZ0`/`GZ2`/`GZ3`（ゾーンゲート、Mode A側）のGO/NG/HOLD判定本体は、
> 02文書14.2節の段階移行計画のどのマイルストーンにも実装担当が明記されておらず、M0〜M5の
> いずれでも実装されないまま引き継がれていた（M5報告のとおり）。**本タスクでこの欠落を埋め、
> ゾーンゲート本体（`--kind=zone-gate --gate=GZ0|GZ2|GZ3`）を実装した。** 既存の
> `--kind=ticket`（Mode Bチケット）・`--kind=zone3-hotfix`（Zone3内ミニチケット）は無変更
> （ただし後述のとおりskip/fixme除外の欠落バグを本タスクで併せて是正した）。

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

## decision-checkとのインターフェース（本タスクで配線済み）

`GZ0`判定は`decision-check`が集計した決定ログの分母・分子を用いる（8.3節）。
`.claude/lib/zone-gate-conditions.js`の`runDecisionCheck()`が、子プロセスとして

```bash
node .claude/skills/decision-check/scripts/check.js --json
```

を実行しJSONをパースする。`zone0.go`（9項目充足）、`decisionWarnings.unresolved`
（未解消警告件数。0でなければ`GZ0`はGOと判定しない、8.2.5節）、`processOption.consistent`
（`false`の場合はブロック、8.7節）を入力としてGO/NG/HOLD判定を組み立てる。
`decision-check`の実行自体に失敗した場合（JSON解析失敗等）は判定不能として**fail closed**
（NG扱い）とする。出力フィールドの詳細は`.claude/skills/decision-check/SKILL.md`を参照。

## ゾーンゲート本体（`--kind=zone-gate --gate=GZ0|GZ2|GZ3`、本タスクで実装）

`scripts/gate-check.js`が`.claude/lib/zone-gate.js`へ委譲する。判定条件は01文書6.5節
「Gate判定基準（全ゾーン共通）」および02文書10.2節のゲート別条件（版2.2）に従う。
判定ロジックの本体は`.claude/lib/zone-gate.js`・`.claude/lib/zone-gate-conditions.js`に
実装し、`gate-check`スクリプトは薄いCLIラッパーに留める（Mode B側`judge()`と対称の構成）。

### 実行方法

```bash
node .claude/skills/gate-check/scripts/gate-check.js --kind=zone-gate --gate=GZ0 [--findings=<path>]
node .claude/skills/gate-check/scripts/gate-check.js --kind=zone-gate --gate=GZ2 [--findings=<path>]
node .claude/skills/gate-check/scripts/gate-check.js --kind=zone-gate --gate=GZ3 [--findings=<path>]
```

`--findings`のJSON形式は`{critical, high, guardPass}`（Mode B側と同一）に加え、GZ2向けに
`hardeningComplete`（全機能の硬化完了。機械検知できないため人手/QAレビュー結果の申告を
受け取る唯一の項目。既定`true`、その旨を`hardeningCompleteSource`に明記し隠さない）を持つ。
**`--findings`はCritical/High件数・Guard結果・硬化完了の3種類の申告のみを受け取り、
それ以外（分母・分子・合格率等）は`--findings`に何を書いても一切参照しない。** これにより
「◯件中◯件パス」のような合格率のみの報告を受理しない（01文書6.5節・7.2節）という原則を、
機構的に（読み取りコードが存在しない、という形で）担保している。

### GZ0の判定条件

1. `decision-check`が集計するZone0決定ログの必須9項目充足（8.3節(a)）
2. `decision-warnings.json`の未解消警告が0件
3. `process-option.json`と`DL-0000`のモード整合（8.7節）
4. Critical/High指摘0件、Guard pass（全ゲート共通条件1・2）

### GZ2の判定条件（版2.2でGZ2 GO条件に06番の生成完了が追加）

1. Critical/High指摘0件、Guard pass
2. 全機能の硬化完了（`--findings`の`hardeningComplete`。機械検知不能なため人手申告を受ける
   唯一の条件）
3. `GZ0`のGO記録が存在すること（条件4: 前ゾーンのGateがGO済み）
4. トレーサビリティ充足（条件6）: 分母 = `HB-ID`全件＋`API-ID`全件＋`NFR-ID`全件＋画面非経由の
   `BAT-ID`全件、分子 = 各テストのdocblock記載件数（`skip`/`fixme`/握りつぶしを除く）。
   分母−分子は`00-12_リスク管理台帳.md`のdefer登録と一致していなければNG
5. **該当する案件では06番（移行・導入）の生成完了**（`00-01`カタログの区分`06`の行が
   「対象外」を除きすべて「生成済み」であること。案件非該当時＝該当行がすべて「対象外」
   の場合はスキップ）。`00-01`カタログ自体が読めない場合は判定不能として**fail closed**（NG）

### GZ3の判定条件

1. Critical/High指摘0件、Guard pass
2. `GZ2`のGO記録が存在すること
3. 逆差分0件（`.claude/lib/verify.js`の`computeReverseDiff`）
4. 生成漏れ検査でギャップ0件（同`computeGenerationGaps`）
5. RTM/トレーサビリティ充足（GZ2と同じ集計方法の近似。RTM正式版の個別パースは行わない、限界）
6. **07番の生成完了**（`00-01`カタログの区分`07`。`07-50`は04文書9.1.3節・02文書9.1.3節が
   定めるとおりGZ3判定対象外として明示的に除外する）
7. IPA標準成果物一式（02〜07、07-50を除く）の生成完了
8. `requirements-first`選択時のみ: `00-14_変更管理台帳.md`の「承認状態」列が「未承認」の
   行が0件であること（`.claude/lib/cr-ledger.js`が定める3値限定スキーマを利用）

### 差し戻し・HOLD（全ゲート共通、10.2.1節・10.2.2節）

NG判定のたびに`.claude-state/zone-gate-retry.json`の当該ゲートのカウンタを+1し、3回超過で
HOLDへ遷移する（Mode B`--kind=ticket`と対称の設計。この対応関係は本タスクの実装判断として
PMへ報告する）。HOLD中は再判定要求そのものを`exit 2`でブロックし続ける（自動解除しない）。

**HOLD解除（10.2.2節の手順、本タスクで実装）**:

```bash
node .claude/skills/gate-check/scripts/gate-check.js --reset-hold=GZ2 --decision=DL-0050
```

`RESET`エントリを`GZ{0,2,3}-99_ゲート記録.md`へ追記し、差し戻し累積回数を`0`にリセットする。
`--decision=<DL-ID>`はMUST（ユーザー承認を記録した決定ログID）。

### `GZ{0,2,3}-99_ゲート記録.md`のスキーマ（10.2.2節、本タスクで正本スキーマへ移行）

旧M3実装はGFMテーブル形式の暫定スキーマを採用していたが、その後02文書 版1.9・10.2.2節が
見出し＋箇条書きブロック形式を正本として確定した。本タスクで`.claude/lib/gate-records.js`を
この正本スキーマへ移行した（`gate-transition-guard.js`は本ライブラリの`latestGateJudgement()`
のみを呼ぶため、hook自体は無変更で追随できる）。

```markdown
## GZ2 判定記録 #3

- 判定日時: 2026-09-11T10:00:00Z
- 判定結果: NG
- 差し戻し累積回数: 2
- 分母: 42
- 分子: 40
- 未解消decision-warnings件数: 0
- 判定主体: gate-check（context: fork）
- 備考: ...
```

## 引数

`$ARGUMENTS`でゲート種別（`--kind=zone-gate --gate=GZ0|GZ2|GZ3`/`--kind=ticket|zone3-hotfix`/
`--reset-hold=GZ0|GZ2|GZ3 --decision=<DL-ID>`）を受け取る。

## Mode Bチケット/Zone3内ミニチケットのGate（M5実装、`--kind=ticket|zone3-hotfix`）

`scripts/gate-check.js`が実装する。判定条件は01文書6.5節「Gate判定基準（全ゾーン共通）」を準用する。

1. Critical/High指摘が0件（`--findings=<JSON path>`で読み込む。`review-dispatch`がまだ
   file:line単位の指摘検証を実装していない《M0雛形のまま》ため、現時点は暫定レビュー結果
   （人手集計またはQAの報告）をJSONで渡す運用とする。未指定時は「未レビュー扱い」として
   全0で通す既定値を使うが、その旨を出力の`findings.source`に明記し隠さない）
2. Guardがpass（同上`--findings`の`guardPass`）
3. トレーサビリティ充足（回帰テスト）: 分母 = `impact-analysis`の直接影響＋連動影響HB-ID、
   分子 = `tests/e2e`・`tests/integration`のdocblock記載件数（`skip`/`fixme`/握りつぶしを
   除く。**本タスクで是正**: 旧実装はこの除外をコメントで主張するのみで実装しておらず、
   `test.skip`を付けたテストのIDまで分子に数えてしまうバグがあった。`static-analysis.js`に
   `isDeadTestContext`/`filterExecutable`を新設し、本kindおよびzone-gate双方で共通利用する
   ことで是正した）。分母−分子は`00-12_リスク管理台帳.md`のdefer登録（IDのgrep一致）と
   一致していなければNG
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

### 動作確認

- Mode Bチケット/Zone3内ミニチケットのGate: M5完了報告を参照。
- ゾーンゲート本体（GZ0/GZ2/GZ3）・HOLD解除・skip除外・`gate-transition-guard.js`連携:
  本タスク（ゾーンゲート本体実装）のPMへの最終報告を参照。
