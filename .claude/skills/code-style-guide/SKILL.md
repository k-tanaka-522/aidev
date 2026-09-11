---
name: code-style-guide
description: v2のコーディング規約。フロントエンド・バックエンド・SDK等、言語別の規約はlanguages/配下を参照する。src/**のexecute/reviewから自動で参照される。
user-invocable: false
paths:
  - "src/**"
---

# code-style-guide（コーディング規約）

> 版数: M0雛形（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 4.1節「code-style-guide/{SKILL.md, languages/*.md}」、
> 14.1節「`.claude/docs/40_standards/`は変換なしでcode-style-guide/iac-style-guideへ移管」）
> `user-invocable: false`, `paths` は設計書5.1節が定める本来の値。`paths`の具体的なパターンはM1で確定する
> （本ファイルでは`src/**`を暫定値として置く）。

## 責務

コーディング規約（共通原則、テスト、Git運用等）を定める。言語固有の規約は`languages/`配下の個別ファイルに分割する（4.1節のディレクトリ構成に対応）。

## 呼び出し元・連携先

- 呼び出し元: `src/**`の`execute`/`review`（自動）

## 言語別規約ファイル（`languages/`、M1で内容実装）

| ファイル | 移行元（14.1節） |
|---|---|
| `languages/typescript.md` | `.claude/docs/40_standards/41_app/languages/typescript.md` |
| `languages/python.md` | `.claude/docs/40_standards/41_app/languages/python.md` |
| `languages/csharp.md` | `.claude/docs/40_standards/41_app/languages/csharp.md` |
| `languages/go.md` | `.claude/docs/40_standards/41_app/languages/go.md` |

<!-- M1で実装: 上記4ファイルへ.claude/docs/40_standards/41_app/languages/配下の内容を移管する。
     併せてframeworks/（react_nextjs.md, flutter.md）・api_design.md・database.md・uiux.mdの
     移管先も本SKILL.mdまたは追加ファイルとして確定する（設計書4.1節はlanguages/*.mdのみを
     明記しており、frameworks等の配置先は明記していない。PMへの報告事項とする） -->

## 共通原則（annotationの既存資産を踏襲、M1で内容確定）

- シンプルさ優先、型安全、テストファースト、セキュアコーディング（OWASP Top 10）
- テスト: カバレッジ80%以上、異常系テスト必須
- Git: ブランチ運用・コミットメッセージ規約

<!-- M1で実装: 上記の具体的な規約本文 -->
