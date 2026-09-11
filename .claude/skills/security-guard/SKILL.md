---
name: security-guard
description: コンプライアンス検査。全ゾーンのExecute/reverse-doc完了後にorchestrateから能動的に起動される（context:fork）ほか、src/**・infra/**・decisions/contracts/**・prototypes/**編集時にSECURITY_STANDARD.mdが自動参照される。
context: fork
paths: "src/**, infra/**, decisions/contracts/**, prototypes/**"
---

# security-guard（コンプライアンスガード）

> 版数: M1実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.1節・3.2節・4.4節）
> `context: fork` は設計書5.1節が定める本来の値。`paths`は版1.6の4.4節が追加要求した
> 「`paths`によるpassive自動参照」を実装したもの。

## 責務

1. **能動的検査（`context: fork`、主機能）**: `orchestrate`から明示的に呼び出され、
   対象範囲（`src/`, `infra/`, `decisions/contracts/`等）がセキュリティ標準
   （`SECURITY_STANDARD.md`）に準拠しているかを独立コンテキストで検査する
2. **受動的自動参照（`paths`、版1.6で追加）**: `src/**`・`infra/**`・
   `decisions/contracts/**`・`prototypes/**`のいずれかを編集した際、本Skillが
   条件付きで活性化され、`code-style-guide`等と同様にモデルが自律的に参照できる
   ようになる（全レーン共通のセキュリティ基準の一元管理、02文書4.4節）

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`（能動検査）、各execute/review Skill（受動自動参照）
- 連携先: `qa`

## レビューとの役割分担

本ガードは**検査者であり、テストを書かない**。セキュリティテスト・テナント分離テスト等の設計と実装は`qa`が担う（書いた本人が合否を出す構造を作らないため）。本ガードは実施済み・合格であることを**確認する**。

## セキュリティ標準の正本（`SECURITY_STANDARD.md`、版1.6で新設）

`.claude/docs/40_standards/49_common/security.md`から移管した内容を
`.claude/skills/security-guard/SECURITY_STANDARD.md`として保持する。
`code-style-guide`・`iac-style-guide`・`ui-style-guide`・（Zone1の`contract-design`）は
この内容を転記・複製せず、必要な箇所でリンク参照する（02文書4.4節、MUST NOT複製）。

主な内容: シークレット管理（AWS Secrets Manager優先）、セキュリティチェックリスト
（アプリ: SQLインジェクション対策・XSS対策・CSRF対策・パスワードハッシュ化・HTTPS強制・
セキュリティヘッダー、インフラ: SecurityGroup最小化・IAM最小権限・VPCプライベートサブネット・
RDS暗号化・S3パブリックアクセス無効化・CloudTrail・GuardDuty、依存関係: 脆弱性スキャン）、
監視・ログ（構造化ログ、シークレットのログ出力禁止）、バックアップ・復旧（RTO/RPO目標）。

## `context: fork` と `paths` の両立可否（要検証15章#23への回答、M1で検証済み）

**検証方法**: 実際にインストールされている`@anthropic-ai/claude-code@2.1.42`
（`/opt/node22/lib/node_modules/@anthropic-ai/claude-code/cli.js`）のSkillロード処理
（`Hu1`関数・`PH9`関数・`W01`関数）をソースレベルで確認した。

**確認できた事実**:

1. Skillのfrontmatterパース処理（`Hu1`関数）は`context`（→`executionContext`）と
   `paths`（→`PH9`が返す配列）を独立にパースしており、両方が同時に設定されていても
   パース・ロードの時点でエラーにはならない、または一方が無効化されることもない
   （両方とも通常どおり値を持つ）
2. `paths`を持つSkillは「条件付きSkill」として保留状態（`$u1`マップ）に置かれ、
   `paths`パターンにマッチするファイルが編集されたタイミングで初めて通常のSkill一覧
   （`Io`マップ）へ昇格し、モデルから自律的に呼び出し可能になる（`W01`関数）。
   `context: fork`はこの「呼び出し可能になった後、実際に呼び出された時」の実行方式
   （独立コンテキストで実行し結果テキストのみを返す）を規定するものであり、
   `paths`による活性化タイミングの制御とは**独立した別レイヤの設定**である
3. したがって**技術的には両立可能**であり、frontmatterに`context: fork`と`paths`を
   同時に設定してよい（MAY、パース・ロードエラーにならないことを確認済み）

**残る意味論上の注意点（要報告）**: 両立は技術的に可能だが、**動作の性質が
`code-style-guide`等の非fork自動参照Skillとは異なる**。非fork Skillは呼び出されると
SKILL.md本文がそのまま現在のコンテキストへ展開され、呼び出し元（例: コーディング中の
coder）はそのガイドラインを読みながら直接作業を続けられる。一方`context: fork`の
Skillは呼び出されるたびに独立した新規コンテキストが作られ、そこでの処理結果（テキスト）
のみが呼び出し元に返る。つまりsecurity-guardが受動的に自動参照された場合も、
「その場でSECURITY_STANDARD.mdの内容を読む」のではなく「security-guardを1回呼び出し、
フォークされた文脈からの回答を受け取る」という**往復（ラウンドトリップ）が毎回発生する**。
機能上は成立するが、`code-style-guide`等と全く同じ使用感（ゼロコストなインライン参照）
にはならない点をPMへ報告する。分離すべきか（能動検査用と受動参照用を別Skillに割る）は
App-Architectの設計判断に委ねる。

## `paths`書式に関する注意（M1で判明した既知の問題、再掲）

`paths`は**カンマ区切りの単一文字列**として与えなければならない（YAMLリスト構文は
無視されるか、常時ロードのSkillとして扱われてしまう。`test-design-guide/SKILL.md`の
該当箇所を参照）。本ファイルはこの訂正を反映済み。

## ツール権限

`context: fork`内での実行のため`Write`/`Edit`は持たない（`Read`/`Grep`/`Glob`のみ）。
