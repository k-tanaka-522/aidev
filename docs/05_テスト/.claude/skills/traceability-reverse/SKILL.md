---
name: traceability-reverse
description: HB-ID起点のRTM（トレーサビリティマトリクス正式版）をas-built生成し、9.1.1節の静的解析でMode B入口ゲート向け逆引き列（HB-ID→実装ファイル→API→モジュール）を生成する。
argument-hint: "[--scope=<ID>]"
---

# traceability-reverse（docs/05_テスト、Zone3リバース生成）

> 版数: M4実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 9.1.1節・9.1節、
> docs/v2/03_成果物体系定義書.md 3.7節・3.2.1節）
> `docs/02〜07/.claude/skills/reverse-doc`の`docs/05_テスト`専用の特化名（02文書5.4節）。

## 責務

1. `tests/e2e/`のdocblock（`HB-ID`）＋`00-02`台帳から`05-02`トレーサビリティマトリクス
   正式版をas-built生成する
2. 02文書9.1.1節の静的解析（`.claude/lib/static-analysis.js`）を実行し、
   `HB-ID`→実装ファイル→API-ID→モジュールの逆引き列を`00-02`台帳へ書き戻す
   （Mode B入口ゲート向け、01文書5.2節が必須とする影響範囲分析の入力）
3. `05-01`テスト方針、条件付き必須の`05-03`テスト結果報告書を生成する

## 手順（MUST）

```
1. 00-02台帳の正式要件ID列が変換済みであることを確認する（02文書9.4.1節の生成DAG
   「00-02 → 02-02 → 05-02」により、02-02が先に完了している必要がある。未完了なら
   「未確定入力あり」として保留し00-13_課題管理表.md へ登録する）
2. scripts/static-analysis-run.js を実行し、9.1.1節の逆引き列を00-02へ書き戻す
3. scripts/generate-rtm.js を実行し、05-02（正式要件ID起点のRTM）を生成する
4. scripts/generate-05-01.js を実行し、05-01（テスト方針）を生成する
```

## 静的解析の限界（正直な限界表明、02文書9.1.1節「限界」節、MUST）

対応アダプタ・対応できない範囲は`.claude/lib/static-analysis.js`のコメントを正とする。
要約:

- 対応: Next.js風/React Router風のフロントルーティング、Express風/FastAPI風の
  バックエンドルーティング、`fetch`/`axios`の文字列リテラル引数によるAPI呼び出し、
  `HB-ID:`docblock＋`page.goto()`風のE2Eナビゲーション
- 非対応（unresolvedとして明示。実装から推測しない）: 動的URL生成（テンプレート
  リテラルの変数展開）、上記以外のフレームワーク、ファイルをまたぐコールグラフ解析

`generate-rtm.js`実行時に出力される`unresolved`一覧は`00-13_課題管理表.md`へ登録すること
（MUST、実装から推測して埋めない）。

## 実行方法

```bash
node docs/05_テスト/.claude/skills/traceability-reverse/scripts/static-analysis-run.js
node docs/05_テスト/.claude/skills/traceability-reverse/scripts/generate-rtm.js
node docs/05_テスト/.claude/skills/traceability-reverse/scripts/generate-05-01.js
```

## 動作確認（M4）

PMへの最終報告を参照。
