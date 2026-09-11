---
name: security-guard
description: コンプライアンス検査（能動）。orchestrateから明示的に呼び出され、対象範囲（src/, infra/, decisions/contracts/等）がセキュリティ標準に準拠しているかをcontext:forkの独立コンテキストで検査する。
context: fork
---

# security-guard（コンプライアンスガード・能動検査専用）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.1節・4.4節。版1.7で`security-style-guide`へ責務分離）
> `context: fork` は設計書5.1節が定める本来の値。**版1.7で`paths`を削除した**（旧M1版は
> `context: fork`と`paths`を1つのSkillに併設していたが、能動検査と受動自動参照を
> `security-guard`／`security-style-guide`に分離する設計判断が確定したため）。

## 責務

**能動的検査のみ**（`context: fork`）。`orchestrate`から明示的に呼び出され、対象範囲
（`src/`, `infra/`, `decisions/contracts/`等）が`security-style-guide`の
`SECURITY_STANDARD.md`に準拠しているかを独立コンテキストで検査する。

**版1.7での変更**: 旧M1版が持っていた「受動的自動参照（`paths`）」の責務は
`security-style-guide`（新設）へ完全に移した。本Skillはもはや`paths`を持たない。

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`（能動検査のみ）
- 連携先: `qa`、`security-style-guide`（同じ標準を参照）

## レビューとの役割分担

本ガードは**検査者であり、テストを書かない**。セキュリティテスト・テナント分離テスト等の設計と実装は`qa`が担う（書いた本人が合否を出す構造を作らないため）。本ガードは実施済み・合格であることを**確認する**。

## セキュリティ標準の参照先（版1.7で移動、MUST NOT複製）

`SECURITY_STANDARD.md`本体は`.claude/skills/security-style-guide/SECURITY_STANDARD.md`
を正本とする（版1.6でのM1新設時は`security-guard`直下に置いていたが、版1.7の分離に伴い
移動した。旧ファイルは削除済み）。本Skillは内容を転記・複製せず、検査時に参照する。

## `context: fork` と `paths` の分離に至った経緯（要検証15章#23、版1.7で解消済み）

M1時点で、実際にインストールされている`@anthropic-ai/claude-code@2.1.42`のSkillロード処理
（`Hu1`関数・`PH9`関数・`W01`関数）をソースレベルで確認し、**技術的には`context: fork`と
`paths`を1つのSkillに併設してもパース・ロードエラーにはならない**ことを確認済みだった。
しかし意味論上、`paths`による受動的自動参照は「本文がそのまま呼び出し元のコンテキストへ
展開される」ことを期待する用途である一方、`context: fork`は「呼ばれるたびに独立コンテキストで
実行され結果テキストのみが返る」ため、受動参照のたびに往復（ラウンドトリップ）が発生してしまう。
この非対称性を理由に、版1.7（02文書4.4節・5.1節、指摘6）は能動検査専用の本Skillと、
受動参照専用の`security-style-guide`（新設）への分離を設計判断として確定した。

## ツール権限

`context: fork`内での実行のため`Write`/`Edit`は持たない（`Read`/`Grep`/`Glob`のみ）。

## 動作確認（M2）

- `paths`削除後も`context: fork`単独でのSkill定義として問題なくロードされることを確認済み
- `security-style-guide`への参照リンクが機能することを確認済み（同一ディレクトリ外への
  リンク参照であり複製ではないことを確認）
