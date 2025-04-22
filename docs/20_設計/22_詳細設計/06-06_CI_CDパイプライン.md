# aiDev CI/CDパイプライン設計書

## 1. 概要

### 1.1 目的
本設計書は、aiDevプロジェクトにおけるCI/CD（継続的インテグレーション/継続的デリバリー）パイプラインの設計を定義する。このパイプラインは開発の効率化、品質の向上、デプロイの安定性を確保するために構築される。

### 1.2 スコープ
- フロントエンド（Reactアプリケーション）のビルドと配信
- バックエンド（Lambda関数、APIゲートウェイ）のデプロイ
- インフラストラクチャ（CloudFormation）の管理
- テスト自動化とコード品質チェック
- 複数環境（開発、ステージング、本番）へのデプロイ管理

### 1.3 前提条件
- GitHubをソースコード管理に使用
- AWS CodePipelineをCI/CDプラットフォームとして使用
- AWS CloudFormationをインフラストラクチャのコード化に使用
- 各環境（dev/stg/prod）は独立して管理される

## 2. アーキテクチャ設計

### 2.1 全体アーキテクチャ

```
[GitHub] → [CodePipeline] → [CodeBuild] → [CloudFormation] → [AWS環境]
   ↑             |               |              |               |
   |             |               |              |               |
   └──────────── | ───────────── | ────────────-|────────────── | ─┐
                 ↓               ↓              ↓               ↓  |
            [通知機能] ← ──── [監視機能] ← ── [デプロイ監視] ← ── ─┘
```

### 2.2 環境分離アーキテクチャ

```
                          [GitHub]
                              |
                              ↓
┌─────────────────┬───────────────────┬─────────────────┐
│                 │                   │                 │
│ [dev-pipeline]  │  [stg-pipeline]   │ [prod-pipeline] │
│                 │                   │                 │
└────────┬────────┴──────────┬────────┴────────┬────────┘
         │                   │                 │
         ↓                   ↓                 ↓
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│                 │ │                 │ │                 │
│   [開発環境]     │ │ [ステージング環境] │ │   [本番環境]    │
│     (dev)       │ │     (stg)       │ │    (prod)      │
│                 │ │                 │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
```

## 3. コンポーネント設計

### 3.1 CodePipeline設計
- 各環境ごとに独立したパイプラインを構築
- パイプラインは以下の段階で構成
  1. **ソース段階**: GitHubリポジトリからのコード取得
  2. **ビルド段階**: CodeBuildによるビルド、テスト実行
  3. **承認段階**: 環境デプロイ前の手動承認（stg/prodのみ）
  4. **デプロイ段階**: CloudFormationによるインフラ/アプリのデプロイ

### 3.2 CloudFormation設計
- AWSリソースはすべてCloudFormationで定義
- AWSサービスごとに独立したテンプレートファイルを作成
- ネストされたスタック構造による管理
  ```
  [root-stack]
    ├── [network-stack]
    ├── [security-stack]
    ├── [storage-stack]
    ├── [compute-stack]
    ├── [database-stack]
    └── [api-stack]
  ```
- 環境間で共通の設定はパラメータとして切り出し
- 環境固有の設定値はパラメータファイルで管理

### 3.3 通知・モニタリング設計
- Amazon SNSを使用した通知
  - パイプライン実行開始
  - ビルド/デプロイ失敗
  - 承認待ち通知
  - デプロイ完了通知
- CloudWatchによるモニタリング
  - パイプライン実行メトリクス
  - デプロイ成功率
  - ビルド時間

## 4. フロントエンド CI/CD設計

### 4.1 ビルドプロセス
- Node.jsによるReactアプリケーションのビルド
- 環境変数の注入によるAPI接続先切り替え
- 静的アセットの最適化（圧縮、バンドル）
- buildspec.ymlによるビルド手順定義

### 4.2 テスト設計
- 単体テスト（Jest）の自動実行
- E2Eテスト（Cypress）の統合
- コードの品質チェック（ESLint、Prettier）
- テスト結果の収集と可視化

### 4.3 デプロイ設計
- S3バケットへの静的ファイルのアップロード
- CloudFrontキャッシュの無効化
- バージョニングと履歴管理
- ロールバック手順

## 5. バックエンド CI/CD設計

### 5.1 ビルドプロセス
- Lambda関数のビルドとパッケージング
- 依存関係のキャッシュ活用
- 環境変数の設定（環境ごとに異なる設定）
- buildspec.ymlによるビルド手順定義

### 5.2 テスト設計
- Lambda関数の単体テスト自動実行
- APIの統合テスト実行
- セキュリティチェック（依存関係の脆弱性スキャン）
- テスト結果の収集と可視化

### 5.3 デプロイ設計
- Lambda関数のバージョニングとエイリアス管理
- API Gatewayのデプロイメント管理
- デプロイ順序の制御（データストア → コンピューティング → API）

## 6. セキュリティ設計

### 6.1 認証・認可
- IAMロールの最小権限原則の適用
- クロスアカウントアクセス権限の設定
- シークレット管理（AWS Secrets Manager活用）

### 6.2 コードセキュリティ
- 依存関係の脆弱性スキャン（npm audit）
- SAST（静的アプリケーションセキュリティテスト）の統合
- プルリクエストレビューの強制

### 6.3 インフラセキュリティ
- ネットワークセキュリティの確保（セキュリティグループ、ネットワークACL）
- データ暗号化（S3、DynamoDB）
- AWS Config Rulesによるコンプライアンスチェック

## 7. 運用設計

### 7.1 初期セットアップ手順
1. CodePipeline初期設定用のCloudFormationテンプレート作成
2. GitHubとの連携設定（OAuth認証）
3. IAMロールと権限の設定
4. 通知設定（SNS）

### 7.2 デプロイ戦略
- 開発環境(dev): プッシュごとに自動デプロイ
- ステージング環境(stg): 開発環境での検証後、承認を経てデプロイ
- 本番環境(prod): ステージング環境での検証後、承認を経てデプロイ

### 7.3 障害対応
- デプロイ失敗時の自動ロールバック
- アラート通知と対応フロー
- 障害記録と分析プロセス

## 8. 実装計画

### 8.1 フェーズ1: CI/CDパイプラインの基本構成
- CodePipeline初期構築
- GitHubとの連携設定
- 基本的なビルド/デプロイフロー確立

### 8.2 フェーズ2: テスト自動化と品質チェック
- テスト自動化の追加
- コード品質チェックの統合
- セキュリティスキャンの実装

### 8.3 フェーズ3: 高度なデプロイ戦略
- カナリアデプロイの導入
- ブルー/グリーンデプロイメントの実装
- 運用メトリクスの拡充

## 9. 添付資料

### 9.1 IAMポリシー設定例
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "s3:*",
        "lambda:*",
        "apigateway:*",
        "cloudfront:*",
        "dynamodb:*"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "aws:RequestedRegion": "ap-northeast-1"
        }
      }
    }
  ]
}
```

### 9.2 buildspec.yml例
```yaml
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 18
    commands:
      - npm install

  pre_build:
    commands:
      - npm run lint
      - npm test

  build:
    commands:
      - npm run build

  post_build:
    commands:
      - aws s3 sync ./build s3://${S3_BUCKET_NAME}/ --delete
      - aws cloudfront create-invalidation --distribution-id ${CF_DISTRIBUTION_ID} --paths "/*"

artifacts:
  files:
    - build/**/*
  base-directory: '.'

cache:
  paths:
    - 'node_modules/**/*'
```

### 9.3 環境パラメータファイル例
```json
{
  "Parameters": {
    "Environment": "dev",
    "VpcCidr": "10.0.0.0/16",
    "ApiGatewayStageName": "v1",
    "DynamoDBReadCapacity": "5",
    "DynamoDBWriteCapacity": "5",
    "LambdaMemorySize": "256",
    "CloudFrontPriceClass": "PriceClass_100"
  }
}
```