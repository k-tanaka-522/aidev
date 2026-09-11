---
name: code-style-guide
description: v2のコーディング規約。フロントエンド・バックエンド・SDK等、言語別の規約はlanguages/配下、フレームワーク別規約はframeworks/配下、DB規約はdata/配下を参照する。src/**のexecute/reviewから自動で参照される。
user-invocable: false
paths: "src/**"
---

# code-style-guide（コーディング規約）

> 版数: M1実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 4.1節・4.4節「技術標準の移管マッピング」）
> `user-invocable: false`, `paths` は設計書5.1節が定める本来の値。
> **`paths`の書式に関する重要な訂正（M1で判明）**: `paths`はYAMLリスト構文
> （`paths:` の下に `- "..."` を複数行）ではなく、**カンマ区切りの単一文字列**でなければ
> ならない。実際にインストールされている`@anthropic-ai/claude-code@2.1.42`のソース
> （`PH9`関数、`typeof frontmatter.paths !== "string"`の場合は無条件に無視）で確認した。
> M0雛形はYAMLリスト構文を使っており機能しない状態だったため、M1で修正した。

## 責務

コーディング規約（共通原則、テスト、Git運用等）を定める。言語固有の規約は`languages/`、
フレームワーク固有の規約は`frameworks/`、データベース規約は`data/`の各配下に分割する
（02文書4.4節が定める移管マッピング）。

## 呼び出し元・連携先

- 呼び出し元: `src/**`の`execute`/`review`（自動、Zone2。M2でディレクトリスコープSkill実装時に配線）

## 規約ファイル一覧（02文書4.4節の移管マッピング、M1で内容移管済み）

| ファイル | 移行元 | 対象 |
|---|---|---|
| `languages/typescript.md` | `.claude/docs/40_standards/41_app/languages/typescript.md` | TypeScript実装全般 |
| `languages/python.md` | `.claude/docs/40_standards/41_app/languages/python.md` | Python実装全般 |
| `languages/csharp.md` | `.claude/docs/40_standards/41_app/languages/csharp.md` | C#実装全般 |
| `languages/go.md` | `.claude/docs/40_standards/41_app/languages/go.md` | Go実装全般 |
| `frameworks/react_nextjs.md`（新設） | `.claude/docs/40_standards/41_app/frameworks/react_nextjs.md` | `src/frontend`（React/Next.js採用時） |
| `frameworks/flutter.md`（新設） | `.claude/docs/40_standards/41_app/frameworks/flutter.md` | `src/mobile`（Flutter採用時） |
| `data/DATABASE_STANDARD.md`（新設） | `.claude/docs/40_standards/41_app/database.md` | `src/backend`（主）。`contract-design`（Zone1、契約モックのデータ形状決定時）からも参照される（副、02文書4.4節） |

いずれも移行元からの内容変更はない（「変更なし」列は02文書4.4節が明記。ただし
v1固有の外部参照（`.claude/agents/coder/AGENT.md`、`.claude/docs/10_facilitation/`）は
本Skill体系内で完結するよう文言を調整済み）。

## 共通原則（annotationの既存資産を踏襲）

- シンプルさ優先、型安全、テストファースト、セキュアコーディング（OWASP Top 10）
- テスト: カバレッジ80%以上、異常系テスト必須（UTはCoderが実装と同時に作成。詳細な
  試験レベル分担は`test-design-guide`を参照）
- Git: ブランチ運用（フィーチャーブランチ＋PRレビュー）、コミットメッセージは
  「なぜ」を主語にした簡潔な1〜2文
- コメント規約（全言語共通）: すべての関数/メソッド/クラスに「目的・理由」
  「影響範囲」「前提条件・制約」を日本語で記載する（AI協業を前提としたコンテキスト明記。
  `languages/*.md`の各言語別コメント例を参照）

## セキュリティ標準への参照（02文書4.4節）

全レーン横断のセキュリティ基準は`security-guard`直下の`SECURITY_STANDARD.md`が正本。
本Skillは内容を複製せず、実装時のセキュリティ判断が必要な箇所ではそちらを参照する
（MUST NOT複製）。

## 動作確認（M1）

- `paths: "src/**"`（文字列形式）に修正済み。実機（Claude Code CLI）での条件付き活性化
  自体の動作確認は、本タスクの実行環境からは直接観測できないため「ソースコード上の
  パース仕様の確認」に留まる（詳細はPMへの報告を参照）
