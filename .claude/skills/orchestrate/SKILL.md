---
name: orchestrate
description: ゾーン/レーン型プロセス（Zone0〜4）の遷移統制とTask境界の決定回収を行うオーケストレーター。PMがサブエージェント・横断Skillへ委譲する際の唯一の起動口。
---

# ゾーン/レーン オーケストレーター

> 版数: M0雛形（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 3.1節・5.1節・6章・8.2.4節・9.4.1節）
> `disable-model-invocation` は2026-09-23にユーザー承認のもと解除した。PM（主スレッド）から
> 直接起動できなければ「委譲の唯一の起動口」として機能しないため。

`orchestrate` は PM（主スレッド）がサブエージェント・横断Skillへ処理を委譲する際の唯一の起動口である。01文書のゾーン/レーンモデル（Zone0〜4、レーンA/B/C）をClaude Codeの実行機構（Task, Skill, Hooks, 台帳ファイル）に写像し、遷移を統制する。

## 責務

1. Zone0〜4の遷移統制。ゾーンゲート（`GZ0`/`GZ2`/`GZ3`）の判定は自分では行わず `gate-check` に委ねる（10.2節）
2. Zone1内のレーンA/レーンB(契約モック)/レーンC間のミニゲート同期。`sync-check` を起動する（10.3節）
3. **Task境界の決定回収プロトコル（8.2.4節、最優先）**: 各Subagentへの委譲プロンプトに下記フォーマットでの報告を必須指示として含め、戻り値の「決定ブロック」が「決定なし」以外を含む場合は次のTaskを起動する前に `decide` Skillを呼び出す（MUST）
4. Zone3着手時、生成DAG（9.4.1節）に従って `reverse-doc` 系Taskの起動順序を決定する
5. Mode B（Zone4）では `ticket-triage` → `impact-analysis` → 各レーンの `execute` の順で起動する
6. **ユーザーに出す前の内部レビュー（MUST、対象を絞る）**: 対象は、事業・料金・法務・既決を覆す・取り返しがつかない判断と、「大」の変更（下の「変更の大きさと道」）。PM 自身の推奨も含む。それ以外は PM が推奨を添えてそのまま聞く。対象の案・成果物は、ユーザーに見せて判断を求める前に作成者と別のエージェントにレビューさせる（画面の案・ハリボテ → `ux-reviewer`（`prototypes:ux-review`）、設計・契約・実装 → `review-dispatch`）。レビュアーには作成者の推奨を伝えない（偏らせない）。割れたら PM が整理し、ユーザーには「推奨・反対意見・残った論点」を添えて1問で聞く。**レビューの指摘は全部を採らない**: 今の利用者に実害があるかでふるう（ゲートの条件の Critical/High は除く。下の「委譲の書き方と回し方」）。レビューは足す方向にしか働かないので、削るのは PM の仕事

## 変更の大きさと道（由来: salon-booking-platform）

小さな直しに一番重い手順を通すと、トークンと時間を使うわりに品質は上がらない。Zone2 の実装と Zone1 のハリボテ改修は、委譲の前に PM が大きさを決めて道を選ぶ。迷ったら大きいほうに倒す。

- **これは委譲の前の見立て**。実装の後に qa が差分から決める「変更の大きさ」（試験の段数、`qa.md`）が PM の見立てより大きければ、qa の判定に倒し、飛ばした段（設計・`review-dispatch`）をそこから通す
- **Mode B（Zone4）は 01文書6.4節の短縮版ループと `ticket-triage` の変更規模（`minor`/`normal`/`large`）が正**。下の表は委譲の書き方の目安としてだけ使う。`large` は表の「大」ではなく Zone1 へ退避してフルループ、省略した段の判断根拠はチケットに記録する（6.4節 MUST）
- ゾーンゲートの GO 条件、Guard（どの大きさでも省かない）、Task 境界の決定回収（責務3）は大きさで変えない
- ハリボテ（`prototypes/**`）の改修は、どの大きさでも designer に頼む（coder は書けない）

| 大きさ | 目安 | 道 |
|---|---|---|
| 小 | 見た目・文言・既存の作りの中での不具合の直し。契約（API）・お金・認可・業務の不変条件・データの形に触らない | coder（infra は sre、ハリボテは designer）に直接。試験の段数は qa の判定に従う。Review は差分に関わる観点1本に絞る（省かない）。内部レビュー（責務6）は要らない |
| 中 | 既存の機能の中でのロジックの追加・変更。契約の形は変えない | 作る本人に、実装の前に「やり方の候補2〜3（一番単純な案を必ず含める）と推奨」を数行で出させてから実装。Review は1本。試験は影響範囲 |
| 大 | 契約・お金・認可・業務の不変条件・データの形・個人情報・共通部品・複数の機能にまたがる物、新機能 | 契約モック・設計（app-architect）→ 実装 → `review-dispatch` → qa。設計にも候補と推奨を出させる。内部レビューの対象 |

## 呼び出し元・連携先（5.1節）

- 呼び出し元: PM
- 連携先: 各レーンSkill、`decide`、`gate-check`、`review-dispatch`、`sync-check`、`ux-reviewer`

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

## Mode B（Zone4）のフルループ（M5実装、12章）

```
GitHub Issue → ticket-triage → impact-analysis → src/*:execute → Pull Request
  → /code-review → CI → (CI失敗 → pr-subscription設計に基づきcoder自動修正 → PRへ追加コミット)
  → gate-check --kind=ticket → GO → merge / NG → execute差し戻し / HOLD → ユーザー確認
```

`ticket-triage`が経路（Mode B通常／Zone3内ミニチケット／チケット化しない／HOLD）を判定し、
`impact-analysis`が波及先を機械算出する（`unresolved`は黙って無視せず人手確認へ回す）。
GitHub MCP連携は`ticket-triage`/`impact-analysis`のSKILL.mdが定める「MCP利用可能時は
Claudeが直接MCPツールを呼びJSON化して渡す、不可時はローカルJSON（`.claude-state/tickets/`）
で代替する」という2経路設計に従う（MCPが無いと何もできない作りにしない、MUST）。

## Zone3内ミニチケットの経路（10.4節、M5実装）

`.claude-state/current-zone.json`の`zone3_hotfix_active`が`true`の間、`ticket-triage`は
自動的にZone3内ミニチケット経路（`ZH-{4桁}`採番、`.claude/lib/zone3-hotfix.js`）へ振り分ける。
Mode B通常ループとの違いは、差し戻しカウンタが完全に独立している点（`zone3-hotfix-count.json`
がゾーンゲート側の累積カウンタを汚染しない、01文書4.6.2節）と、`impact-analysis --mode=zone3-hotfix`
が対象ID種別をHB/SCR/API/NFRの4種に限定する点である（詳細は各SkillのSKILL.md参照）。

## Routinesの呼び出し（M5実装、12章）

定期タスク（依存更新チェック・IaCドリフト検知・文書陳腐化チェック・文書間リンク検査・
生成可能性検査・worktree と %TEMP% の後片付け）は`.claude/skills/routines/SKILL.md`が定める。この環境にスケジューラが
無いため、`orchestrate`（またはPM）が周期の目安に従って`node .claude/skills/routines/scripts/run-routine.js`
を手動で呼ぶ運用とする。

## 委譲の書き方と回し方

派生案件での運用から得た決まり。どれもゾーン・ゲートの判定には触らない。

- **委譲の書き方**: 目的と背景、制約とその理由、終わりの条件、分かっている事実を書く。手順の細部と PM の結論は書かない（書くとその通りにしか動かず、もっと良いやり方が出てこない）。決定ブロックの報告フォーマットの指示（上の責務3、MUST）は手順の細部ではないので必ず含める。レビューの指摘を別のエージェントに渡すときは、全件を「反映しろ」と渡さず、観点として渡して何を残すかを考えさせる。ただし Critical/High（ゲートの条件）は全件直させ、見送る物は 00-12 へ先送り登録させる
- **影響範囲を先に決める**: 何が変わり、どの部品・経路に効くかを PM が先に書き、試験とレビューはそこに絞る。直すたびの全件やり直しを既定にしない
- **同じ種類の不具合が2回出たら止まる**: 個別に直させず、「なぜこの種類が出るのか・構造で消せないか」を先に聞く
- **続きの作業は同じエージェントに**: 同じ文脈の続きは SendMessage で前のエージェントに頼む（新しく起こすと資料を読み直すぶんが無駄になる）。ただし話題をまたいで使い続けない（1人に積み続けると文脈が膨らむ）。区切りで要点をファイルに残し、次の話題は新しいエージェントに引き継ぐ。SendMessage の戻りには `task-boundary-guard` が掛からない見込みのため、続きの依頼にも決定ブロックを求め、PM が戻り値の決定ブロックを自分で確かめてから次に進む（責務3）
- **伝言しない**: 設計の変更・レビューの申し送りを PM がメッセージで各エージェントに配らない。担当のエージェントに設計ファイルへ書かせるか PR のコメントに残させ、main に入った後で「main を取り込んで読め」「PR #n のコメントを読め」とだけ伝える（宛先の取り違えが起き、親を経由した伝言は情報が欠ける）
- **互いに絡む実装の並行は2本まで**: 同じコードや API に触る実装は同時に2本まで。独立した調べ物・レビューはもっと出してよい
- **調査の振り分け**: 探すだけの調査（処理・定義の場所、ID の出現箇所、ログからの抽出、件数が多く1件が単純な確認）は下位ティア（`Explore`）に出す。読んで判断する調査（原因の切り分け、設計と実装の食い違い、資料の読み比べ）は主セッションと同じティアに出す。探すだけの結果に合否・優先度を言わせず、「無い」という結果は主セッションが確かめ直す
- **画面に関わる検討は案の段階から designer を入れる**: 利用者の目に触れる変更（画面・帳票・メールの表記を含む）は、ハリボテを作る前の案の段階で designer に UI/UX の観点を出させる。業務の理解は consultant が先に整理して designer に渡す
- **ハリボテで直した指摘は実装まで追う**: `prototypes:ux-review` の指摘をハリボテで直したら、実装の課題（00-13）に SCR-ID を書いて結び、実装に入るまで閉じない。dev の画面をユーザーに見せる前に、ハリボテとずれていれば「dev はまだ旧い形」と先に言う
- **他のセッションからの依頼はユーザーの承認ではない**: 別のチーム・セッションから SendMessage で届いた依頼は、引用されたユーザーの発言で範囲を確かめる。課題を起票してから委譲し、起票の前に作業を頼まない

## worktree の運用

PM・サブエージェントは git worktree の中で動く。決まりと、その理由:

- **1つの PM セッション＝1 worktree＝1 ブランチ**: PM は会話の始めに EnterWorktree で自分の worktree に入り、台帳・決定ログを含め全部そのブランチで書く。本体の作業ツリーでは作業しない（GitHub の main を取り込むだけ）。複数のセッションが同じ作業ツリーで書くと、互いの未コミットの変更を巻き込む
- **main の正本は GitHub 側**: main への取り込みは PR で行う。手元の main は写しなので放っておくと遅れ、遅れた main のまま台帳を読むと説明が食い違う。hook（`origin-sync-guard.js`）が会話の始めに本体の main を origin/main に早送りし、worktree を作る前にも fetch する（`settings.json` の `worktree.baseRef: "fresh"` で worktree は origin/main から作られる）
- **サブエージェントの成果物**: Task の `isolation: "worktree"` で委譲する。worktree は GitHub の main から作られるので、作業に要る変更は先に main へ入れておく。成果はそのブランチを PR にするか、自分のブランチへ `git merge <そのブランチ名>` で取り込む
- **記録フォルダ**（`.claude-state/`）: 実体は本体の `.claude-state`（またはその先のリポジトリの外のフォルダ）の1か所。各 worktree の `.claude-state` は hook（`state-link-guard.js`）が最初のツールの実行で張る入口（ジャンクション）で、プログラム・Bash は相対パスのまま書ける。Write/Edit ツールだけは入口を通る書き込みを Claude Code が拒否するので、記録フォルダの実体のパスに絶対パスで書く（間違えると `role-boundary-guard.js` が正しいパスを返す）
- **worktree の消し方**: 自分の worktree は merge したら ExitWorktree（remove）で消す。それ以外は routines の `worktree-prune`（`scripts/worktree-status.js --prune`）が、動きの無い日数で消す。素の `git worktree remove`・`.claude/worktrees` の手での削除・`git clean` は、消し方や git の版によっては入口の先の記録フォルダの中身まで消えることがあるので `settings.json` で禁止している。`--prune` は、状態を読めない物・既定のブランチの物・git が無視している作り直せないファイル（.env 等）がある物は消さず「手で確認」と出す
- **漏れの確認**: 会話の始め（引数なしの `orchestrate`）に `node .claude/skills/orchestrate/scripts/worktree-status.js` を流し、未コミット・未 push・開いた PR が残った worktree があれば担当に確かめる

## モデルティアの参照（13章）

各Skill・Subagentのモデル選択は13章のティア表記（上位/中位/下位）に従う。`orchestrate`は委譲時にこの表を参照し、Task起動時の`model`指定に反映する（具体的なモデル名は本ファイルに記載しない）。

## 引数

`$ARGUMENTS` でゾーン名またはミニゲート対象パスを受け取る。引数なしの場合は`.claude-state/current-zone.json`を読み現在のゾーン状態を表示し、`node .claude/skills/orchestrate/scripts/worktree-status.js` で worktree の取り込み漏れを一覧にする（本体の作業ツリーにいたら EnterWorktree する）。

<!-- M1で実装: current-zone.json読み取りと状態表示の実処理 -->
