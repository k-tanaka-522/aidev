# AWS CloudFormation 規約

## 基本方針

- **Change Sets必須**（dry-run）
- **Well-Architected Framework準拠**
- **設計で判断**（技術標準は推奨であり、プロジェクト要件に応じて調整可能）

---

## ファイル分割の3原則

### なぜファイルを分割するのか？

**目的:**
1. **メンテナンス性**: 変更箇所がすぐわかる
2. **変更リスクの最小化**: 影響範囲を限定
3. **並行作業**: チームで同時に異なるリソースを編集可能
4. **可読性**: ファイル名で何があるかすぐわかる

### 3原則

CloudFormation のファイル分割は、以下の3原則に基づいて判断します：

#### 原則1: AWS コンソールの分け方（基本）

**AWS コンソールで別メニュー → 別ファイル**

- ✅ VPC と Subnets → 別ファイル（別メニュー）
- ✅ VPC と Internet Gateway → 同じファイル（VPC作成時に一緒に作る、密結合）
- ✅ ALB と Target Group と Listener → 同じファイル（ALB配下で一緒に操作）
- ✅ ECS Cluster と ECS Service → 別ファイル（別メニュー）

**理由**: AWS コンソールの構造は、AWS が推奨するリソースの論理的なまとまりを反映しています。

#### 原則2: ライフサイクル（変更頻度）

**初回のみ作成 vs 頻繁に変更 → 分ける**

- ✅ ECS Cluster（変更少） vs Task Definition（変更多） → 別ファイル
- ✅ VPC（初回のみ） vs Security Groups（継続的に追加） → 別ファイル
- ✅ Route53 Hosted Zone（初回のみ） vs Route53 Records（継続的に追加） → 別ファイル

**理由**: 変更頻度が異なるリソースを分けることで、変更リスクを最小化できます。

**AWS公式推奨**: ライフサイクル・オーナーシップで分割

| 更新頻度 | リソース例 | 分離推奨 |
|---------|----------|--------|
| 年単位 | VPC, Subnet, RouteTable | network/ |
| 月単位 | RDS, DynamoDB, S3 | database/ |
| 週単位 | ECS Service, ALB, Auto Scaling | compute/ |
| 日単位 | Task Definition | compute/ecs-task-*.yaml |

#### 原則3: 設定数（増減の可能性）

**1個で固定 vs 継続的に増える → 分ける**

- ✅ VPC（1個） + IGW（1個） → 同じファイルOK
- ✅ Security Groups（激増） → ディレクトリで分割
- ✅ CloudWatch Alarms（激増） → サービス別にファイル分割

**増えやすいリソースの例**:
- Security Groups → `security-groups/alb-sg.yaml`, `security-groups/ecs-sg.yaml`
- CloudWatch Alarms → `cloudwatch-alarms-ecs.yaml`, `cloudwatch-alarms-rds.yaml`
- Route53 Records → `route53-records-api.yaml`, `route53-records-web.yaml`

### 判断フロー

```
1. AWS コンソールで別メニュー？
   ├─ Yes → 分割候補
   └─ No → 同じファイル候補

2. ライフサイクルが異なる？
   ├─ Yes → 分割推奨
   └─ No → 次へ

3. 設定が継続的に増える？
   ├─ Yes → 分割推奨（ディレクトリ化も検討）
   └─ No → 同じファイルでOK
```

### 判断例

| リソース | コンソール | ライフサイクル | 設定数 | 判定 |
|---------|-----------|--------------|--------|------|
| VPC + IGW | 密結合 | 初回のみ | 1個 | 同じファイル |
| Subnets | 別メニュー | たまに追加 | 4個→増える | 別ファイル |
| Security Groups | 別メニュー | 継続的に追加 | 3個→激増 | ディレクトリ |
| ECS Cluster | 別メニュー | 初回のみ | 1個 | 別ファイル |
| Task Definition | 同じメニュー | 頻繁に変更 | 増える | サービス別 |
| ALB + TG + Listener | ALB配下 | たまに変更 | 1個 | 同じファイル |

### クロススタック参照（Export/Import）

**network-stack** (Exportする側)
```yaml
Outputs:
  VpcId:
    Value: !Ref VPC
    Export:
      Name: !Sub ${ProjectName}-${Environment}-VpcId

  PrivateSubnetIds:
    Value: !Join [",", [!Ref PrivateSubnet1, !Ref PrivateSubnet2]]
    Export:
      Name: !Sub ${ProjectName}-${Environment}-PrivateSubnetIds
```

**compute-stack** (Importする側)
```yaml
Resources:
  ECSService:
    Type: AWS::ECS::Service
    Properties:
      NetworkConfiguration:
        AwsvpcConfiguration:
          Subnets: !Split
            - ","
            - !ImportValue
                Fn::Sub: ${ProjectName}-${Environment}-PrivateSubnetIds
```

---

## ディレクトリ構造

### 推奨構造（3原則ベース + ネスト構成 + README インデックス）

```
infra/cloudformation/service/
├── README.md  ← ★ インデックス（3原則の説明、よくある変更の対応表）
├── stack.yaml (親スタック)
├── parameters/                    # 環境差分を集約
│   ├── dev.json
│   └── prod.json
└── nested/
    ├── network/
    │   ├── README.md                    # ネットワーク層のインデックス
    │   ├── vpc-and-igw.yaml             # VPC+IGW（密結合、初回のみ、1個）
    │   ├── subnets.yaml                 # Subnets（別メニュー、たまに追加、増える）
    │   ├── route-tables.yaml            # Route Tables（別メニュー、たまに変更）
    │   ├── nat-gateways.yaml            # NAT GW（別メニュー、初回のみ、高額）
    │   └── security-groups/             # ★ ディレクトリ（激増する）
    │       ├── alb-sg.yaml
    │       ├── ecs-sg.yaml
    │       └── rds-sg.yaml
    ├── database/
    │   ├── README.md
    │   ├── rds-instance.yaml            # RDS（別メニュー、たまに変更、1個）
    │   └── rds-security-group.yaml      # RDS SG（設定複雑なので分離）
    ├── compute/
    │   ├── README.md                    # コンピュート層のインデックス
    │   ├── ecr-repositories.yaml        # ECR（別メニュー、たまに追加、増える）
    │   ├── ecs-cluster.yaml             # Cluster（別メニュー、初回のみ、1個）
    │   ├── ecs-task-public-web.yaml     # Task（頻繁に変更、サービス別）
    │   ├── ecs-service-public-web.yaml  # Service（たまに変更、サービス別）
    │   ├── ecs-task-admin-api.yaml
    │   ├── ecs-service-admin-api.yaml
    │   └── alb.yaml                     # ALB+TG+Listener（密結合、1個）
    └── monitoring/
        ├── README.md
        ├── cloudwatch-log-groups.yaml      # Log Groups（別メニュー、増える）
        ├── cloudwatch-alarms-ecs.yaml      # Alarms（激増、サービス別）
        ├── cloudwatch-alarms-rds.yaml
        ├── cloudwatch-alarms-alb.yaml
        └── eventbridge-rules.yaml          # EventBridge（別メニュー、増える）
```

### README.md インデックスの例

**`service/README.md`**:
```markdown
# Service Account CloudFormation Templates

## 📁 構成（3原則ベース）

### ネットワーク層 (`nested/network/`)
- **VPC と IGW** → `vpc-and-igw.yaml` （密結合）
- **Subnets** → `subnets.yaml` （増える可能性）
- **Security Groups** → `security-groups/*.yaml` （激増）

### コンピュート層 (`nested/compute/`)
- **ECS Cluster** → `ecs-cluster.yaml` （初回のみ）
- **ECS Task** → `ecs-task-*.yaml` （頻繁に変更、サービス別）
- **ALB** → `alb.yaml` （ALB+TG+Listener、密結合）

## 🔍 よくある変更

| やりたいこと | 編集するファイル |
|------------|----------------|
| VPC の CIDR を変更 | `nested/network/vpc-and-igw.yaml` |
| ECS のタスク定義変更 | `nested/compute/ecs-task-public-web.yaml` |
| ALB のリスナールール追加 | `nested/compute/alb.yaml` |
| CloudWatch アラーム追加 | `nested/monitoring/cloudwatch-alarms-ecs.yaml` |
```

### 使い方

```bash
# 1. Network Stack（最初、滅多に更新しない）
aws cloudformation deploy \
  --stack-name myapp-dev-network \
  --template-file stacks/network/main.yaml \
  --parameter-overrides file://parameters/dev.json

# 2. Storage Stack（時々更新）
aws cloudformation deploy \
  --stack-name myapp-dev-storage \
  --template-file stacks/storage/main.yaml \
  --parameter-overrides file://parameters/dev.json

# 3. Compute Stack（頻繁に更新）
aws cloudformation deploy \
  --stack-name myapp-dev-compute \
  --template-file stacks/compute/main.yaml \
  --parameter-overrides file://parameters/dev.json
```

### parameters/dev.json の例（環境差分を集約）

```json
[
  {
    "ParameterKey": "Environment",
    "ParameterValue": "dev"
  },
  {
    "ParameterKey": "ProjectName",
    "ParameterValue": "myapp"
  },
  {
    "ParameterKey": "VpcCidr",
    "ParameterValue": "10.1.0.0/16"
  },
  {
    "ParameterKey": "DBInstanceClass",
    "ParameterValue": "db.t3.micro"
  },
  {
    "ParameterKey": "ECSTaskCpu",
    "ParameterValue": "256"
  }
]
```

**すべての環境差分（dev/prod）がこのファイルに集約される**

### 複雑なプロジェクトの場合

Platform Account / Service Account など、複数のAWSアカウントを使用する場合：

```
infra/cloudformation/
├── platform/                      # Platform Account用
│   ├── stacks/
│   │   ├── network/
│   │   │   └── main.yaml
│   │   └── connectivity/
│   │       └── main.yaml         # TGW, RAM
│   ├── templates/
│   │   └── ...
│   └── parameters/
│       ├── dev.json
│       └── prod.json
│
└── service/                       # Service Account用
    ├── stacks/
    │   ├── network/
    │   ├── storage/
    │   └── compute/
    ├── templates/
    │   └── ...
    └── parameters/
        ├── dev.json
        └── prod.json
```

---

## テンプレート規約

### パラメータ必須項目

```yaml
Parameters:
  Environment:
    Type: String
    AllowedValues:
      - dev
      - stg
      - prd
    Description: Environment name

  ProjectName:
    Type: String
    Description: Project name for resource naming
```

### リソース命名規則

```yaml
Resources:
  MyAppVPC:
    Type: AWS::EC2::VPC
    Properties:
      Tags:
        - Key: Name
          Value: !Sub ${ProjectName}-${Environment}-vpc
        - Key: Environment
          Value: !Ref Environment
```

---

## デプロイ手順（Change Sets必須）

```bash
# ❌ Bad: 直接デプロイ
aws cloudformation deploy \
  --template-file template.yaml \
  --stack-name myapp-prd

# ✅ Good: Change Setsで確認
# 1. Change Set作成
aws cloudformation create-change-set \
  --stack-name myapp-prd \
  --change-set-name update-2025-10-19 \
  --template-body file://template.yaml

# 2. Change Set確認
aws cloudformation describe-change-set \
  --stack-name myapp-prd \
  --change-set-name update-2025-10-19

# 3. 承認後、実行
aws cloudformation execute-change-set \
  --stack-name myapp-prd \
  --change-set-name update-2025-10-19
```

---

## Well-Architected Framework

### 6つの柱

1. **セキュリティ**: IAM、暗号化、SecurityGroup
2. **信頼性**: Multi-AZ、バックアップ
3. **パフォーマンス効率**: Auto Scaling
4. **コスト最適化**: リソース最適化
5. **運用上の優秀性**: CloudWatch、ログ
6. **持続可能性**: リソース効率化

---

## ファイル分割の判断基準

### コメント見出しレベルで判断

**行数ではなく、コメント見出しの数で判断します。**

CloudFormation テンプレートには、見出しレベルがあります：

```yaml
# ==============================================================================
# Resources  ← 大見出し（セクション）
# ==============================================================================

# ------------------------------------------------------------------------------
# VPC  ← 中見出し（リソースの論理的なまとまり）
# ------------------------------------------------------------------------------
ServiceVPC:
  Type: AWS::EC2::VPC
  # ...

# ------------------------------------------------------------------------------
# Internet Gateway  ← 中見出し
# ------------------------------------------------------------------------------
InternetGateway:
  Type: AWS::EC2::InternetGateway
  # ...
```

**判断基準**:
- **中見出し (`# ----`) が3個以上** → 分割を検討
- 中見出し1つ = nested スタック1ファイル

### 判断フロー

```
ファイルを見る
  ↓
中見出し (`# ----`) が何個ある？
  ↓
├─ 1〜2個 → そのまま（分割不要）
├─ 3〜5個 → 分割を検討（3原則で判断）
└─ 6個以上 → 分割推奨
```

### 例外ケース

**分割しない方がいい場合**:
- 中見出しが複数あっても、密結合（必ず一緒に変更）
  - 例: VPC + IGW + VPC Attachment → 1ファイルでOK
  - 例: ALB + TargetGroup + Listener → 1ファイルでOK

**さらに細かく分割する場合**:
- 中見出し内のリソースが10個以上
  - 例: CloudWatch Alarms が20個 → サービス別に分割

### Good Example

#### ✅ 中見出し2個、密結合 → 1ファイル

```yaml
# 設計書に記載:
# 「VPC と IGW は密結合のため、1ファイルで管理。
#  推定200行だが、必ず一緒に変更するため分割しない。」

# ------------------------------------------------------------------------------
# VPC
# ------------------------------------------------------------------------------
ServiceVPC: ...

# ------------------------------------------------------------------------------
# Internet Gateway  ← VPC と密結合
# ------------------------------------------------------------------------------
InternetGateway: ...
AttachGateway: ...
```

#### ✅ 中見出し5個 → ネスト構成に分割

```yaml
# 設計書に記載:
# 「compute.yaml は中見出しが5個あり、3原則で判断した結果、
#  ネスト構成に分割:
#  - ecr-repositories.yaml（別メニュー）
#  - ecs-cluster.yaml（初回のみ）
#  - ecs-task-public-web.yaml（頻繁に変更）
#  - ecs-service-public-web.yaml（たまに変更）
#  - alb.yaml（ALB+TG+Listener、密結合）」

# 元のファイル（760行、中見出し5個）:
# ------------------------------------------------------------------------------
# ECR Repositories
# ------------------------------------------------------------------------------

# ------------------------------------------------------------------------------
# ECS Cluster
# ------------------------------------------------------------------------------

# ------------------------------------------------------------------------------
# ECS Task Definition
# ------------------------------------------------------------------------------

# ------------------------------------------------------------------------------
# ECS Service
# ------------------------------------------------------------------------------

# ------------------------------------------------------------------------------
# Application Load Balancer
# ------------------------------------------------------------------------------
```

### Bad Example

#### ❌ 中見出し5個、752行で1ファイル（理由なし）

```yaml
# 設計書に記載なし
# → 実装時に「とりあえず全部入れた」
# → なぜこの構成か説明できない
# → メンテナンス時にどこを変更すればいいかわからない
```

---

**参照**: `.claude/docs/10_facilitation/2.4_実装フェーズ/2.4.6_IaC構築プロセス/2.4.6.1_CloudFormation構築/`
