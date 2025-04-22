# aiDev プロジェクト - インフラストラクチャ・アズ・コード (IaC)

このディレクトリには、aiDevプロジェクトのインフラストラクチャをコードとして管理するためのリソースが含まれています。現在はAWS CloudFormationを使用していますが、将来的には他のIaCツール（Terraform等）にも対応できるよう構成されています。

## 構成

```
/iac/                              # インフラストラクチャ・アズ・コード関連ファイル
├── README.md                      # IaC全体のドキュメント
│
├── cloudformation/                # CloudFormationリソース
│   ├── pipeline/                  # CI/CDパイプライン初期設定
│   │   ├── pipeline.yaml          # パイプライン基本テンプレート
│   │   ├── parameters/            # パイプライン用パラメータ
│   │   │   ├── dev-parameters.json
│   │   │   ├── stg-parameters.json
│   │   │   └── prod-parameters.json
│   │   └── SETUP.md               # セットアップ手順とコマンド例
│   │
│   ├── infrastructure/            # 基本インフラ構築
│   │   ├── network.yaml           # ネットワークリソース
│   │   ├── security.yaml          # セキュリティリソース
│   │   └── monitoring.yaml        # 監視リソース
│   │
│   ├── backend/                   # バックエンド関連リソース
│   │   ├── api.yaml               # API Gateway定義
│   │   ├── lambda.yaml            # Lambda関数定義
│   │   └── database.yaml          # データストア定義
│   │
│   ├── frontend/                  # フロントエンド関連リソース
│   │   ├── hosting.yaml           # S3+CloudFront設定
│   │   └── cdn.yaml               # CDN関連設定
│   │
│   ├── buildspecs/                # 各コンポーネント用ビルド仕様
│   │   ├── infra-buildspec.yml    # インフラ用
│   │   ├── backend-buildspec.yml  # バックエンド用
│   │   └── frontend-buildspec.yml # フロントエンド用
│   │
│   └── parameters/                # 環境別パラメータ(パイプライン以外)
│       ├── dev/                   # 開発環境
│       │   ├── infrastructure.json
│       │   ├── backend.json
│       │   └── frontend.json
│       ├── stg/                   # ステージング環境
│       │   ├── infrastructure.json
│       │   ├── backend.json
│       │   └── frontend.json
│       └── prod/                  # 本番環境
│           ├── infrastructure.json
│           ├── backend.json
│           └── frontend.json
│
└── terraform/                     # 将来的なTerraform用（現時点では空）
```

## 使用方法

### CI/CDパイプラインのセットアップ

パイプラインのセットアップ手順については、`cloudformation/pipeline/SETUP.md`を参照してください。

### インフラストラクチャのデプロイ

各コンポーネント（インフラ、バックエンド、フロントエンド）は、CI/CDパイプラインを通じて自動的にデプロイされます。パイプラインのセットアップ後は、GitHubへのコードプッシュが自動的にデプロイを開始します。

環境によって異なるデプロイ戦略：
- 開発環境(dev): プッシュごとに自動デプロイ
- ステージング環境(stg): 承認後デプロイ
- 本番環境(prod): 承認後デプロイ

## インフラ設計方針

1. **モジュール化**: 各リソースタイプごとに独立したテンプレートを作成
2. **環境分離**: 開発・ステージング・本番環境の完全分離
3. **パラメータ化**: 環境ごとの違いはパラメータで吸収
4. **最小権限**: IAMロールとポリシーは最小権限原則に基づいて設計
5. **自動化**: インフラ変更は原則としてCI/CDパイプラインを通じて適用
