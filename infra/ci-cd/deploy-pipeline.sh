#!/bin/bash

# CI/CDパイプラインデプロイスクリプト
# 使用法: ./deploy-pipeline.sh [環境名] [リージョン]
# 例: ./deploy-pipeline.sh dev ap-northeast-1

set -e

# 引数チェック
ENV=${1:-dev}
REGION=${2:-ap-northeast-1}
STACK_NAME="${ENV}-aidev-cicd-pipeline"

echo "CI/CDパイプラインのデプロイを開始します..."
echo "環境: $ENV"
echo "リージョン: $REGION"
echo "スタック名: $STACK_NAME"

# パラメータファイルの存在確認
PARAMS_FILE="parameters/${ENV}-parameters.json"
if [ ! -f "$PARAMS_FILE" ]; then
    echo "エラー: パラメータファイル $PARAMS_FILE が見つかりません"
    exit 1
fi

# GitHubトークンの確認
TOKEN_SECRET_NAME=$(grep -o '"GitHubTokenSecretName".*".*"' $PARAMS_FILE | cut -d '"' -f 4)
echo "GitHubトークンシークレット名: $TOKEN_SECRET_NAME"

# シークレットの存在を確認
SECRET_EXISTS=$(aws secretsmanager list-secrets --region $REGION --query "SecretList[?Name=='$TOKEN_SECRET_NAME'].Name" --output text)
if [ -z "$SECRET_EXISTS" ]; then
    echo "警告: シークレット $TOKEN_SECRET_NAME が存在しません。シークレットを作成します。"
    echo "GitHub個人アクセストークンを入力してください:"
    read -s GITHUB_TOKEN
    
    # シークレットを作成
    aws secretsmanager create-secret \
        --name $TOKEN_SECRET_NAME \
        --description "GitHub OAuth Token for aiDev CI/CD Pipeline" \
        --secret-string "{\"token\":\"$GITHUB_TOKEN\"}" \
        --region $REGION
    
    echo "シークレット $TOKEN_SECRET_NAME を作成しました。"
fi

# CloudFormationスタックをデプロイ
echo "CloudFormationスタックをデプロイしています..."
aws cloudformation deploy \
    --stack-name $STACK_NAME \
    --template-file pipeline.yaml \
    --parameter-overrides file://$PARAMS_FILE \
    --capabilities CAPABILITY_NAMED_IAM \
    --region $REGION

# スタックの出力を取得
echo "デプロイが完了しました。スタック出力を表示します:"
aws cloudformation describe-stacks \
    --stack-name $STACK_NAME \
    --query "Stacks[0].Outputs" \
    --region $REGION

echo "CI/CDパイプラインのセットアップが完了しました。"