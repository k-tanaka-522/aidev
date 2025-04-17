#!/bin/bash

# aiDev CI/CD 環境構築スクリプト
# このスクリプトはaiDevプロジェクトのCI/CD環境を構築します。

set -e  # エラーがあれば中断

# デフォルト値
ENV="dev"
REGION=$(aws configure get region)
STACK_NAME="aidev-cicd-resources"
TEMPLATE_DIR="$(dirname "$(readlink -f "$0")")"

# ヘルプ関数
function show_help {
    echo "aiDev CI/CD環境構築スクリプト"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -h, --help               このヘルプを表示"
    echo "  -e, --environment ENV    環境名を指定 (dev, staging, prod) [デフォルト: dev]"
    echo "  -r, --region REGION      AWSリージョンを指定 [デフォルト: AWSプロファイルから取得]"
    echo "  -s, --stack-name NAME    CloudFormationスタック名 [デフォルト: aidev-cicd-resources]"
    echo ""
    exit 0
}

# コマンドライン引数の解析
while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        -h|--help)
            show_help
            ;;
        -e|--environment)
            ENV="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -s|--stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        *)
            echo "未知のオプション: $1"
            show_help
            ;;
    esac
done

# 環境名の検証
if [[ ! "$ENV" =~ ^(dev|staging|prod)$ ]]; then
    echo "エラー: 環境名は dev, staging, prod のいずれかである必要があります。"
    exit 1
fi

echo "========== aiDev CI/CD環境セットアップ =========="
echo "環境: $ENV"
echo "リージョン: $REGION"
echo "スタック名: $STACK_NAME"
echo "テンプレートディレクトリ: $TEMPLATE_DIR"
echo "=============================================="

# 確認
read -p "上記の設定で続行しますか？ (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "セットアップを中断します。"
    exit 1
fi

# スタックが既に存在するか確認
STACK_EXISTS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION 2>/dev/null || echo "STACK_NOT_EXIST")

if [[ "$STACK_EXISTS" == "STACK_NOT_EXIST" ]]; then
    echo "新しいスタック '$STACK_NAME' を作成します..."
    STACK_ACTION="create-stack"
else
    echo "既存のスタック '$STACK_NAME' を更新します..."
    STACK_ACTION="update-stack"
fi

# テンプレートのS3へのアップロード用バケットを作成または確認
TEMPLATE_BUCKET="aidev-cfn-templates-$REGION-$ENV"
BUCKET_EXISTS=$(aws s3api head-bucket --bucket $TEMPLATE_BUCKET 2>&1 || echo "BUCKET_NOT_EXIST")

if [[ "$BUCKET_EXISTS" == *"BUCKET_NOT_EXIST"* ]]; then
    echo "テンプレート用バケット '$TEMPLATE_BUCKET' を作成します..."
    aws s3 mb s3://$TEMPLATE_BUCKET --region $REGION
else
    echo "テンプレート用バケット '$TEMPLATE_BUCKET' が確認されました"
fi

# 中間テンプレートのアップロード
echo "テンプレートをS3にアップロードしています..."
aws s3 cp $TEMPLATE_DIR/ci-cd-resources.yml s3://$TEMPLATE_BUCKET/ci-cd-resources.yml
aws s3 cp $TEMPLATE_DIR/codebuild-projects.yml s3://$TEMPLATE_BUCKET/codebuild-projects.yml
aws s3 cp $TEMPLATE_DIR/codepipeline.yml s3://$TEMPLATE_BUCKET/codepipeline.yml

# CI/CDリソースのスタックを作成または更新
echo "基本CI/CDリソースをデプロイしています..."
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

aws cloudformation $STACK_ACTION \
    --stack-name $STACK_NAME \
    --template-url https://$TEMPLATE_BUCKET.s3.$REGION.amazonaws.com/ci-cd-resources.yml \
    --parameters ParameterKey=EnvironmentName,ParameterValue=$ENV \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --region $REGION

echo "CloudFormationスタックのデプロイを待機中..."
aws cloudformation wait stack-$([[ "$STACK_ACTION" == "create-stack" ]] && echo "create" || echo "update")-complete \
    --stack-name $STACK_NAME \
    --region $REGION

# スタックの出力を取得
echo "スタックの出力を取得中..."
OUTPUTS=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query "Stacks[0].Outputs" --output json)

# スタック出力から必要な値を取得
CODECOMMIT_REPO_NAME=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="CodeCommitRepositoryName") | .OutputValue')
CODECOMMIT_REPO_HTTP=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="CodeCommitRepositoryCloneUrlHttp") | .OutputValue')
ARTIFACT_BUCKET=$(echo $OUTPUTS | jq -r '.[] | select(.OutputKey=="ArtifactBucketName") | .OutputValue')
CODEBUILD_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query "Stacks[0].Outputs[?OutputKey=='CodeBuildServiceRoleArn'].OutputValue" --output text)
CODEPIPELINE_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --region $REGION --query "Stacks[0].Outputs[?OutputKey=='CodePipelineServiceRoleArn'].OutputValue" --output text)

echo "CodeCommitリポジトリ: $CODECOMMIT_REPO_NAME"
echo "アーティファクトバケット: $ARTIFACT_BUCKET"
echo "CodeBuild IAM Role ARN: $CODEBUILD_ROLE_ARN"
echo "CodePipeline IAM Role ARN: $CODEPIPELINE_ROLE_ARN"

# CodeBuildプロジェクトのスタックを作成または更新
echo "CodeBuildプロジェクトをデプロイしています..."
CODEBUILD_STACK_NAME="$STACK_NAME-codebuild"

aws cloudformation $([[ $(aws cloudformation describe-stacks --stack-name $CODEBUILD_STACK_NAME --region $REGION 2>/dev/null && echo "update-stack" || echo "create-stack") ]]) \
    --stack-name $CODEBUILD_STACK_NAME \
    --template-url https://$TEMPLATE_BUCKET.s3.$REGION.amazonaws.com/codebuild-projects.yml \
    --parameters \
        ParameterKey=EnvironmentName,ParameterValue=$ENV \
        ParameterKey=CodeBuildServiceRoleArn,ParameterValue=$CODEBUILD_ROLE_ARN \
        ParameterKey=CodeCommitRepositoryName,ParameterValue=$CODECOMMIT_REPO_NAME \
        ParameterKey=ArtifactBucketName,ParameterValue=$ARTIFACT_BUCKET \
    --region $REGION

echo "CodeBuildスタックのデプロイを待機中..."
aws cloudformation wait stack-$([[ $(aws cloudformation describe-stacks --stack-name $CODEBUILD_STACK_NAME --region $REGION 2>/dev/null) ]] && echo "update" || echo "create")-complete \
    --stack-name $CODEBUILD_STACK_NAME \
    --region $REGION

# CodeBuildスタックの出力を取得
CODEBUILD_OUTPUTS=$(aws cloudformation describe-stacks --stack-name $CODEBUILD_STACK_NAME --region $REGION --query "Stacks[0].Outputs" --output json)

# CodeBuild出力から必要な値を取得
FRONTEND_BUILD_PROJECT=$(echo $CODEBUILD_OUTPUTS | jq -r '.[] | select(.OutputKey=="FrontendBuildProjectName") | .OutputValue')
BACKEND_BUILD_PROJECT=$(echo $CODEBUILD_OUTPUTS | jq -r '.[] | select(.OutputKey=="BackendBuildProjectName") | .OutputValue')
INFRA_BUILD_PROJECT=$(echo $CODEBUILD_OUTPUTS | jq -r '.[] | select(.OutputKey=="InfrastructureBuildProjectName") | .OutputValue')

echo "フロントエンドビルドプロジェクト: $FRONTEND_BUILD_PROJECT"
echo "バックエンドビルドプロジェクト: $BACKEND_BUILD_PROJECT"
echo "インフラビルドプロジェクト: $INFRA_BUILD_PROJECT"

# CodePipelineスタックを作成または更新
echo "CodePipelineをデプロイしています..."
CODEPIPELINE_STACK_NAME="$STACK_NAME-codepipeline"

aws cloudformation $([[ $(aws cloudformation describe-stacks --stack-name $CODEPIPELINE_STACK_NAME --region $REGION 2>/dev/null && echo "update-stack" || echo "create-stack") ]]) \
    --stack-name $CODEPIPELINE_STACK_NAME \
    --template-url https://$TEMPLATE_BUCKET.s3.$REGION.amazonaws.com/codepipeline.yml \
    --parameters \
        ParameterKey=EnvironmentName,ParameterValue=$ENV \
        ParameterKey=CodePipelineServiceRoleArn,ParameterValue=$CODEPIPELINE_ROLE_ARN \
        ParameterKey=CodeCommitRepositoryName,ParameterValue=$CODECOMMIT_REPO_NAME \
        ParameterKey=ArtifactBucketName,ParameterValue=$ARTIFACT_BUCKET \
        ParameterKey=FrontendBuildProjectName,ParameterValue=$FRONTEND_BUILD_PROJECT \
        ParameterKey=BackendBuildProjectName,ParameterValue=$BACKEND_BUILD_PROJECT \
        ParameterKey=InfrastructureBuildProjectName,ParameterValue=$INFRA_BUILD_PROJECT \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --region $REGION

echo "CodePipelineスタックのデプロイを待機中..."
aws cloudformation wait stack-$([[ $(aws cloudformation describe-stacks --stack-name $CODEPIPELINE_STACK_NAME --region $REGION 2>/dev/null) ]] && echo "update" || echo "create")-complete \
    --stack-name $CODEPIPELINE_STACK_NAME \
    --region $REGION

# CodePipelineスタックの出力を取得
CODEPIPELINE_OUTPUTS=$(aws cloudformation describe-stacks --stack-name $CODEPIPELINE_STACK_NAME --region $REGION --query "Stacks[0].Outputs" --output json)
PIPELINE_URL=$(echo $CODEPIPELINE_OUTPUTS | jq -r '.[] | select(.OutputKey=="PipelineUrl") | .OutputValue')

echo "======== CI/CD環境のセットアップが完了しました ========"
echo "CodeCommitリポジトリ: $CODECOMMIT_REPO_HTTP"
echo "CodePipelineコンソールURL: $PIPELINE_URL"
echo "======================================================"

# 必要なbuildspecファイルを作成するディレクトリ構造を確保
mkdir -p /mnt/c/dev2/aiDev/src/frontend
mkdir -p /mnt/c/dev2/aiDev/src/backend
mkdir -p /mnt/c/dev2/aiDev/src/infra

# buildspecファイルのテンプレートを作成
echo "buildspecファイルのテンプレートを作成しています..."

cat > /mnt/c/dev2/aiDev/src/frontend/buildspec.yml << 'EOL'
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 16
    commands:
      - echo Installing dependencies...
      - cd src/frontend/chatbot-ui
      - npm install

  build:
    commands:
      - echo Building the frontend...
      - npm run build

  post_build:
    commands:
      - echo Build completed on `date`

artifacts:
  base-directory: src/frontend/chatbot-ui/build
  files:
    - '**/*'
  discard-paths: no
EOL

cat > /mnt/c/dev2/aiDev/src/backend/buildspec.yml << 'EOL'
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 16
    commands:
      - echo Installing dependencies...
      - cd src/backend/lambda
      - npm install

  build:
    commands:
      - echo Building the backend...
      - npm run build

  post_build:
    commands:
      - echo Build completed on `date`

artifacts:
  base-directory: src/backend/lambda
  files:
    - '**/*'
  discard-paths: no
EOL

cat > /mnt/c/dev2/aiDev/src/infra/buildspec.yml << 'EOL'
version: 0.2

phases:
  install:
    runtime-versions:
      python: 3.9
    commands:
      - echo Installing dependencies...
      - pip install --upgrade pip
      - pip install --upgrade awscli aws-sam-cli

  build:
    commands:
      - echo Building SAM template...
      - cd src/infra/sam
      - sam build
      - sam package --s3-bucket ${ARTIFACT_BUCKET} --output-template-file packaged-template.yaml

  post_build:
    commands:
      - echo SAM packaging completed on `date`
      - cp config.json .
      - ls -la

artifacts:
  files:
    - src/infra/sam/packaged-template.yaml
    - src/infra/sam/config.json
  discard-paths: yes
EOL

echo "buildspecファイルを作成しました。"
echo "環境変数やディレクトリ構造、必要なファイルなどをプロジェクトに応じて調整してください。"

echo "セットアップ完了！"
