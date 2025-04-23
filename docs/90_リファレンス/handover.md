# aiDevプロジェクト 引継ぎ状況

## 2025年4月24日 第十八次追記

### 実施済み
- API Gateway CloudWatch Logsロール設定の問題を修正
  - `main.yaml`に以下の変更を実施：
    1. IAMロール「APIGatewayCloudWatchLogsRole」の追加
    2. API GatewayリソースにDependsOn属性を追加してロールとの依存関係を設定
    3. アクセスログ設定を有効化
  - この修正により、API GatewayのCloudWatch Logsが適切に設定され、アクセスログの出力が可能になる

### 次のアクション
1. **修正の適用とパイプライン動作確認**
   - 修正をGitHubリポジトリにプッシュ
   - CI/CDパイプラインの再実行をトリガー
   - デプロイが正常に完了することを確認

2. **設計とコードの整合性改善**
   - 現状のIaCコードと設計書の内容を比較し不整合箇所を特定
   - 必要に応じて設計書を更新
   - トレーサビリティマトリクスの作成

3. **フェーズ1機能の実装準備**
   - 質問応答機能の実装計画策定
   - ナレッジベースの基本構築計画作成
   - 簡易設計提案機能の実装計画策定

## 2025年4月24日 第十七次追記

### 調査結果
- API Gatewayアクセスログ設定とAWS環境間の不整合を発見
  - **AWS環境の現状**: CloudWatch LogsロールがAWSアカウントレベルで設定されている（`arn:aws:iam::897167645238:role/APIGatewayCloudWatchLogsRole`）
  - **IaCコードの現状**: CloudFormationテンプレートにアクセスログ設定が有効化されているが、ロールとの連携が不十分
  - **根本原因**: IaCコードと手動設定の不整合。ロールは存在するが、適切な権限設定やAPI Gatewayとの関連付けが不足している可能性がある

### 次のアクション
1. **短期的対応（CI/CDパイプライン修復）**
   - CloudFormationテンプレート(`main.yaml`)のAPI Gateway定義内のAccessLogSetting部分をコメントアウト
   - 修正をコミットし、デプロイを再実行して基本機能を回復

2. **恒久的対応（設計とコード間の整合性確保）**
   - **IAMロール設定の設計文書更新**
     - API Gateway用CloudWatch Logsロールの設定を明示的に設計書に記述
     - 必要な権限の詳細を文書化
   - **IaCコードへの反映**
     - APIGatewayCloudWatchLogsRoleの権限設定コードをCloudFormationテンプレートに追加
     - 必要に応じてデプロイスクリプトを作成:
       ```bash
       aws apigateway update-account --patch-operations op='replace',path='/cloudwatchRoleArn',value='arn:aws:iam::897167645238:role/APIGatewayCloudWatchLogsRole'
       ```
   - **CloudFormationテンプレート改善**
     - 依存関係（特にApiGatewayAccessLogGroupとの関係）の正しい設定
     - アクセスログ設定の再有効化
     - スタックの問題（ROLLBACK_COMPLETE状態）解消のため、必要に応じてスタック名の一時的変更を検討

## 2025年4月23日 第十六次追記

### 実施済み
- CloudTrailログを使ったデプロイ失敗原因の詳細分析
  - API Gateway作成時に関連するログイベントを確認
  - エラーの根本原因を特定：「CloudWatch Logs role ARN must be set in account settings to enable logging」
  - アクセスログ設定をコメントアウトしたが、別の箇所で依然として参照されている可能性
  - CloudFormationスタックの状態管理の問題も発見

### 次のアクション
1. **API GatewayのアクセスログをAWSアカウントレベルで設定**
   - アカウント設定でCloudWatch Logsロール設定を行う
   - 必要なIAMロールを作成し、必要なポリシーをアタッチ
   - 設定コマンド: `aws apigateway update-account --patch-operations op='replace',path='/cloudwatchRoleArn',value='IAMロールARN'`

2. **API Gatewayアクセスログの実装修正**
   - `main.yaml`のAPI Gateway定義を再確認
   - 依存関係（特にApiGatewayAccessLogGroupとの関係）を正しく設定
   - アクセスログ設定を再度有効化（CloudWatchロール設定後）

3. **CloudFormationデプロイの修正**
   - スタック名を一時的に変更して新規スタックとしてデプロイすることを検討
   - 成功後、元のスタック名に戻す

## 2025年4月23日 第十五次追記

### 実施済み
- パイプラインの再実行とさらなるトラブルシューティング
  - コード修正をGitHubにプッシュ済み
  - パイプラインを手動実行
  - SourceとBuildステージは成功したが、Deployステージが再度失敗
  - 依然としてAPI Gateway関連の問題が解決していない

## 2025年4月23日 第十四次追記

### 実施済み
- パイプラインの実行確認とトラブルシューティング
  - パイプラインのデプロイ失敗：`CAPABILITY_AUTO_EXPAND`の追加
  - CloudFormationスタックの問題特定：API Gatewayのアクセスログ設定エラー
  - 根本原因：`CloudWatch Logs role ARN must be set in account settings to enable logging`
  - 解決策：`iac/cloudformation/main.yaml`内のAPI GatewayのAccessLogSettingを一時的に無効化
  - 成功条件：スタックの問題（ROLLBACK_COMPLETE）が解消されること

### 次のアクション
1. **修正済みコードのプッシュと再実行**
   - 修正済みのCloudFormationテンプレート（main.yaml）をGitHubにプッシュ
   - パイプラインの再実行をトリガー（コンソールから手動実行でも可）
   - すべてのステージが正常に完了することを確認

2. **API Gatewayログ設定の恒久的な解決策**
   - API Gatewayのアカウント設定でCloudWatchログロールを設定する
   - コマンド例: `aws apigateway update-account --patch-operations op='replace',path='/cloudwatchRoleArn',value='IAMロールARN'`
   - 必要なIAMロールの作成とアタッチ

3. **追加コンポーネントの構築**
   - フロントエンド用のビルド・デプロイ設定の詳細化
   - バックエンド用のビルド・デプロイ設定の詳細化
   - テスト自動化の組み込み
   - 通知設定の詳細化

## 2025年4月23日 第十三次追記

### 実施済み
- CloudFormationテンプレートのLambda関数パス参照を修正
  - エラー分析：`Unable to upload artifact ../src/lambda/hello-world/ referenced by CodeUri parameter of HelloWorldFunction resource.`
  - 根本原因：ディレクトリ構造の変更により、古いパス参照が無効になっていた
  - 解決策：`iac/cloudformation/main.yaml`内の各Lambda関数のCodeUriパスを修正
  - 変更内容：`../src/lambda/` から `../../src/lambda/` に修正（相対パス）

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