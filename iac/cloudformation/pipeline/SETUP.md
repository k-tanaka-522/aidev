# CI/CDパイプライン セットアップ手順

このドキュメントでは、aiDevプロジェクト用のCI/CDパイプラインをAWS CodePipelineとCloudFormationを使用してセットアップする手順を説明します。

## 前提条件

- AWS CLIがインストールされており、適切に設定されていること
- 必要なAWS権限を持つIAMユーザーまたはロールがあること
- GitHubリポジトリへのアクセス権があること

## 1. CloudFormationスタックのデプロイ

まず、CloudFormationスタックをデプロイして、CI/CDパイプラインの基本構造をセットアップします。

```bash
# 開発環境パイプラインのデプロイ（例）
aws cloudformation deploy \
    --stack-name dev-aidev-pipeline \
    --template-file pipeline.yaml \
    --parameter-overrides file://parameters/dev-parameters.json \
    --capabilities CAPABILITY_NAMED_IAM \
    --region ap-northeast-1
```

他の環境（stg/prod）にもデプロイする場合は、上記コマンドの`stack-name`と`parameter-overrides`を適宜変更します。

## 2. CodeStar Connections の認証と有効化

スタックが作成されたら、GitHubへの接続を手動で認証する必要があります。

1. AWS Management ConsoleにログインしてDeveloper Tools > Settings > Connectionsに移動します
2. CloudFormationスタックで作成された接続（例: `dev-aidev-github-connection`）を選択します
3. 「保留中の接続」ステータスの接続で「保留中の接続を更新」ボタンをクリックします
4. GitHubアカウントにログインするよう求められるので、認証を完了します
5. 接続したいGitHubアカウント/組織を選択して接続を承認します
6. 接続のステータスが「利用可能」に変わることを確認します

## 3. パラメータファイルの確認と調整

デプロイ前にパラメータファイル（`parameters/dev-parameters.json`など）を開き、以下の項目を確認・調整します：

- `GitHubOwner`: GitHubリポジトリのオーナー名
- `GitHubRepo`: リポジトリ名
- `GitHubBranch`: 監視するブランチ（dev環境ならdevelop、stg環境ならrelease、prod環境ならmainなど）
- `ApprovalRequired`: デプロイ前に手動承認が必要かどうか（"true"または"false"）

## 4. デプロイ結果の確認

```bash
# スタック出力の確認
aws cloudformation describe-stacks \
    --stack-name dev-aidev-pipeline \
    --query "Stacks[0].Outputs" \
    --region ap-northeast-1
```

ここで、`GitHubConnectionArn`の値を確認します。この接続は「保留中」状態で作成されるため、次のステップで手動で承認する必要があります。

## 5. パイプラインの動作確認

1. GitHub接続が「利用可能」ステータスになっていることを確認
2. AWS Management ConsoleにログインしてCodePipelineサービスに移動
3. デプロイしたパイプラインを選択して状態を確認
4. GitHubリポジトリに小さな変更を加えてプッシュし、パイプラインが自動的に開始されることを確認

## トラブルシューティング

### GitHubへの接続に問題がある

- AWS Management ConsoleでCodeStar Connectionsの状態を確認
- 接続が「保留中」の場合は、接続を更新して認証フローを完了させる
- 接続が「エラー」状態の場合は、接続を削除して再作成してみる
- CloudTrailログでCodeStarへの接続に関するエラーを確認

### パイプラインがトリガーされない

- GitHub接続が「利用可能」ステータスになっているか確認
- リポジトリ名とブランチが正しく設定されているか確認
- CloudWatchログでエラーメッセージを確認

### ビルドエラー

- CodeBuildプロジェクトのログを確認
- buildspec.ymlファイルの内容を確認
- 必要な依存関係がインストールされているか確認

### デプロイエラー

- CloudFormationのイベントログでエラーを確認
- IAMロールに必要な権限があるか確認
- テンプレート構文に問題がないか確認
