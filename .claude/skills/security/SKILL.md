# セキュリティスキル

## 概要

セキュリティ設計、脆弱性対策、OWASP準拠に関する専門知識。

## 主な利用エージェント

- **infra-architect**: インフラセキュリティ設計
- **sre**: 運用セキュリティ
- **app-architect**: アプリケーションセキュリティ
- **coder**: セキュアコーディング

## 参照ドキュメント

### 技術標準（セキュリティ）
- [.claude/docs/40_standards/49_common/security.md](../../docs/40_standards/49_common/security.md)
- [.claude/docs/40_standards/42_infra/cicd/cicd-security.md](../../docs/40_standards/42_infra/cicd/cicd-security.md)

### フェーズ別ガイド
- [.claude/docs/10_facilitation/2.3_設計フェーズ/2.3.9_セキュリティ設計チェックリスト.md](../../docs/10_facilitation/2.3_設計フェーズ/2.3.9_セキュリティ設計チェックリスト.md)
- [.claude/docs/10_facilitation/2.5_テストフェーズ/2.5.8_セキュリティテスト/](../../docs/10_facilitation/2.5_テストフェーズ/2.5.8_セキュリティテスト/)

## クイックリファレンス

### OWASP Top 10 (2021)
1. **Broken Access Control**: 認可の不備
2. **Cryptographic Failures**: 暗号化の失敗
3. **Injection**: SQLインジェクション等
4. **Insecure Design**: 設計段階の脆弱性
5. **Security Misconfiguration**: 設定ミス
6. **Vulnerable Components**: 脆弱な依存関係
7. **Authentication Failures**: 認証の不備
8. **Data Integrity Failures**: データ整合性
9. **Logging Failures**: ログ・監視の不足
10. **SSRF**: サーバーサイドリクエストフォージェリ

### セキュアコーディング原則
- **入力検証**: すべての入力を疑う
- **出力エスケープ**: XSS対策
- **パラメータ化クエリ**: SQLインジェクション対策
- **最小権限の原則**: 必要最小限のアクセス権
- **多層防御**: 単一の対策に依存しない

### 認証・認可
- **認証（Authentication）**: 誰か？
  - パスワード、多要素認証、SSO
- **認可（Authorization）**: 何ができる？
  - RBAC、ABAC、OAuth2

### 暗号化
- **転送時**: TLS 1.2以上、HTTPS必須
- **保存時**: AES-256、AWS KMS、HashiCorp Vault
- **シークレット管理**: 環境変数、AWS Secrets Manager

### セキュリティテスト
- **SAST**: 静的解析（コードレビュー）
- **DAST**: 動的解析（実行時テスト）
- **SCA**: 依存関係スキャン
- **ペネトレーションテスト**: 実際の攻撃シミュレーション

## 関連スキル
- [infrastructure](../infrastructure/) - インフラセキュリティ
- [coding](../coding/) - セキュアコーディング
- [testing](../testing/) - セキュリティテスト
