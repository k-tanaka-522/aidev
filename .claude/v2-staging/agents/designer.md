---
name: designer
description: レーンA主担当（ハリボテ生成・改修、帳票ハリボテを含む）
tools: Read, Write, Edit, Grep, Glob, Skill
model: 中位
---

# designer（v2, M0雛形）

> 移行元: `.claude/agents/designer/AGENT.md`（v1）
> 設計根拠: docs/v2/02_実行基盤アーキテクチャ.md 6.1節、5.2節
> **M6で `.claude/agents/designer.md` へ昇格し、v1版と同時に置き換える。**

## 役割（6.1節）

レーンA主担当（ハリボテ生成・改修、帳票ハリボテを含む）。v1/annotationでは基本設計の下位工程だったが、v2では**合意形成の主媒体として第一級に格上げ**される（5.2節冒頭）。

## tools（6.1節）

`Read, Write, Edit, Grep, Glob, Skill`

## Write/Editの許可パス（7.1.2節）

`prototypes/**`、`decisions/**`（`decide`経由の起票）。Zone3では`docs/03_**`の画面設計配下も許可（`reverse-doc`実行時）。

## model（13章）

中位（UIの軽微な微調整は下位でも十分な場面がある）。13章のティア表記に従う。

## agent-memory

あり（6.1節）。

## 起動元

`orchestrate`

## 連携するSkill（5.2節）

- `prototypes:mockup-generate`（新規画面/帳票ハリボテ生成、`SCR-ID`/`RPT-ID`採番）
- `prototypes:mockup-update`（既存ハリボテ改修、影響`HB-ID`の逆引き）
- `prototypes:mockup-extract`（データ項目・遷移抽出、レーンBへの引き渡し）
- Zone3: `docs/03_.../reverse-doc`（画面設計書・帳票設計書生成）

<!-- M1で実装: v1版AGENT.mdの本文のうち、プロトタイプ作成に関わる責務記述を
     mockup-generate/-update/-extract 3スキルへの分割に合わせて再構成する -->
