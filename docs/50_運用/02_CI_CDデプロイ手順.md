# CI/CDデプロイ手順

## 概要

aiDevプロジェクトでは、AWS CodeCommitリポジトリとAWS CodePipelineを使用した継続的インテグレーション/継続的デプロイ（CI/CD）を採用しています。このドキュメントでは、CI/CD環境のセットアップ方法とコードの変更をデプロイする手順について説明します。

## 前提条件

- AWS CLIがインストールされていること
- 適切なAWS IAM権限が設定されていること
- Gitがインストールされていること

## 1. CI/CD環境のセットアップ

### 1.1 CI/CD用のAWSリソースを作成

以下のスクリプトを実行して、CI/CD環境に必要なAWSリソース（CodeCommitリポジトリ、CodeBuildプロジェクト、CodePipelineなど）を作成します：

```bash
cd /mnt/c/dev2/aiDev
./deploy-scripts/deploy-cicd.sh -e dev -r ap-northeast-1
```

スクリプト実行後、以下のリソースが作成されます：
- CodeCommitリポジトリ: `aiDev-dev-repository`
- S3アーティファクトバケット
- CodeBuildプロジェクト（フロントエンド、バックエンド、インフラ用）
- CodePipeline

### 1.2 CodeCommitリポジトリの認証設定

AWS CodeCommitへのアクセス権を設定します：

```bash
# IAMユーザー用のGit認証情報を作成
aws iam create-service-specific-credential \
  --user-name <IAMユーザー名> \
  --service-name codecommit.amazonaws.com

# 出力されたユーザー名とパスワードをメモしておく

# Git認証情報ヘルパーを設定
git config --global credential.helper '!aws codecommit credential-helper $@'
git config --global credential.UseHttpPath true
```

## 2. ソースコードのCodeCommitリポジトリへの初期設定

### 2.1 srcディレクトリをGitリポジトリとして設定

```bash
# srcディレクトリに移動
cd /mnt/c/dev2/aiDev/src

# Gitリポジトリとして初期化
git init

# CodeCommitリポジトリをリモートとして追加
git remote add origin https://git-codecommit.ap-northeast-1.amazonaws.com/v1/repos/aiDev-dev-repository

# 全ファイルをステージング
git add .

# 初期コミット
git commit -m "Initial commit"

# devブランチを作成して切り替え
git checkout -b dev

# リモートにプッシュ
git push -u origin dev
```

この操作により、`src`ディレクトリの内容がCodeCommitリポジトリの`dev`ブランチにプッシュされます。

## 3. コード変更のデプロイ方法

開発環境へのデプロイは、CodeCommitリポジトリの`dev`ブランチへのプッシュによって自動的に行われます。

### 3.1 コード変更のプッシュ

```bash
# srcディレクトリに移動
cd /mnt/c/dev2/aiDev/src

# 変更をステージング
git add .

# コミット
git commit -m "変更内容の説明"

# devブランチにプッシュ
git push origin dev
```

### 3.2 デプロイの確認

1. AWS Management Consoleにログイン
2. CodePipelineのコンソールに移動（リージョン: ap-northeast-1）
3. `aiDev-dev-pipeline`を選択
4. パイプラインの進行状況を確認

パイプラインの各ステージが正常に完了すると、変更が開発環境にデプロイされます。

## 4. トラブルシューティング

### 4.1 認証エラー

認証エラーが発生した場合は、以下を確認してください：
- IAM認証情報が正しく設定されているか
- Git認証情報ヘルパーが正しく設定されているか

### 4.2 ビルドエラー

ビルドエラーが発生した場合は、CodeBuildのログで詳細を確認してください：
1. CodeBuildコンソールに移動
2. 該当するビルドプロジェクトを選択
3. 最新のビルド履歴を選択
4. 「ビルドログ」タブでエラーメッセージを確認

### 4.3 デプロイエラー

デプロイエラーが発生した場合は、CloudFormationのイベントログで詳細を確認してください。

## 5. プロジェクト構造について

現在のデプロイパイプラインは以下のディレクトリ構造を前提としています：

```
/src
├── frontend/       # フロントエンドコード
│   └── chatbot-ui/ # React/Next.jsアプリケーション
├── lambda/         # バックエンドコード（Lambda関数）
│   ├── auth/
│   ├── auth_handler/
│   └── chat_handler/
└── infra/          # インフラコード
    ├── auth/
    └── sam/        # AWS SAMテンプレート
```

各ディレクトリには`buildspec.yml`ファイルが配置されており、CodeBuildプロジェクトの設定が定義されています。

## 6. 注意事項

- 現在は開発環境（dev）のみの構成となっています
- GitHubリポジトリとCodeCommitリポジトリは別々に管理されています
- プロジェクト全体は引き続きGitHubで管理し、デプロイ対象のコードのみをCodeCommitで管理する形になっています
