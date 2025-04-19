# aiDev インフラストラクチャ詳細設計 - IAMポリシー

## 1. はじめに

本ドキュメントは、aiDevプロジェクトのIAM（Identity and Access Management）ポリシーとロールの詳細設計について記述します。システムの各コンポーネントに必要な権限と、最小権限の原則に基づいたアクセス制御方針を定義します。

## 2. IAM設計の基本方針

aiDevシステムのIAM設計は、以下の基本方針に従います：

1. **最小権限の原則**: 各コンポーネントには、必要最小限の権限のみを付与
2. **職責分離**: 異なる機能・役割には異なるIAMロールを使用
3. **一時的な認証情報**: 長期的な認証情報の代わりに、短期的なIAMロールの引き受けを活用
4. **アクセス監査**: すべてのアクセスを監査し、定期的に権限を見直す
5. **自動化**: IaCを使ったIAMポリシーの定義と管理

## 3. IAMユーザー管理

### 3.1 ユーザー管理方針

aiDevシステムでは、以下のユーザー管理方針を採用します：

- 長期的なIAMユーザーは最小限に抑える（主に自動化用サービスアカウントのみ）
- 人間のユーザーはIAM Identity Centerを使用
- フェデレーションアクセスを優先
- MFAを強制

### 3.2 IAM Identity Center（旧AWS SSO）構成

IAM Identity Centerを使用して、人間のユーザーを管理します。

**ユーザーグループ**:
- `aidev-administrators`: システム全体の管理者
- `aidev-developers`: 開発者
- `aidev-operators`: 運用担当者
- `aidev-readonly`: 閲覧のみのユーザー

**アクセス権限セット**:
- `AdministratorAccess`: 管理者向けフルアクセス
- `DeveloperAccess`: 開発に必要な権限
- `OperatorAccess`: 運用に必要な権限
- `ReadOnlyAccess`: 閲覧のみの権限

## 4. Lambda関数用IAMロール

### 4.1 基本Lambda実行ロール

すべてのLambda関数の基本となる実行ロールを定義します。

**ロール名**: `{環境}-aidev-lambda-basic-execution-role`

**ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    }
  ]
}
```

### 4.2 チャットハンドラーLambdaロール

チャット処理を担当するLambda関数用のロールを定義します。

**ロール名**: `{環境}-aidev-lambda-chat-handler-role`

**ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:{region}:{account-id}:table/{環境}-aidev-ddb-sessions",
        "arn:aws:dynamodb:{region}:{account-id}:table/{環境}-aidev-ddb-sessions/index/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream"
      ],
      "Resource": [
        "arn:aws:bedrock:{region}::foundation-model/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "bedrock-knowledge-base:Retrieve",
        "bedrock-knowledge-base:Query"
      ],
      "Resource": [
        "arn:aws:bedrock:{region}:{account-id}:knowledge-base/{環境}-aidev-kb-*"
      ]
    }
  ]
}
```

### 4.3 認証ハンドラーLambdaロール

認証処理を担当するLambda関数用のロールを定義します。

**ロール名**: `{環境}-aidev-lambda-auth-handler-role`

**ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cognito-idp:AdminInitiateAuth",
        "cognito-idp:AdminRespondToAuthChallenge",
        "cognito-idp:AdminGetUser"
      ],
      "Resource": "arn:aws:cognito-idp:{region}:{account-id}:userpool/{環境}-aidev-user-pool"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:Query"
      ],
      "Resource": [
        "arn:aws:dynamodb:{region}:{account-id}:table/{環境}-aidev-ddb-users",
        "arn:aws:dynamodb:{region}:{account-id}:table/{環境}-aidev-ddb-users/index/*"
      ]
    }
  ]
}
```

### 4.4 アカウント作成Lambda関数ロール

顧客アカウント作成を担当するLambda関数用のロールを定義します。
（フェーズ2以降で使用）

**ロール名**: `{環境}-aidev-lambda-account-creator-role`

**ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "organizations:CreateAccount",
        "organizations:DescribeCreateAccountStatus",
        "organizations:ListAccounts"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreateServiceLinkedRole"
      ],
      "Resource": "arn:aws:iam::{account-id}:role/aws-service-role/organizations.amazonaws.com/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:{region}:{account-id}:table/{環境}-aidev-ddb-accounts"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sns:Publish"
      ],
      "Resource": "arn:aws:sns:{region}:{account-id}:{環境}-aidev-sns-account-creation"
    },
    {
      "Effect": "Allow",
      "Action": [
        "sts:AssumeRole"
      ],
      "Resource": "arn:aws:iam::*:role/OrganizationAccountAccessRole"
    }
  ]
}
```

### 4.5 環境構築Lambda関数ロール

顧客環境の自動構築を担当するLambda関数用のロールを定義します。
（フェーズ2以降で使用）

**ロール名**: `{環境}-aidev-lambda-env-builder-role`

**ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "sts:AssumeRole"
      ],
      "Resource": "arn:aws:iam::*:role/OrganizationAccountAccessRole"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:UpdateItem"
      ],
      "Resource": "arn:aws:dynamodb:{region}:{account-id}:table/{環境}-aidev-ddb-deployment-status"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::{環境}-aidev-s3-cloudformation-templates/*"
    }
  ]
}
```

## 5. APIゲートウェイ認証/認可

### 5.1 Cognitoオーソライザー

API Gatewayでは、Cognitoオーソライザーを使用してAPIエンドポイントへのアクセスを制御します。

**設定**:
- ユーザープール: `{環境}-aidev-user-pool`
- トークンソース: `Authorization`ヘッダー
- トークンの検証: アクセストークン
- キャッシュ: 有効

### 5.2 APIキー管理

一部のAPIエンドポイントでは、APIキーを使用してアクセスを制御します。

**APIキー設計**:
- 用途ごとに異なるAPIキーを発行
- 使用量プランによる制限の適用
- 定期的なローテーション（90日ごと）

**使用量プラン**:
- 無料プラン: 1日あたり100リクエスト
- 基本プラン: 1日あたり1,000リクエスト
- プレミアムプラン: 1日あたり10,000リクエスト

## 6. DynamoDBアクセス制御

### 6.1 テーブルごとのアクセスポリシー

DynamoDBテーブルごとに、きめ細かなアクセス制御を適用します。

**セッションテーブル**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:{region}:{account-id}:table/{環境}-aidev-ddb-sessions",
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:LeadingKeys": ["${cognito-identity.amazonaws.com:sub}"]
        }
      }
    }
  ]
}
```

**ユーザーテーブル**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query"
      ],
      "Resource": "arn:aws:dynamodb:{region}:{account-id}:table/{環境}-aidev-ddb-users",
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:LeadingKeys": ["${cognito-identity.amazonaws.com:sub}"]
        }
      }
    }
  ]
}
```

### 6.2 条件付きアクセス

特定の条件下でのみアクセスを許可するポリシーを定義します。

**例: 所有リソースのみ更新可能**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "dynamodb:UpdateItem",
      "Resource": "arn:aws:dynamodb:{region}:{account-id}:table/{環境}-aidev-ddb-user-resources",
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:LeadingKeys": ["${cognito-identity.amazonaws.com:sub}"]
        }
      }
    }
  ]
}
```

## 7. S3バケットアクセス制御

### 7.1 フロントエンドS3バケットポリシー

フロントエンドのS3バケットは、CloudFrontからのアクセスのみを許可します。

**バケットポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudfront.amazonaws.com"
      },
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::{環境}-aidev-s3-frontend/*",
      "Condition": {
        "StringEquals": {
          "aws:SourceArn": "arn:aws:cloudfront::{account-id}:distribution/{distribution-id}"
        }
      }
    }
  ]
}
```

### 7.2 ナレッジベースS3バケットポリシー

ナレッジベース用のS3バケットは、特定のLambda関数からのアクセスのみを許可します。

**バケットポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::{account-id}:role/{環境}-aidev-lambda-kb-manager-role"
      },
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::{環境}-aidev-s3-knowledge-base",
        "arn:aws:s3:::{環境}-aidev-s3-knowledge-base/*"
      ]
    }
  ]
}
```

### 7.3 CloudFormationテンプレートS3バケットポリシー

CloudFormationテンプレート用のS3バケットは、特定のLambda関数と管理者からのアクセスのみを許可します。

**バケットポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::{account-id}:role/{環境}-aidev-lambda-env-builder-role",
          "arn:aws:iam::{account-id}:role/OrganizationAccountAccessRole"
        ]
      },
      "Action": [
        "s3:GetObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::{環境}-aidev-s3-cloudformation-templates",
        "arn:aws:s3:::{環境}-aidev-s3-cloudformation-templates/*"
      ]
    },
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::{account-id}:role/aidev-administrators"
      },
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::{環境}-aidev-s3-cloudformation-templates",
        "arn:aws:s3:::{環境}-aidev-s3-cloudformation-templates/*"
      ]
    }
  ]
}
```

## 8. クロスアカウントアクセス

### 8.1 親アカウントから子アカウントへのアクセス

親アカウントから子アカウントへのアクセスのためのロールを定義します。

**ロール名**: `OrganizationAccountAccessRole`（各子アカウントに作成される標準ロール）

**信頼ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::{parent-account-id}:root"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

**アクセスポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "*",
      "Resource": "*"
    }
  ]
}
```

### 8.2 子アカウントから親アカウントへのアクセス

特定のサービスについては、子アカウントから親アカウントへの限定的なアクセスを許可します。

**ロール名**: `{環境}-aidev-child-to-parent-role`

**信頼ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::{child-account-id}:root"
      },
      "Action": "sts:AssumeRole",
      "Condition": {
        "StringEquals": {
          "aws:PrincipalOrgID": "o-xxxxxxxxxx"
        }
      }
    }
  ]
}
```

**アクセスポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:{region}:{parent-account-id}:log-group:/aws/lambda/{環境}-aidev-central-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::{環境}-aidev-s3-central-config/*"
    }
  ]
}
```

## 9. CI/CD権限

### 9.1 CodeBuild実行ロール

CodeBuildの実行に必要な権限を持つロールを定義します。

**ロール名**: `{環境}-aidev-codebuild-service-role`

**ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:*:*:*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:GetObjectVersion",
        "s3:GetBucketAcl",
        "s3:GetBucketLocation"
      ],
      "Resource": [
        "arn:aws:s3:::{環境}-aidev-s3-artifacts",
        "arn:aws:s3:::{環境}-aidev-s3-artifacts/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "codecommit:GitPull"
      ],
      "Resource": "arn:aws:codecommit:{region}:{account-id}:{環境}-aidev-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:ValidateTemplate"
      ],
      "Resource": "*"
    }
  ]
}
```

### 9.2 CodePipeline実行ロール

CodePipelineの実行に必要な権限を持つロールを定義します。

**ロール名**: `{環境}-aidev-codepipeline-service-role`

**ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:GetObjectVersion",
        "s3:GetBucketVersioning",
        "s3:PutObject"
      ],
      "Resource": [
        "arn:aws:s3:::{環境}-aidev-s3-artifacts",
        "arn:aws:s3:::{環境}-aidev-s3-artifacts/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "codecommit:GetBranch",
        "codecommit:GetCommit",
        "codecommit:UploadArchive",
        "codecommit:GetUploadArchiveStatus",
        "codecommit:CancelUploadArchive"
      ],
      "Resource": "arn:aws:codecommit:{region}:{account-id}:{環境}-aidev-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "codebuild:BatchGetBuilds",
        "codebuild:StartBuild"
      ],
      "Resource": "arn:aws:codebuild:{region}:{account-id}:project/{環境}-aidev-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:CreateStack",
        "cloudformation:UpdateStack",
        "cloudformation:DeleteStack",
        "cloudformation:DescribeStacks",
        "cloudformation:CreateChangeSet",
        "cloudformation:ExecuteChangeSet",
        "cloudformation:DeleteChangeSet",
        "cloudformation:DescribeChangeSet"
      ],
      "Resource": "arn:aws:cloudformation:{region}:{account-id}:stack/{環境}-aidev-*/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:PassRole"
      ],
      "Resource": "arn:aws:iam::{account-id}:role/{環境}-aidev-cloudformation-*",
      "Condition": {
        "StringEquals": {
          "iam:PassedToService": "cloudformation.amazonaws.com"
        }
      }
    }
  ]
}
```

### 9.3 CloudFormation実行ロール

CloudFormationがデプロイ時に使用するロールを定義します。

**ロール名**: `{環境}-aidev-cloudformation-execution-role`

**ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iam:*Role*",
        "iam:*Policy*",
        "lambda:*",
        "apigateway:*",
        "s3:*",
        "dynamodb:*",
        "logs:*",
        "cloudfront:*",
        "route53:*",
        "cloudwatch:*",
        "sns:*",
        "sqs:*",
        "ec2:*Vpc*",
        "ec2:*Subnet*",
        "ec2:*Route*",
        "ec2:*SecurityGroup*",
        "ec2:*Address*",
        "cognito-idp:*"
      ],
      "Resource": "*"
    }
  ]
}
```

**信頼ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Service": "cloudformation.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

## 10. ポリシー管理戦略

### 10.1 ポリシー管理手法

IAMポリシーとロールの管理には、以下の手法を採用します：

1. **CloudFormationを使用したバージョン管理**:
   - すべてのIAMリソースをCloudFormationテンプレートで定義
   - GitリポジトリでのIaCコード管理
   - CI/CDパイプラインを使った変更デプロイ

2. **マネージドポリシーの活用**:
   - 共通機能には、カスタムマネージドポリシーを作成
   - 再利用性の高いポリシーはマネージドポリシー化

3. **定期的なポリシーレビュー**:
   - 四半期ごとのポリシーレビュー
   - 未使用権限の特定と削除
   - セキュリティベストプラクティスの適用

### 10.2 権限境界の活用

サービス全体の権限範囲を制限するために、権限境界（Permissions Boundary）を活用します。

**権限境界ポリシー**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "iam:Get*",
        "iam:List*",
        "iam:Generate*"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "iam:CreateRole",
        "iam:DeleteRole",
        "iam:PutRolePolicy",
        "iam:DeleteRolePolicy",
        "iam:AttachRolePolicy",
        "iam:DetachRolePolicy"
      ],
      "Resource": "arn:aws:iam::{account-id}:role/{環境}-aidev-*"
    },
    {
      "Effect": "Deny",
      "Action": [
        "iam:*"
      ],
      "Resource": [
        "arn:aws:iam::{account-id}:role/OrganizationAccountAccessRole",
        "arn:aws:iam::{account-id}:role/aws-service-role/*"
      ]
    },
    {
      "Effect": "Deny",
      "Action": [
        "organizations:LeaveOrganization"
      ],
      "Resource": "*"
    }
  ]
}
```

## 11. 次のステップ

本ドキュメントで定義したIAMポリシー設計に基づき、次のステップとして以下のタスクを実施します：

1. **CloudFormationテンプレートへの実装**: 定義したIAMポリシーとロールをCloudFormationテンプレートに変換
2. **ロールのテストプラン作成**: 各ロールが意図した通りに機能することを検証するテスト計画の策定
3. **権限最適化プロセス設計**: 長期的な権限の最適化とメンテナンスのプロセスを確立
EOF < /dev/null
