---
name: mockup-generate
description: 対話しながら新規画面のHTMLハリボテを生成する。決定ログとdesign-system.htmlのパターンに従う。帳票（印刷物・外部提出様式）の依頼と判断した場合はprototypes/reports/配下に帳票ハリボテを生成しRPT-IDを採番する。
argument-hint: "[画面名 or 帳票名 or all]"
disable-model-invocation: true
---

# mockup-generate（ハリボテ新規生成）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.2節・10.1.1節・10.1.3節）
> レーンA（Designer主担当、01文書4.4.1節）の中核Skill。ハリボテはv2では
> 「合意形成の主媒体」として第一級に格上げされる（02文書5.2節）。

## 責務

1. ユーザーと対話しながら新規画面（または帳票）のHTMLハリボテを生成する
2. 決定ログ（Zone0の制約）と`design-system.html`のパターンに従う
3. **帳票判定（MUST）**: ユーザーの依頼内容に「帳票」「印刷」「PDF」「提出様式」等の
   キーワードが含まれる、または明示的な引数指定がある場合は帳票と判断し、
   `prototypes/reports/`配下に生成する。画面と帳票を同一HTMLに二重採番しない（MUST NOT）
4. 生成後、`register-mockup.js`を呼び出し`SCR-ID`（画面）または`RPT-ID`（帳票）を採番し、
   対応する台帳（`SCREEN_ID_INDEX.md`/`REPORT_ID_INDEX.md`）へ登録する

## 手順（MUST）

```
1. ウォームアップ: prototypes/配下の既存ファイル（index.html等）を1つReadする
2. ui-style-guide（paths自動参照）を通じてUI/UX規約を確認する
3. security-style-guide（paths自動参照）を通じてXSS対策等のフォーム実装規約を確認する
4. ユーザーと対話し、画面（または帳票）の内容を決める
5. HTMLファイルを Write する
   - 画面: prototypes/{screen}.html
   - 帳票: prototypes/reports/{report}.html （手順3の帳票判定に基づく）
6. node prototypes/.claude/skills/mockup-generate/scripts/register-mockup.js \
     --file=<書いたファイルの相対パス> --title="<画面名/帳票名>" [--kind=screen|report]
   を実行し、SCR-ID/RPT-IDの採番と台帳登録を完了させる（MUST。手動で台帳を編集しない）
7. 採番されたIDをユーザーに報告する
```

## 入力・出力

- 入力: ユーザーとの会話、決定ログ（`docs/00_プロジェクト管理・ガバナンス/decisions/`）
- 出力: `{screen}.html`または`reports/{report}.html`、対応する台帳への新規ID追記、
  `.claude-state/mockup-snapshots/{basename}.json`（`mockup-update`が改修差分検知に使う
  スナップショット。フィールド名・画面遷移候補を保存する）

## 帳票と画面の機械的区別（10.1.3節、MUST）

**方式: ディレクトリによる隔離**。帳票ハリボテは`prototypes/reports/`配下にのみ配置し、
画面ハリボテは`reports/`には置かない。`register-mockup.js`は`--kind`省略時、ファイルパスが
`prototypes/reports/`配下かどうかで自動判定するが、判定ミス（例: 画面を`reports/`配下に
誤って置く）はスクリプトがexit 1で拒否する。

**却下した代替案**: HTML内部の構造（`<table>`要素の有無、印刷用CSSの有無等）を解析して
自動判定する案も検討したが、通常の画面にも表形式のUIが多く含まれ誤判定率が高いと判断し、
確実性の高いディレクトリ分離を採用した（02文書10.1.3節の判断を踏襲）。

## 動作確認（M2）

- 画面ハリボテ作成→`SCR-ID`採番→`SCREEN_ID_INDEX.md`登録を確認済み
- 帳票ハリボテ（`prototypes/reports/`配下）作成→`RPT-ID`採番→`REPORT_ID_INDEX.md`登録を確認済み
- `prototypes/reports/`配下でないファイルに`--kind=report`を指定した場合の拒否を確認済み
- スナップショット（`.claude-state/mockup-snapshots/`）の保存を確認済み

詳細な確認手順・結果はPMへの報告（本タスクの最終回答）を参照。
