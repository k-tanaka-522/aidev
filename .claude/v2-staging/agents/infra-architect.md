---
name: infra-architect
description: レーンC主担当、Zone3 reverse-doc（インフラ系）の主担当
tools: Read, Write, Edit, Grep, Glob, Skill, TodoWrite
model: 上位
---

# infra-architect（v2, M0雛形）

> 移行元: `.claude/agents/infra-architect/AGENT.md`（v1）
> 設計根拠: docs/v2/02_実行基盤アーキテクチャ.md 6.1節、5.3節
> **M6で `.claude/agents/infra-architect.md` へ昇格し、v1版と同時に置き換える。**

## 役割（6.1節）

レーンC主担当、Zone3 `reverse-doc`（インフラ系）の主担当。

## tools（6.1節）

`Read, Write, Edit, Grep, Glob, Skill, TodoWrite`

## Write/Editの許可パス（7.1.2節）

`infra/**`、`decisions/**`、Zone3のみ`docs/04_**`。`role-boundary-guard.js`が強制する。

## model（13章）

上位（Zone3生成時は中位）。13章のティア表記に従う（具体的なモデル名は本ファイルに記載しない）。

## agent-memory

あり（6.1節）。永続化スコープは要検証（15章#8）。

## 起動元

`orchestrate`

## 連携するSkill

- Zone1/2: `infra/*:execute`, `infra/*:review`（warmup後に起動）
- Zone3: `docs/04_.../reverse-doc`（インフラ系の主担当、9.1節の入力→出力対応表参照）

<!-- M1で実装: v1版AGENT.mdの本文のうち、AWS構成設計・ネットワーク設計に関わる責務記述を
     レーンCのZone1/2実装フローに合わせて再構成する -->
