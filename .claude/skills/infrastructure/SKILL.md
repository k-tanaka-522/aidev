# インフラ設計スキル

## 概要

インフラアーキテクチャ設計、IaC、クラウド設計に関する専門知識。

## 主な利用エージェント

- **infra-architect**: インフラ設計の主担当
- **sre**: 運用を考慮したインフラ設計
- **app-architect**: アプリとインフラの整合性確認

## 参照ドキュメント

### 技術標準（インフラ）
- [.claude/docs/40_standards/42_infra/iac/terraform.md](../../docs/40_standards/42_infra/iac/terraform.md)
- [.claude/docs/40_standards/42_infra/iac/cloudformation.md](../../docs/40_standards/42_infra/iac/cloudformation.md)
- [.claude/docs/40_standards/42_infra/iac/iac-import.md](../../docs/40_standards/42_infra/iac/iac-import.md)

### CI/CD
- [.claude/docs/40_standards/42_infra/cicd/github_actions.md](../../docs/40_standards/42_infra/cicd/github_actions.md)
- [.claude/docs/40_standards/42_infra/cicd/cicd-security.md](../../docs/40_standards/42_infra/cicd/cicd-security.md)

### フェーズ別ガイド（実装）
- [.claude/docs/10_facilitation/2.4_実装フェーズ/2.4.6_IaC構築プロセス/](../../docs/10_facilitation/2.4_実装フェーズ/2.4.6_IaC構築プロセス/)

## クイックリファレンス

### IaC設計の原則
1. **冪等性**: 何度実行しても同じ結果
2. **宣言的**: 「何をするか」ではなく「どうあるべきか」
3. **バージョン管理**: Git管理必須
4. **環境分離**: dev/stg/prod の明確な分離
5. **State管理**: Terraformのstate、CFnのスタック

### Terraform ベストプラクティス
- モジュール化: 再利用可能な単位で分割
- State管理: S3 + DynamoDB でロック
- plan必須: 差分確認なしでapplyしない
- workspaceまたはディレクトリで環境分離

### CloudFormation ベストプラクティス
- スタック分割: ネットワーク/コンピュート/データ
- Change Sets必須: 直接deployは禁止
- ParameterとMappingsで環境差分管理
- Outputsでスタック間連携

### AWS Well-Architected Framework
1. **運用の優秀性**: 自動化、小さく頻繁な変更
2. **セキュリティ**: 多層防御、最小権限
3. **信頼性**: 自動復旧、水平スケール
4. **パフォーマンス効率**: 適切なリソース選択
5. **コスト最適化**: 従量課金の活用
6. **持続可能性**: 環境への影響最小化

## 関連スキル
- [security](../security/) - セキュアなインフラ設計
- [sre](../sre/) - 運用を考慮した設計
- [architecture](../architecture/) - アプリとの整合性
