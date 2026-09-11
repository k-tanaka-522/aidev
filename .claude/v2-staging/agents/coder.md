---
name: coder
description: Zone2実装（ハリボテ→実装置換）
tools: Read, Write, Edit, Bash, Grep, Glob, Skill, TodoWrite
model: 中位
---

# coder（v2, M0雛形）

> 移行元: `.claude/agents/coder/AGENT.md`（v1）
> 設計根拠: docs/v2/02_実行基盤アーキテクチャ.md 6.1節、5.3節、12章
> **M6で `.claude/agents/coder.md` へ昇格し、v1版と同時に置き換える。**

## 役割（6.1節）

Zone2実装（ハリボテ→実装置換）。

## tools（6.1節）

`Read, Write, Edit, Bash, Grep, Glob, Skill, TodoWrite`

## Write/Editの許可パス（7.1.2節）

`src/**`, `tests/**`（Zone2以降）。

## model（13章）

中位。13章のティア表記に従う。

## agent-memory

あり（6.1節）。

## 起動元

`orchestrate`、PR購読（12章、Mode B）

## 連携するSkill

- Zone2: `src/*:execute`, `src/*:review`（warmup後に起動）
- Mode B（12章）: CI失敗・レビューコメントを受けPR購読イベントから起動される自動修正ループ（上限3回、超過時HOLD）

<!-- M1で実装: v1版AGENT.mdの本文のうち、TDD・技術標準準拠・コメント規約に関わる記述は
     src/*/code-style-guide への参照に置き換え、実装対象の入力源を「設計書」から
     「ハリボテ・契約モック・決定ログ」へ書き換える -->
