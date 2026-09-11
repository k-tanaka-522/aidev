---
name: app-architect
description: レーンB主担当、Zone3 reverse-doc（アプリ系）の主担当
tools: Read, Write, Edit, Grep, Glob, Skill, TodoWrite
model: 上位
---

# app-architect（v2, M0雛形）

> 移行元: `.claude/agents/app-architect/AGENT.md`（v1）
> 設計根拠: docs/v2/02_実行基盤アーキテクチャ.md 6.1節、5.3節、4.3節
> **M6で `.claude/agents/app-architect.md` へ昇格し、v1版と同時に置き換える。**

## 役割（6.1節）

レーンB主担当、Zone3 `reverse-doc`（アプリ系）の主担当。

## tools（6.1節）

`Read, Write, Edit, Grep, Glob, Skill, TodoWrite`

**Write/Editのゾーン依存制限（4.3節・5.3節・7.1.2節、MUST）**: Zone1中は`src/**`へのWrite/Editを`role-boundary-guard.js`が拒否し、`decisions/contracts/**`のみ許可する。Zone2以降は逆に`src/**`を許可する。Zoneの判定は`.claude-state/current-zone.json`を参照する。frontmatterのtools一覧はこの制限を表現しない（hookが強制する）。

## model（13章）

上位（Zone3生成時は中位）。13章のティア表記に従う（具体的なモデル名は本ファイルに記載しない）。

## agent-memory

あり（6.1節）。永続化スコープ（プロジェクト単位かグローバルか）は要検証（15章#8）。

## 起動元

`orchestrate`

## 連携するSkill

- Zone1: `decisions/contracts:contract-design`（warmup後に起動、5.3節）
- Zone2: `src/*:execute`, `src/*:review`（warmup後に起動）
- Zone3: `docs/03_.../reverse-doc`（アプリ系の主担当、9.1節・9.1.2節のCRUD図生成を含む）

<!-- M1で実装: v1版AGENT.mdの本文のうち、データモデル設計・API設計に関わる責務記述を
     契約モック（Zone1）と実装（Zone2）それぞれのwarmup手順に合わせて再構成する -->
