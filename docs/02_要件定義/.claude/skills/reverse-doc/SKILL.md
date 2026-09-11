---
name: reverse-doc
description: Zone3のas-builtリバースにより要件定義書一式（02-01〜02-04）を生成する。requirements-first選択時は先に9.5節の差分検査モードを実行する。
argument-hint: "[--diff-check-only]"
---

# reverse-doc（docs/02_要件定義、Zone3リバース生成）

> 版数: M4実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 9章、
> docs/v2/03_成果物体系定義書.md 3.4節）

## 責務

決定ログ・`00-02`〜`00-03`台帳・契約モックから、要件定義書一式（`02-01`〜`02-04`）を
as-built生成する（03文書3.4節）。**標準構成ではZone3到達まで本Skillは実質的に空振り
（生成対象が無い）ことが正常であり（02文書4.2.1節）、`requirements-first`選択時のみ
Zone1から`execute`/`plan`が追加有効化され前倒し執筆される（02文書4.3節「例外」）。**

## 手順（MUST）

```
1. .claude-state/process-option.json の mode を確認する
   - mode=requirements-first の場合:
     a. 02-01_要件定義書.md が既に存在する（前倒し執筆済み）ことを確認する
     b. 存在すれば、まず9.5節の差分検査モード（scripts/diff-check.js）を実行し、
        02-99_前倒し版差分検査レポート.md を生成する（生成区分: 実装反映(as-built)）
     c. 差分検査で「文書のみ」「実装のみ」の不一致が見つかった場合、00-14変更管理台帳へ
        CRとして起票する（reverse-docが前倒し文書を自動で書き換えることはしない、MUST NOT）
   - mode=prototype-driven（標準）の場合: 上記a〜cはスキップする
2. scripts/reverse-doc.js を実行し、02-01〜02-04をas-built生成する
   （requirements-first選択時は02-01は前倒し文書のまま保持し上書きしない。02-02〜02-04は
   標準どおり生成する）
3. 生成のたびに doc-style-guide のヘッダーテンプレートに従い、
   `生成区分: 実装反映(as-built)`（前倒し文書は`事前設計(前倒し)`）を付与する
4. 00-01成果物構成カタログの該当行を都度更新する（1文書判明ごとに追記、まとめ書き禁止。
   02文書9.4節）
```

## 生成DAGにおける位置づけ（02文書9.4.1節）

`decisions/`全件 → `02-01`/`02-03`/`02-04`。`00-02 HB台帳（正式ID変換前）` → `02-02`。
`02-02` → `05-02`（RTM正式版）。したがって`02-02`の正式ID変換は`05_テスト/traceability-reverse`
より先に完了している必要がある（MUST、DAG違反時は「未確定入力あり」として保留し
`00-13_課題管理表.md`へ登録する）。

## 入力・出力

- 入力: `docs/00_.../decisions/`全件、`docs/00_.../00-02`〜`00-03`台帳、
  `decisions/contracts/*.openapi.yaml`
- 出力: `02-01_要件定義書.md`、`02-02_機能要件一覧.md`、`02-03_非機能要件一覧.md`、
  `02-04_外部インターフェース要件.md`（該当する場合）、`02-99_前倒し版差分検査レポート.md`
  （`requirements-first`選択時のみ）

## 実行方法

```bash
node docs/02_要件定義/.claude/skills/reverse-doc/scripts/reverse-doc.js
node docs/02_要件定義/.claude/skills/reverse-doc/scripts/reverse-doc.js --diff-check-only
```

## 動作確認（M4）

PMへの最終報告を参照（サンプルプロジェクトでの生成・逆差分0件・突合レポート生成の確認）。
