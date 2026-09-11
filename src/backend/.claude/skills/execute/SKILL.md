---
name: execute
description: 契約モック・ハリボテ・決定ログ・インフラ制約を直接の入力として、バックエンド実装を行う（規約準拠実装＋UT）。Zone2限定。
argument-hint: "[機能名 or HB-ID or API-ID]"
---

# execute（src/backend、Zone2実装）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.3節）

## 責務

契約モック（`decisions/contracts/*.openapi.yaml`）・ハリボテ・決定ログ・インフラ制約を
直接の入力として実装する。契約モックのoperationId（`x-api-id`）ごとにエンドポイントを
実装し、レスポンス形状は契約モックのschemaと一致させる（MUST。`sync-check --source=impl`が
Zone2以降にこの一致を突合する、10.3節）。

**適用ゾーン: Zone2限定（MUST）**。Zone1のうちはapp-architectが`decisions/contracts/**`
のみ書き込み可能で`src/**`への書き込みは`role-boundary-guard.js`（M3実装）が拒否する
（02文書5.3節）。

## 手順

```
1. ウォームアップ: src/backend/配下の既存ファイルを1つReadする
2. code-style-guide（paths自動参照）でコーディング規約を確認する
3. code-style-guide/data/DATABASE_STANDARD.md（自動参照）でDB設計規約を確認する
4. security-style-guide（paths自動参照）でSQLインジェクション対策等のセキュリティ規約を確認する
5. test-design-guide（自動参照）でUTの試験レベル分担を確認する
6. 対応する契約モック（decisions/contracts/*.openapi.yaml）・決定ログを読み、
   operationId単位でエンドポイントを実装する
7. UTを実装と同時に作成する
```

## 入力・出力

- 入力: 契約モック（API-ID単位）、決定ログ、インフラ制約
- 出力: `src/backend/`配下の実装コード、対応するUT

## 動作確認（M2）

- SKILL.mdがディレクトリスコープSkillとして配置されていることを確認済み。
