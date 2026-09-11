---
name: pr-subscription
description: PR購読の設計文書(実行スキルではない)。CI失敗・レビューコメントを検知してcoderの自動修正を起動する設計を定義する。実際の購読(webhook/polling)はこのタスクでは行わない。
disable-model-invocation: true
---

# pr-subscription（PR購読、設計のみ・M5）

> 版数: M5設計（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 3.2節L5「PR購読」、12章
> 「PR購読による自動修正」、6.1エージェント一覧のcoder行「起動元: orchestrate、PR購読」）
>
> **本Skillは実行しない設計文書である（MUST NOT実装）。** タスク指示により、この環境の
> GitHub MCPサーバーは接続が不安定であるため、実際のPR購読（webhook受信またはポーリング）は
> 行わない。ここでは「何がどう起きたら何を呼ぶか」を定義するに留め、動作確認は
> ローカル代替データ構造（`.claude-state/prs/{id}.json`、`.claude/lib/ticket-store.js`）を
> 用いた入出力の整形・判定ロジックの範囲でのみ行う。

## 設計（02文書12章フロー図の該当部分）

```
PR作成（coderのexecute完了後） → CI実行
  CI失敗 → PR購読イベント → coder起動（自動修正） → PRへ追加コミット → CI再実行
  CI成功 かつ Approve → gate-check --kind=ticket → GO → merge
                                              → NG/HOLD → 差し戻し
ループ上限: 3回（CI失敗→修正→再実行のサイクル）。超過時HOLD（01文書7.4節と同じ上限を準用）
```

## トリガー条件（設計、MUST）

| イベント | 検知方法（本来の実装イメージ） | 本タスクでの代替 |
|---|---|---|
| CI失敗 | GitHub Actionsのwebhook、またはGitHub MCPの`list_workflow_runs`ポーリング（Routines、`.claude/skills/routines/routines.json`の`pr-ci-poll`枠に登録可能。ただし既定では無効。後述） | `.claude-state/prs/{id}.json`の`ci_status`フィールドを`failure`に更新する操作をイベントの代替とする |
| レビューコメント（Critical/High指摘） | GitHub MCPの`pull_request_review_write`結果、またはWebhook | 同上ファイルの`review_status`を`changes_requested`に更新する操作を代替とする |

## coder起動の入力契約（設計）

PR購読イベント発火時、`orchestrate`は次の情報を`coder`への委譲プロンプトに含める（MUST、設計）。

- 対象PR番号（またはローカル代替`PR-ID`）
- CI失敗ログの要約、またはレビュー指摘の一覧（file:line付き）
- 現在の自動修正試行回数（3回superで停止しHOLD）

## ループ上限とHOLD（MUST、01文書7.4節を準用）

自動修正ループが3回を超過した場合、`.claude/lib/ticket-retry.js`の差し戻しカウンタと**同一のキー空間**（チケット参照）を用いて記録し、`gate-check --kind=ticket`のHOLD判定に合流させる（自動修正の失敗も「差し戻し」の一種として扱う設計判断。02/01文書はPR購読の失敗回数カウンタの永続化先を明記していないため、既存のticket-retry.jsを流用するという実装判断をPMへ報告する）。

## 実際に購読しない理由（タスク指示との整合）

1. GitHub MCPサーバーの接続不安定性（タスク指示のとおり、実際にAPIを叩く必要はない）
2. Webhook受信にはこの実行環境の外側にエンドポイント（HTTPサーバー等）が必要であり、Claude Codeのフック機構（PreToolUse/PostToolUse/Stop）はいずれもツール呼び出し契機のイベントであって外部からのHTTP着信を契機にできない（要検証事項として次段へ申し送る）

## 動作確認（M5、設計文書としての確認範囲）

上記の入出力契約・判定ロジック自体は`.claude/skills/gate-check/scripts/gate-check.js`の
`--kind=ticket`実行と、`.claude-state/prs/{id}.json`の更新（本Skill外の手動操作として
PM/orchestrateが行う）の組み合わせで、実際に購読を行わずとも一連の流れとして確認できる。
PMへの最終報告の動作確認ログを参照。
