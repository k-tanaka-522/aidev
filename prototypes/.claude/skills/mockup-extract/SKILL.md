---
name: mockup-extract
description: 確定したハリボテからデータ項目（入力フィールド名・型のヒント）・画面遷移条件を抽出し、レーンB向けの構造化データ（決定ログのサブフォーマット）として出力する。
argument-hint: "[画面名 or all]"
disable-model-invocation: true
---

# mockup-extract（データ項目抽出・レーンB連携）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.2節）

## 責務

確定したハリボテからデータ項目（入力フィールド名・型のヒント）・画面遷移条件を抽出し、
レーンB向けの構造化データとして出力する。**記述系文書は生成しない**、あくまでレーンB/Cへの
引き渡し用データの抽出に限る（02文書2.2節の原則をレーンA→Bの情報伝達にも適用）。

抽出対象画面の`SCR-ID`が`00-02`台帳の`HB-ID`経路に未紐付けであれば警告する
（sync-check未実施の可能性を示すシグナルであり、ブロックはしない）。

## 手順（MUST）

```
1. ウォームアップ: 対象HTMLをReadする
2. node prototypes/.claude/skills/mockup-extract/scripts/extract-data.js \
     --file=<対象ファイルの相対パス>
   を実行する
3. 生成された decisions/DL-{4桁}_screen-data-{screen}.md をレーンB（App-Architect）へ連携する
   （sync-checkが契約モック未確定時の代替突合対象として読む、02文書10.3節手順2）
```

## 出力形式（実体は決定ログのサブフォーマット、5.2節）

`decisions/DL-{4桁}_screen-data-{screen}.md`として保存する。`decide`の通常の決定ログ
（`DL-{4桁}_{タイトルkebab}.md`）と同一のID体系内のサブタイプであり、frontmatterに
`種別: screen-data-extract`を持つことで区別する。本文には入力項目一覧（型ヒント）・
画面遷移候補・SCR-IDのHB-ID紐付け状況を記載する。

## 動作確認（M2）

- 入力フィールド（name/type）の抽出を確認済み
- 画面遷移候補（`<a href>`/`<form action>`）の抽出を確認済み
- SCR-ID未登録時・HB-ID未紐付け時の警告を確認済み
- 決定ログサブフォーマット（`DL-*_screen-data-*.md`）としての保存を確認済み

詳細な確認手順・結果はPMへの報告（本タスクの最終回答）を参照。
