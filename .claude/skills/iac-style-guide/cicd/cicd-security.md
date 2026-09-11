> 移行元: `.claude/docs/40_standards/42_infra/cicd/cicd-security.md`（02文書4.4節、新設ディレクトリ `iac-style-guide/cicd/`）

# CI/CD セキュリティ標準

**目的**: GitHub Actions と AWS を使った CI/CD パイプラインのセキュリティリスクを軽減する

---

## 対象リスク

1. **AWSクレデンシャルの漏洩リスク**: GitHub Secrets に長期クレデンシャルを保存することによる漏洩リスク
2. **不正なワークフロー実行**: 悪意のある PR から不正なワークフローが実行されるリスク
3. **コスト爆発**: 不正な CloudFormation テンプレートで高額リソースが作成されるリスク
4. **機密情報の公開**: CloudFormation テンプレートに機密情報がハードコードされるリスク

---

## 標準1: OIDC による AWS 認証（必須）

### 原則

**長期クレデンシャル（AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）を GitHub Secrets に保存してはいけない。**

OIDC (OpenID Connect) による一時クレデンシャルを使用すること。

---

### 設定手順

#### Step 1: AWS 側の設定

**1-1. OIDC プロバイダー作成**

AWS コンソール: IAM → Identity providers → Add provider

または AWS CLI:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

**1-2. IAM Role 作成**

信頼ポリシー（Trust Policy）:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:your-org/your-repo:*"
        }
      }
    }
  ]
}
```

**重要**: `repo:your-org/your-repo:*` を実際のリポジトリに置き換える。

**アクセス許可ポリシー（例: CloudFormation デプロイ）**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DescribeStacks",
        "cloudformation:CreateChangeSet",
        "cloudformation:DescribeChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet",
        "s3:PutObject",
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": "*"
    }
  ]
}
```

**推奨**: 最小権限の原則に従い、必要な権限のみを付与する。

---

#### Step 2: GitHub Actions ワークフロー

```yaml
name: Deploy to AWS

on:
  push:
    branches:
      - main  # main ブランチのみデプロイ

permissions:
  id-token: write   # OIDC トークン取得に必須
  contents: read    # リポジトリ読み取り

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789012:role/GitHubActionsDeployRole
          aws-region: ap-northeast-1
          # AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY は不要！

      - name: Deploy CloudFormation
        run: |
          ./scripts/create-changeset.sh production
```

**必須項目**:
- `permissions: id-token: write` - OIDC トークン取得権限
- `role-to-assume` - AWS IAM Role の ARN

---

### セキュリティ強化オプション

#### オプション1: ブランチ制限

main ブランチのみが AWS にアクセス可能にする:

```json
{
  "StringLike": {
    "token.actions.githubusercontent.com:sub": "repo:your-org/your-repo:ref:refs/heads/main"
  }
}
```

#### オプション2: 環境別 IAM Role

```yaml
# 開発環境用
- name: Configure AWS credentials (dev)
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::111111111111:role/GitHubActionsDev

# 本番環境用（承認必須）
- name: Configure AWS credentials (prod)
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::222222222222:role/GitHubActionsProd
  environment: production  # GitHub Environment で承認フロー設定
```

---

## 標準2: PR からのワークフロー実行制限（必須）

### 原則

**Pull Request からの AWS デプロイは禁止。**

悪意のある PR で不正なワークフローが実行されるリスクを防ぐ。

---

### 設定方法

#### 方法1: ブランチ制限

```yaml
on:
  push:
    branches:
      - main  # main ブランチのみ
  # pull_request は含めない
```

#### 方法2: Environment Protection Rules

GitHub リポジトリ設定: Settings → Environments → production

- **Required reviewers**: 承認者を指定
- **Wait timer**: デプロイ前の待機時間（例: 5分）
- **Deployment branches**: main ブランチのみ許可

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production  # 承認必須
    steps:
      - name: Deploy
        run: ./scripts/deploy.sh
```

---

## 標準3: 機密情報の分離（必須）

### 原則

**CloudFormation テンプレートに機密情報をハードコードしてはいけない。**

AWS Secrets Manager または AWS Systems Manager Parameter Store を使用すること。

---

### 実装例

#### ❌ NG: ハードコード

```yaml
# infra/database.yaml（NG）
Resources:
  RDSInstance:
    Type: AWS::RDS::DBInstance
    Properties:
      MasterUsername: admin
      MasterUserPassword: MySecretPassword123!  # NG: ハードコード
```

#### ✅ OK: Secrets Manager

```yaml
# infra/database.yaml（OK）
Resources:
  RDSInstance:
    Type: AWS::RDS::DBInstance
    Properties:
      MasterUsername: !Sub '{{resolve:secretsmanager:${DBSecretArn}:SecretString:username}}'
      MasterUserPassword: !Sub '{{resolve:secretsmanager:${DBSecretArn}:SecretString:password}}'
```

**Secrets Manager でシークレット作成**:

```bash
aws secretsmanager create-secret \
  --name myapp-prod-db-secret \
  --secret-string '{"username":"admin","password":"SecureRandomPassword123!"}'
```

---

### 分離すべき機密情報

- データベースパスワード
- API キー
- 暗号化キー
- TLS/SSL 証明書の秘密鍵
- OAuth クライアントシークレット

---

## 標準4: コスト保護（推奨）

### 原則

**不正なリソース作成によるコスト爆発を防ぐ。**

---

### 対策

#### 対策1: CloudFormation Change Set（必須）

直接デプロイ（`aws cloudformation deploy`）は禁止。

必ず Change Set で変更内容を確認すること:

```bash
# NG: 直接デプロイ
aws cloudformation deploy --stack-name my-stack --template-file template.yaml

# OK: Change Set
./scripts/create-changeset.sh production
./scripts/describe-changeset.sh production changeset-20251026-1430
./scripts/execute-changeset.sh production changeset-20251026-1430
```

#### 対策2: AWS Budgets アラート

コスト超過時に通知:

```yaml
Resources:
  CostBudget:
    Type: AWS::Budgets::Budget
    Properties:
      Budget:
        BudgetName: monthly-budget
        BudgetLimit:
          Amount: 10000
          Unit: USD
        TimeUnit: MONTHLY
        BudgetType: COST
      NotificationsWithSubscribers:
        - Notification:
            NotificationType: ACTUAL
            ComparisonOperator: GREATER_THAN
            Threshold: 80
          Subscribers:
            - SubscriptionType: EMAIL
              Address: ops@example.com
```

#### 対策3: IAM Policy でリソース制限

高額リソースの作成を禁止:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Deny",
      "Action": [
        "ec2:RunInstances"
      ],
      "Resource": "arn:aws:ec2:*:*:instance/*",
      "Condition": {
        "StringNotLike": {
          "ec2:InstanceType": [
            "t3.*",
            "t4g.*"
          ]
        }
      }
    }
  ]
}
```

👉 t3/t4g インスタンスのみ許可（高額な r5, c5 等は禁止）

---

## 標準5: GitHub Secrets 管理（必須）

### 原則

**GitHub Secrets には最小限の情報のみを保存する。**

OIDC を使用すれば、AWS クレデンシャルは不要。

---

### 許可される Secrets

- OIDC IAM Role ARN（機密情報ではない）
- Slack Webhook URL（通知用）
- その他の外部サービス API キー（AWS 以外）

### 禁止される Secrets

- AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY（OIDC を使用）
- データベースパスワード（Secrets Manager を使用）
- 暗号化キー（AWS KMS を使用）

---

## 標準6: ワークフロー監査（推奨）

### ログ保持

GitHub Actions のログは **90日間**保持される（デフォルト）。

重要なデプロイログは外部に保存すること:

```yaml
- name: Upload deployment log
  if: always()
  uses: actions/upload-artifact@v3
  with:
    name: deployment-log
    path: deployment.log
    retention-days: 365  # 1年間保持
```

### 監査ログ

GitHub Enterprise の場合、Audit Log で以下を監査可能:

- ワークフロー実行履歴
- Secrets アクセス履歴
- 承認者の記録

---

## チェックリスト

デプロイパイプラインを作成する際、以下を確認してください:

- [ ] OIDC による AWS 認証を使用している
- [ ] 長期クレデンシャル（AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）を使用していない
- [ ] PR からの AWS デプロイは禁止されている
- [ ] CloudFormation テンプレートに機密情報がハードコードされていない
- [ ] Secrets Manager または Parameter Store を使用している
- [ ] CloudFormation Change Set で変更内容を確認している
- [ ] AWS Budgets アラートを設定している
- [ ] IAM Policy で高額リソースの作成を制限している
- [ ] GitHub Secrets には最小限の情報のみを保存している
- [ ] デプロイログを適切に保持している

---

## トラブルシューティング

### OIDC 認証エラー

**エラー**: `Error: Could not assume role with OIDC: Not authorized to perform sts:AssumeRoleWithWebIdentity`

**原因**: IAM Role の Trust Policy が正しく設定されていない

**対処**:
1. IAM Role の Trust Policy を確認
2. `token.actions.githubusercontent.com:sub` が正しいリポジトリを指しているか確認
3. OIDC プロバイダーが作成されているか確認

### Change Set 作成失敗

**エラー**: `No changes to deploy`

**原因**: CloudFormation テンプレートに変更がない

**対処**:
- これはエラーではない（変更がない場合は正常）
- Change Set をスキップして次に進む

---

## 参考資料

- [AWS公式: GitHub Actions で OIDC を使用して AWS にアクセスする](https://docs.aws.amazon.com/ja_jp/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [GitHub公式: Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [AWS Well-Architected Framework: セキュリティの柱](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/welcome.html)

---

## まとめ

**CI/CD パイプラインのセキュリティ**:

1. **OIDC による AWS 認証**（長期クレデンシャル不要）
2. **PR からのワークフロー実行制限**（不正実行防止）
3. **機密情報の分離**（Secrets Manager / Parameter Store）
4. **コスト保護**（Change Set / Budgets / IAM Policy）
5. **GitHub Secrets 管理**（最小限の情報のみ）
6. **ワークフロー監査**（ログ保持）

**これらの標準を守ることで、安全な CI/CD パイプラインを構築できます。**
