---
name: impact-analysis
description: Mode Bのチケット影響範囲特定。01文書5.2節のMUST手順（正引き・逆引き・波及先分類・文書更新義務範囲）をRTM(00-02/00-03台帳・9.1.1節の静的解析逆引き列)に対する機械検索として実行する。Zone3内ミニチケット(10.4節)では軽量モードとして流用する。
argument-hint: "[--ticket=<TICKET-ID> | --ticket-file=<path>] [--mode=mode-b|zone3-hotfix] [--cr]"
---

# impact-analysis（影響範囲分析）

> 版数: M5実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 9.1.1節・10.4節・12章、
> docs/v2/01_プロセス定義書.md 5.2節、docs/v2/04_運用設計体系定義書.md 8.3節）
> M0雛形の `disable-model-invocation: true` はM5で解除した（Mode B機構が実装され、
> `orchestrate`から実際に呼ばれる想定になったため。`ticket-triage`・`sync-check`と同型）。

## 責務

チケット（GitHub Issue、またはZone3内ミニチケット）の内容から、01文書5.2節が定めるMUST手順で波及先を機械的に導出する。**実装を読んで「影響がありそうな箇所」を主観的に洗い出すことは禁止（MUST NOT）**であり、本Skillは必ずRTM（`docs/00_.../00-02`・`00-03`台帳、および02文書9.1.1節の静的解析が書き戻した逆引き列）を検索キーにした機械検索のみを行う。

## 分母（12章、版1.4）

**Zone3で生成されたIPA成果物（RTM・API設計書等）**。`GZ3`通過後は要件定義書・設計書が実在するため「設計書を分母とする」原則に復帰する。9.1.1節の静的解析結果（実装ファイル→API→モジュール列）を逆引きの材料とする。

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`（Mode B、Zone3内ミニチケット10.4節）、`ticket-triage`
- 連携先: `src/{layer}:execute`、`gate-check --kind=ticket|zone3-hotfix`、`docs/00_.../00-14_変更管理台帳.md`

## GitHub 連携（MUST、MCP不安定を前提にした設計）

**この環境のGitHub MCPサーバーは接続が不安定である。実際にAPIを叩く必要はない。** 本Skillの実処理（`.claude/lib/impact-analysis.js`）はNode子プロセスであり、MCPツールを直接呼び出すことができない（MCPツール呼び出しはClaude本体のみが行える）。したがって「GitHub連携」は次の2経路のいずれかで**呼び出し元（orchestrate/PM）がチケットをJSON化してから**本スクリプトに渡す、という設計で表現する。

```
経路A（MCP利用可能時、MAY）:
  1. Claudeが mcp__github__get_issue(owner, repo, issue_number) 等を呼ぶ
  2. 結果を .claude/lib/ticket-store.js のスキーマへ変換し
     .claude-state/tickets/{id}.json として保存する（ticket-triageが担う）
  3. node impact-analysis.js --ticket={id} を呼ぶ

経路B（MCP利用不可時、フォールバック）:
  1. PM/orchestrateが同じスキーマのJSONを手で作成する
     （Issue本文をコピー、または --title/--body を直接指定）
  2. node impact-analysis.js --ticket-file=<path> または --title/--body で呼ぶ
```

**後続処理（正引き・逆引き・分類・unresolved明示）は経路A/Bで完全に同一**であり、MCPの有無が結果の構造に影響しない（MUST、タスク指示「MCPが無いと何もできない作りにしないこと」への対応）。

## 手順（01文書5.2節のMUST手順を機構化）

```
1. 対象IDの特定: チケットのtitle/bodyから正規表現でID(SCR/HB/API/RPT/BAT/NFR-連番)を
   抽出する。--idsで明示指定されたIDも合流させる。バッククォート付きファイルパス言及も
   抽出し、00-02の実装ファイル（逆引き）列との一致を試みる（一致しなければunresolvedに計上）
2. 正引き: 対象IDを00-02（HB-ID起点、SCR/RPT/API-IDは経路欄からの逆引き）・00-03（BAT-ID）
   に対して検索し、実装ファイル（逆引き）・API-ID（逆引き）・モジュール（逆引き）・
   正式要件ID を抽出する
3. 逆引き（波及先の導出）: 手順2で得た実装ファイル・API-ID・モジュールを検索キーに、
   00-02全行を逆引きし、同一の値を共有する他のHB-IDを「連動影響」として機械抽出する
4. 波及先の分類:
   - 直接影響: チケットが意図する対象ID
   - 連動影響: 実装ファイル/API/モジュールを共有する他のHB-ID（回帰テスト対象、MUST）
   - 非機能影響: 決定ログのNFR-IDのうち、対象モジュールとの弱いテキスト一致で絞り込んだ
     候補（`matched`）。**厳密な対応付けは構造的に不可能なため**、全NFR-ID一覧
     （`allNfrIds`）も併記し、Guard適用範囲は人手で最終確認する
5. 文書更新義務範囲の決定: 直接影響IDは対応する設計書ファイルの改訂を必須とする
   （候補はモジュール名によるキーワード近似検索。00-02/05-02に「設計書項番」列が
   存在しないため近似に留まる、後述の限界参照）。連動影響IDはRTM当該行への参照追記を
   必須とする（内容変更は不要）
6. `--cr`指定時、分析結果を`00-14_変更管理台帳.md`へCRとして起票する（01文書5.2節手順6）
```

## `unresolved`の明示（MUST、タスク指示・02文書9.1.1節版2.1）

以下はすべて**黙って無視せず**、結果JSONの`unresolved`配列に理由付きで明示する。

1. 対象IDがどの台帳にも見つからない
2. 対象IDは見つかったが、00-02の逆引き列がリテラル値`unresolved`（静的解析が9.1.1節の対応範囲外と判定した領域。`static-analysis-run.js`がM5で明記するよう修正済み）
3. チケット本文中のファイルパス言及が00-02のどの実装ファイル列とも一致しない
4. 直接影響IDに対応する設計書ファイルをキーワード近似検索でも特定できない（「設計書項番」列がRTMに存在しないという構造的な限界。15章への申し送り事項、後述）
5. `zone3-hotfix`モード時、対象ID種別（HB/SCR/API/NFRのみ、10.4節）に該当しないID

**これを怠ると、影響範囲分析が「解決済み」と偽る結果を返し、01文書が禁止する「実装を読んで主観的に洗い出す」よりも悪い（虚偽の完全性を主張する）結果になる（タスク指示のとおり）。**

## Zone3内ミニチケットでの軽量モード（10.4節）

`--mode=zone3-hotfix`を指定すると、対象ID種別を`HB`/`SCR`/`API`/`NFR`の4種に限定する（`BAT`は対象外、10.4節の記述どおり）。`gate-check --kind=zone3-hotfix`向けの入力として使う。Mode Bの通常ループとの違いは次のとおり。

| 項目 | Mode B（通常） | Zone3内ミニチケット |
|---|---|---|
| 差し戻しカウント | `.claude-state/mode-b-ticket-retry.json`（3回超でHOLD、01文書7.4節） | `.claude-state/zone3-hotfix-count.json`（GZ系カウンタとは別台帳、01文書4.6.2節「累積対象外」） |
| as-built再生成範囲 | 通常のreverse-doc実行 | 影響ID単位限定（`--scope=<ID>`、9.4.2節のコードフリーズ基準点更新の仕組みを流用） |
| 対象ID種別 | SCR/HB/API/RPT/BAT/NFRの6種 | HB/SCR/API/NFRの4種のみ |
| CR記録 | `00-14`へCR起票 | `00-14`へCR起票＋git tag基準点更新（04文書8.4節） |

## 運用起因チケットの起点特定（04文書8.3節への対応）

監視アラート・問合せ起点のチケットは、対象IDの特定を`07-00_運用設計書`または`HB-ID`直接指定から開始する（04文書8.3節）。本Skillの`--ids`引数、または`--ticket`のbody内にHB-ID等が記載されていればそのまま手順1に合流する。`07-00`からの逆引き自体（インフラリソース→非機能要件ID）は本Skillの対象外とし、呼び出し元（ticket-triage/orchestrate）が対象IDを特定してから本Skillに渡す設計とする（07番文書の構造化データ抽出は本タスクのスコープ外、後述の限界参照）。

## 実行方法

```bash
# GitHub MCP経由で取得済みのticket-store JSONを使う場合
node .claude/skills/impact-analysis/scripts/impact-analysis.js --ticket=TICKET-0001 --cr

# ローカルJSONファイルを使う場合（MCP不使用時のフォールバック）
node .claude/skills/impact-analysis/scripts/impact-analysis.js --ticket-file=.claude-state/tickets/TICKET-0001.json

# 個別フラグ直接指定
node .claude/skills/impact-analysis/scripts/impact-analysis.js --title="決済APIのタイムアウト修正" --body="HB-0001 の決済確認画面で..." --cr

# Zone3内ミニチケットの軽量モード
node .claude/skills/impact-analysis/scripts/impact-analysis.js --ids=HB-0002 --mode=zone3-hotfix --hotfix-id=ZH-0001
```

## できる範囲・できない範囲（正直な限界表明、MUST）

- できる: `00-02`/`00-03`台帳・9.1.1節の静的解析逆引き列を検索キーにした機械的な正引き・逆引き・波及先分類
- できない（15章への申し送り事項、宛先: 03）: 01文書5.2節手順2が要求する「設計書項番」の抽出。`00-02`/`05-02`の列定義（03文書3.2.1節）に「設計書項番」列が存在しないため、モジュール名によるキーワード近似検索で代替している。一致しない場合は`unresolved`として明示する（推測で埋めない、MUST NOT）
- できない: NFR-IDと対象モジュールの厳密な対応付け（決定ログのNFR-IDフィールドはHB-ID/モジュールとの構造的関連を持たない）。弱いテキスト一致による絞り込みと全件併記で代替する
- できない: `07-00_運用設計書`からの対象ID逆引き（04文書8.3節）そのものの自動化。呼び出し元が対象IDを特定してから本Skillへ渡す前提とする

## 動作確認（M5）

PMへの最終報告を参照。
