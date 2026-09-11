---
name: ticket-triage
description: Mode BにおけるGitHub Issueの一次仕分け。04文書8.2節の運用事象チケット化判定を含め、ラベル/キーワード一致と現在のゾーン状態からカテゴリ・緊急度・変更規模・経路(Mode B/Zone3内ミニチケット/チケット化しない/HOLD)を機械判定する。
argument-hint: "[--ticket=<TICKET-ID> | --ticket-file=<path> | --title=... --body=... --labels=a,b]"
---

# ticket-triage（チケット一次仕分け）

> 版数: M5実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.1節・12章、
> docs/v2/04_運用設計体系定義書.md 8.2節、docs/v2/01_プロセス定義書.md 3.4節・6.4節）
> M0雛形の`disable-model-invocation: true`はM5で解除した（Mode B機構が実装され、
> `orchestrate`から実際に呼ばれる想定になったため）。

## 責務

Mode B: Issueの一次仕分け。04文書8.2節が定める運用事象のチケット化判定（チケット化する/しない/事業判断へエスカレーション）を含む。

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`（Mode B、Zone3内ミニチケット8.1節）
- 連携先: `impact-analysis`

## Mode Bフロー内の位置づけ（12章）

```
GitHub Issue → ticket-triage → impact-analysis → src/*:execute → Pull Request → /code-review → CI → gate-check → merge
```

## GitHub 連携（MUST、MCP不安定を前提にした設計）

`impact-analysis`と同じ設計判断を踏襲する。**この環境のGitHub MCPサーバーは接続が不安定であり、実際にAPIを叩く必要はない。** Node子プロセスはMCPツールを直接呼べないため、以下の2経路のいずれかで正規化済みのチケットデータをスクリプトへ渡す。

```
経路A（MCP利用可能時、MAY）:
  Claudeが mcp__github__get_issue / mcp__github__list_issues 等を呼ぶ
  → 結果を title/body/labels/number に整形し
    node ticket-triage.js --title="..." --body="..." --labels=... --number=<n>
    で取り込む（内部で .claude-state/tickets/{id}.json に正規化保存される）

経路B（MCP利用不可時、フォールバック）:
  PM/orchestrateがIssue本文を手でコピーし、同じ引数で呼ぶ。
  または .claude-state/tickets/{id}.json を直接作成し --ticket-file で読ませる。
```

後続の分類ロジックはどちらの経路でも完全に同一である（MUST、MCPが無いと何もできない作りにしない）。

## 分類ロジック（MUST、機械判定を優先しラベルが無い場合のみキーワード判定にフォールバック）

1. **カテゴリ**: `bug`/`feature`/`tech-debt`/`ops`/`security`。ラベル一致を最優先し、無ければ日本語/英語キーワード一致で暫定判定する（語彙集合は`scripts/ticket-triage.js`のコメントに列挙。02〜04文書のいずれもこの語彙集合を定義していないため実装者が定めた値であることをPMへ報告する）
2. **緊急度**: `high`/`normal`/`low`。同様にラベル優先＋キーワードのフォールバック
3. **変更規模**（01文書6.4節の短縮版ループ区分に対応）: `minor`/`normal`/`large`。`large`は01文書3.4節の基準（新規テナント区分、アーキ土台変更、新規外部連携、非機能カテゴリ追加、複数領域を跨ぐ影響）のキーワード一致による**一次判定に留まる**。特に3.4節の基準4（影響範囲がRTMの1領域を跨ぐか）は`impact-analysis`実行後でなければ確定できないため、`large`判定時は`impact-analysis`結果を踏まえた人手の最終確認を必須とする（MUST、機構だけで断定しない）
4. **運用事象のチケット化判定**（カテゴリが`ops`の場合のみ、04文書8.2節）:

   | 判定 | 条件（ラベル優先、無ければキーワード） | 対応 |
   |---|---|---|
   | `no-ticket` | `runbook-resolved`ラベル、または本文に「手順どおり」 | チケット化しない。`07-30-01`への記録のみ |
   | `ticketize` | `permanent-fix-needed`ラベル、または「恒久」「再発防止」「設計変更」 | チケット化する（Mode Bまたは Zone3内ミニチケットへ） |
   | `escalate-hold` | `needs-business-decision`ラベル、または「事業判断」「エスカレーション」 | PM経由でユーザーへHOLD確認 |
   | `needs-human-judgement`（既定） | 上記いずれにも該当しない | **機構だけでは断定しない**（MUST）。04文書8.2節が求める「07-10-02ポストモーテム項目での人間判定」を仰ぐ |

## 経路判定（`.claude-state/current-zone.json`を参照）

- `zone3_hotfix_active === true` → **Zone3内ミニチケット経路**（01文書4.6.2節）。`.claude/lib/zone3-hotfix.js`で`ZH-{4桁}`を新規採番する
- `zone === 4` → **Mode B通常経路**（01文書5章）
- `opsClassification.decision === 'no-ticket'` → チケット化せず終了
- `opsClassification.decision === 'escalate-hold'` → HOLD、PM経由でユーザー確認
- 上記いずれにも該当しない（`zone`が0/1/3でZone3内ミニチケットでもない） → `unexpected-zone`。01文書3.1節・3.2節（Mode AとMode Bは排他）により、この状態でticket-triageが呼ばれることは想定外であるため警告する

## Zone3内ミニチケットとMode Bの違い（10.4節、重要）

| 項目 | Mode B（通常） | Zone3内ミニチケット |
|---|---|---|
| 契機 | `GZ3` GO後、常時 | リリース実施後〜`GZ3` GO前の本番障害 |
| 差し戻しカウント台帳 | `.claude-state/mode-b-ticket-retry.json`（3回超でHOLD） | `.claude-state/zone3-hotfix-count.json`（GZ系カウンタから独立、累積対象外） |
| impact-analysisのモード | `--mode=mode-b`（ID種別6種） | `--mode=zone3-hotfix`（ID種別4種、`BAT`除外） |
| CR記録 | `00-14`へCR起票 | `00-14`へCR起票＋git tag基準点更新 |

## 実行方法

```bash
node .claude/skills/ticket-triage/scripts/ticket-triage.js \
  --title="決済APIがタイムアウトする" --body="本番で恒久対応が必要" --labels=bug,permanent-fix-needed

node .claude/skills/ticket-triage/scripts/ticket-triage.js --ticket=TICKET-0001
```

## できる範囲・できない範囲（正直な限界表明）

- できる: ラベル・キーワード一致による一次分類、現在のゾーン状態に基づく経路判定
- できない: 04文書8.2節が要求する「再発防止策が設計・実装変更を含むか」の意味的判定（一次対応の実施結果という機構の外側の事実に依存するため）。該当時は`needs-human-judgement`として明示し断定しない
- できない: 01文書3.4節基準4（RTMの1領域を跨ぐか）の確定判定。`impact-analysis`実行後の人手確認に委ねる

## 動作確認（M5）

PMへの最終報告を参照。
