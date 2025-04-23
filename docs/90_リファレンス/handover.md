# aiDevプロジェクト 引継ぎ状況

## 2025年4月23日 第十三次追記

### 実施済み
- CloudFormationテンプレートのLambda関数パス参照を修正
  - エラー分析：`Unable to upload artifact ../src/lambda/hello-world/ referenced by CodeUri parameter of HelloWorldFunction resource.`
  - 根本原因：ディレクトリ構造の変更により、古いパス参照が無効になっていた
  - 解決策：`iac/cloudformation/main.yaml`内の各Lambda関数のCodeUriパスを修正
  - 変更内容：`../src/lambda/` から `../../src/lambda/` に修正（相対パス）

### 次のアクション
1. **修正後のパイプライン実行確認**
   - 修正をリモートリポジトリにプッシュ
   - パイプラインの再実行トリガー
   - ビルドおよびデプロイステージが正常に完了することを確認

## 2025年4月23日 第十二次追記

### 実施済み
- CodeBuildのビルド失敗を修正
  - エラー分析：`node: /lib64/libm.so.6: version 'GLIBC_2.27' not found (required by node)` エラーを確認
  - 根本原因：amazonlinux2-x86_64-standard:4.0イメージが古いGLIBCバージョンを持ち、Node.js 18をサポートしていない
  - 解決策：buildspec.ymlを修正し、runtime-versionsでのNode.js 18指定を削除
  - 代替アプローチ：`n`コマンドを使用してNode.js 16をインストールするように変更
  - 変更内容：`iac/cloudformation/buildspecs/pipeline-buildspec.yml`を更新

### 次のアクション
1. **buildspec変更のプッシュとビルド確認**
   - ローカルでコミットした変更をGithubリポジトリにプッシュ
   - パイプラインの再実行をトリガー
   - Buildステージが正常に完了することを確認

## 2025年4月23日 第十一次追記

### 実施済み
- CI/CDパイプラインのGitHubリポジトリ設定を修正
  - GitHubオーナー情報を「aidev-organization」から「k-tanaka-522」に修正
  - 監視ブランチを「main」から「develop」に変更
  - パイプラインの手動実行を開始
  - Source ステージが正常に完了
  - Build ステージで失敗（npm install -g aws-cdk でエラー発生）

### 次のアクション
1. **ビルド失敗の修正** ✅
   - エラー内容: `Build terminated with state: FAILED. Phase: INSTALL, Code: COMMAND_EXECUTION_ERROR, Message: Error while executing command: npm install -g aws-cdk. Reason: exit status 1`
   - buildspec.ymlファイルの見直し：npm権限の問題またはNodeJSのバージョンの問題の可能性
   - buildspec.ymlで`sudo npm install -g aws-cdk`を試すか、グローバルインストールを避けて`npm install aws-cdk`を使用
   - CodeBuildプロジェクトの環境設定を確認（Node.js バージョンなど）

2. **パイプラインの完了を確認**
   - ビルド問題修正後、パイプラインを再実行
   - すべてのステージが正常に完了することを確認
   - デプロイされたリソースが想定通りに機能するか検証

3. **追加コンポーネントの構築**
   - フロントエンド用のビルド・デプロイ設定の詳細化
   - バックエンド用のビルド・デプロイ設定の詳細化
   - テスト自動化の組み込み
   - 通知設定の詳細化

## 2025年4月22日 第九次追記

### 実施済み
- CI/CDパイプラインのCloudFormationテンプレート修正
  - 通知ルール（PipelineNotificationRule）リソースのARN参照方法を修正
  - YAMLシンタックスエラーの修正（!If 構文の修正）
  - スタック構築のためのCloudFormationデプロイコマンドを実行済み

### 次のアクション
- **GitHub接続の設定（デプロイ完了後）**
  - AWSコンソールでCodeStarConnectionsの手動認証設定
    1. Developer Tools > Settings > Connectionsに移動
    2. dev-aidev-github-connectionを選択
    3. 「保留中の接続を更新」ボタンをクリック
    4. GitHubにログインして認証を完了

- **パイプラインの動作確認**
  ```bash
  # パイプラインの情報を確認
  aws cloudformation describe-stacks \
      --stack-name dev-aidev-pipeline \
      --region ap-northeast-1 \
      --query "Stacks[0].Outputs" \
      --output json

  # テスト用のコミットとプッシュ
  cd /mnt/c/dev2/aiDev
  echo "// テスト用コメント追加" >> src/lambda/hello-world/index.js
  git add src/lambda/hello-world/index.js
  git commit -m "test: パイプラインの動作確認用コミット"
  git push origin develop  # GitHubブランチ名は設定に合わせる
  ```

- **追加コンポーネントの構築（パイプライン動作確認後）**
  - フロントエンド用のビルド・デプロイ設定の詳細化
  - バックエンド用のビルド・デプロイ設定の詳細化
  - テスト自動化の組み込み
  - 通知設定の詳細化

## 2025年4月22日 第七次追記

### 実施済み
- CI/CDパイプラインのGitHub連携方法の改善
  - OAuthトークン方式からCodeStarConnections方式に移行
  - CloudFormationテンプレート（`pipeline.yaml`）を更新
  - GitHubと連携するためのWebhook関連リソースを削除
  - CodeStarConnectionsを利用するためのIAM権限設定を追加
  - パラメータファイルを更新（GitHubトークン不要）
  - セットアップ手順書を更新（CodeStarConnections認証フロー）

## 2025年4月21日 第六次追記

### 実施済み
- CI/CDパイプライン実装のためのIaC（Infrastructure as Code）ディレクトリ構造の整備
  - `/mnt/c/dev2/aiDev/iac/`ディレクトリを新設
  - CloudFormation用のモジュール化された構造を整備
  - CI/CDパイプライン用CloudFormationテンプレートの改良と実装
  - 環境分離（dev/stg/prod）対応のパラメータファイル作成
  - 承認プロセスを組み込んだパイプライン設計の実装
  - セットアップ手順書の作成

## 2025年4月20日 第五次追記

### 実施済み
- CI/CDパイプライン要件の反映と文書整備
  - 非機能要件書にCI/CDパイプライン要件セクションを追加
  - CI/CD設計書を要件定義に基づいて完成
  - システム開発プロセスに沿ったドキュメント整理

### レビュー済み
- `/mnt/c/dev2/aiDev/docs/10_要件/13_非機能要件.md`の「CI/CDパイプライン要件」セクション
- `/mnt/c/dev2/aiDev/docs/80_設計書/CI_CD_設計書.md`の全体内容（→ 20_設計/22_詳細設計/06-06_CI_CDパイプライン.mdに移動済み）

## 2025年4月20日 第四次追記

### 実施済み
- CI/CDパイプラインの設計再検討
  - 設計が不十分な状態での実装のリスクを分析
  - プロジェクト要件に基づいたCI/CDパイプライン要件定義ドキュメントを作成
  - ドキュメント整理（handover_infra.md → cicd_requirements.md）

### レビュー済み
- `/mnt/c/dev2/aiDev/docs/90_リファレンス/cicd_requirements.md`
  → CI/CDパイプラインの要件定義ドキュメント

## 2025年4月20日 第三次追記

### 実施済み
- CI/CDパイプライン実装の課題分析
  - 既存のCI/CD関連ファイルを確認し問題点を特定
  - 設計が先行していない状態での実装は再考が必要と判断

## 2025年4月20日 第二次追記

### 実施済み
- CI/CDパイプラインの詳細分析と問題点の特定
  - CloudFormationテンプレート、buildspec.yml、デプロイスクリプトの確認
  - 環境別パラメータファイルの確認
  - 不足しているコンポーネントの特定

## 2025年4月20日 第一次追記

### 実施済み
- CI/CDパイプラインのCloudFormationテンプレートを作成
  - ファイル: `/infra/ci-cd/pipeline.yaml`
  - 開発/ステージング/本番環境に対応したパラメータファイルを作成
  - buildspec.ymlファイルの基本実装
  - デプロイスクリプトとドキュメントの作成

## 2025年4月20日 現状確認

### 実施済み
- プロジェクトの基本設計および詳細設計ドキュメントの作成
- インフラ環境構成の詳細設計
- IAMポリシーおよびCloudFormationの設計
- 最小限のサーバーレスアプリ（HelloWorld Lambda）のセットアップ

### 未実施・課題
- 環境構築自動化機能の詳細実装
- デプロイパイプラインのセットアップと自動テスト