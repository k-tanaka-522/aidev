---
name: execute
description: 契約モック・ハリボテ・決定ログ・インフラ制約を直接の入力として、フロントエンド実装を行う（規約準拠実装＋UT）。Zone2限定。
argument-hint: "[機能名 or HB-ID]"
---

# execute（src/frontend、Zone2実装）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.3節）
> `src/frontend`は02文書4.3節が示すレーンB（一部レーンA由来のUI実装を含む）の代表例。
> `{mobile,sdk,...}`等の他レイヤーを追加する場合も同型のSkillを配置する（本ディレクトリを
> テンプレートとして複製する）。

## 責務

契約モック（`decisions/contracts/*.openapi.yaml`）・ハリボテ（`prototypes/*.html`）・
決定ログ・インフラ制約を直接の入力として実装する。計画（plan）に相当する独立工程は置かず、
ハリボテ・決定ログ・インフラ制約の3者を突き合わせながら直接実装に入る（02文書4.3節の
設計判断。計画に相当する判断は`sync-check`（ミニゲート）と決定ログが代替する）。

**適用ゾーン: Zone2限定（MUST）**。Zone1のうちにapp-architect/coderが`src/**`へ
Write/Editを試みた場合、`role-boundary-guard.js`（M3実装）がこれを拒否する
（02文書5.3節、`.claude-state/current-zone.json`参照）。

## 手順

```
1. ウォームアップ: src/frontend/配下の既存ファイルを1つReadする
2. code-style-guide（paths: "src/**"自動参照）でコーディング規約を確認する
3. code-style-guide/frameworks/react_nextjs.md（React/Next.js採用時、自動参照）を確認する
4. security-style-guide（paths自動参照）でXSS対策等のセキュリティ規約を確認する
5. test-design-guide（自動参照）でUTの試験レベル分担を確認する
6. 対応するハリボテ（prototypes/{screen}.html）・契約モック（decisions/contracts/*.openapi.yaml）
   ・決定ログを読み、実装する
7. UTを実装と同時に作成する（coderの責務、02文書6.1節）
```

## 入力・出力

- 入力: 契約モック、ハリボテ、決定ログ、インフラ制約（`infra/`の決定事項）
- 出力: `src/frontend/`配下の実装コード、対応するUT

## 動作確認（M2）

- SKILL.mdがディレクトリスコープSkillとして`src/frontend/.claude/skills/execute/`配下に
  配置されていることを確認済み（ウォームアップ後に`src/frontend:execute`として呼び出し
  可能になる想定。M3の`role-boundary-guard.js`実装後に呼び出し経路そのものの実機確認が必要）
