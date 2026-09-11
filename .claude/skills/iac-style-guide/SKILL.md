---
name: iac-style-guide
description: v2のIaC規約。CDK/Terraform/CloudFormation等、ツール別規約は個別ファイルを参照する。infra/**のexecute/reviewから自動で参照される。
user-invocable: false
paths:
  - "infra/**"
---

# iac-style-guide（IaC規約）

> 版数: M0雛形（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 4.1節「iac-style-guide/{SKILL.md, *.md}」、
> 14.1節「`.claude/docs/40_standards/` → `code-style-guide`/`iac-style-guide`（変更なし）」）
> `user-invocable: false`, `paths` は設計書5.1節が定める本来の値。`paths`の具体的なパターンはM1で確定する
> （本ファイルでは`infra/**`を暫定値として置く）。

## 責務

IaC規約（IAM最小権限、暗号化デフォルト、タグ必須、環境差分管理方針等）を定める。ツール別の規約は同階層の個別ファイルに分割する。

## 呼び出し元・連携先

- 呼び出し元: `infra/**`の`execute`/`review`（自動）

## ツール別規約ファイル（M1で内容実装）

| ファイル | 移行元（14.1節） |
|---|---|
| `cloudformation.md` | `.claude/docs/40_standards/42_infra/iac/cloudformation.md` |
| `terraform.md` | `.claude/docs/40_standards/42_infra/iac/terraform.md` |

<!-- M1で実装: 上記2ファイルへ.claude/docs/40_standards/42_infra/iac/配下の内容を移管する。
     併せてcicd/（cicd-security.md, github_actions.md）・testing/infra-test-structure.mdの
     移管先も確定する（設計書4.1節は*.mdとのみ記載しており個別ファイル名は明記していない。
     PMへの報告事項とする） -->
