---
name: execute
description: 決定ログ・非機能骨格・契約モックの外部IF制約を直接の入力として、IaC(CDK)実装を行う。
argument-hint: "[スタック名]"
---

# execute（infra/cdk、レーンC実装）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.3節・4.3節）
> `infra/cdk`は02文書4.3節が示す`{cdk,terraform,...}`の代表例。Terraform等の他ツールを
> 採用する場合も同型のSkillを配置する（本ディレクトリをテンプレートとして複製する）。

## 責務

決定ログ（Zone0の非機能骨格・アーキ土台）・契約モックが示す外部IF制約を直接の入力として
IaC実装を行う。レーンCはZone1のうちから決定ログ・構成メモを蓄積し、`infra/`への実装着手は
IaCの性質上Zone1から継続的に行われうる（01文書4.4.1節。レーンBのようなZone1実装禁止の
制約は無い。IaCのdev環境構築等は探索の一部として許容される）。

## 手順

```
1. ウォームアップ: infra/cdk/配下の既存ファイルを1つReadする
2. iac-style-guide（paths: "infra/**, .github/workflows/**, tests/integration/**"自動参照）
   でIaC規約（IAM最小権限、暗号化デフォルト、タグ必須等）を確認する
3. iac-style-guide/cicd/*.md（CI/CDパイプライン定義時）を確認する
4. security-style-guide（paths自動参照）でセキュリティ規約を確認する
5. 決定ログ（非機能骨格・アーキ土台・外部連携制約）を読み、実装する
6. iac-style-guide/testing/INFRA_TEST_STANDARD.md に従いテスト計画・シナリオを
   tests/integration/infra/ 配下に用意する（QA主導、02文書v1前提書き換え済み）
```

## 入力・出力

- 入力: 決定ログ、契約モックの外部IF制約
- 出力: `infra/cdk/`配下のIaCコード

## 動作確認（M2）

- SKILL.mdがディレクトリスコープSkillとして配置されていることを確認済み。
