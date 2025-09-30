# インフラ（IaC）技術標準

このドキュメントは、Infrastructure as Code (IaC) に関する技術標準とベストプラクティスを定義しています。

**Phase 1 検証対象：AWS（Terraform / CloudFormation）**

---

## 1. 基本方針

### 1.1 IaCの原則

- **すべてをコードで管理**：手動操作禁止
- **冪等性の確保**：何度実行しても同じ結果
- **バージョン管理**：Gitで管理
- **レビュー可能**：Pull Requestでレビュー

### 1.2 AWS IaCツールの選定

| ツール | 特徴 | 推奨ケース |
|--------|------|-----------|
| **Terraform** | マルチクラウド対応、モジュール化しやすい | 推奨（Phase 1検証） |
| **CloudFormation** | AWS特化、ネストスタック | AWS専用プロジェクト |
| **CDK** | プログラミング言語で記述 | 複雑なロジックが必要な場合 |

---

## 2. ディレクトリ構造

### 2.1 Terraform の標準構造

```
project-root/
├── modules/                    # 再利用可能なモジュール
│   ├── vpc/
│   │   ├── main.tf
│   │   ├── variables.tf
│   │   ├── outputs.tf
│   │   └── README.md
│   ├── ec2/
│   ├── rds/
│   └── s3/
│
├── environments/               # 環境ごとの設定
│   ├── dev/
│   │   ├── main.tf            # モジュールの呼び出し
│   │   ├── terraform.tfvars   # 環境固有の値
│   │   ├── backend.tf         # ステートファイル設定
│   │   └── variables.tf
│   ├── stg/
│   └── prod/
│
├── shared/                     # 共通設定
│   ├── variables.tf
│   └── data_sources.tf
│
├── .gitignore
└── README.md
```

### 2.2 CloudFormation の標準構造

```
project-root/
├── templates/                  # CloudFormationテンプレート
│   ├── vpc.yaml
│   ├── ec2.yaml
│   ├── rds.yaml
│   └── main.yaml              # ネストスタックのルート
│
├── parameters/                 # パラメーターファイル
│   ├── dev.json
│   ├── stg.json
│   └── prod.json
│
└── README.md
```

---

## 3. モジュール分割

### 3.1 Terraformモジュール

**原則：**
- リソースタイプごとにモジュール化
- 再利用可能な設計
- 適切な粒度（細かすぎず、大きすぎず）

**モジュールの構成：**

```hcl
# modules/vpc/main.tf
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-vpc"
    }
  )
}

resource "aws_subnet" "public" {
  count             = length(var.public_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.public_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-public-${count.index + 1}"
      Type = "Public"
    }
  )
}
```

```hcl
# modules/vpc/variables.tf
variable "project_name" {
  description = "プロジェクト名"
  type        = string
}

variable "environment" {
  description = "環境名 (dev, stg, prod)"
  type        = string
}

variable "vpc_cidr" {
  description = "VPCのCIDRブロック"
  type        = string
}

variable "public_subnet_cidrs" {
  description = "パブリックサブネットのCIDRブロックリスト"
  type        = list(string)
}

variable "availability_zones" {
  description = "使用するAvailability Zoneのリスト"
  type        = list(string)
}

variable "tags" {
  description = "共通タグ"
  type        = map(string)
  default     = {}
}
```

```hcl
# modules/vpc/outputs.tf
output "vpc_id" {
  description = "作成したVPCのID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "作成したパブリックサブネットのIDリスト"
  value       = aws_subnet.public[*].id
}
```

**モジュールの呼び出し：**

```hcl
# environments/dev/main.tf
module "vpc" {
  source = "../../modules/vpc"

  project_name         = var.project_name
  environment          = var.environment
  vpc_cidr             = "10.0.0.0/16"
  public_subnet_cidrs  = ["10.0.1.0/24", "10.0.2.0/24"]
  availability_zones   = ["ap-northeast-1a", "ap-northeast-1c"]

  tags = local.common_tags
}
```

### 3.2 CloudFormation ネストスタック

```yaml
# templates/main.yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'メインスタック - ネストスタックを統合'

Parameters:
  Environment:
    Type: String
    AllowedValues: [dev, stg, prod]
    Description: 環境名

Resources:
  VPCStack:
    Type: AWS::CloudFormation::Stack
    Properties:
      TemplateURL: !Sub 'https://s3.amazonaws.com/${S3Bucket}/templates/vpc.yaml'
      Parameters:
        Environment: !Ref Environment
        VpcCIDR: !FindInMap [EnvironmentMap, !Ref Environment, VpcCIDR]

  EC2Stack:
    Type: AWS::CloudFormation::Stack
    DependsOn: VPCStack
    Properties:
      TemplateURL: !Sub 'https://s3.amazonaws.com/${S3Bucket}/templates/ec2.yaml'
      Parameters:
        Environment: !Ref Environment
        VpcId: !GetAtt VPCStack.Outputs.VpcId
```

---

## 4. 環境差分の管理

### 4.1 Terraform での環境差分

**terraform.tfvars による管理：**

```hcl
# environments/dev/terraform.tfvars
environment      = "dev"
aws_region       = "ap-northeast-1"
instance_type    = "t3.micro"
db_instance_class = "db.t3.micro"
min_size         = 1
max_size         = 2
desired_capacity = 1
```

```hcl
# environments/prod/terraform.tfvars
environment      = "prod"
aws_region       = "ap-northeast-1"
instance_type    = "t3.large"
db_instance_class = "db.r5.large"
min_size         = 2
max_size         = 10
desired_capacity = 4
```

**locals での環境別設定：**

```hcl
# environments/dev/main.tf
locals {
  environment = "dev"

  common_tags = {
    Project     = var.project_name
    Environment = local.environment
    ManagedBy   = "Terraform"
  }

  # 環境別の設定
  config = {
    enable_nat_gateway     = false  # dev環境ではコスト削減
    enable_backup          = false
    enable_deletion_protection = false
    multi_az               = false
  }
}
```

```hcl
# environments/prod/main.tf
locals {
  environment = "prod"

  common_tags = {
    Project     = var.project_name
    Environment = local.environment
    ManagedBy   = "Terraform"
  }

  # 環境別の設定
  config = {
    enable_nat_gateway     = true   # prod環境では有効化
    enable_backup          = true
    enable_deletion_protection = true
    multi_az               = true
  }
}
```

### 4.2 CloudFormation での環境差分

```json
// parameters/dev.json
[
  {
    "ParameterKey": "Environment",
    "ParameterValue": "dev"
  },
  {
    "ParameterKey": "InstanceType",
    "ParameterValue": "t3.micro"
  },
  {
    "ParameterKey": "DBInstanceClass",
    "ParameterValue": "db.t3.micro"
  }
]
```

```json
// parameters/prod.json
[
  {
    "ParameterKey": "Environment",
    "ParameterValue": "prod"
  },
  {
    "ParameterKey": "InstanceType",
    "ParameterValue": "t3.large"
  },
  {
    "ParameterKey": "DBInstanceClass",
    "ParameterValue": "db.r5.large"
  }
]
```

---

## 5. ステートファイル管理

### 5.1 Terraform State

**S3バックエンドの使用（推奨）：**

```hcl
# environments/dev/backend.tf
terraform {
  backend "s3" {
    bucket         = "myproject-terraform-state"
    key            = "dev/terraform.tfstate"
    region         = "ap-northeast-1"
    encrypt        = true
    dynamodb_table = "myproject-terraform-lock"  # ロック用
  }
}
```

**重要：**
- ステートファイルは機密情報を含むため、暗号化必須
- DynamoDBでロック管理（複数人の同時実行を防ぐ）
- バージョニングを有効化

### 5.2 CloudFormation Stack

CloudFormationは自動でステート管理されるため、特別な設定不要。

---

## 6. 命名規則

### 6.1 リソース命名規則

**形式：** `{project}-{environment}-{resource_type}-{purpose}-{number}`

**例：**
```
myapp-prod-ec2-web-01
myapp-prod-rds-postgresql
myapp-prod-s3-logs
myapp-prod-elb-public
myapp-prod-sg-web
```

**Terraform での実装：**

```hcl
resource "aws_instance" "web" {
  ami           = data.aws_ami.amazon_linux_2023.id
  instance_type = var.instance_type

  tags = {
    Name = "${var.project_name}-${var.environment}-ec2-web-${count.index + 1}"
  }
}
```

### 6.2 タグ戦略

**必須タグ：**
```hcl
tags = {
  Name        = "リソース名"
  Project     = "プロジェクト名"
  Environment = "dev/stg/prod"
  ManagedBy   = "Terraform"
  Owner       = "チーム名"
  CostCenter  = "コストセンター"
}
```

---

## 7. セキュリティ

### 7.1 機密情報の管理

**❌ 悪い例：ハードコード**
```hcl
resource "aws_db_instance" "main" {
  username = "admin"
  password = "MyPassword123"  # NG！
}
```

**✅ 良い例：AWS Secrets Manager**
```hcl
data "aws_secretsmanager_secret_version" "db_password" {
  secret_id = "${var.project_name}-${var.environment}-db-password"
}

resource "aws_db_instance" "main" {
  username = "admin"
  password = jsondecode(data.aws_secretsmanager_secret_version.db_password.secret_string)["password"]
}
```

**✅ 良い例：環境変数**
```hcl
variable "db_password" {
  description = "データベースパスワード（環境変数 TF_VAR_db_password で設定）"
  type        = string
  sensitive   = true
}
```

### 7.2 セキュリティグループ

**原則：**
- 最小権限の原則
- ソースIPは可能な限り限定
- 不要なポートは開けない

```hcl
resource "aws_security_group" "web" {
  name        = "${var.project_name}-${var.environment}-sg-web"
  description = "Webサーバー用セキュリティグループ"
  vpc_id      = module.vpc.vpc_id

  # HTTPSのみ許可（HTTPは不要）
  ingress {
    description = "HTTPS from ALB"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    security_groups = [aws_security_group.alb.id]  # ALBからのみ
  }

  # SSH（踏み台サーバーからのみ）
  ingress {
    description = "SSH from bastion"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    security_groups = [aws_security_group.bastion.id]
  }

  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
```

---

## 8. 可用性・冗長化

### 8.1 マルチAZ構成

```hcl
# 複数のAvailability Zoneにサブネットを作成
resource "aws_subnet" "private" {
  count             = length(var.availability_zones)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]
}

# RDSのマルチAZ
resource "aws_db_instance" "main" {
  multi_az = var.environment == "prod" ? true : false
}

# Auto Scalingで複数インスタンス
resource "aws_autoscaling_group" "web" {
  min_size         = var.min_size
  max_size         = var.max_size
  desired_capacity = var.desired_capacity

  vpc_zone_identifier = aws_subnet.private[*].id  # 複数AZ
}
```

---

## 9. コスト最適化

### 9.1 環境別のリソースサイズ

```hcl
# locals.tf
locals {
  instance_config = {
    dev = {
      instance_type = "t3.micro"
      volume_size   = 20
    }
    stg = {
      instance_type = "t3.small"
      volume_size   = 30
    }
    prod = {
      instance_type = "t3.large"
      volume_size   = 100
    }
  }
}

resource "aws_instance" "web" {
  instance_type = local.instance_config[var.environment].instance_type
}
```

### 9.2 開発環境のコスト削減

```hcl
# dev環境では不要なリソースを無効化
locals {
  config = {
    enable_nat_gateway = var.environment == "prod" ? true : false
    enable_backup      = var.environment == "prod" ? true : false
  }
}
```

---

## 10. デプロイ戦略

### 10.1 Terraform apply フロー

```bash
# 1. 初期化
terraform init

# 2. プラン（dry-run）
terraform plan -var-file=terraform.tfvars -out=tfplan

# 3. ユーザー確認
# （AIがプラン結果を解析してユーザーに提示）

# 4. 適用
terraform apply tfplan

# 5. 確認
terraform show
```

### 10.2 CloudFormation デプロイフロー

```bash
# 1. Change Set作成（dry-run）
aws cloudformation create-change-set \
  --stack-name myapp-dev \
  --template-body file://templates/main.yaml \
  --parameters file://parameters/dev.json \
  --change-set-name deploy-$(date +%Y%m%d-%H%M%S)

# 2. Change Setの内容確認
aws cloudformation describe-change-set \
  --stack-name myapp-dev \
  --change-set-name deploy-xxx

# 3. 実行
aws cloudformation execute-change-set \
  --stack-name myapp-dev \
  --change-set-name deploy-xxx
```

---

## 11. ロールバック戦略

### 11.1 Terraform

```bash
# 前のバージョンに戻る
git checkout <previous-commit>
terraform plan
terraform apply

# または、stateから直接
terraform state list
terraform state rm <resource>  # 必要に応じて
```

### 11.2 CloudFormation

```bash
# スタックの更新をロールバック（自動）
# CloudFormationは失敗時に自動でロールバック

# 手動ロールバック
aws cloudformation update-stack \
  --stack-name myapp-prod \
  --use-previous-template
```

---

## 12. CI/CD統合

### 12.1 GitHub Actions での自動デプロイ

```yaml
name: Terraform Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  terraform:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Terraform
        uses: hashicorp/setup-terraform@v2

      - name: Terraform Init
        run: terraform init
        working-directory: ./environments/dev

      - name: Terraform Plan
        run: terraform plan -out=tfplan
        working-directory: ./environments/dev

      - name: Terraform Apply (on main only)
        if: github.ref == 'refs/heads/main'
        run: terraform apply -auto-approve tfplan
        working-directory: ./environments/dev
```

---

## 13. まとめ

IaCの技術標準を守ることで：
- 保守可能なインフラコード
- 安全なデプロイ
- 環境間の一貫性
- コスト最適化

を実現できます。

コード生成時は、必ずこの標準に従ってください。