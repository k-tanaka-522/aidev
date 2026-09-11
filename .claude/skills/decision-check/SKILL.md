---
name: decision-check
description: 決定ログのカバレッジ検査（Zone0分母9項目・HB-ID単位4スロット・運用系分母の機械集計）、decision-warnings.jsonの未解消件数確認、process-option.jsonとの同期検査。
context: fork
disable-model-invocation: true
---

# decision-check（決定ログカバレッジ検査）

> 版数: M1実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 8.2.5節・8.3節・8.7節）
> `context: fork` は設計書5.1節が定める本来の値。`disable-model-invocation: true` は
> M3でsettings.jsonが昇格し`gate-check`から実際に呼ばれる配線が組まれるまでの安全策として維持する。

## 責務

1. **決定ログの分母の機械集計（8.3節）**
   - **(a) Zone0分母**: `decisions/DL-*.md`のfrontmatter「対象カテゴリ」フィールドについて、9値（`事業背景`/`スコープ外周`/`法規制前提`/`非機能骨格`/`アーキ土台`/`外部連携制約`/`予算期限体制`/`案件類型`/`前倒しオプション`）それぞれで該当エントリが1件以上存在するかを判定し、分母9・分子（充足カテゴリ数）を計算する。全9件が埋まっていなければ`GZ0`はGOと判定しない
   - **(b) HB-ID単位分母**: 各`HB-ID`について「業務ルール」「権限」「異常系」「外部連携」の4スロットが分母。`00-02_HBトレーサビリティ台帳.md`から`HB-ID`一覧を取得し、frontmatterの「関連HB-ID」フィールドで対応する決定ログを検索し、「対象スロット」フィールド（`decide`が起票時に構造化する）で充足数を数える。分母は`(a)の9項目) + (4スロット × HB-ID件数)`
   - **(c) 運用系分母**: 04文書4.3節が定める条件B該当項目（M2・B5・M10）について、frontmatterの「運用項目コード」フィールドで検索し、本文中に04文書6.3節の5項目ヒアリング見出しがすべて存在するかを確認する
2. `decision-warnings.json`の`resolved: false`エントリ件数を分母計算に組み込む（8.2.5節）
3. `process-option.json`が対応する決定ログエントリ（`DL-0000`）と一致していることを確認する（8.7節、不一致はゾーンゲートでブロック）

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`（ミニゲート/ゾーンゲート時）。M3で`gate-check`との連携配線を組む
- 連携先: `gate-check`

## 実装構成（M1で新設）

上記1〜3の集計は、`Read`/`Grep`/`Glob`のみを持つ`context: fork`内で確実に同じ結果を
再現できるよう、判定ロジックをスクリプト化している（LLMが都度目視で数えると、
ファイル件数が増えたときに見落としが生じるため）。

```
.claude/skills/decision-check/scripts/
└── check.js   # 分母・分子・警告未解消件数・process-option整合をJSON/人間可読で出力
```

### 呼び出し方

```bash
node .claude/skills/decision-check/scripts/check.js          # 人間可読サマリ + JSON詳細
node .claude/skills/decision-check/scripts/check.js --json   # JSON詳細のみ（gate-check等の後続処理向け）
```

本スクリプトは読み取り専用であり、`decisions/`・`00-02`台帳・`decision-warnings.json`・
`process-option.json`のいずれも書き換えない（`decision-check`が`Write`/`Edit`を
持たないという設計書のツール権限方針、7.2節と整合させるため）。

### 出力される主なフィールド（`--json`時）

```jsonc
{
  "zone0": { "denominator": 9, "numerator": <int>, "missing": [...], "go": <bool> },
  "hbId": { "hbIds": [...], "denominator": <int>, "numerator": <int>, "detail": {...} },
  "ops": { "M2": {...}, "B5": {...}, "M10": {...} },
  "decisionWarnings": { "total": <int>, "unresolved": <int>, "unresolvedList": [...] },
  "processOption": { "mirror": {...}, "dl0000Mode": "...", "consistent": <bool|null> }
}
```

`zone0.go`は便宜上の集計値であり、実際のGZ0 GO/NG/HOLD判定は`gate-check`（M3実装、
`decision-warnings.json`の未解消件数等も加味した総合判断）が行う。`decision-check`は
分母・分子を機械的に数えて提供するに留める（判定と集計の責務分離、10.2節の
「判定主体の独立性」と整合）。

`processOption.consistent`は次の3値を取る。
- `true`: 鏡ファイルと`DL-0000`のモードが一致
- `false`: 片方のみ存在、またはモードが不一致（**要対応**、8.7節が要求する不一致検知）
- `null`: 両方とも未作成（Zone0未着手。GZ0未到達時点での正常状態）

## HB-ID単位分母の集計方式（8.3節(b)、実装補足）

`decide`が決定ログ起票時に付与する「対象スロット」フィールド（形式:
`"業務ルール=あり, 異常系=該当なし"`）を機械的にパースする。同一`HB-ID`に対応する
決定ログが複数ある場合、それらのスロット充足状況を**論理和（いずれか1件でも
言及していれば充足）**として扱う。「該当なし」の明記も充足として数える
（01文書4.7.3節(b)「該当が無い場合は『該当なし』と明記する」の要求を反映）。

## 運用系分母の判定方式（8.3節(c)、実装補足）

`運用項目コード`フィールドにM2/B5/M10のいずれかを含む決定ログを検索し、該当する
決定ログのうち1件でも本文に04文書6.3節の5項目ヒアリング見出し文言
（「一次対応者・エスカレーション先」「事業影響の判断基準」「対外報告義務の有無と、
報告先・期限」「本番変更の最終承認者」「データ廃棄・システム廃止の判断トリガとなる条件」）
がすべて含まれていれば`hearingOk: true`とする。`decide`の`new-decision.js`が生成する
定型文言と一致させているため、`decide`経由で起票する限り自動的に満たされる。

## ツール権限

`Read`, `Grep`, `Glob`, `Bash`（同梱スクリプトの実行のため）のみ（判定主体の独立性を
担保するため`Write`/`Edit`は持たない）。

## 動作確認済みの事項（M1）

- Zone0の9カテゴリ全件充足時に`zone0.go: true`となることを確認済み
- HB-ID 1件・4スロット全充足で`hbId.numerator: 4`となることを確認済み
- 運用系分母（M2）でヒアリング5項目充足時に`hearingOk: true`となることを確認済み
- `decision-warnings.json`の未解消件数増減が`decisionWarnings.unresolved`に反映されることを確認済み
- `process-option.json`と`DL-0000`の意図的な不一致が`processOption.consistent: false`として検出されることを確認済み

詳細な確認手順・結果はPMへの報告（本タスクの最終回答）を参照。
