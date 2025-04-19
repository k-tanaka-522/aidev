# aiDev - AI 開発支援エージェント

## プロジェクト概要

aiDevは、Chatbot UI と AWS Bedrock を連携し、ナレッジベースを活用した「対話型のAI開発支援窓口（プリセールスエージェント）」を構築するプロジェクトです。このシステムを通じて、ユーザーはAIと会話しながら開発の相談や、AWS環境の設計・構築・改善の支援を受けることができます。

## システム構成

```
🔼 Chatbot UI (フロントエンド)
   └️ ユーザーインターフェース（Web）
      ↓
📌 API Gateway
      ↓
💡 Lambda Functions
      - チャット処理
      - ナレッジベース連携
      ↓
📁 AWS Bedrock Agent + Knowledge Base
      - ヒアリング / 設計支援 / 提案生成
```

## ディレクトリ構成

```
/aiDev
├── docs/                   # プロジェクトドキュメント
│   ├── 00_ドキュメント構成ガイド.md # ドキュメント作成ガイドライン
│   ├── 01_計画/            # プロジェクト計画関連
│   │   └── 01_プラン.md    # プロジェクト計画
│   ├── 10_要件/            # 要件定義関連
│   │   ├── 11_ユーザーストーリー.md # ユーザーストーリー
│   │   ├── 12_機能要件.md  # 機能要件
│   │   ├── 13_非機能要件.md # 非機能要件
│   │   └── 14_制約条件.md  # 制約条件
│   ├── 20_設計/            # 設計関連ドキュメント
│   ├── 30_開発/            # 開発関連ドキュメント
│   ├── 40_テスト/          # テスト関連ドキュメント
│   ├── 50_運用/            # 運用・保守関連ドキュメント
│   └── 90_リファレンス/    # 参考資料・リファレンス
│
├── src/                    # ソースコード
│   ├── frontend/           # フロントエンドコード
│   │   └── chatbot-ui/     # Chatbot UI (オープンソースUI)
│   │
│   ├── backend/            # バックエンドコード
│   │   ├── lambda/         # AWS Lambda関数
│   │   │   └── chat_handler/ # チャット処理ハンドラー
│   │   └── api/            # API定義
│   │
│   ├── infra/              # インフラストラクチャコード
│   │   ├── terraform/      # Terraformコード
│   │   └── sam/            # AWS SAMテンプレート
│   │
│   └── infra-init/         # プロジェクト初期化・CI/CD環境構築
│
├── tests/                  # テストコード
└── deploy-scripts/         # 旧デプロイスクリプト（非推奨）
```

## セットアップ手順

### ローカル開発環境のセットアップ

1. **リポジトリのクローン**

```bash
git clone <repository-url>
cd aiDev
```

2. **フロントエンドのセットアップ**

```bash
cd src/frontend/chatbot-ui
npm install
cp .env.local.example .env.local
# .env.localファイルを編集して必要な値を設定
npm run dev
```

3. **バックエンドのローカルテスト**

AWS SAMを使用してローカルでLambda関数をテストします：

```bash
cd src/infra/sam
sam build
sam local start-api
```

## AWS環境へのデプロイ

### AWS CLIのセットアップ

```bash
aws configure
```

### 方法1: 改良されたPowerShellスクリプトを使用したデプロイ（推奨）

```powershell
# PowerShellから実行
cd C:\dev2\aiDev
.\deploy-scripts\deploy.ps1
```

このスクリプトは以下の機能を提供します：
- 既存のCloudFormationスタックの状態チェック
- ROLLBACK_COMPLETE状態のスタックを自動クリーンアップ
- 新規スタック作成または既存スタック更新の選択
- S3バケット経由のテンプレートアップロードと参照URL修正
- 詳細なエラーハンドリングとステータス表示

### 方法2: SAMを使用したデプロイ

```bash
cd src/infra/sam
sam build
sam deploy --guided
```

プロンプトに従って必要な情報を入力します。

## MVPの機能

現在のMVPでは以下の機能を提供しています：

- Chatbot UIを通じた対話型インターフェース
- AWS Bedrockを利用したAI応答生成
- シンプルなAPIによるフロントエンドとバックエンドの連携

## 開発フェーズ計画

aiDevプロジェクトは、以下の段階的なフェーズで開発を進めます：

### フェーズ1：プリセールス特化（3ヶ月）
- 質問応答機能の実装
- ナレッジベースの基本構築
- 簡易設計提案機能
- 判断基準：月間対話数100件達成、商談化率15%以上

### フェーズ2：実装支援機能追加（+3ヶ月）
- 環境構築自動化機能の本格実装
- より詳細な設計支援機能
- テンプレートライブラリの拡充
- 判断基準：自動化機能利用率30%以上、提案満足度4.0/5.0以上

### フェーズ3：持続的関係構築（+6ヶ月）
- 環境発行機能の実装
- 運用監視提案機能
- 最適化提案機能の追加
- 判断基準：リピート率70%以上、SES展開率20%以上

## 将来の拡張予定

- さらなるAWS Bedrock Agentの本格的な活用
- ナレッジベースの充実と専門知識の拡充
- ユーザーのAWS環境へのアクセスと自動構築機能の強化
- 複数エージェントの連携と特化型支援の高度化

## CI/CD環境のセットアップ

CI/CD環境を構築することで、継続的インテグレーションと継続的デリバリーを実現します。以下の手順でCI/CD環境をセットアップします。

### CI/CD環境構築スクリプトの実行

```bash
# スクリプトを実行して開発環境のCI/CD環境を構築
cd /mnt/c/dev2/aiDev
./src/infra-init/deploy-cicd.sh --environment dev

# または特定の環境を指定
./src/infra-init/deploy-cicd.sh --environment staging
./src/infra-init/deploy-cicd.sh --environment prod
```

スクリプトは以下のリソースを作成します：

1. **CodeCommitリポジトリ**
   - ソースコード管理用のプライベートGitリポジトリ
   - 環境ごとに異なるブランチ（dev, staging, prod）で管理

2. **CodeBuildプロジェクト**
   - フロントエンドビルド用プロジェクト
   - バックエンドビルド用プロジェクト
   - インフラストラクチャビルド用プロジェクト

3. **CodePipeline**
   - ソース、ビルド、デプロイのステージを含むパイプライン
   - CodeCommitリポジトリからの変更を自動的に検出して実行

### リポジトリのクローンと初期コミット

CI/CD環境をセットアップした後、CodeCommitリポジトリをクローンし、初期コミットを行います：

```bash
# リポジトリをクローン
git clone https://git-codecommit.ap-northeast-1.amazonaws.com/v1/repos/aiDev-dev-repository
cd aiDev-dev-repository

# 既存のコードをコピー
cp -r /mnt/c/dev2/aiDev/* .

# 初期コミットを作成
git add .
git commit -m "初期コミット: プロジェクト構造とCI/CD設定"

# devブランチにプッシュ
git checkout -b dev
git push origin dev
```

### CI/CDパイプラインの動作確認

コードをプッシュすると、自動的にパイプラインが起動します。AWS Management Consoleから進捗を確認できます：

1. CodePipelineコンソールにアクセス
2. パイプラインの実行状況を確認
3. 各ステージのログを確認し、問題があれば修正

## CI/CD環境を活用した開発ワークフロー

1. **フィーチャーブランチでの開発**
   - 新機能やバグ修正のための作業はフィーチャーブランチで行う
   - 開発が完了したらdevブランチにマージ

2. **環境ごとのデプロイ**
   - dev環境: 開発中の機能をテスト
   - staging環境: 結合テストやUAT
   - prod環境: 本番リリース

3. **継続的インテグレーション**
   - 自動ビルドとテストにより、問題を早期に発見
   - コードの品質を維持

4. **継続的デリバリー**
   - 自動デプロイにより、環境間の一貫性を確保
   - リリースサイクルの短縮

