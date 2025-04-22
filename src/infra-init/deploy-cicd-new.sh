#!/bin/bash

# aiDev CI/CD 環境構築スクリプト (改良版)
# このスクリプトはaiDevプロジェクトのCI/CD環境を構築します。
# 冪等性を考慮した設計：既存リソースは更新、存在しない場合は新規作成します

set -e  # エラーがあれば中断

# スクリプトディレクトリの取得
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
COMMON_DIR="${SCRIPT_DIR}/common"
PARAMS_DIR="${SCRIPT_DIR}/parameters"

# 必要なコマンドの確認
for CMD in jq yq aws; do
    if ! command -v ${CMD} &> /dev/null; then
        echo "エラー: ${CMD}コマンドがインストールされていません。"
        echo "実行前にインストールしてください。"
        exit 1
    fi
done

# ログ機能を追加
LOG_DIR="${SCRIPT_DIR}/logs"
mkdir -p ${LOG_DIR}
LOG_FILE="${LOG_DIR}/deploy-cicd-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a ${LOG_FILE}) 2>&1

echo "========== aiDev CI/CD環境セットアップログ =========="
echo "開始時刻: $(date)"

# デフォルト値
ENV="dev"

# ヘルプ関数
function show_help {
    echo "aiDev CI/CD環境構築スクリプト"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  -h, --help               このヘルプを表示"
    echo "  -e, --environment ENV    環境名を指定 (dev, staging, prod) [デフォルト: dev]"
    echo "  -i, --interactive        対話モードで実行（パラメーターの確認と編集）"
    echo "  --show-params            パラメーターのみ表示して終了"
    echo ""
    exit 0
}

# コマンドライン引数の解析
INTERACTIVE=false
SHOW_PARAMS=false

while [[ $# -gt 0 ]]; do
    key="$1"
    case ${key} in
        -h|--help)
            show_help
            ;;
        -e|--environment)
            ENV="$2"
            shift 2
            ;;
        -i|--interactive)
            INTERACTIVE=true
            shift
            ;;
        --show-params)
            SHOW_PARAMS=true
            shift
            ;;
        *)
            echo "未知のオプション: $1"
            show_help
            ;;
    esac
done

# 環境名の検証
if [[ ! "${ENV}" =~ ^(dev|staging|prod)$ ]]; then
    echo "エラー: 環境名は dev, staging, prod のいずれかである必要があります。"
    exit 1
fi

# パラメーターの読み込み
echo "パラメーターファイルを読み込みます..."
# ソースとして読み込むため、変数をエクスポート
source ${COMMON_DIR}/param-loader.sh ${ENV}

# パラメーターのみ表示モードの場合は終了
if ${SHOW_PARAMS}; then
    echo "パラメーター表示モードが指定されました。終了します。"
    exit 0
fi

# 対話モードの処理
if ${INTERACTIVE}; then
    echo "対話モードが有効です。パラメーターを確認・編集できます。"
    read -p "CloudFrontディストリビューションID [${CLOUDFRONT_DISTRIBUTION_ID}]: " NEW_CF_ID
    if [[ -n "${NEW_CF_ID}" ]]; then
        CLOUDFRONT_DISTRIBUTION_ID="${NEW_CF_ID}"
        echo "CloudFrontディストリビューションIDを更新しました: ${CLOUDFRONT_DISTRIBUTION_ID}"
    fi
    
    # 他のパラメーターも必要に応じて対話式で編集可能
    
    read -p "すべてのパラメーターを確認しました。続行しますか？ (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "セットアップを中断します。"
        exit 1
    fi
fi

# 確認
echo "=============================================="
echo "環境: ${ENV}"
echo "スタックプレフィックス: ${STACK_PREFIX}"
echo "AWS リージョン: ${AWS_REGION}"
echo "GitHub所有者: ${GITHUB_OWNER}"
echo "GitHubリポジトリ: ${GITHUB_REPO}"
echo "GitHubブランチ: ${GITHUB_BRANCH}"
echo "CloudFrontディストリビューションID: ${CLOUDFRONT_DISTRIBUTION_ID}"
echo "=============================================="

read -p "上記の設定で続行しますか？ (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "セットアップを中断します。"
    exit 1
fi

# スタックが既に存在するか確認
if aws cloudformation describe-stacks --stack-name ${BASE_RESOURCES_STACK} --region ${AWS_REGION} 2>/dev/null; then
    echo "既存のスタック '${BASE_RESOURCES_STACK}' を更新します..."
    STACK_ACTION="update-stack"
else
    echo "新しいスタック '${BASE_RESOURCES_STACK}' を作成します..."
    STACK_ACTION="create-stack"
fi

# テンプレートのS3へのアップロード用バケットを作成または確認
TEMPLATE_BUCKET="aidev-cfn-templates-${AWS_REGION}-${ENV}"
if aws s3api head-bucket --bucket ${TEMPLATE_BUCKET} 2>/dev/null; then
    echo "テンプレート用バケット '${TEMPLATE_BUCKET}' が確認されました"
else
    echo "テンプレート用バケット '${TEMPLATE_BUCKET}' を作成します..."
    aws s3 mb s3://${TEMPLATE_BUCKET} --region ${AWS_REGION}
fi

# 中間テンプレートのアップロード
echo "テンプレートをS3にアップロードしています..."
aws s3 cp ${SCRIPT_DIR}/ci-cd-resources.yml s3://${TEMPLATE_BUCKET}/ci-cd-resources.yml
aws s3 cp ${SCRIPT_DIR}/codebuild-projects.yml s3://${TEMPLATE_BUCKET}/codebuild-projects.yml
aws s3 cp ${SCRIPT_DIR}/codepipeline.yml s3://${TEMPLATE_BUCKET}/codepipeline.yml

# CI/CDリソースのスタックを作成または更新
echo "基本CI/CDリソースをデプロイしています..."

aws cloudformation ${STACK_ACTION} \
    --stack-name ${BASE_RESOURCES_STACK} \
    --template-url https://${TEMPLATE_BUCKET}.s3.${AWS_REGION}.amazonaws.com/ci-cd-resources.yml \
    --parameters \
        ParameterKey=EnvironmentName,ParameterValue=${ENV} \
        ParameterKey=GitHubOwner,ParameterValue=${GITHUB_OWNER} \
        ParameterKey=GitHubRepo,ParameterValue=${GITHUB_REPO} \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --region ${AWS_REGION}

echo "CloudFormationスタックのデプロイを待機中..."
if [[ "${STACK_ACTION}" == "create-stack" ]]; then
    aws cloudformation wait stack-create-complete --stack-name ${BASE_RESOURCES_STACK} --region ${AWS_REGION}
else
    aws cloudformation wait stack-update-complete --stack-name ${BASE_RESOURCES_STACK} --region ${AWS_REGION}
fi

# スタックの出力を取得
echo "スタックの出力を取得中..."
OUTPUTS=$(aws cloudformation describe-stacks --stack-name ${BASE_RESOURCES_STACK} --region ${AWS_REGION} --query "Stacks[0].Outputs" --output json)

# スタック出力から必要な値を取得
ARTIFACT_BUCKET=$(echo ${OUTPUTS} | jq -r '.[] | select(.OutputKey=="ArtifactBucketName") | .OutputValue')
GITHUB_CONNECTION_ARN=$(echo ${OUTPUTS} | jq -r '.[] | select(.OutputKey=="GitHubConnectionArn") | .OutputValue')
GITHUB_CONNECTION_STATUS=$(echo ${OUTPUTS} | jq -r '.[] | select(.OutputKey=="GitHubConnectionStatus") | .OutputValue')
CODEBUILD_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name ${BASE_RESOURCES_STACK} --region ${AWS_REGION} --query "Stacks[0].Outputs[?OutputKey=='CodeBuildServiceRoleArn'].OutputValue" --output text)
CODEPIPELINE_ROLE_ARN=$(aws cloudformation describe-stacks --stack-name ${BASE_RESOURCES_STACK} --region ${AWS_REGION} --query "Stacks[0].Outputs[?OutputKey=='CodePipelineServiceRoleArn'].OutputValue" --output text)

echo "GitHub接続ARN: ${GITHUB_CONNECTION_ARN}"
echo "GitHub接続ステータス: ${GITHUB_CONNECTION_STATUS}"
echo "アーティファクトバケット: ${ARTIFACT_BUCKET}"
echo "CodeBuild IAM Role ARN: ${CODEBUILD_ROLE_ARN}"
echo "CodePipeline IAM Role ARN: ${CODEPIPELINE_ROLE_ARN}"

# CodeBuildプロジェクトのスタックを作成または更新
echo "CodeBuildプロジェクトをデプロイしています..."

# スタックが既に存在するか確認
if aws cloudformation describe-stacks --stack-name ${CODEBUILD_STACK} --region ${AWS_REGION} 2>/dev/null; then
    CODEBUILD_STACK_ACTION="update-stack"
else
    CODEBUILD_STACK_ACTION="create-stack"
fi

aws cloudformation ${CODEBUILD_STACK_ACTION} \
    --stack-name ${CODEBUILD_STACK} \
    --template-url https://${TEMPLATE_BUCKET}.s3.${AWS_REGION}.amazonaws.com/codebuild-projects.yml \
    --parameters \
        ParameterKey=EnvironmentName,ParameterValue=${ENV} \
        ParameterKey=CodeBuildServiceRoleArn,ParameterValue=${CODEBUILD_ROLE_ARN} \
        ParameterKey=ArtifactBucketName,ParameterValue=${ARTIFACT_BUCKET} \
    --region ${AWS_REGION}

echo "CodeBuildスタックのデプロイを待機中..."
if [[ "${CODEBUILD_STACK_ACTION}" == "create-stack" ]]; then
    aws cloudformation wait stack-create-complete --stack-name ${CODEBUILD_STACK} --region ${AWS_REGION}
else
    aws cloudformation wait stack-update-complete --stack-name ${CODEBUILD_STACK} --region ${AWS_REGION}
fi

# CodeBuildスタックの出力を取得
CODEBUILD_OUTPUTS=$(aws cloudformation describe-stacks --stack-name ${CODEBUILD_STACK} --region ${AWS_REGION} --query "Stacks[0].Outputs" --output json)

# CodeBuild出力から必要な値を取得
FRONTEND_BUILD_PROJECT=$(echo ${CODEBUILD_OUTPUTS} | jq -r '.[] | select(.OutputKey=="FrontendBuildProjectName") | .OutputValue')
BACKEND_BUILD_PROJECT=$(echo ${CODEBUILD_OUTPUTS} | jq -r '.[] | select(.OutputKey=="BackendBuildProjectName") | .OutputValue')
INFRA_BUILD_PROJECT=$(echo ${CODEBUILD_OUTPUTS} | jq -r '.[] | select(.OutputKey=="InfrastructureBuildProjectName") | .OutputValue')

echo "フロントエンドビルドプロジェクト: ${FRONTEND_BUILD_PROJECT}"
echo "バックエンドビルドプロジェクト: ${BACKEND_BUILD_PROJECT}"
echo "インフラビルドプロジェクト: ${INFRA_BUILD_PROJECT}"

# CodePipelineスタックを作成または更新
echo "CodePipelineをデプロイしています..."

# スタックが既に存在するか確認
if aws cloudformation describe-stacks --stack-name ${CODEPIPELINE_STACK} --region ${AWS_REGION} 2>/dev/null; then
    CODEPIPELINE_STACK_ACTION="update-stack"
else
    CODEPIPELINE_STACK_ACTION="create-stack"
fi

CLOUDFRONT_PARAM=""
if [[ -n "${CLOUDFRONT_DISTRIBUTION_ID}" && "${CLOUDFRONT_DISTRIBUTION_ID}" != "DUMMY_ID" ]]; then
    CLOUDFRONT_PARAM="ParameterKey=CloudFrontDistributionId,ParameterValue=${CLOUDFRONT_DISTRIBUTION_ID}"
fi

aws cloudformation ${CODEPIPELINE_STACK_ACTION} \
    --stack-name ${CODEPIPELINE_STACK} \
    --template-url https://${TEMPLATE_BUCKET}.s3.${AWS_REGION}.amazonaws.com/codepipeline.yml \
    --parameters \
        ParameterKey=EnvironmentName,ParameterValue=${ENV} \
        ParameterKey=CodePipelineServiceRoleArn,ParameterValue=${CODEPIPELINE_ROLE_ARN} \
        ParameterKey=GitHubConnectionArn,ParameterValue=${GITHUB_CONNECTION_ARN} \
        ParameterKey=GitHubOwner,ParameterValue=${GITHUB_OWNER} \
        ParameterKey=GitHubRepo,ParameterValue=${GITHUB_REPO} \
        ParameterKey=GitHubBranch,ParameterValue=${GITHUB_BRANCH} \
        ParameterKey=ArtifactBucketName,ParameterValue=${ARTIFACT_BUCKET} \
        ParameterKey=FrontendBuildProjectName,ParameterValue=${FRONTEND_BUILD_PROJECT} \
        ParameterKey=BackendBuildProjectName,ParameterValue=${BACKEND_BUILD_PROJECT} \
        ParameterKey=InfrastructureBuildProjectName,ParameterValue=${INFRA_BUILD_PROJECT} \
        ${CLOUDFRONT_PARAM} \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --region ${AWS_REGION}

echo "CodePipelineスタックのデプロイを待機中..."
if [[ "${CODEPIPELINE_STACK_ACTION}" == "create-stack" ]]; then
    aws cloudformation wait stack-create-complete --stack-name ${CODEPIPELINE_STACK} --region ${AWS_REGION}
else
    aws cloudformation wait stack-update-complete --stack-name ${CODEPIPELINE_STACK} --region ${AWS_REGION}
fi

# CodePipelineスタックの出力を取得
CODEPIPELINE_OUTPUTS=$(aws cloudformation describe-stacks --stack-name ${CODEPIPELINE_STACK} --region ${AWS_REGION} --query "Stacks[0].Outputs" --output json)
PIPELINE_URL=$(echo ${CODEPIPELINE_OUTPUTS} | jq -r '.[] | select(.OutputKey=="PipelineUrl") | .OutputValue')

echo "======== CI/CD環境のセットアップが完了しました ========"
echo "GitHub接続ARN: ${GITHUB_CONNECTION_ARN}"
echo "GitHub接続ステータス: ${GITHUB_CONNECTION_STATUS}"
echo "CodePipelineコンソールURL: ${PIPELINE_URL}"
echo "======================================================"

# 必要なbuildspecファイルがないか確認
if [ ! -f "/mnt/c/dev2/aiDev/src/frontend/buildspec.yml" ] || \
   [ ! -f "/mnt/c/dev2/aiDev/src/backend/buildspec.yml" ] || \
   [ ! -f "/mnt/c/dev2/aiDev/src/infra/buildspec.yml" ]; then
    
    echo "buildspecファイルが見つからないため、テンプレートを作成します..."
    
    # 必要なディレクトリの作成
    mkdir -p /mnt/c/dev2/aiDev/src/frontend
    mkdir -p /mnt/c/dev2/aiDev/src/backend
    mkdir -p /mnt/c/dev2/aiDev/src/infra
    
    # フロントエンドbuildspec.yml
    if [ ! -f "/mnt/c/dev2/aiDev/src/frontend/buildspec.yml" ]; then
        cat > /mnt/c/dev2/aiDev/src/frontend/buildspec.yml << 'EOL'
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 16
    commands:
      - echo Installing dependencies...
      - cd chatbot-ui
      - npm install

  build:
    commands:
      - echo Building the frontend...
      - npm run build

  post_build:
    commands:
      - echo Build completed on `date`

artifacts:
  base-directory: chatbot-ui/build
  files:
    - '**/*'
  discard-paths: no
EOL
        echo "フロントエンドbuildspecファイルを作成しました"
    fi
    
    # バックエンドbuildspec.yml
    if [ ! -f "/mnt/c/dev2/aiDev/src/backend/buildspec.yml" ]; then
        cat > /mnt/c/dev2/aiDev/src/backend/buildspec.yml << 'EOL'
version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 16
    commands:
      - echo Installing dependencies...
      - cd lambda
      - npm install || echo "No package.json found, skipping install"

  build:
    commands:
      - echo Building the backend...
      - npm run build || echo "No build script found, skipping build"

  post_build:
    commands:
      - echo Build completed on `date`
      - mkdir -p dist
      - cp -r . dist/ || echo "Creating empty dist directory"

artifacts:
  base-directory: lambda/dist
  files:
    - '**/*'
  discard-paths: no
EOL
        echo "バックエンドbuildspecファイルを作成しました"
    fi
    
    # インフラbuildspec.yml
    if [ ! -f "/mnt/c/dev2/aiDev/src/infra/buildspec.yml" ]; then
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
      - cd sam
      - sam build
      - sam package --s3-bucket ${ARTIFACT_BUCKET} --output-template-file packaged-template.yaml

  post_build:
    commands:
      - echo SAM packaging completed on `date`
      - mkdir -p output
      - cp packaged-template.yaml output/
      - cp config.json output/ || echo "{}" > output/config.json

artifacts:
  base-directory: sam/output
  files:
    - packaged-template.yaml
    - config.json
  discard-paths: yes
EOL
        echo "インフラbuildspecファイルを作成しました"
    fi
    
    echo "必要なbuildspecファイルを作成しました。環境変数やディレクトリ構造を必要に応じて調整してください。"
fi

echo "========== CI/CD環境のセットアップが完了しました =========="
echo "終了時刻: $(date)"
echo "ログファイル: ${LOG_FILE}"
echo "セットアップ完了！"
echo "============================================================"
echo ""
echo "GitHub接続のステータスが「PENDING」の場合は、AWS管理コンソールで承認を行ってください："
echo "1. AWS管理コンソールにログイン"
echo "2. 「CodePipeline」 > 「設定」 > 「接続」に移動"
echo "3. '${GITHUB_CONNECTION_NAME}' という名前の接続を選択"
echo "4. 「保留中の接続を更新」ボタンをクリックして承認"
echo ""
echo "承認完了後、GitHubリポジトリに変更をプッシュすることでパイプラインが実行されます。"
echo "「${GITHUB_OWNER}/${GITHUB_REPO}」リポジトリの「${GITHUB_BRANCH}」ブランチへの変更が検出されます。"