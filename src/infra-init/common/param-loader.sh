#!/bin/bash

# aiDev パラメーター読み込みヘルパー
# YAMLパラメーターファイルを読み込み、環境変数として設定するスクリプト

# 必要なコマンドの確認
if ! command -v yq &> /dev/null; then
    echo "エラー: yqコマンドがインストールされていません。"
    echo "実行前にインストールしてください: sudo apt-get update && sudo apt-get install -y yq"
    exit 1
fi

SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
PARAMS_DIR="${SCRIPT_DIR}/../parameters"
COMMON_PARAMS="${PARAMS_DIR}/common.yml"

# 使用方法
function show_usage {
    echo "使用方法: source $(basename "$0") <環境名>"
    echo "例: source $(basename "$0") dev"
    echo "有効な環境名: dev, staging, prod"
}

# 引数チェック
if [ $# -ne 1 ]; then
    show_usage
    return 1
fi

ENV_NAME="$1"
ENV_PARAMS="${PARAMS_DIR}/${ENV_NAME}.yml"

# パラメーターファイルの存在確認
if [ ! -f "${COMMON_PARAMS}" ]; then
    echo "エラー: 共通パラメーターファイルが見つかりません: ${COMMON_PARAMS}"
    return 1
fi

if [ ! -f "${ENV_PARAMS}" ]; then
    echo "エラー: 環境パラメーターファイルが見つかりません: ${ENV_PARAMS}"
    return 1
fi

echo "========== aiDev パラメーター読み込み =========="
echo "環境: ${ENV_NAME}"
echo "共通パラメーターファイル: ${COMMON_PARAMS}"
echo "環境パラメーターファイル: ${ENV_PARAMS}"

# 環境パラメーターの読み込み
export ENV_NAME=$(yq e '.Environment' "${ENV_PARAMS}")
export AWS_REGION=$(yq e '.Region' "${ENV_PARAMS}")
export GITHUB_OWNER=$(yq e '.GitHub.Owner' "${ENV_PARAMS}")
export GITHUB_REPO=$(yq e '.GitHub.Repo' "${ENV_PARAMS}")
export GITHUB_BRANCH=$(yq e '.GitHub.Branch' "${ENV_PARAMS}")
export CLOUDFRONT_DISTRIBUTION_ID=$(yq e '.CloudFront.DistributionId' "${ENV_PARAMS}")

# 共通パラメーターから値を取得
export STACK_PREFIX=$(yq e ".Environment.${ENV_NAME}.StackPrefix" "${COMMON_PARAMS}")
export BASE_RESOURCES_STACK=$(yq e '.StackNames.BaseResources' "${COMMON_PARAMS}")
export CODEBUILD_STACK=$(yq e '.StackNames.CodeBuild' "${COMMON_PARAMS}")
export CODEPIPELINE_STACK=$(yq e '.StackNames.CodePipeline' "${COMMON_PARAMS}")

# AWS アカウントIDの取得
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# リソース名の生成（変数置換）
function replace_vars {
    local template="$1"
    local result="${template}"
    
    # 変数置換
    result="${result//\{StackPrefix\}/${STACK_PREFIX}}"
    result="${result//\{EnvironmentName\}/${ENV_NAME}}"
    result="${result//\{AccountId\}/${AWS_ACCOUNT_ID}}"
    
    echo "${result}"
}

# リソース名の設定
export GITHUB_CONNECTION_NAME=$(replace_vars "$(yq e '.ResourceNames.GitHubConnection' "${COMMON_PARAMS}")")
export ARTIFACT_BUCKET_NAME=$(replace_vars "$(yq e '.ResourceNames.ArtifactBucket' "${COMMON_PARAMS}")")
export PIPELINE_NAME=$(replace_vars "$(yq e '.ResourceNames.Pipeline' "${COMMON_PARAMS}")")
export LAMBDA_FUNCTION_NAME=$(replace_vars "$(yq e '.ResourceNames.LambdaFunction' "${COMMON_PARAMS}")")
export FRONTEND_BUILD_PROJECT=$(replace_vars "$(yq e '.ResourceNames.FrontendBuildProject' "${COMMON_PARAMS}")")
export BACKEND_BUILD_PROJECT=$(replace_vars "$(yq e '.ResourceNames.BackendBuildProject' "${COMMON_PARAMS}")")
export INFRA_BUILD_PROJECT=$(replace_vars "$(yq e '.ResourceNames.InfrastructureBuildProject' "${COMMON_PARAMS}")")

# 読み込んだパラメーターの表示
echo "---------------------------------------------"
echo "エクスポートされた環境変数:"
echo "ENV_NAME: ${ENV_NAME}"
echo "AWS_REGION: ${AWS_REGION}"
echo "GITHUB_OWNER: ${GITHUB_OWNER}"
echo "GITHUB_REPO: ${GITHUB_REPO}"
echo "GITHUB_BRANCH: ${GITHUB_BRANCH}"
echo "CLOUDFRONT_DISTRIBUTION_ID: ${CLOUDFRONT_DISTRIBUTION_ID}"
echo "STACK_PREFIX: ${STACK_PREFIX}"
echo "BASE_RESOURCES_STACK: ${BASE_RESOURCES_STACK}"
echo "CODEBUILD_STACK: ${CODEBUILD_STACK}"
echo "CODEPIPELINE_STACK: ${CODEPIPELINE_STACK}"
echo "AWS_ACCOUNT_ID: ${AWS_ACCOUNT_ID}"
echo "GITHUB_CONNECTION_NAME: ${GITHUB_CONNECTION_NAME}"
echo "ARTIFACT_BUCKET_NAME: ${ARTIFACT_BUCKET_NAME}"
echo "PIPELINE_NAME: ${PIPELINE_NAME}"
echo "LAMBDA_FUNCTION_NAME: ${LAMBDA_FUNCTION_NAME}"
echo "FRONTEND_BUILD_PROJECT: ${FRONTEND_BUILD_PROJECT}"
echo "BACKEND_BUILD_PROJECT: ${BACKEND_BUILD_PROJECT}"
echo "INFRA_BUILD_PROJECT: ${INFRA_BUILD_PROJECT}"
echo "=========================================="

echo "パラメーターを読み込みました。以下のコマンドで環境を確認できます:"
echo "env | grep -E 'ENV_NAME|AWS_|GITHUB_|CLOUDFRONT_|STACK_|ARTIFACT_|PIPELINE_|LAMBDA_|BUILD_PROJECT'"
