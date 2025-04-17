#!/bin/bash
# aiDev フロントエンドのビルドとデプロイスクリプト

# 実行ディレクトリの確認
if [ ! -f "package.json" ]; then
  echo "Error: package.jsonが見つかりません。"
  echo "このスクリプトはfrontend/chatbot-uiディレクトリで実行してください。"
  exit 1
fi

# 環境変数の設定
echo "REACT_APP_API_ENDPOINT=https://ykwncsow4g.execute-api.ap-northeast-1.amazonaws.com/dev" > .env.production

# 依存関係のインストール
echo "依存関係をインストールします..."
npm install

# プロダクションビルドの作成
echo "プロダクションビルドを作成します..."
npm run build

# deploy-info.jsonからバケット名を取得
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
BUCKET_NAME="aidev-dev-frontend-${ACCOUNT_ID}"

# S3へのアップロード
echo "ビルド成果物をS3バケット ${BUCKET_NAME} にアップロードします..."
aws s3 sync build/ s3://${BUCKET_NAME}/ --delete

# CloudFrontのキャッシュ無効化
DISTRIBUTION_ID=$(aws cloudfront list-distributions --query "DistributionList.Items[?contains(Aliases.Items, 'aidev')].Id" --output text)
if [ -n "$DISTRIBUTION_ID" ]; then
  echo "CloudFrontキャッシュを無効化します..."
  aws cloudfront create-invalidation --distribution-id ${DISTRIBUTION_ID} --paths "/*"
fi

echo "デプロイが完了しました。"
echo "フロントエンドは https://d3nbe0w9axb9qt.cloudfront.net でアクセスできます。"
