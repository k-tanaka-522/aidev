# Bedrock Multi-Agent オーケストレーション設計プラン

**作成日**: 2025-10-24
**目的**: aidev の知見を活用した Bedrock Multi-Agent システムの設計方針

---

## 1. 背景

### 1.1 Claude Code の制約

**検証結果**（AGENT_VALIDATION_RESULTS.md 参照）:
- `.claude/agents/` に配置したカスタムAgentは、Task toolから呼び出せない
- 利用可能なのは組み込みAgent（general-purpose, Explore）のみ
- 組み込みAgentはユーザーと直接対話できない（メインClaudeが仲介）

**結論**:
- aidev は PHASE_GUIDE.md アプローチで完成させる
- マルチエージェント・オーケストレーションは Bedrock で実装

### 1.2 aidev の価値

**aidev で構築した資産**:
1. **PHASE_GUIDE.md**（6フェーズ）
   - 企画、要件定義、設計、実装、テスト、納品
   - What（何をやるか） + How（どうやるか）を統合

2. **技術標準**（7ファイル）
   - Python, TypeScript, C#, Go, CloudFormation, Terraform, Security

3. **プロセス定義**（175ファイル）
   - 各フェーズの詳細プロセス
   - Good/Bad Examples
   - チェックリスト

4. **対話原則**（`.claude/docs/00_core-principles.md`）
   - 一問一答の原則
   - ビジネス背景優先
   - ユーザーの言葉で質問（技術用語を使わない）
   - 事例・数値重視

**これらの知見を Bedrock Multi-Agent に移植する**

---

## 2. Bedrock Multi-Agent アーキテクチャ

### 2.1 全体構成

```
┌─────────────────────────────────────────┐
│  Supervisor Agent (PM)                  │
│  - ユーザーとの対話                      │
│  - フェーズ管理                          │
│  - 専門Agentへの仕事振り                │
└─────────────────────────────────────────┘
              │
              ├─────────────┬──────────────┬──────────────┬──────────────┐
              ▼             ▼              ▼              ▼              ▼
        ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
        │Consultant│   │Architect│   │  Coder  │   │   QA    │   │   SRE   │
        │ Agent   │   │ Agent   │   │ Agent   │   │ Agent   │   │ Agent   │
        └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘
              │             │              │              │              │
              └─────────────┴──────────────┴──────────────┴──────────────┘
                                         │
                                         ▼
                              ┌────────────────────┐
                              │  Knowledge Base    │
                              │  (PHASE_GUIDE.md,  │
                              │   技術標準, etc.)   │
                              └────────────────────┘
```

### 2.2 Agent 役割定義

#### Supervisor Agent（PM）

**役割**: プロジェクト全体の管理・オーケストレーション

**責務**:
- ユーザーとの対話窓口
- フェーズ判断（企画→要件定義→設計→実装→テスト→納品）
- 専門Agentへのタスク委譲
- 進捗管理・状態管理
- 成果物の統合

**Knowledge Base**:
- `.claude/docs/00_core-principles.md` - 対話原則
- `.claude-state/project-state.json` - プロジェクト状態

**Tools**:
- `delegate_to_agent` - 専門Agentに委譲
- `update_project_state` - 状態更新
- `ask_user` - ユーザーに質問

#### Consultant Agent

**役割**: ビジネス要件のヒアリング・企画・要件定義

**担当フェーズ**: 企画、要件定義

**責務**:
- ユーザーの言葉でヒアリング（技術用語を使わない）
- ビジネス背景・課題の深掘り
- 企画書・要件定義書の生成
- 一問一答の原則を守る

**Knowledge Base**:
- `.claude/docs/10_facilitation/2.1_企画フェーズ/PHASE_GUIDE.md`
- `.claude/docs/10_facilitation/2.2_要件定義フェーズ/PHASE_GUIDE.md`
- `.claude/docs/00_core-principles.md` - 対話原則

**Tools**:
- `ask_user` - ユーザーに質問
- `generate_document` - ドキュメント生成
- `save_decisions` - 決定事項記録

**ユーザー言語変換例**:
```
❌ 技術的: 「アーキテクチャはマイクロサービスとモノリスどちらが良いですか？」
✅ ビジネス的: 「将来的にユーザー数が急増する可能性はありますか？」

❌ 技術的: 「データベースはRDSとDynamoDBどちらが良いですか？」
✅ ビジネス的: 「データの整合性は厳密に保つ必要がありますか？」
```

#### Architect Agent

**役割**: システム設計・技術選定

**担当フェーズ**: 設計

**責務**:
- システムアーキテクチャ設計
- 技術スタック選定
- インフラ設計
- 基本設計書の生成

**Knowledge Base**:
- `.claude/docs/10_facilitation/2.3_設計フェーズ/PHASE_GUIDE.md`
- `.claude/docs/40_standards/` - 全技術標準
- Consultant Agent の成果物（企画書、要件定義書）

**Tools**:
- `generate_architecture_diagram` - システム構成図生成（Mermaid）
- `select_technology_stack` - 技術選定
- `generate_design_document` - 設計書生成

**判断基準**:
- 非機能要件（性能、可用性、セキュリティ）
- コスト
- 運用性
- チームのスキルセット

#### Coder Agent

**役割**: コード生成・実装

**担当フェーズ**: 実装

**責務**:
- アプリケーションコード生成
- テストコード生成
- IaC（CloudFormation/Terraform）生成
- コード品質確保

**Knowledge Base**:
- `.claude/docs/10_facilitation/2.4_実装フェーズ/PHASE_GUIDE.md`
- `.claude/docs/40_standards/41_python.md`
- `.claude/docs/40_standards/42_typescript.md`
- `.claude/docs/40_standards/43_csharp.md`
- `.claude/docs/40_standards/44_go.md`
- `.claude/docs/40_standards/45_cloudformation.md`
- `.claude/docs/40_standards/46_terraform.md`
- Architect Agent の成果物（設計書）

**Tools**:
- `generate_code` - コード生成
- `generate_tests` - テストコード生成
- `generate_iac` - インフラコード生成

**実行原則**:
- 事前説明 → 生成 → 事後説明
- ベストプラクティスの解説
- テストカバレッジ 80%+ 目標

#### QA Agent

**役割**: テスト計画・実行・品質保証

**担当フェーズ**: テスト

**責務**:
- テスト計画策定
- テストケース生成
- テスト実行
- バグレポート
- 品質レポート

**Knowledge Base**:
- `.claude/docs/10_facilitation/2.5_テストフェーズ/PHASE_GUIDE.md`
- Coder Agent の成果物（コード、テストコード）

**Tools**:
- `generate_test_plan` - テスト計画生成
- `execute_tests` - テスト実行
- `generate_bug_report` - バグレポート生成

**テストレベル**:
- 単体テスト
- 統合テスト
- E2Eテスト
- 性能テスト
- セキュリティテスト

#### SRE Agent

**役割**: 運用設計・デプロイ・納品

**担当フェーズ**: 納品

**責務**:
- デプロイ手順書作成
- 運用手順書作成
- トラブルシューティングガイド作成
- 本番デプロイ（dry-run必須）
- 監視・アラート設定

**Knowledge Base**:
- `.claude/docs/10_facilitation/2.6_納品フェーズ/PHASE_GUIDE.md`
- `.claude/docs/40_standards/49_security.md` - セキュリティ・運用基準

**Tools**:
- `generate_deployment_guide` - デプロイ手順書生成
- `generate_operation_guide` - 運用手順書生成
- `dry_run_deployment` - dry-run実施
- `deploy_to_production` - 本番デプロイ

**安全性原則**:
- dry-run必須（Change Set/Plan確認）
- ロールバック手順準備
- バックアップ取得
- ユーザー承認後に実行

---

## 3. Knowledge Base 設計

### 3.1 S3 構成

```
s3://aidev-knowledge-base/
├── core-principles/
│   └── 00_core-principles.md
├── phase-guides/
│   ├── 2.1_planning/PHASE_GUIDE.md
│   ├── 2.2_requirements/PHASE_GUIDE.md
│   ├── 2.3_design/PHASE_GUIDE.md
│   ├── 2.4_implementation/PHASE_GUIDE.md
│   ├── 2.5_testing/PHASE_GUIDE.md
│   └── 2.6_delivery/PHASE_GUIDE.md
├── standards/
│   ├── 41_python.md
│   ├── 42_typescript.md
│   ├── 43_csharp.md
│   ├── 44_go.md
│   ├── 45_cloudformation.md
│   ├── 46_terraform.md
│   └── 49_security.md
└── process-details/
    └── 10_facilitation/ (175ファイル)
```

### 3.2 RAG 設定

**OpenSearch Serverless**:
- Vector embedding: Titan Embeddings G1
- Chunk size: 1000 tokens
- Overlap: 200 tokens

**Metadata フィルタ**:
```json
{
  "phase": "planning|requirements|design|implementation|testing|delivery",
  "type": "phase-guide|standard|process-detail|example",
  "technology": "python|typescript|go|cloudformation|terraform"
}
```

---

## 4. Agent 間の情報フロー

### 4.1 フェーズ遷移フロー

```
ユーザー: 「在庫管理システムを作りたい」
  ↓
Supervisor: Consultant に初回ヒアリングを依頼
  ↓
Consultant: ユーザーに一問一答でヒアリング
  - 「現在の在庫管理はどうしていますか？」
  - 「何が困っていますか？」
  - 「誰が使いますか？」
  ↓
Consultant: 企画書生成 → Supervisor に返す
  ↓
Supervisor: ユーザーに企画書提示 → 承認取得
  ↓
Supervisor: Consultant に要件定義を依頼
  ↓
Consultant: ユーザーに要件ヒアリング
  - 「在庫の種類はいくつくらいありますか？」
  - 「月間の入出庫回数はどのくらいですか？」
  ↓
Consultant: 要件定義書生成 → Supervisor に返す
  ↓
Supervisor: ユーザーに要件定義書提示 → 承認取得
  ↓
Supervisor: Architect に設計を依頼（要件定義書を渡す）
  ↓
Architect: システム設計
  - 技術スタック選定（要件から判断）
  - アーキテクチャ設計
  - インフラ設計
  ↓
Architect: 基本設計書生成 → Supervisor に返す
  ↓
Supervisor: ユーザーに設計書提示 → 承認取得
  ↓
Supervisor: Coder に実装を依頼（設計書を渡す）
  ↓
Coder: コード生成
  - FastAPI (Python)
  - Next.js (TypeScript)
  - AWS ECS Fargate (CloudFormation)
  ↓
Coder: コード生成完了 → Supervisor に返す
  ↓
Supervisor: QA にテストを依頼（コードを渡す）
  ↓
QA: テスト実行 → バグ発見
  ↓
QA: Coder に修正依頼 → Coder が修正 → QA が再テスト
  ↓
QA: テスト完了 → Supervisor に返す
  ↓
Supervisor: SRE に納品を依頼
  ↓
SRE: 納品物準備
  - README.md
  - デプロイ手順書
  - 運用手順書
  - dry-run実施
  - 本番デプロイ（ユーザー承認後）
  ↓
SRE: 納品完了 → Supervisor に返す
  ↓
Supervisor: ユーザーに完了報告
```

### 4.2 状態管理

**DynamoDB テーブル**: `aidev-project-state`

```json
{
  "projectId": "uuid",
  "projectName": "在庫管理システム",
  "currentPhase": "planning|requirements|design|implementation|testing|delivery",
  "status": "ongoing|blocked|completed",
  "decisions": {
    "planning": { ... },
    "requirements": { ... },
    "design": { ... }
  },
  "artifacts": [
    {
      "type": "document|code|infrastructure",
      "phase": "planning",
      "fileName": "01_企画書.md",
      "s3Uri": "s3://aidev-artifacts/project-123/..."
    }
  ],
  "createdAt": "ISO 8601",
  "updatedAt": "ISO 8601"
}
```

---

## 5. 実装ステップ

### Phase 1: 基盤構築（2週間）

1. **AWS環境セットアップ**
   - Bedrock Agent 有効化
   - S3 バケット作成（Knowledge Base, Artifacts）
   - DynamoDB テーブル作成
   - OpenSearch Serverless セットアップ

2. **Knowledge Base 構築**
   - aidev の `.claude/docs/` を S3 にアップロード
   - RAG 設定
   - Vector embedding 生成

3. **Supervisor Agent 作成**
   - 基本的なオーケストレーション
   - 状態管理
   - ユーザー対話

### Phase 2: 専門Agent実装（3週間）

1. **Consultant Agent**
   - PHASE_GUIDE.md（企画・要件定義）を Knowledge Base に接続
   - 一問一答の実装
   - ユーザー言語変換ロジック

2. **Architect Agent**
   - PHASE_GUIDE.md（設計）を Knowledge Base に接続
   - 技術標準を参照
   - 設計書生成

3. **Coder Agent**
   - PHASE_GUIDE.md（実装）を Knowledge Base に接続
   - 技術標準を参照
   - コード生成

### Phase 3: 統合テスト（2週間）

1. **QA Agent 追加**
2. **SRE Agent 追加**
3. **エンドツーエンドテスト**
   - 企画→納品まで一貫実行
   - 実際のプロジェクト（小規模）で検証

### Phase 4: UI/UX 改善（1週間）

1. **Webインターフェース構築**
   - Streamlit or Gradio
   - チャットUI
   - 進捗可視化

2. **通知・レポート機能**
   - フェーズ完了通知
   - 進捗レポート自動生成

---

## 6. コスト見積もり

### 6.1 Bedrock Agents

**Claude Sonnet 4.5（推奨モデル）**:
- Input: $3 / 1M tokens
- Output: $15 / 1M tokens

**想定トークン数（1プロジェクト）**:
- Input: 約 500K tokens（Knowledge Base検索 + ユーザー対話）
- Output: 約 200K tokens（ドキュメント生成 + コード生成）

**コスト**:
- Input: 500K × $3 / 1M = $1.5
- Output: 200K × $15 / 1M = $3.0
- **合計: 約 $4.5 / プロジェクト**

### 6.2 Knowledge Base（OpenSearch Serverless）

- OCU（OpenSearch Compute Units）: 約 $0.24 / OCU-hour
- 想定: 2 OCU × 24時間 × 30日 = $345.6 / 月

### 6.3 その他

- S3: 約 $1 / 月（ドキュメント保存）
- DynamoDB: 約 $5 / 月（状態管理）

**合計**: 約 $350 / 月 + $4.5 / プロジェクト

---

## 7. 次のアクション

### 7.1 優先度1: aidev 完成・検証

1. **AWS-ECS-Forgate で 3周テスト**
   - PHASE_GUIDE.md の実用性検証
   - 問題点の洗い出し
   - PHASE_GUIDE.md の改善

### 7.2 優先度2: Bedrock PoC

1. **小規模 PoC（Supervisor + Consultant のみ）**
   - 企画フェーズのみ実装
   - Knowledge Base 接続テスト
   - 一問一答の実用性検証

2. **検証項目**:
   - Knowledge Base の検索精度
   - Agent 間の情報受け渡し
   - ユーザー体験（自然な対話になっているか）
   - コスト（実測）

### 7.3 優先度3: フルスケール実装

PoC で問題なければ、全Agent実装へ。

---

## 8. 期待される効果

### 8.1 ユーザー体験

- **自然な対話**: PM（Supervisor）が窓口、専門家（Agent）が裏で動く
- **高品質な成果物**: aidev の知見を活用
- **学習機会**: ベストプラクティスの解説

### 8.2 開発効率

- **並列実行**: 複数Agentが同時に動く（例: テスト中に運用手順書作成）
- **一貫性**: PHASE_GUIDE.md により手順が統一
- **再現性**: 状態管理により、いつでも再開可能

### 8.3 拡張性

- **新しい技術標準の追加**: Knowledge Base に追加するだけ
- **新しいAgentの追加**: 例: Security Agent, Performance Agent
- **プロジェクトテンプレート**: 過去プロジェクトをテンプレート化

---

**作成者**: Claude（AI開発ファシリテーター）
**次回更新予定**: PoC 完了後
