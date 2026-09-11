---
name: iac-style-guide
description: v2のIaC規約。CDK/Terraform/CloudFormation等、ツール別規約は個別ファイル、CI/CD規約はcicd/配下、インフラテスト規約はtesting/配下を参照する。infra/**・.github/workflows/**のexecute/reviewから自動で参照される。
user-invocable: false
paths: "infra/**, .github/workflows/**"
---

# iac-style-guide（IaC規約）

> 版数: M1実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 4.1節・4.4節「技術標準の移管マッピング」）
> `user-invocable: false`, `paths` は設計書5.1節が定める本来の値。
> **`paths`の書式に関する重要な訂正（M1で判明）**: `code-style-guide/SKILL.md`と同様の
> 理由により、`paths`はカンマ区切りの単一文字列で与える。M0雛形のYAMLリスト構文を修正した。

## 責務

IaC規約（IAM最小権限、暗号化デフォルト、タグ必須、環境差分管理方針等）を定める。
ツール別の規約・CI/CD規約・インフラテスト規約は同階層のサブディレクトリに分割する
（02文書4.4節が定める移管マッピング）。

## 呼び出し元・連携先

- 呼び出し元: `infra/**`の`execute`/`review`（自動、Zone2）。CI/CD定義
  （`.github/workflows/**`）もsre主導での参照対象に追加（02文書4.4節）

## 規約ファイル一覧（02文書4.4節の移管マッピング、M1で内容移管済み）

| ファイル | 移行元 | 対象 |
|---|---|---|
| `cloudformation.md` | `.claude/docs/40_standards/42_infra/iac/cloudformation.md` | CloudFormation採用時 |
| `terraform.md` | `.claude/docs/40_standards/42_infra/iac/terraform.md` | Terraform採用時 |
| `iac-import.md` | `.claude/docs/40_standards/42_infra/iac/iac-import.md` | 緊急対応で作成した管理外リソースの取り込み（M0で移管漏れだったものをM1で追加） |
| `cicd/cicd-security.md`（新設） | `.claude/docs/40_standards/42_infra/cicd/cicd-security.md` | OIDC認証・PR実行制限・機密情報分離・コスト保護 |
| `cicd/github_actions.md`（新設） | `.claude/docs/40_standards/42_infra/cicd/github_actions.md` | GitHub Actionsパイプライン標準 |
| `testing/INFRA_TEST_STANDARD.md`（新設） | `.claude/docs/40_standards/42_infra/testing/infra-test-structure.md` | インフラテスト計画・実施標準（QA主導） |

## 移管時に判明した内容面の課題（PMへの報告事項）

`cicd/github_actions.md`は移行元がv1の別プロジェクト（`sampleAWS-subagent`）への
相対パスリンクを含んでおり、本リポジトリには存在しないためリンク切れになる。
本リポジトリ内で完結する注記に置き換えたが、リンク先の実体（検証完了レポート）は
失われている。**この項目はM6完了条件（外部参照切れの確認、版1.7指摘7）で扱う。**

**解消済み（M2、版1.7 14.2節の完了条件）**: `testing/INFRA_TEST_STANDARD.md`の
ディレクトリ構造例（`docs/03_テスト/インフラテスト/`）とPM委譲プロンプト例がv1
（フェーズ順次型）前提のままだった問題は、v2のゾーン/レーン型（Zone2の`infra/{layer}:execute`が
テスト実装、`tests/integration/infra/`配下に実行成果物を置き、`docs/05_テスト/`はZone3の
`traceability-reverse`が生成する薄い正式文書のみを持つ）へ書き換え済み。同様に
`cloudformation.md`の設計書ファイル分割節、`iac-import.md`のパラメーターシート更新先も
書き換え済み（各ファイルの該当節を参照）。内容の骨子（テスト観点9種、品質基準、
自動化ツール一覧、ファイル分割3原則、Import手順そのもの）はv1/v2で変わらない技術的内容
のため変更していない。

## セキュリティ標準への参照（02文書4.4節、版1.7で参照先変更）

全レーン横断のセキュリティ基準は`security-style-guide`直下の`SECURITY_STANDARD.md`が正本
（版1.7で`security-guard`から`security-style-guide`へ移動。能動検査/受動自動参照の分離）。
本Skill（および`cicd/`配下）は内容を複製せず参照する。

## v1前提記述の書き換え（M2完了条件、版1.7 14.2節）

M1移管時に「PMへの報告事項」としていた`testing/INFRA_TEST_STANDARD.md`のディレクトリ構造・
PM委譲プロンプト、`cloudformation.md`の設計書ファイル分割例、`iac-import.md`のパラメーター
シート更新先について、v1（フェーズ順次型）前提からv2（ゾーン/レーン型）前提へ書き換え済み
（M2、各ファイル冒頭・該当節の注記を参照）。

## 動作確認（M1）

- `paths`を文字列形式に修正済み（`code-style-guide`と同一の問題・同一の修正）
