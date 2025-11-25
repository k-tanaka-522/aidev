# SRE・運用スキル

## 概要

運用、信頼性、SLO/SLI、インシデント管理に関する専門知識。

## 主な利用エージェント

- **sre**: 運用・信頼性の主担当
- **infra-architect**: 運用を考慮した設計
- **qa**: 運用テスト（負荷テスト等）

## 参照ドキュメント

### 技術標準（インフラ・CI/CD）
- [.claude/docs/40_standards/42_infra/cicd/github_actions.md](../../docs/40_standards/42_infra/cicd/github_actions.md)
- [.claude/docs/40_standards/42_infra/iac/](../../docs/40_standards/42_infra/iac/)

### フェーズ別ガイド（納品・運用）
- [.claude/docs/10_facilitation/2.6_納品フェーズ/PHASE_GUIDE.md](../../docs/10_facilitation/2.6_納品フェーズ/PHASE_GUIDE.md)
- [2.6.6_製造物_運用手順書構成.md](../../docs/10_facilitation/2.6_納品フェーズ/2.6.6_製造物_運用手順書構成.md)
- [2.6.7_製造物_トラブルシューティングガイド構成.md](../../docs/10_facilitation/2.6_納品フェーズ/2.6.7_製造物_トラブルシューティングガイド構成.md)

## クイックリファレンス

### SLI/SLO/SLA
- **SLI (Service Level Indicator)**: 実際の測定値
  - 例: 可用性 99.95%、レスポンスタイム P95 < 200ms
- **SLO (Service Level Objective)**: 目標値
  - 例: 可用性 99.9%以上を維持
- **SLA (Service Level Agreement)**: 契約上の保証
  - 例: 可用性 99.9%未満の場合は返金

### エラーバジェット
- SLO 99.9% = 年間8.76時間のダウン許容
- 使い切ったら新機能開発を止めて信頼性向上に集中

### 可観測性（Observability）の3本柱
1. **メトリクス**: 数値データ（CPU、メモリ、リクエスト数）
2. **ログ**: イベント記録（エラーログ、アクセスログ）
3. **トレース**: リクエストの流れ（分散トレーシング）

### Golden Signals（監視すべき4つの指標）
1. **Latency**: レスポンスタイム
2. **Traffic**: リクエスト数
3. **Errors**: エラー率
4. **Saturation**: リソース使用率

### インシデント管理プロセス
1. **検知**: アラート・ユーザー報告
2. **対応**: インシデントコマンダー指名
3. **復旧**: 一時対応（ロールバック等）
4. **調査**: 根本原因分析
5. **ポストモーテム**: 再発防止策の策定

### ポストモーテム（振り返り）の原則
- **Blameless**: 犯人探しをしない
- **学習機会**: 組織全体で学ぶ
- **具体的な対策**: 「気をつける」ではなく仕組み化

### デプロイ戦略
- **Blue-Green**: 新旧環境を並行稼働、切り替え
- **Canary**: 一部ユーザーで検証後、全展開
- **Rolling**: 徐々に入れ替え
- **Feature Toggle**: 機能フラグで制御

### 自動復旧
- **Auto Scaling**: 負荷に応じてスケール
- **Health Check**: 異常検知で再起動
- **Self-Healing**: 自動修復

## 関連スキル
- [infrastructure](../infrastructure/) - インフラ設計
- [security](../security/) - 運用セキュリティ
- [testing](../testing/) - 障害テスト、負荷テスト
