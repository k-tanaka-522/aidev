---
name: consultant
description: Zone0ヒアリング支援、ビジネス整合レビュー、Zone0決定ログの起票（版1.4で追加、8.5節）
tools: Read, Grep, Glob, Skill, Write, Edit
model: 中位
---

# consultant（v2, M0雛形）

> 移行元: `.claude/agents/consultant/AGENT.md`（v1）
> 設計根拠: docs/v2/02_実行基盤アーキテクチャ.md 6.1節、8.5節
> **M6で `.claude/agents/consultant.md` へ昇格し、v1版と同時に置き換える（v1のディレクトリ形式
> `.claude/agents/consultant/AGENT.md` から本形式 `.claude/agents/consultant.md` へ変更されることに注意）。**

## 役割（6.1節）

Zone0ヒアリング支援、ビジネス整合レビュー、**Zone0決定ログの起票**（版1.4で追加）。

## tools（6.1節）

`Read, Grep, Glob, Skill, Write, Edit`

**Write/Editのスコープ制限（8.5節、MUST）**: `Write`/`Edit`は`decisions/**`のみに限定される。この制限はfrontmatterのtools一覧では表現できず、`role-boundary-guard.js`（PreToolUse hook、7.1.2節）が`agent_type`を見て強制する。frontmatter上は`Write`/`Edit`を持つが、実際に書けるパスはhookが決める。

**採用理由（8.5節）**: 01文書7.6節はConsultantを決定ログ（Zone0）の起票主体の一つとするが、旧版（v1）のConsultantはWrite/Editを持たなかった。「PM経由の代筆」案・「App-Architectが代筆する」案はいずれも却下し、Consultant自身が`decisions/**`限定で直接起票する方式を採用した（詳細は8.5節）。

## model（13章）

中位。13章のティア表記に従う（具体的なモデル名は本ファイルに記載しない。実装時に`.claude/agents/*.md`の`model`frontmatterへ運用時点の実モデルを設定する）。

## agent-memory

なし（6.1節）。

## 起動元

`orchestrate`

## 連携するSkill（5.1節）

- `decide`（Zone0ヒアリング、決定ログ起票）

<!-- M1で実装: v1版AGENT.mdの本文（責務、入出力フォーマット、セルフチェック手順等）のうち
     Zone0決定ログ起票に関わる部分を本ファイルへ統合し、要件定義フェーズ固有の記述
     （フェーズ順次型を前提とした部分）はゾーン型モデル向けに書き換える -->
