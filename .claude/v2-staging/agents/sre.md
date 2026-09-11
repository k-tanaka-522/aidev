---
name: sre
description: レーンCの構築実務、運用移行
tools: Read, Write, Edit, Bash, Grep, Glob, Skill, TodoWrite
model: 中位
---

# sre（v2, M0雛形）

> 移行元: `.claude/agents/sre/AGENT.md`（v1）
> 設計根拠: docs/v2/02_実行基盤アーキテクチャ.md 6.1節、10.2節
> **M6で `.claude/agents/sre.md` へ昇格し、v1版と同時に置き換える。**

## 役割（6.1節）

レーンCの構築実務、運用移行。

## tools（6.1節）

`Read, Write, Edit, Bash, Grep, Glob, Skill, TodoWrite`

## Write/Editの許可パス（7.1.2節）

`infra/**`、Zone3以降`docs/07_**`、`docs/06_**`。

## 本番反映コマンドの扱い（7.1.1節）

本番反映コマンドは`settings.json`の`ask`ルール（`Bash(*apply*env=prod*)`, `Bash(*deploy*env=prod*)`）が別途適用される。dry-run（`Bash(terraform plan*)`, `Bash(cdk diff*)`）・非本番apply（`Bash(*apply*env=dev*)`）は自律実行可。

## model（13章）

中位（本番deployのみ上位判断）。13章のティア表記に従う。

## agent-memory

あり（6.1節）。

## 起動元

`orchestrate`

## 連携するSkill

- Zone1/2: `infra/*:execute`, `infra/*:review`
- GZ2 GO後: リリース実施（dry-run→承認→本番実行の3ステップ、10.2節。Gateを持たない実行イベント）
- Zone3: `docs/06_.../reverse-doc`, `docs/07_.../reverse-doc`

<!-- M1で実装: v1版AGENT.mdの本文のうち、dry-run・3ステップ承認フローに関わる記述は
     そのまま踏襲しつつ、ゾーンゲートGZ2との接続（コードフリーズ→リリース実施）を明記する -->
