---
name: orchestrate
description: ゾーン/レーン型プロセス（Zone0〜4）の遷移統制とTask境界の決定回収を行うオーケストレーター。PMがサブエージェント・横断Skillへ委譲する際の唯一の起動口。
disable-model-invocation: true
---

# ゾーン/レーン オーケストレーター

> 版数: M0雛形（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 3.1節・5.1節・6章・8.2.4節・9.4.1節）
> `disable-model-invocation: true` は設計書5.1節が定める既定値であり、PMが明示的に呼び出したときのみ起動する。

`orchestrate` は PM（主スレッド）がサブエージェント・横断Skillへ処理を委譲する際の唯一の起動口である。01文書のゾーン/レーンモデル（Zone0〜4、レーンA/B/C）をClaude Codeの実行機構（Task, Skill, Hooks, 台帳ファイル）に写像し、遷移を統制する。

## 責務

1. Zone0〜4の遷移統制。ゾーンゲート（`GZ0`/`GZ2`/`GZ3`）の判定は自分では行わず `gate-check` に委ねる（10.2節）
2. Zone1内のレーンA/レーンB(契約モック)/レーンC間のミニゲート同期。`sync-check` を起動する（10.3節）
3. **Task境界の決定回収プロトコル（8.2.4節、最優先）**: 各Subagentへの委譲プロンプトに下記フォーマットでの報告を必須指示として含め、戻り値の「決定ブロック」が「決定なし」以外を含む場合は次のTaskを起動する前に `decide` Skillを呼び出す（MUST）
4. Zone3着手時、生成DAG（9.4.1節）に従って `reverse-doc` 系Taskの起動順序を決定する
5. Mode B（Zone4）では `ticket-triage` → `impact-analysis` → 各レーンの `execute` の順で起動する

## 呼び出し元・連携先（5.1節）

- 呼び出し元: PM
- 連携先: 各レーンSkill、`decide`、`gate-check`、`review-dispatch`、`sync-check`

## ネストスキルの呼び出し方（ウォームアップ、1.4節）

ディレクトリスコープSkillは、そのディレクトリ配下のファイルを読み書きするまで有効化されない。呼ぶ前に必ず対象ディレクトリのファイルを1つ読み込むこと。

```
1. Read <対象ディレクトリ>配下のファイルを1つ（例: prototypes/index.html）
2. その後 <ディレクトリ>:<スキル名> を呼ぶ（例: prototypes:mockup-generate）
```

## ゾーンとレーンの対応（3.1節・4章の要約）

| ゾーン | 内容 | 主なSkill |
|---|---|---|
| Zone0 | 不可逆決定（Fix First） | `decide` |
| Zone1 | 探索・収束ループ（ハリボテ駆動、レーンA/B/C並行） | `prototypes:mockup-generate/-update/-extract`、`decisions/contracts:contract-design`、`sync-check` |
| Zone2 | 実装・硬化（機能単位でZone1と重なる） | `src/*:execute`/`review`、`infra/*:execute`/`review` |
| Zone3 | ローンチ時リバース | `docs/{02-07}:reverse-doc`、`docs/05:traceability-reverse` |
| Zone4 | Mode B（稼働後チケット駆動） | `ticket-triage`、`impact-analysis` |

現在のゾーンは `.claude-state/current-zone.json` を参照する。この値の前進的な書き込みが「ゾーンゲート相当の操作」であり、`gate-transition-guard.js` が監視する（7.3節#3）。

## Task完了報告の決定ブロック仕様（MUST、8.2.4節）

各Subagentへの委譲プロンプトには、次のフォーマットでの報告を必須指示として含めること。

```
## 決定ブロック
（この作業で下した決定を1件ずつ列挙する。無ければ「決定なし」と記載する）
1. 決定内容: ...
   不可逆度: 高 | 中 | 低
   理由: ...
   対象カテゴリ / 関連HB-ID: ...（該当する場合）
```

**遵守事項（MUST）**: 決定ブロックが「決定なし」以外の内容を含む場合、次のTaskを起動する前に `decide` Skillを呼び出し、決定内容をそのまま引数として渡して起票を完了させる。「決定なし」の場合はそのまま進めてよい。`task-boundary-guard.js`（PostToolUse, `Task`）がこの遵守の自己申告を機械的に補強する（8.2.4節）。

<!-- M1で実装: decideへの実引数受け渡し、decision-warnings.jsonとの突合ロジックの具体化 -->

## ゲート判定への委譲（10.2節）

ミニゲート・ゾーンゲートいずれも判定は自分で行わず、`gate-check`（`context: fork`）へ委譲しGO/NG/HOLDを受け取る。差し戻し回数カウントの対象は`GZ0`/`GZ2`/`GZ3`のみであり、ミニゲートおよびZone1⇄2の機能単位往復（準ゲート）はカウント対象外（戻りは正常系という1.3節の原則）。

<!-- M1で実装: gate-checkとのTask連携、GZ判定結果に応じた分岐処理 -->

## Zone3生成DAGへの追従（9.4.1節）

Zone3着手時、`orchestrate`は次のDAGに従い`reverse-doc`系Taskの起動順序を決定する（MUST）。上流（決定ログ・台帳の確定）が下流（文書生成）より先に完了していなければ、下流の生成は「未確定入力あり」として保留し`00-13_課題管理表.md`へ登録する。

```
決定ログ全件 → 02-01/02-03/02-04(要件定義)
00-02 HB台帳(正式ID変換前) → 02-02(機能要件一覧) → 05-02(RTM正式版)
02-01等 → 03番一式 → 03-10(CRUD図)
infra静的解析 → 04番一式
00-04(運用項目一覧確定版) → 07-00(運用設計書) → 07-10/07-20(運用手順書・マニュアル)
03番一式・04番一式 → 07-00
05番(テスト方針・RTM) → 06番(移行・導入)
```

<!-- M4で実装: DAGに基づくTask起動順序の自動決定ロジック -->

## モデルティアの参照（13章）

各Skill・Subagentのモデル選択は13章のティア表記（上位/中位/下位）に従う。`orchestrate`は委譲時にこの表を参照し、Task起動時の`model`指定に反映する（具体的なモデル名は本ファイルに記載しない）。

## 引数

`$ARGUMENTS` でゾーン名またはミニゲート対象パスを受け取る。引数なしの場合は`.claude-state/current-zone.json`を読み現在のゾーン状態を表示する。

<!-- M1で実装: current-zone.json読み取りと状態表示の実処理 -->
