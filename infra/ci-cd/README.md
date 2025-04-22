# aiDev CI/CDパイプライン

このディレクトリには、aiDevプロジェクトのCI/CDパイプラインに関連するインフラストラクチャコードとツールが含まれています。

## 構成

- `pipeline.yaml`: CI/CDパイプラインのCloudFormationテンプレート
- `buildspec.yml`: CodeBuild用のビルド仕様ファイル
- `parameters/`: 環境別のパラメータファイル
  - `dev-parameters.json`: 開発環境用パラメータ
  - `stg-parameters.json`: ステージング環境用パラメータ
  - `prod-parameters.json`: 本番環境用パラメータ
- `deploy-pipeline.sh`: パイプラインデプロイスクリプト

## デプロイ手順

### 前提条件

- AWS CLIがインストールされていること
- 適切なAWS認証情報が設定されていること
- AWS SecretsManagerにGitHubトークンを保存するための権限があること

### CI/CDパイプラインのデプロイ

1. ターミナルを開き、このディレクトリに移動します：

```bash
cd /mnt/c/dev2/aiDev/infra/ci-cd
```

2. デプロイスクリプトを実行します：

```bash
./deploy-pipeline.sh [環境名] [リージョン]
```

例：
```bash
./deploy-pipeline.sh dev ap-northeast-1
```

環境名には `dev`、`stg`、`prod` のいずれかを指定してください。リージョンは省略するとデフォルトで `ap-northeast-1` が使用されます。

3. 初回実行時は、GitHubアクセストークンの入力を求められます。
   - [GitHub Personal Access Token](https://github.com/settings/tokens) を生成し、リポジトリへのアクセス権限を付与してください。
   - トークンはAWS SecretsManagerに安全に保存されます。

4. デプロイが完了すると、AWS Management Consoleからパイプラインの状態を確認できます。
   
## パイプラインのカスタマイズ

### buildspec.ymlファイルの調整

CodeBuildプロジェクトの動作をカスタマイズするには、`buildspec.yml`を編集します。以下のフェーズで処理を定義できます：

- `install`: 依存関係のインストール
- `pre_build`: テストとコードの検証
- `build`: アプリケーションのビルドとパッケージング
- `post_build`: 後処理とアーティファクトの準備

### 環境別の設定

各環境のパイプライン構成を調整するには、`parameters/` ディレクトリ内の対応するパラメータファイルを編集します。

## トラブルシューティング

### 一般的な問題

1. **GitHubと接続できない場合**:
   - GitHubトークンが有効か確認してください
   - トークンに適切な権限（repo）が付与されているか確認してください

2. **ビルドエラー**:
   - CloudWatchログでエラーメッセージを確認してください
   - buildspec.ymlファイルが適切に設定されているか確認してください

3. **デプロイエラー**:
   - CloudFormationイベントログでエラーの詳細を確認してください
   - IAMロールに必要な権限があるか確認してください

### パイプラインのクリーンアップ

パイプラインを削除するには、以下のコマンドを実行します：

```bash
aws cloudformation delete-stack --stack-name [環境名]-aidev-cicd-pipeline --region [リージョン]
```

注: アーティファクトS3バケットには内容が残っている場合があります。手動で空にしてから削除する必要があります。