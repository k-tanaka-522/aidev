# aiDev DynamoDBデータモデル設計

## 1. 概要

本ドキュメントでは、aiDevシステムで使用するDynamoDBのデータモデル設計を定義します。DynamoDBは主要なデータストアとして使用され、ユーザー情報、エージェントのコンテキスト、セッション管理、マルチテナントデータなどを管理します。この設計は、アクセスパターンを最適化し、スケーラビリティとパフォーマンスを確保することを目的としています。

## 2. 設計原則

aiDevのDynamoDBデータモデル設計では、以下の原則を適用します：

1. **シングルテーブルデザイン**：可能な限り関連データを1つのテーブルに統合し、クエリの効率化
2. **アクセスパターン駆動設計**：主要なアクセスパターンを最適化するキー設計
3. **データ分離の徹底**：テナント間のデータ隔離を確実にするパーティション設計
4. **柔軟なスキーマ**：属性の追加・変更が容易な非正規化構造
5. **スパースインデックス**：必要な項目のみにGSI/LSIを適用
6. **TTL（有効期限）の活用**：一時データの自動削除による管理コスト削減

## 3. メインテーブル設計

### 3.1 UserDataテーブル

このテーブルは、ユーザー情報、セッション、顧客メタデータ、アカウント情報などをまとめて管理します。

#### 3.1.1 キー構造

- **パーティションキー (PK)**: `<エンティティタイプ>#<ID>`
  - 例: `USER#u123456`, `TENANT#t789012`
- **ソートキー (SK)**: `<エンティティサブタイプ>#<詳細ID>#<追加識別子>`
  - 例: `PROFILE`, `SESSION#s456789`, `ACCOUNT#a101112`

#### 3.1.2 インデックス構造

**GSI1**:
- パーティションキー: `SK`
- ソートキー: `PK`
- 目的: 逆引き検索

**GSI2**:
- パーティションキー: `EntityType`
- ソートキー: `CreatedAt`
- 目的: タイプ別の時系列検索

**GSI3**:
- パーティションキー: `TenantId`
- ソートキー: `EntityId`
- 目的: テナント別データアクセス

#### 3.1.3 データエンティティ例

**ユーザープロファイル**:
```json
{
  "PK": "USER#u123456",
  "SK": "PROFILE",
  "EntityType": "USER",
  "EntityId": "u123456",
  "TenantId": "t789012",
  "Email": "user@example.com",
  "Name": "山田太郎",
  "CreatedAt": "2025-04-01T10:30:00Z",
  "UpdatedAt": "2025-04-15T14:45:00Z",
  "Status": "ACTIVE",
  "UserAttributes": {
    "Company": "株式会社サンプル",
    "Position": "IT部門マネージャー",
    "Industry": "製造業"
  }
}
```

**ユーザーセッション**:
```json
{
  "PK": "USER#u123456",
  "SK": "SESSION#s456789",
  "EntityType": "SESSION",
  "EntityId": "s456789",
  "TenantId": "t789012",
  "UserId": "u123456",
  "CreatedAt": "2025-04-16T09:15:00Z",
  "ExpiresAt": "2025-04-16T21:15:00Z",
  "LastActivity": "2025-04-16T10:45:00Z",
  "Device": "Web Browser (Chrome 121)",
  "IP": "192.168.1.100",
  "TTL": 1713464100,
  "AuthToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "RefreshToken": "rt-1a2b3c4d5e6f7g8h9i0j..."
}
```

**テナント情報**:
```json
{
  "PK": "TENANT#t789012",
  "SK": "METADATA",
  "EntityType": "TENANT",
  "EntityId": "t789012",
  "TenantName": "株式会社サンプル",
  "CreatedAt": "2025-03-15T08:00:00Z",
  "Status": "ACTIVE",
  "Plan": "BUSINESS",
  "BillingEmail": "billing@example.com",
  "AWSAccountId": "123456789012"
}
```

**テナントユーザー関連付け**:
```json
{
  "PK": "TENANT#t789012",
  "SK": "USER#u123456",
  "EntityType": "TENANT_USER",
  "TenantId": "t789012",
  "UserId": "u123456",
  "Role": "ADMIN",
  "JoinedAt": "2025-03-20T14:30:00Z",
  "Status": "ACTIVE",
  "Permissions": ["MANAGE_USERS", "VIEW_BILLING", "ACCESS_APIS"]
}
```

**AWSアカウント情報**:
```json
{
  "PK": "TENANT#t789012",
  "SK": "ACCOUNT#a101112",
  "EntityType": "AWS_ACCOUNT",
  "EntityId": "a101112",
  "TenantId": "t789012",
  "AWSAccountId": "123456789012",
  "AccountEmail": "aws-account@example.com",
  "CreatedAt": "2025-03-15T09:30:00Z",
  "Status": "ACTIVE",
  "OrganizationUnitId": "ou-abcd-12345678",
  "RootRoleArn": "arn:aws:iam::123456789012:role/OrganizationAccountAccessRole",
  "CrossAccountRoles": [
    {
      "RoleName": "CustomerManageRole",
      "RoleArn": "arn:aws:iam::123456789012:role/CustomerManageRole"
    }
  ]
}
```

### 3.2 AgentContextテーブル

このテーブルはAIエージェントのコンテキスト情報、会話履歴、状態を管理します。

#### 3.2.1 キー構造

- **パーティションキー (PK)**: `<テナントID>#<ユーザーID>#<セッションID>`
  - 例: `t789012#u123456#s456789`
- **ソートキー (SK)**: `<エージェントID>#<タイムスタンプ>`
  - 例: `AGENT_PS01#2025-04-16T10:30:45.123Z`

#### 3.2.2 インデックス構造

**GSI1**:
- パーティションキー: `TenantId`
- ソートキー: `CreatedAt`
- 目的: テナント別の会話履歴検索

**GSI2**:
- パーティションキー: `SessionId`
- ソートキー: `AgentId`
- 目的: セッション別のエージェント活動検索

**GSI3**:
- パーティションキー: `UserId`
- ソートキー: `CreatedAt`
- 目的: ユーザー別の会話履歴検索

#### 3.2.3 データエンティティ例

**エージェントメッセージ**:
```json
{
  "PK": "t789012#u123456#s456789",
  "SK": "AGENT_PS01#2025-04-16T10:30:45.123Z",
  "TenantId": "t789012",
  "UserId": "u123456",
  "SessionId": "s456789",
  "AgentId": "AGENT_PS01",
  "MessageId": "msg_abcdef123456",
  "MessageType": "AGENT_RESPONSE",
  "Content": "AWSの環境構築についてご相談いただきありがとうございます。...",
  "CreatedAt": "2025-04-16T10:30:45.123Z",
  "Metadata": {
    "TokenCount": 345,
    "ModelUsed": "claude-3-7-sonnet",
    "PromptId": "ps01_initial_response"
  }
}
```

**ユーザーメッセージ**:
```json
{
  "PK": "t789012#u123456#s456789",
  "SK": "USER#2025-04-16T10:29:30.456Z",
  "TenantId": "t789012",
  "UserId": "u123456",
  "SessionId": "s456789",
  "MessageId": "msg_uvwxyz789012",
  "MessageType": "USER_INPUT",
  "Content": "EC2、RDS、S3を使ったWebアプリケーション環境を構築したいです。予算は月額5万円程度です。",
  "CreatedAt": "2025-04-16T10:29:30.456Z"
}
```

**エージェントコンテキスト**:
```json
{
  "PK": "t789012#u123456#s456789",
  "SK": "CONTEXT#AGENT_PS01",
  "TenantId": "t789012",
  "UserId": "u123456",
  "SessionId": "s456789",
  "AgentId": "AGENT_PS01",
  "CurrentState": "SOLUTION_PROPOSAL",
  "PreviousStates": ["INITIAL_HEARING", "REQUIREMENTS_ANALYSIS"],
  "ExtractedRequirements": {
    "ApplicationType": "Web",
    "Components": ["EC2", "RDS", "S3"],
    "Budget": 50000,
    "BudgetCurrency": "JPY",
    "BudgetPeriod": "MONTHLY"
  },
  "ProposedSolutions": [
    {
      "Id": "sol_12345",
      "Name": "基本Webアプリ構成",
      "Description": "EC2, RDS, S3を使った基本的なWebアプリケーション環境",
      "EstimatedCost": 45000
    }
  ],
  "UpdatedAt": "2025-04-16T10:35:12.789Z"
}
```

**エージェント間連携レコード**:
```json
{
  "PK": "t789012#u123456#s456789",
  "SK": "HANDOFF#AGENT_PS01#AGENT_SA01#2025-04-16T10:40:00.123Z",
  "TenantId": "t789012",
  "UserId": "u123456",
  "SessionId": "s456789",
  "SourceAgentId": "AGENT_PS01",
  "TargetAgentId": "AGENT_SA01",
  "HandoffReason": "DETAILED_ARCHITECTURE_DESIGN",
  "HandoffTimestamp": "2025-04-16T10:40:00.123Z",
  "TransferredContext": {
    "ExtractedRequirements": {...},
    "ProposedSolutions": [...],
    "UserPreferences": {...}
  },
  "Status": "COMPLETED",
  "CompletionTimestamp": "2025-04-16T10:40:02.456Z"
}
```

### 3.3 ナレッジベースメタデータテーブル

このテーブルはナレッジベースのメタデータと検索インデックスを管理します。

#### 3.3.1 キー構造

- **パーティションキー (PK)**: `<ナレッジベースID>`
  - 例: `KB#aws-solutions`
- **ソートキー (SK)**: `<ドキュメントID>`
  - 例: `DOC#vpc-design-patterns`

#### 3.3.2 インデックス構造

**GSI1**:
- パーティションキー: `Category`
- ソートキー: `Title`
- 目的: カテゴリ別のドキュメント検索

**GSI2**:
- パーティションキー: `TenantId`
- ソートキー: `UpdatedAt`
- 目的: テナント固有ナレッジの時系列検索

#### 3.3.3 データエンティティ例

**ナレッジベースメタデータ**:
```json
{
  "PK": "KB#aws-solutions",
  "SK": "METADATA",
  "KnowledgeBaseId": "aws-solutions",
  "Title": "AWS Solutions Knowledge Base",
  "Description": "AWSソリューション構築のベストプラクティス集",
  "CreatedAt": "2025-01-15T08:00:00Z",
  "UpdatedAt": "2025-04-10T14:30:00Z",
  "DocumentCount": 254,
  "Status": "ACTIVE",
  "AccessLevel": "PUBLIC"
}
```

**ナレッジドキュメントメタデータ**:
```json
{
  "PK": "KB#aws-solutions",
  "SK": "DOC#vpc-design-patterns",
  "KnowledgeBaseId": "aws-solutions",
  "DocumentId": "vpc-design-patterns",
  "Title": "VPC設計パターン集",
  "Description": "様々なユースケース向けのVPC設計パターンとベストプラクティス",
  "Category": "NETWORKING",
  "Tags": ["VPC", "Subnet", "Security Group", "NACL"],
  "CreatedAt": "2025-02-01T10:15:00Z",
  "UpdatedAt": "2025-04-05T16:45:00Z",
  "Status": "ACTIVE",
  "ContentLocation": "s3://aidev-knowledge/aws-solutions/vpc-design-patterns.md",
  "TenantId": null
}
```

**テナント固有ナレッジドキュメント**:
```json
{
  "PK": "KB#custom-tenant-kb",
  "SK": "DOC#t789012-architecture-review",
  "KnowledgeBaseId": "custom-tenant-kb",
  "DocumentId": "t789012-architecture-review",
  "Title": "株式会社サンプルのアーキテクチャレビュー",
  "Description": "既存システムの分析とクラウド移行計画",
  "Category": "ARCHITECTURE_REVIEW",
  "Tags": ["Migration", "Cost Optimization", "Security"],
  "CreatedAt": "2025-04-01T13:20:00Z",
  "UpdatedAt": "2025-04-01T13:20:00Z",
  "Status": "ACTIVE",
  "ContentLocation": "s3://aidev-knowledge/tenant-specific/t789012/architecture-review.md",
  "TenantId": "t789012",
  "AccessControl": {
    "AllowedRoles": ["ADMIN", "ARCHITECT"],
    "AllowedUserIds": ["u123456", "u234567"]
  }
}
```

## 4. アクセスパターン最適化

### 4.1 主要アクセスパターン

以下の主要アクセスパターンを最適化するようにデータモデルを設計しています：

1. **ユーザー管理**:
   - ユーザーIDによるプロファイル取得
   - Eメールアドレスによるユーザー検索
   - テナント内のすべてのユーザーの一覧取得

2. **セッション管理**:
   - セッションIDによるセッション情報取得
   - ユーザーIDによる有効なセッション取得
   - 期限切れセッションの検出と削除

3. **エージェントコンテキスト**:
   - セッションID+エージェントIDによるコンテキスト取得
   - セッション内の時系列順メッセージ一覧取得
   - テナント全体のエージェント活動の分析

4. **テナント管理**:
   - テナント情報の取得と更新
   - テナントに関連するAWSアカウント情報の取得
   - テナントユーザーの関連付け管理

5. **ナレッジベースアクセス**:
   - カテゴリ別のナレッジドキュメント検索
   - テナント固有のナレッジドキュメント取得
   - ナレッジベース全体のドキュメント一覧取得

### 4.2 クエリ例

#### 4.2.1 ユーザープロファイル取得

```javascript
const params = {
  TableName: "UserDataTable",
  Key: {
    PK: "USER#u123456",
    SK: "PROFILE"
  }
};
```

#### 4.2.2 セッション情報取得

```javascript
const params = {
  TableName: "UserDataTable",
  Key: {
    PK: "USER#u123456",
    SK: "SESSION#s456789"
  }
};
```

#### 4.2.3 テナント内のすべてのユーザー取得

```javascript
const params = {
  TableName: "UserDataTable",
  IndexName: "GSI3",
  KeyConditionExpression: "TenantId = :tid AND begins_with(EntityId, :prefix)",
  ExpressionAttributeValues: {
    ":tid": "t789012",
    ":prefix": "u"
  }
};
```

#### 4.2.4 特定セッションのエージェントコンテキスト取得

```javascript
const params = {
  TableName: "AgentContextTable",
  Key: {
    PK: "t789012#u123456#s456789",
    SK: "CONTEXT#AGENT_PS01"
  }
};
```

#### 4.2.5 セッション内のメッセージ履歴取得

```javascript
const params = {
  TableName: "AgentContextTable",
  KeyConditionExpression: "PK = :pk AND begins_with(SK, :prefix)",
  ExpressionAttributeValues: {
    ":pk": "t789012#u123456#s456789",
    ":prefix": "AGENT"
  }
};
```

#### 4.2.6 カテゴリ別のナレッジドキュメント検索

```javascript
const params = {
  TableName: "KnowledgeBaseTable",
  IndexName: "GSI1",
  KeyConditionExpression: "Category = :category",
  ExpressionAttributeValues: {
    ":category": "NETWORKING"
  }
};
```

## 5. データ分離モデル

### 5.1 マルチテナントデータ分離

aiDevシステムでは、テナント（顧客）間のデータ分離を以下の方法で実現します：

1. **キーレベル分離**:
   - テナントID (TenantId) をパーティションキーの一部として使用
   - すべてのクエリにテナントIDを含める

2. **親アカウント/子アカウント分離**:
   - 特に機密性の高いデータは子アカウント内のストレージに保存
   - 親アカウントはメタデータとアクセス情報のみを管理

3. **IAMポリシーによる制御**:
   - 細粒度アクセス制御(FGAC)を使用したテナント分離
   - IAMポリシー条件でテナントIDを制約

### 5.2 IAMポリシー例

**テナント分離ポリシー**:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:Query",
        "dynamodb:BatchGetItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:us-west-2:123456789012:table/UserDataTable",
        "arn:aws:dynamodb:us-west-2:123456789012:table/AgentContextTable"
      ],
      "Condition": {
        "ForAllValues:StringEquals": {
          "dynamodb:LeadingKeys": ["${aws:PrincipalTag/TenantId}"]
        }
      }
    }
  ]
}
```

**エージェント実行ロールポリシー**:

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
      "Resource": "arn:aws:dynamodb:us-west-2:123456789012:table/AgentContextTable",
      "Condition": {
        "StringEquals": {
          "dynamodb:LeadingKeys": ["${aws:PrincipalTag/TenantId}#*"]
        }
      }
    }
  ]
}
```

## 6. パフォーマンス最適化

### 6.1 プロビジョニングとスケーリング

#### 6.1.1 キャパシティモード選択

- **オンデマンドモード**: MVPフェーズおよび不安定なワークロードに対して
- **プロビジョンドモード**: 安定したワークロードが確立された後

#### 6.1.2 Auto Scaling設定

**UserDataテーブル**:
- 最小キャパシティユニット: 5
- 最大キャパシティユニット: 100
- ターゲット使用率: 70%
- スケールイン/アウトの速度: ゆるやか/速い

**AgentContextテーブル**:
- 最小キャパシティユニット: 10
- 最大キャパシティユニット: 500
- ターゲット使用率: 70%
- スケールイン/アウトの速度: ゆるやか/速い

### 6.2 パーティションキー設計の最適化

- **ホットパーティション回避**: テナントID+ユーザーID+セッションIDの組み合わせによるパーティション分散
- **項目サイズの最適化**: 大きなドキュメントは最大400KBに収まるように分割
- **パーティション均等化**: 高トラフィックのキーにソルト追加（必要に応じて）

### 6.3 キャッシング戦略

- **DAX (DynamoDB Accelerator)**: 高頻度読み取りパターンのキャッシング
- **アプリケーションキャッシュ**: クライアント側でのセッション/コンテキストキャッシング
- **TTLと更新ポリシー**: 適切なキャッシュ期間とバリデーション

## 7. データコンシステンシーモデル

### 7.1 整合性レベル設定

- **強力な整合性**: ユーザー認証、セッション管理、エージェントコンテキストなどの重要操作
- **結果整合性**: ナレッジベース検索、分析クエリなど低頻度/読み取り専用操作
- **トランザクション使用条件**: 複数項目の同時更新が必要な操作（テナント作成とユーザー関連付けなど）

### 7.2 バージョン管理

- **オプティミスティックロック**: 条件付き更新による競合解決
- **バージョン番号**: 更新可能な項目へのバージョン属性追加

```javascript
// オプティミスティックロックの例
const updateParams = {
  TableName: "AgentContextTable",
  Key: {
    PK: "t789012#u123456#s456789",
    SK: "CONTEXT#AGENT_PS01"
  },
  UpdateExpression: "SET CurrentState = :newState, UpdatedAt = :now, Version = :newVersion",
  ConditionExpression: "Version = :oldVersion",
  ExpressionAttributeValues: {
    ":newState": "SOLUTION_PRESENTATION",
    ":now": "2025-04-16T11:15:30.123Z",
    ":newVersion": 7,
    ":oldVersion": 6
  }
};
```

## 8. データライフサイクル管理

### 8.1 TTL（有効期限）設定

- **セッションデータ**: 非アクティブ期間12時間後に削除
- **一時コンテキスト**: 会話終了から24時間後に削除
- **通知・アラート**: 処理または確認から72時間後に削除

### 8.2 アーカイブ戦略

- **コールドストレージへの移行**: 30日以上経過した会話履歴はS3にアーカイブ
- **増分バックアップ**: 日次のDynamoDBバックアップ
- **Point-in-time Recovery (PITR)**: 重要テーブルに対して有効化

### 8.3 履歴データ管理

- **履歴レコードパターン**: 更新時に履歴レコードを作成
- **圧縮戦略**: 長期保存データの圧縮
- **サマリ生成**: 詳細データを要約して長期保存

## 9. フェーズ別実装計画

### 9.1 MVPフェーズ

- **基本テーブル構造の実装**: UserDataとAgentContextテーブルの基本構造
- **シンプルなインデックス**: 最低限必要なGSI
- **オンデマンドキャパシティ**: スケーリング自動化のためのオンデマンドモード
- **プリセールスフロー対応**: MVPで必要なデータ構造と操作の実装

### 9.2 フェーズ2

- **追加インデックス**: より複雑なクエリパターン対応
- **DAXの導入**: 高トラフィックパターンのキャッシング
- **マルチテナント最適化**: テナント分離とアクセス制御の強化
- **バックアップ・復旧システム**: 本格的なバックアップ戦略の実装

### 9.3 フェーズ3

- **グローバルテーブル**: 複数リージョン展開（必要に応じて）
- **高度な分析クエリ**: 使用状況や効果の分析データモデル
- **フルマネージドライフサイクル**: 完全自動化されたデータ管理
- **エンタープライズ統合**: 大規模組織のユースケース対応

## 10. 監視と運用

### 10.1 メトリクス監視

- **CloudWatch メトリクス**:
  - 読み取り/書き込みキャパシティ使用率
  - スロットリングイベント
  - SystemErrors と UserErrors
  - 条件チェック失敗

- **カスタムメトリクス**:
  - クエリレイテンシ
  - 項目サイズ分布
  - テナント別使用量

### 10.2 アラート設定

- **スロットリングアラート**:
  - しきい値: 5分間で10回以上のスロットリング
  - アクション: キャパシティ自動増加と通知

- **エラー率アラート**:
  - しきい値: 1分間で5%以上のエラー率
  - アクション: オンコール通知とインシデント作成

- **使用量アラート**:
  - しきい値: 容量の80%以上の持続的使用
  - アクション: 運用チームへの通知とスケーリング計画

### 10.3 コスト最適化戦略

- **使用パターン分析**:
  - 定期的な使用状況レポート
  - 未使用または過剰なインデックスの特定

- **リザーブドキャパシティ**:
  - 安定したワークロードに対して事前予約
  - 使用率予測に基づく最適化

- **データ圧縮とクリーンアップ**:
  - 不要なフィールドの排除
  - 古いデータの適切なアーカイブまたは削除

## 11. セキュリティ考慮事項

### 11.1 暗号化

- **保存データの暗号化**: AWS KMSを使用したサーバー側暗号化
- **機密属性の暗号化**: 特に機密性の高い属性のクライアント側暗号化
- **キー管理**: 定期的なキーローテーションと厳格なアクセス制御

### 11.2 アクセス制御

- **IAMポリシー制限**: 最小権限の原則に基づく厳格なアクセス制御
- **条件付きアクセス**: テナントIDとユーザーロールによる条件付きポリシー
- **監査ログ**: すべてのアクセスと変更の監査記録

### 11.3 データ保護

- **機密情報処理**: PII（個人識別情報）の適切な処理
- **削除メカニズム**: 安全なデータ削除プロセス
- **バックアップセキュリティ**: バックアップデータの保護と暗号化

## 12. 移行と展開計画

### 12.1 開発環境設定

- 開発用DynamoDBテーブルの作成
- テストデータの生成とロード
- 開発用IAM権限の設定

### 12.2 テスト環境展開

- テスト環境のテーブル設定
- インデックス性能の評価
- 負荷テストとスケーリングテスト

### 12.3 本番環境デプロイメント

- 段階的なデータモデル展開
- モニタリングとアラートの設定
- バックアップと復旧のテスト
