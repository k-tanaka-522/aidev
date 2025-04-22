# CI/CDデプロイ手順

## 概要

aiDevプロジェクトでは、GitHubリポジトリとAWS CodePipelineを使用した継続的インテグレーション/継続的デプロイ（CI/CD）を採用しています。このドキュメントでは、CI/CD環境のセットアップ方法とコードの変更をデプロイする手順について説明します。

## 前提条件

- AWS CLIがインストールされていること
- 適切なAWS IAM権限が設定されていること
- GitHubアカウントとaidevリポジトリへのアクセス権があること
- Gitがインストールされていること

## 1. CI/CD環境のセットアップ（GitHub連携）

### 1.1 CI/CD用のAWSリソースを作成

以下のスクリプトを実行して、CI/CD環境に必要なAWSリソース（GitHub接続、CodeBuildプロジェクト、CodePipelineなど）を作成します：

```bash
cd /mnt/c/dev2/aiDev
./src/infra-init/deploy-cicd.sh -e dev -r ap-northeast-1 -o k-tanaka-522 -g aidev -b main -c E2ABCDE12FGHI3
```

パラメータの説明:
- `-e dev`: 環境名（dev, staging, prod）
- `-r ap-northeast-1`: AWSリージョン
- `-o k-tanaka-522`: GitHub所有者（ユーザー名または組織名）
- `-g aidev`: GitHubリポジトリ名
- `-b main`: デプロイするGitHubブランチ名
- `-c E2ABCDE12FGHI3`: CloudFrontディストリビューションID（フロントエンドデプロイ後にキャッシュ無効化を行う場合）

スクリプト実行後、以下のリソースが作成されます：
- GitHub接続: `aiDev-dev-github-connection`
- S3アーティファクトバケット
- CodeBuildプロジェクト（フロントエンド、バックエンド、インフラ用）
- CodePipeline

### 1.2 GitHub接続の承認設定

AWS CodeStarConnectionsを通じてGitHubへの接続を承認します：

1. スクリプト実行後、出力される「GitHub接続ARN」と「GitHub接続ステータス」を確認
2. AWS Management Consoleにログイン
3. 日本語表示の場合: 「CodePipeline」に移動し、左側メニューから「設定」を選択して「接続」タブを確認
   英語表示の場合: 「Developer Tools」>「Settings」>「Connections」に移動
4. 作成された接続（名前: `aiDev-dev-github-connection`）を選択
5. 「保留中」/「Pending」状態の接続に対して「保留中の接続を更新」/「Update pending connection」ボタンをクリック
6. 表示されるダイアログでGitHubアカウントにログインし、接続を承認
7. 接続ステータスが「利用可能」/「Available」になったことを確認

## 2. GitHub連携の確認

### 2.1 GitHub接続の確認

GitHub接続が正しく設定されていることを確認します：

1. AWS Management Consoleで以下のいずれかの方法で接続設定画面に移動
   - 日本語表示の場合: 「CodePipeline」に移動し、左側メニューから「設定」を選択して「接続」タブを確認
   - 英語表示の場合: 「Developer Tools」>「Settings」>「Connections」に移動
2. `aiDev-dev-github-connection`の状態が「利用可能」/「Available」になっていることを確認

### 2.2 GitHubリポジトリの準備

GitHubリポジトリが必要なファイル構造を持っていることを確認します：

```bash
# ローカルリポジトリでの確認
cd /mnt/c/dev2/aiDev

# 必要なディレクトリ構造の確認
ls -la src/frontend src/backend src/infra

# 各ディレクトリにbuildspec.ymlファイルがあることを確認
ls -la src/frontend/buildspec.yml src/backend/buildspec.yml src/infra/buildspec.yml
```

## 3. コード変更のデプロイ方法

開発環境へのデプロイは、GitHubリポジトリの指定されたブランチ（例：`main`）へのプッシュによって自動的に行われます。

### 3.1 コード変更のプッシュ

```bash
# リポジトリディレクトリに移動
cd /mnt/c/dev2/aiDev

# 変更をステージング
git add .

# コミット
git commit -m "変更内容の説明"

# mainブランチにプッシュ
git push origin main
```

### 3.2 デプロイの確認

1. AWS Management Consoleにログイン
2. CodePipelineのコンソールに移動（リージョン: ap-northeast-1）
3. `aiDev-dev-pipeline`を選択
4. パイプラインの進行状況を確認

パイプラインの各ステージが正常に完了すると、変更が開発環境にデプロイされます。

## 4. トラブルシューティング

### 4.1 GitHub接続の問題

GitHub接続に問題がある場合は、以下を確認してください：
- CodeStarConnectionsの接続状態が「利用可能」/「Available」になっているか
- GitHubアカウントでaidevリポジトリへのアクセス権があるか
- GitHubリポジトリの指定したブランチ（例：main）が存在するか

接続問題を解決するには：
1. AWS管理コンソールで接続を削除し、スクリプトを再実行
2. 新しく作成された接続を承認する
3. GitHubアカウント設定でAWSの接続アプリケーションを確認する（Settings > Applications > Authorized OAuth Apps）

### 4.2 ビルドエラー

ビルドエラーが発生した場合は、CodeBuildのログで詳細を確認してください：
1. CodeBuildコンソールに移動
2. 該当するビルドプロジェクトを選択
3. 最新のビルド履歴を選択
4. 「ビルドログ」タブでエラーメッセージを確認

一般的なビルドエラーの解決策：
- buildspec.ymlファイルが正しい場所に配置されているか確認
- 必要な依存関係がインストールされているか確認
- 権限関連のエラーはIAMロールの設定を確認

#### 4.2.1 パス指定の問題（ディレクトリパスの重複）

次のようなエラーが発生した場合、buildspec.ymlファイルのパス指定に問題がある可能性があります：
- `stat /codebuild/output/src*/src/src/xxx/buildspec.yml: no such file or directory`（パスの重複）
- `npm run build` 実行エラー - 指定したディレクトリが存在しない
- `Unable to upload artifact ... referenced by ...` - テンプレートの参照ファイルが存在しない

**解決策：**
1. buildspec.ymlファイル内のパス指定を修正する：
   - フロントエンド（/src/frontend/buildspec.yml）：
     - `cd frontend/chatbot-ui` → `cd chatbot-ui`
     - `base-directory: frontend/chatbot-ui/build` → `base-directory: chatbot-ui/build`
   - バックエンド（/src/backend/buildspec.yml）：
     - `cd backend/lambda` → `cd lambda`
     - `base-directory: backend/lambda/dist` → `base-directory: lambda/dist`
   - インフラ（/src/infra/buildspec.yml）：
     - `cd infra/sam` → `cd sam`
     - `base-directory: infra/sam/output` → `base-directory: sam/output`

2. 各ディレクトリ構造が存在することを確認：
   - /src/frontend/chatbot-ui/
   - /src/backend/lambda/
   - /src/infra/sam/

3. 修正後、GitHubリポジトリに変更をプッシュしてパイプラインを再実行

### 4.3 デプロイエラー

デプロイエラーが発生した場合は、以下を確認してください：
1. CloudFormationのイベントログでデプロイエラーの詳細を確認
2. S3バケットの権限設定が正しいか確認
3. デプロイ先のリソースに対する適切なIAM権限があるか確認

## 5. プロジェクト構造について

現在のデプロイパイプラインは以下のディレクトリ構造を前提としています：

```
/src
├── frontend/       # フロントエンドコード
│   └── chatbot-ui/ # React/Next.jsアプリケーション
│   └── buildspec.yml # フロントエンドビルド設定
├── backend/        # バックエンドコード（Lambda関数）
│   ├── lambda/     # Lambda関数群
│   └── buildspec.yml # バックエンドビルド設定
└── infra/          # インフラコード
    ├── sam/        # AWS SAMテンプレート
    └── buildspec.yml # インフラビルド設定
```

各ディレクトリには`buildspec.yml`ファイルが配置されており、CodeBuildプロジェクトの設定が定義されています。

## 6. CloudFront無効化について

CI/CDパイプラインには、フロントエンドデプロイ後にCloudFrontのキャッシュを自動的に無効化する機能が組み込まれています。この機能は、静的アセットの更新がユーザーに即時反映されるようにするために重要です。

### 6.1 CloudFront無効化機能のしくみ

1. フロントエンドのデプロイが完了すると、パイプラインは自動的にLambda関数を呼び出します
2. Lambda関数は指定されたCloudFrontディストリビューションに対して無効化リクエストを作成します
3. 無効化パスは「/*」が設定されており、すべてのキャッシュが無効化されます

### 6.2 CloudFront無効化機能の設定

CloudFront無効化機能を有効にするには、CI/CD環境のセットアップ時に`-c`オプションでCloudFrontディストリビューションIDを指定します:

```bash
./src/infra-init/deploy-cicd.sh -e dev ... -c E2ABCDE12FGHI3
```

CloudFrontディストリビューションIDは、AWS CloudFrontコンソールまたは以下のAWS CLIコマンドで確認できます:

```bash
aws cloudfront list-distributions --query "DistributionList.Items[*].{Id:Id,DomainName:DomainName,Enabled:Enabled}" --output table
```

### 6.3 CloudFront無効化のトラブルシューティング

無効化ステップが正常に動作しない場合は、以下を確認してください:
- Lambda関数のログをCloudWatchで確認（関数名: `aiDev-${環境名}-cf-invalidation`）
- IAMロールに`cloudfront:CreateInvalidation`権限があることを確認
- CloudFrontディストリビューションIDが正しいことを確認

## 7. 注意事項と運用上の考慮点

- GitHub接続は初回設定時のみ手動承認が必要です
- フロントエンド、バックエンド、インフラのビルドはパイプライン内で並行して実行されます
- 環境変数やシークレットは、CodeBuildプロジェクトの環境変数またはAWS Systems Managerのパラメータストアで管理することを推奨します
- ブランチ保護ルールをGitHubリポジトリに設定することで、コードレビューを経た変更のみがデプロイされるよう制御できます
- 本番環境へのデプロイには、追加の承認ステップを設けることを検討してください
- CloudFrontキャッシュ無効化機能をデプロイすることで、フロントエンド更新がユーザーに即時反映されます

