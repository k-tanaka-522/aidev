# aiDev インフラ初期化スクリプト

このディレクトリには、aiDevプロジェクトのインフラストラクチャ（AWS環境）を初期化するためのスクリプトとテンプレートが含まれています。

## 構成

```
/infra-init/
├── common/                 # 共通ヘルパースクリプト
│   └── param-loader.sh     # パラメーターファイル読み込みヘルパー
├── parameters/             # 環境ごとのパラメーター定義
│   ├── common.yml          # 共通パラメーター
│   ├── dev.yml             # 開発環境パラメーター
│   ├── staging.yml         # ステージング環境パラメーター
│   └── prod.yml            # 本番環境パラメーター
├── ci-cd-resources.yml     # CI/CD基本リソース（CloudFormation）
├── codebuild-projects.yml  # CodeBuildプロジェクト定義（CloudFormation）
├── codepipeline.yml        # CodePipeline定義（CloudFormation）
├── deploy-cicd.sh          # CI/CD環境構築スクリプト（従来版）
└── deploy-cicd-new.sh      # CI/CD環境構築スクリプト（パラメーター化版）
```

## CI/CD環境のセットアップ

### 1. 基本的な使用方法

パラメーター化版スクリプトを使用して、CI/CD環境をセットアップします：

```bash
# 開発環境の場合
./deploy-cicd-new.sh -e dev

# ステージング環境の場合
./deploy-cicd-new.sh -e staging

# 本番環境の場合
./deploy-cicd-new.sh -e prod
```

### 2. 対話モードでの実行

変数を対話的に確認・編集しながらセットアップする場合：

```bash
./deploy-cicd-new.sh -e dev -i
```

### 3. パラメーターのみ表示

設定されるパラメーターのみを確認したい場合：

```bash
./deploy-cicd-new.sh -e dev --show-params
```

## パラメーターのカスタマイズ

環境ごとのパラメーターは `parameters/` ディレクトリ内のYAMLファイルで定義されています。

- 共通パラメーター: `parameters/common.yml`
- 環境固有パラメーター: `parameters/{dev|staging|prod}.yml`

必要に応じてこれらのファイルを編集することで、環境ごとの設定をカスタマイズできます。

## 前提条件

スクリプトを実行する前に、以下のツールがインストールされていることを確認してください：

- AWS CLI
- jq（JSONパーサー）
- yq（YAMLパーサー）

```bash
# jqとyqのインストール例（Ubuntuの場合）
sudo apt-get update
sudo apt-get install -y jq
sudo wget -qO /usr/local/bin/yq https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64
sudo chmod +x /usr/local/bin/yq
```

## 注意事項

- GitHub接続は初回セットアップ時に手動承認が必要です（スクリプト実行後に表示される手順に従ってください）
- デプロイには適切なAWS IAM権限が必要です
- 既存のスタックがある場合は更新、ない場合は新規作成されます
