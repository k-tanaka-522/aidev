# aiDev インフラストラクチャ As Code 詳細設計

## 1. はじめに

本ドキュメントは、aiDevプロジェクトのCloudFormationテンプレート設計について記述します。インフラストラクチャをコードとして定義し、一貫性のある環境構築を実現するための詳細設計を提供します。

## 2. CloudFormation設計の基本方針

aiDevシステムのCloudFormation設計は、以下の基本方針に従います：

1. **モジュール化**: 機能ごとに分割された再利用可能なテンプレート構造
2. **環境分離**: 開発/ステージング/本番環境の明確な分離
3. **パラメータ化**: 環境固有の設定を外部パラメータとして管理
4. **ベストプラクティス準拠**: AWSベストプラクティスに従った安全で保守性の高い実装
5. **段階的デプロイ**: 依存関係を考慮した適切なデプロイ順序の定義

## 3. テンプレート構造

### 3.1 全体構成

CloudFormationテンプレートは、以下の階層構造で構成します：

```
/templates/
├── master.yaml                   # マスターテンプレート（メイン）
├── parameters/                   # 環境別パラメータファイル
│   ├── dev-parameters.json
│   ├── stg-parameters.json
│   └── prod-parameters.json
├── networking/                   # ネットワーク関連テンプレート
│   ├── vpc.yaml
│   └── security-groups.yaml
├── storage/                      # ストレージ関連テンプレート
│   ├── s3.yaml
│   └── dynamodb.yaml
├── compute/                      # コンピュート関連テンプレート
│   ├── lambda.yaml
│   └── api-gateway.yaml
├── security/                     # セキュリティ関連テンプレート
│   ├── iam.yaml
│   └── cognito.yaml
├── frontend/                     # フロントエンド関連テンプレート
│   └── cloudfront.yaml
├── monitoring/                   # 監視関連テンプレート
│   ├── cloudwatch.yaml
│   └── alarms.yaml
└── cicd/                         # CI/CD関連テンプレート
    ├── pipeline.yaml
    └── build.yaml
```

### 3.2 マスターテンプレート

マスターテンプレートは、すべてのコンポーネントを統合するエントリーポイントとして機能します。

**構成例（master.yaml）**:
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "aiDev System - Master Template"

Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues:
      - dev
      - stg
      - prod
    Description: Environment name

  OrganizationId:
    Type: String
    Description: AWS Organization ID
    
  ArtifactBucket:
    Type: String
    Description: S3 bucket containing CloudFormation templates

Resources:
  NetworkingStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: \!Sub https://${ArtifactBucket}.s3.amazonaws.com/templates/networking/vpc.yaml
      Parameters:
        Environment: \!Ref Environment

  StorageStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: \!Sub https://${ArtifactBucket}.s3.amazonaws.com/templates/storage/s3.yaml
      Parameters:
        Environment: \!Ref Environment
    DependsOn: NetworkingStack

  # 他のスタックも同様に定義...

Outputs:
  VpcId:
    Description: The VPC ID
    Value: \!GetAtt NetworkingStack.Outputs.VpcId
    Export:
      Name: \!Sub ${Environment}-aidev-VpcId

  # 他の出力パラメータも同様に定義...
```

## 4. コンポーネント別テンプレート設計

### 4.1 ネットワークテンプレート（vpc.yaml）

VPCとサブネットを定義するテンプレートです。

**主要リソース**:
- VPC
- サブネット（パブリック/プライベート）
- インターネットゲートウェイ
- ルートテーブル
- NAT Gateway（ステージング/本番環境のみ）

**設計のポイント**:
- 開発環境では単一AZでコスト最適化
- ステージング/本番環境ではマルチAZ構成
- CIDR範囲は環境ごとに分離
- フローログは本番環境でのみ有効化

**サンプル**:
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "aiDev System - VPC Template"

Parameters:
  Environment:
    Type: String
    Default: dev
    AllowedValues:
      - dev
      - stg
      - prod
  
  # 他のパラメータも同様に定義...

Mappings:
  NetworkConfig:
    dev:
      VpcCidr: 10.0.0.0/16
      PublicSubnet1Cidr: 10.0.0.0/24
      PrivateSubnet1Cidr: 10.0.10.0/24
    stg:
      VpcCidr: 10.1.0.0/16
      PublicSubnet1Cidr: 10.1.0.0/24
      PublicSubnet2Cidr: 10.1.1.0/24
      PrivateSubnet1Cidr: 10.1.10.0/24
      PrivateSubnet2Cidr: 10.1.11.0/24
    prod:
      VpcCidr: 10.2.0.0/16
      PublicSubnet1Cidr: 10.2.0.0/24
      PublicSubnet2Cidr: 10.2.1.0/24
      PrivateSubnet1Cidr: 10.2.10.0/24
      PrivateSubnet2Cidr: 10.2.11.0/24

Conditions:
  IsProduction: \!Equals [\!Ref Environment, "prod"]
  IsMultiAZ: \!Or [\!Equals [\!Ref Environment, "stg"], \!Ref IsProduction]

Resources:
  VPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: \!FindInMap [NetworkConfig, \!Ref Environment, VpcCidr]
      EnableDnsSupport: true
      EnableDnsHostnames: true
      Tags:
        - Key: Name
          Value: \!Sub ${Environment}-aidev-vpc

  # サブネット、IGW、ルートテーブルなど他のリソースも同様に定義...

Outputs:
  VpcId:
    Description: The VPC ID
    Value: \!Ref VPC
    Export:
      Name: \!Sub ${Environment}-aidev-VpcId

  # 他の出力も同様に定義...
```

### 4.2 ストレージテンプレート

#### 4.2.1 S3バケットテンプレート（s3.yaml）

S3バケットを定義するテンプレートです。

**主要リソース**:
- フロントエンド用S3バケット
- CloudFormationテンプレート用S3バケット
- ナレッジベース用S3バケット
- アーティファクト用S3バケット

**設計のポイント**:
- 環境ごとにバケットを分離
- 適切なアクセス制御
- 暗号化設定
- ライフサイクルポリシー

**サンプル**:
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "aiDev System - S3 Buckets Template"

Parameters:
  Environment:
    Type: String
    Default: dev
    
  # 他のパラメータも同様に定義...

Conditions:
  IsProduction: \!Equals [\!Ref Environment, "prod"]

Resources:
  FrontendBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: \!Sub ${Environment}-aidev-s3-frontend
      AccessControl: Private
      WebsiteConfiguration:
        IndexDocument: index.html
        ErrorDocument: error.html
      VersioningConfiguration:
        Status: Enabled
      BucketEncryption:
        ServerSideEncryptionConfiguration:
          - ServerSideEncryptionByDefault:
              SSEAlgorithm: AES256
      LifecycleConfiguration:
        Rules:
          - Id: DeleteOldVersions
            Status: Enabled
            NoncurrentVersionExpirationInDays: \!If [IsProduction, 90, 30]

  # 他のバケットも同様に定義...

Outputs:
  FrontendBucketName:
    Description: Frontend S3 Bucket Name
    Value: \!Ref FrontendBucket
    Export:
      Name: \!Sub ${Environment}-aidev-FrontendBucketName

  # 他の出力も同様に定義...
```

#### 4.2.2 DynamoDBテンプレート（dynamodb.yaml）

DynamoDBテーブルを定義するテンプレートです。

**主要リソース**:
- セッションテーブル
- ユーザーテーブル
- アカウントテーブル
- デプロイメント状態テーブル

**設計のポイント**:
- 適切なプライマリキーとGSI設計
- オンデマンドキャパシティモードの活用
- TTL設定
- バックアップ設定

**サンプル**:
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "aiDev System - DynamoDB Tables Template"

Parameters:
  Environment:
    Type: String
    Default: dev
    
  # 他のパラメータも同様に定義...

Conditions:
  IsProduction: \!Equals [\!Ref Environment, "prod"]

Resources:
  SessionsTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: \!Sub ${Environment}-aidev-ddb-sessions
      BillingMode: PAY_PER_REQUEST
      AttributeDefinitions:
        - AttributeName: session_id
          AttributeType: S
        - AttributeName: user_id
          AttributeType: S
        - AttributeName: created_at
          AttributeType: S
      KeySchema:
        - AttributeName: session_id
          KeyType: HASH
      GlobalSecondaryIndexes:
        - IndexName: UserIdIndex
          KeySchema:
            - AttributeName: user_id
              KeyType: HASH
            - AttributeName: created_at
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
      TimeToLiveSpecification:
        AttributeName: expiry_time
        Enabled: true
      PointInTimeRecoverySpecification:
        PointInTimeRecoveryEnabled: \!If [IsProduction, true, false]

  # 他のテーブルも同様に定義...

Outputs:
  SessionsTableName:
    Description: Sessions DynamoDB Table Name
    Value: \!Ref SessionsTable
    Export:
      Name: \!Sub ${Environment}-aidev-SessionsTableName

  # 他の出力も同様に定義...
```

### 4.3 コンピュートテンプレート

#### 4.3.1 Lambda関数テンプレート（lambda.yaml）

Lambda関数を定義するテンプレートです。

**主要リソース**:
- チャットハンドラー関数
- 認証ハンドラー関数
- アカウント作成関数
- 環境構築関数
- Lambda関数の実行ロール

**設計のポイント**:
- 段階的デプロイのための依存関係管理
- 環境別の構成設定
- 適切なメモリとタイムアウト設定
- ロギング設定

**サンプル**:
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "aiDev System - Lambda Functions Template"

Parameters:
  Environment:
    Type: String
    Default: dev
    
  # 他のパラメータも同様に定義...

Mappings:
  LambdaConfig:
    dev:
      Memory: 256
      Timeout: 30
    stg:
      Memory: 512
      Timeout: 15
    prod:
      Memory: 1024
      Timeout: 10

Resources:
  ChatHandlerFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: \!Sub ${Environment}-aidev-lambda-chat-handler
      Handler: index.handler
      Role: \!ImportValue 
        Fn::Sub: ${Environment}-aidev-LambdaChatHandlerRoleArn
      Code:
        S3Bucket: \!Sub ${Environment}-aidev-s3-artifacts
        S3Key: lambda/chat-handler/latest.zip
      Runtime: nodejs18.x
      MemorySize: \!FindInMap [LambdaConfig, \!Ref Environment, Memory]
      Timeout: \!FindInMap [LambdaConfig, \!Ref Environment, Timeout]
      Environment:
        Variables:
          ENVIRONMENT: \!Ref Environment
          SESSIONS_TABLE: \!ImportValue 
            Fn::Sub: ${Environment}-aidev-SessionsTableName
          LOG_LEVEL: \!If [\!Equals [\!Ref Environment, "dev"], "DEBUG", "INFO"]

  # 他のLambda関数も同様に定義...

Outputs:
  ChatHandlerFunctionArn:
    Description: Chat Handler Lambda Function ARN
    Value: \!GetAtt ChatHandlerFunction.Arn
    Export:
      Name: \!Sub ${Environment}-aidev-ChatHandlerFunctionArn

  # 他の出力も同様に定義...
```

#### 4.3.2 API Gatewayテンプレート（api-gateway.yaml）

API Gatewayを定義するテンプレートです。

**主要リソース**:
- REST API
- リソースとメソッド
- ステージ設定
- デプロイメント設定
- 認証設定

**設計のポイント**:
- 環境ごとのステージ分離
- スロットリング設定
- ログ設定
- WebSocket APIとREST APIの連携

**サンプル**:
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "aiDev System - API Gateway Template"

Parameters:
  Environment:
    Type: String
    Default: dev
    
  # 他のパラメータも同様に定義...

Resources:
  ApiGateway:
    Type: AWS::ApiGateway::RestApi
    Properties:
      Name: \!Sub ${Environment}-aidev-api
      Description: \!Sub ${Environment} environment API for aiDev
      EndpointConfiguration:
        Types:
          - REGIONAL

  # チャットAPIリソース
  ChatResource:
    Type: AWS::ApiGateway::Resource
    Properties:
      RestApiId: \!Ref ApiGateway
      ParentId: \!GetAtt ApiGateway.RootResourceId
      PathPart: "chat"

  # POSTメソッド
  ChatPostMethod:
    Type: AWS::ApiGateway::Method
    Properties:
      RestApiId: \!Ref ApiGateway
      ResourceId: \!Ref ChatResource
      HttpMethod: POST
      AuthorizationType: COGNITO_USER_POOLS
      AuthorizerId: \!Ref ApiAuthorizer
      Integration:
        Type: AWS_PROXY
        IntegrationHttpMethod: POST
        Uri: \!Sub arn:aws:apigateway:${AWS::Region}:lambda:path/2015-03-31/functions/${ChatHandlerFunctionArn}/invocations

  # API認証設定
  ApiAuthorizer:
    Type: AWS::ApiGateway::Authorizer
    Properties:
      RestApiId: \!Ref ApiGateway
      Name: \!Sub ${Environment}-aidev-cognito-authorizer
      Type: COGNITO_USER_POOLS
      IdentitySource: method.request.header.Authorization
      ProviderARNs:
        - \!ImportValue 
          Fn::Sub: ${Environment}-aidev-UserPoolArn

  # APIデプロイメント
  ApiDeployment:
    Type: AWS::ApiGateway::Deployment
    DependsOn:
      - ChatPostMethod
    Properties:
      RestApiId: \!Ref ApiGateway
      Description: \!Sub ${Environment} deployment

  # APIステージ
  ApiStage:
    Type: AWS::ApiGateway::Stage
    Properties:
      StageName: \!Ref Environment
      RestApiId: \!Ref ApiGateway
      DeploymentId: \!Ref ApiDeployment
      MethodSettings:
        - ResourcePath: "/*"
          HttpMethod: "*"
          ThrottlingBurstLimit: \!If [\!Equals [\!Ref Environment, "prod"], 100, 200]
          ThrottlingRateLimit: \!If [\!Equals [\!Ref Environment, "prod"], 50, 100]
          LoggingLevel: \!If [\!Equals [\!Ref Environment, "dev"], "INFO", "ERROR"]
          DataTraceEnabled: \!If [\!Equals [\!Ref Environment, "dev"], true, false]
          MetricsEnabled: true

Outputs:
  ApiGatewayUrl:
    Description: API Gateway URL
    Value: \!Sub https://${ApiGateway}.execute-api.${AWS::Region}.amazonaws.com/${Environment}
    Export:
      Name: \!Sub ${Environment}-aidev-ApiGatewayUrl

  # 他の出力も同様に定義...
```

### 4.4 セキュリティテンプレート

#### 4.4.1 IAMロールテンプレート（iam.yaml）

IAMロールとポリシーを定義するテンプレートです。

**主要リソース**:
- Lambda実行ロール
- CloudFormation実行ロール
- CI/CD用サービスロール
- クロスアカウントロール

**設計のポイント**:
- 最小権限の原則に準拠
- 環境ごとのロール分離
- 適切な信頼関係設定
- リソースベースのポリシー制約

**サンプル**:
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "aiDev System - IAM Roles Template"

Parameters:
  Environment:
    Type: String
    Default: dev
    
  # 他のパラメータも同様に定義...

Resources:
  # Lambda基本実行ロール
  LambdaBasicExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: \!Sub ${Environment}-aidev-lambda-basic-execution-role
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

  # チャットハンドラーロール
  LambdaChatHandlerRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: \!Sub ${Environment}-aidev-lambda-chat-handler-role
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      ManagedPolicyArns:
        - arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
      Policies:
        - PolicyName: \!Sub ${Environment}-aidev-chat-handler-policy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - dynamodb:GetItem
                  - dynamodb:PutItem
                  - dynamodb:UpdateItem
                  - dynamodb:Query
                Resource:
                  - \!Sub arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${Environment}-aidev-ddb-sessions
                  - \!Sub arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/${Environment}-aidev-ddb-sessions/index/*
              - Effect: Allow
                Action:
                  - bedrock:InvokeModel
                  - bedrock:InvokeModelWithResponseStream
                Resource:
                  - \!Sub arn:aws:bedrock:${AWS::Region}::foundation-model/*
              - Effect: Allow
                Action:
                  - bedrock-knowledge-base:Retrieve
                  - bedrock-knowledge-base:Query
                Resource:
                  - \!Sub arn:aws:bedrock:${AWS::Region}:${AWS::AccountId}:knowledge-base/${Environment}-aidev-kb-*

  # 他のロールも同様に定義...

Outputs:
  LambdaChatHandlerRoleArn:
    Description: Lambda Chat Handler Role ARN
    Value: \!GetAtt LambdaChatHandlerRole.Arn
    Export:
      Name: \!Sub ${Environment}-aidev-LambdaChatHandlerRoleArn

  # 他の出力も同様に定義...
```

#### 4.4.2 Cognito認証テンプレート（cognito.yaml）

Cognitoユーザープールとアイデンティティプールを定義するテンプレートです。

**主要リソース**:
- ユーザープール
- ユーザープールクライアント
- アイデンティティプール
- 統合されたIAMロール

**設計のポイント**:
- 認証フロー設定
- パスワードポリシー
- MFA設定
- フェデレーテッドID設定（オプション）

**サンプル**:
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "aiDev System - Cognito Authentication Template"

Parameters:
  Environment:
    Type: String
    Default: dev
    
  # 他のパラメータも同様に定義...

Resources:
  # ユーザープール
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: \!Sub ${Environment}-aidev-user-pool
      AdminCreateUserConfig:
        AllowAdminCreateUserOnly: false
      AutoVerifiedAttributes:
        - email
      MfaConfiguration: "OPTIONAL"
      Policies:
        PasswordPolicy:
          MinimumLength: 8
          RequireLowercase: true
          RequireNumbers: true
          RequireSymbols: true
          RequireUppercase: true
      Schema:
        - Name: email
          AttributeDataType: String
          Mutable: false
          Required: true
        - Name: name
          AttributeDataType: String
          Mutable: true
          Required: true

  # ユーザープールクライアント
  UserPoolClient:
    Type: AWS::Cognito::UserPoolClient
    Properties:
      ClientName: \!Sub ${Environment}-aidev-app-client
      UserPoolId: \!Ref UserPool
      GenerateSecret: false
      ExplicitAuthFlows:
        - ALLOW_USER_SRP_AUTH
        - ALLOW_REFRESH_TOKEN_AUTH
      PreventUserExistenceErrors: ENABLED
      ReadAttributes:
        - email
        - name
        - profile
      WriteAttributes:
        - email
        - name
        - profile

  # アイデンティティプール
  IdentityPool:
    Type: AWS::Cognito::IdentityPool
    Properties:
      IdentityPoolName: \!Sub ${Environment}-aidev-identity-pool
      AllowUnauthenticatedIdentities: false
      CognitoIdentityProviders:
        - ClientId: \!Ref UserPoolClient
          ProviderName: \!GetAtt UserPool.ProviderName

  # 認証済みロール
  AuthenticatedRole:
    Type: AWS::IAM::Role
    Properties:
      AssumeRolePolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              Federated: cognito-identity.amazonaws.com
            Action: sts:AssumeRoleWithWebIdentity
            Condition:
              StringEquals:
                "cognito-identity.amazonaws.com:aud": \!Ref IdentityPool
              ForAnyValue:StringLike:
                "cognito-identity.amazonaws.com:amr": authenticated
      Policies:
        - PolicyName: \!Sub ${Environment}-aidev-authenticated-policy
          PolicyDocument:
            Version: "2012-10-17"
            Statement:
              - Effect: Allow
                Action:
                  - execute-api:Invoke
                Resource: \!Sub arn:aws:execute-api:${AWS::Region}:${AWS::AccountId}:*/${Environment}/*

  # アイデンティティプールロール設定
  IdentityPoolRoleAttachment:
    Type: AWS::Cognito::IdentityPoolRoleAttachment
    Properties:
      IdentityPoolId: \!Ref IdentityPool
      Roles:
        authenticated: \!GetAtt AuthenticatedRole.Arn

Outputs:
  UserPoolId:
    Description: Cognito User Pool ID
    Value: \!Ref UserPool
    Export:
      Name: \!Sub ${Environment}-aidev-UserPoolId

  UserPoolArn:
    Description: Cognito User Pool ARN
    Value: \!GetAtt UserPool.Arn
    Export:
      Name: \!Sub ${Environment}-aidev-UserPoolArn

  # 他の出力も同様に定義...
```

### 4.5 フロントエンドテンプレート（cloudfront.yaml）

CloudFrontとS3の静的ウェブホスティングを定義するテンプレートです。

**主要リソース**:
- CloudFrontディストリビューション
- OAI（オリジンアクセスID）
- S3バケットポリシー
- ACM証明書（オプション）

**設計のポイント**:
- S3との安全な統合
- キャッシュ最適化
- カスタムドメイン設定
- エッジロケーション設定

**サンプル**:
```yaml
AWSTemplateFormatVersion: "2010-09-09"
Description: "aiDev System - CloudFront Distribution Template"

Parameters:
  Environment:
    Type: String
    Default: dev
    
  DomainName:
    Type: String
    Description: Custom domain name (optional)
    Default: ""

Conditions:
  HasCustomDomain: \!Not [\!Equals [\!Ref DomainName, ""]]

Resources:
  # CloudFrontディストリビューション
  CloudFrontDistribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Enabled: true
        DefaultRootObject: index.html
        HttpVersion: http2
        PriceClass: \!If [\!Equals [\!Ref Environment, "prod"], "PriceClass_All", "PriceClass_100"]
        Origins:
          - DomainName: \!Sub "${FrontendBucketName}.s3.amazonaws.com"
            Id: S3Origin
            S3OriginConfig:
              OriginAccessIdentity: \!Sub "origin-access-identity/cloudfront/${CloudFrontOAI}"
        DefaultCacheBehavior:
          TargetOriginId: S3Origin
          ViewerProtocolPolicy: redirect-to-https
          AllowedMethods:
            - GET
            - HEAD
            - OPTIONS
          CachedMethods:
            - GET
            - HEAD
            - OPTIONS
          Compress: true
          ForwardedValues:
            QueryString: false
            Cookies:
              Forward: none
        Aliases: \!If
          - HasCustomDomain
          - - \!Ref DomainName
          - \!Ref AWS::NoValue
        ViewerCertificate: \!If
          - HasCustomDomain
          - AcmCertificateArn: \!ImportValue CustomCertificateArn
            SslSupportMethod: sni-only
            MinimumProtocolVersion: TLSv1.2_2019
          - CloudFrontDefaultCertificate: true
        CustomErrorResponses:
          - ErrorCode: 404
            ResponseCode: 200
            ResponsePagePath: /index.html
          - ErrorCode: 403
            ResponseCode: 200
            ResponsePagePath: /index.html

  # CloudFront OAI
  CloudFrontOAI:
    Type: AWS::CloudFront::CloudFrontOriginAccessIdentity
    Properties:
      CloudFrontOriginAccessIdentityConfig:
        Comment: \!Sub "OAI for ${Environment} aiDev frontend"

  # S3バケットポリシー
  BucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: \!ImportValue 
        Fn::Sub: ${Environment}-aidev-FrontendBucketName
      PolicyDocument:
        Version: "2012-10-17"
        Statement:
          - Effect: Allow
            Principal:
              AWS: \!Sub "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ${CloudFrontOAI}"
            Action: s3:GetObject
            Resource: \!Sub "arn:aws:s3:::${FrontendBucketName}/*"

Outputs:
  CloudFrontDomainName:
    Description: CloudFront Distribution Domain Name
    Value: \!GetAtt CloudFrontDistribution.DomainName
    Export:
      Name: \!Sub ${Environment}-aidev-CloudFrontDomainName

  # 他の出力も同様に定義...
```

## 5. テンプレートパラメータ管理

### 5.1 環境別パラメータファイル

環境ごとの設定を分離するためのパラメータファイルを用意します。

**開発環境パラメータ例（dev-parameters.json）
```json
{
  "Parameters": {
    "Environment": "dev",
    "OrganizationId": "o-xxxxxxxxxx",
    "ArtifactBucket": "dev-aidev-s3-artifacts",
    "CostCenter": "CC001-DevTeam",
    "Owner": "DevTeam"
  }
}
```

**ステージング環境パラメータ例（stg-parameters.json）**:
```json
{
  "Parameters": {
    "Environment": "stg",
    "OrganizationId": "o-xxxxxxxxxx",
    "ArtifactBucket": "stg-aidev-s3-artifacts",
    "CostCenter": "CC002-TestTeam",
    "Owner": "TestTeam"
  }
}
```

**本番環境パラメータ例（prod-parameters.json）**:
```json
{
  "Parameters": {
    "Environment": "prod",
    "OrganizationId": "o-xxxxxxxxxx",
    "ArtifactBucket": "prod-aidev-s3-artifacts",
    "CostCenter": "CC003-OperationTeam",
    "Owner": "OperationTeam",
    "DomainName": "aidev.example.com"
  }
}
```

### 5.2 パラメータ設計の原則

1. **共通パラメータと環境固有パラメータの分離**:
   - すべての環境で共通のパラメータはテンプレートにハードコード
   - 環境ごとに異なるパラメータは外部ファイルに定義

2. **デフォルト値の適切な設定**:
   - すべてのパラメータに意味のあるデフォルト値を設定
   - 開発環境の値をデフォルトとして使用

3. **機密パラメータの取り扱い**:
   - パスワードなどの機密情報はパラメータファイルに記述しない
   - AWS Secrets Managerを使用して管理

4. **制約とバリデーション**:
   - AllowedValuesやAllowedPatternを使用して入力値を制約
   - 重要なパラメータに対してNoEchoを使用

## 6. デプロイメント戦略

### 6.1 段階的デプロイメント

リソース間の依存関係を考慮し、以下の順序でスタックをデプロイします：

1. **IAMロール/ポリシー**:
   - 他のリソースが使用するIAMロールとポリシーを最初にデプロイ

2. **ストレージリソース**:
   - S3バケットとDynamoDBテーブルをデプロイ

3. **ネットワークリソース**:
   - VPCとサブネットをデプロイ

4. **コンピュートリソース**:
   - Lambda関数とAPI Gatewayをデプロイ

5. **フロントエンドリソース**:
   - CloudFrontディストリビューションをデプロイ

6. **監視リソース**:
   - モニタリングとアラーム設定をデプロイ

### 6.2 変更セット（ChangeSets）

本番環境への変更には、変更セット（ChangeSet）を使用して事前に影響を確認します。

**変更セットのワークフロー**:
1. 変更セットの作成（テンプレートの更新）
2. 変更内容の確認と検証
3. 変更セットの実行（または拒否と再設計）
4. 結果の検証

**例（AWS CLI）**:
```bash
# 変更セットの作成
aws cloudformation create-change-set \
  --stack-name prod-aidev-master \
  --template-url https://s3.amazonaws.com/prod-aidev-s3-artifacts/templates/master.yaml \
  --parameters file://parameters/prod-parameters.json \
  --capabilities CAPABILITY_NAMED_IAM \
  --change-set-name prod-update-20250401

# 変更内容の確認
aws cloudformation describe-change-set \
  --change-set-name prod-update-20250401 \
  --stack-name prod-aidev-master

# 変更セットの実行
aws cloudformation execute-change-set \
  --change-set-name prod-update-20250401 \
  --stack-name prod-aidev-master
```

### 6.3 ロールバック戦略

デプロイに失敗した場合のロールバック戦略を整備します。

**ロールバック設定**:
- 自動ロールバックの有効化（デプロイに失敗した場合）
- ロールバックトリガーの設定（アラームベース）
- 手動ロールバックのための過去のバージョン管理

**手動ロールバック例（AWS CLI）**:
```bash
# 以前のテンプレートバージョンへのロールバック
aws cloudformation update-stack \
  --stack-name prod-aidev-master \
  --template-url https://s3.amazonaws.com/prod-aidev-s3-artifacts/templates/previous/master.yaml \
  --parameters file://parameters/prod-parameters-previous.json \
  --capabilities CAPABILITY_NAMED_IAM
```

## 7. ベストプラクティスとパターン

### 7.1 テンプレート設計のベストプラクティス

1. **一貫した命名規則**:
   - 論理IDに説明的な名前を使用
   - リソース名にはプレフィックスとサフィックスを一貫して適用

2. **メタデータの活用**:
   - リソースの目的や設定に関する説明をMetadataセクションに記述
   - インスタンス設定のためのAWS::CloudFormation::Initの使用

3. **依存関係の適切な管理**:
   - DependsOnを使用して明示的な依存関係を定義
   - Fnインポート/エクスポートを使用したスタック間の参照

4. **ヘルパースクリプトとカスタムリソース**:
   - 複雑な設定には、AWS::CloudFormation::Customリソースを使用
   - ブートストラップスクリプトを活用した初期設定の自動化

### 7.2 一般的なパターンと解決策

1. **クロススタック参照**:
   - 出力値のエクスポートとインポートを使用
   - スタック間の依存関係を管理

   **例**:
   ```yaml
   # スタック1での出力定義
   Outputs:
     VpcId:
       Description: The VPC ID
       Value: \!Ref VPC
       Export:
         Name: \!Sub ${Environment}-aidev-VpcId

   # スタック2での参照
   Resources:
     SecurityGroup:
       Type: AWS::EC2::SecurityGroup
       Properties:
         VpcId: \!ImportValue 
           Fn::Sub: ${Environment}-aidev-VpcId
   ```

2. **条件付きリソース作成**:
   - 環境または設定に基づいてリソースを条件付きで作成

   **例**:
   ```yaml
   Conditions:
     CreateNatGateway: \!Or
       - \!Equals [\!Ref Environment, "stg"]
       - \!Equals [\!Ref Environment, "prod"]

   Resources:
     NatGateway:
       Type: AWS::EC2::NatGateway
       Condition: CreateNatGateway
       Properties:
         AllocationId: \!GetAtt ElasticIP.AllocationId
         SubnetId: \!Ref PublicSubnet1
   ```

3. **マッピングの活用**:
   - 環境ごとの設定値をマッピングテーブルで管理

   **例**:
   ```yaml
   Mappings:
     EnvironmentConfig:
       dev:
         InstanceType: t3.small
         MaxCapacity: 2
       stg:
         InstanceType: t3.medium
         MaxCapacity: 4
       prod:
         InstanceType: t3.large
         MaxCapacity: 8

   Resources:
     LambdaFunction:
       Type: AWS::Lambda::Function
       Properties:
         MemorySize: \!FindInMap [EnvironmentConfig, \!Ref Environment, MaxCapacity]
   ```

## 8. テンプレートの検証と最適化

### 8.1 静的解析とバリデーション

1. **テンプレート構文の検証**:
   - AWS CloudFormation Linterの使用
   - `aws cloudformation validate-template`コマンドによる検証

2. **ベストプラクティスのチェック**:
   - cfn-nag等のツールによるセキュリティと設計パターンの評価
   - IAMポリシーの最小権限チェック

3. **コーディング規約の遵守**:
   - インデント、コメント、命名規則の一貫性
   - リソース論理IDの命名パターン

### 8.2 テンプレートの最適化

1. **テンプレートサイズの最適化**:
   - ネストされたスタックの活用
   - 再利用可能なコンポーネントの分離

2. **デプロイメント時間の短縮**:
   - 不必要な依存関係の削除
   - パラレルデプロイの最適化

3. **メンテナンス性の向上**:
   - 適切なコメントとドキュメント
   - 変更履歴の管理

## 9. CloudFormationテンプレートのテスト

### 9.1 テスト戦略

1. **単体テスト**:
   - 個々のテンプレートファイルの構文検証
   - リソース設定の妥当性チェック

2. **統合テスト**:
   - テスト環境での実際のデプロイメント
   - リソース作成とプロパティの検証

3. **機能テスト**:
   - 作成されたリソースの機能検証
   - コンポーネント間の相互作用の確認

### 9.2 自動テスト

1. **CI/CDパイプラインでのテスト自動化**:
   - コミット時の構文検証
   - プルリクエスト時の自動デプロイテスト

2. **テスト用のモックスタック**:
   - 本番環境と同等のテスト環境
   - デプロイメントの検証

3. **カナリアデプロイメント**:
   - 小規模な変更を段階的にデプロイ
   - 影響の監視と評価

## 10. 実装計画

### 10.1 フェーズ1（MVP）

以下のコンポーネントに焦点を当てた最小限のテンプレートを作成します：

1. **基本インフラ**:
   - ネットワーク構成（VPC、サブネット、セキュリティグループ）
   - ストレージリソース（S3、DynamoDB）
   - 認証基盤（Cognito）

2. **コア機能**:
   - Lambda関数（チャットハンドラー、認証ハンドラー）
   - API Gateway設定
   - CloudFront配信設定

3. **運用基盤**:
   - 基本的なモニタリングとアラート
   - CI/CDパイプライン
   - バックアップと復旧設定

### 10.2 フェーズ2

機能拡張に対応するテンプレート拡張を行います：

1. **マルチテナント機能強化**:
   - AWS Organizations連携
   - アカウント自動作成機能

2. **環境構築自動化**:
   - CloudFormation実行基盤
   - クロスアカウントアクセス設定

3. **モニタリング強化**:
   - X-Rayトレーシング
   - 高度なアラート設定
   - ダッシュボード設定

### 10.3 フェーズ3

エンタープライズレベルの機能を追加します：

1. **高可用性構成**:
   - マルチリージョン対応
   - 災害復旧設定

2. **セキュリティ強化**:
   - WAF設定
   - VPC Flowログ分析
   - セキュリティ監査

3. **コスト最適化**:
   - リザーブドキャパシティ
   - 自動スケーリング最適化
   - 使用率モニタリング

## 11. 次のステップ

CloudFormationテンプレート設計に基づき、以下のステップを実施します：

1. **テンプレートの初期実装**:
   - マスターテンプレートの作成
   - 主要コンポーネントテンプレートの作成
   - パラメータファイルの作成

2. **テスト環境でのデプロイメント**:
   - テンプレートの検証
   - リソース作成の確認
   - 機能テスト

3. **デプロイメントパイプラインの構築**:
   - CI/CD設定
   - 自動テスト
   - 環境管理
EOT < /dev/null
