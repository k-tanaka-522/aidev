# aidev 3周テスト実行ガイド

**目的**: AWS-ECS-Forgate プロジェクトで aidev を実際に使い、実用性を検証する

---

## 🎯 テスト観点

### 1. プロセス観点

#### 1.1 PHASE_GUIDE.md の実用性
- [ ] Claude が各フェーズの PHASE_GUIDE.md を読み込んでいるか
- [ ] PDCA 1周目（決定事項収集）が機能しているか
- [ ] PDCA 2周目（抜け漏れチェック）が機能しているか
- [ ] フェーズ遷移が適切か

#### 1.2 対話品質
- [ ] 一問一答の原則が守られているか
- [ ] ユーザーの言葉で質問しているか（技術用語を使っていないか）
- [ ] ビジネス背景を優先しているか
- [ ] 事例・数値を聞いているか
- [ ] 確認前の振り返りがあるか

#### 1.3 状態管理
- [ ] `.claude-state/project-state.json` が正しく更新されるか
- [ ] 各フェーズの決定事項が記録されるか
- [ ] セッションをまたいで継続できるか

### 2. 成果物観点

#### 2.1 ドキュメント品質
- [ ] 企画書: ビジネス背景・課題が明確か
- [ ] 要件定義書: 機能要件・非機能要件が具体的か
- [ ] 基本設計書: 技術選定の理由が明確か、代替案・トレードオフがあるか
- [ ] README.md: セットアップ手順が具体的か
- [ ] デプロイ手順書: dry-run を含むか、ロールバック手順があるか
- [ ] 運用手順書: 日次/週次運用が具体的か

#### 2.2 コード品質
- [ ] コーディング規約（技術標準）に準拠しているか
- [ ] テストコードが存在するか
- [ ] テストカバレッジが 80%+ か
- [ ] エラーハンドリングが適切か
- [ ] コメントが適切か

#### 2.3 インフラコード品質
- [ ] CloudFormation 3 principles に準拠しているか
  - [ ] 責任分離原則（スタック分割）
  - [ ] テンプレート分割原則（ネスト or クロススタック参照）
  - [ ] 段階的デプロイ原則（Change Set）
- [ ] デプロイスクリプトが存在するか
  - [ ] create-changeset.sh
  - [ ] describe-changeset.sh
  - [ ] execute-changeset.sh
- [ ] dry-run が可能か
- [ ] ロールバックスクリプトが存在するか

### 3. 実デプロイ観点 ⭐重要

#### 3.1 デプロイ前確認
- [ ] AWS CLI がインストールされているか
- [ ] AWS 認証情報が設定されているか
- [ ] 必要な権限があるか（CloudFormation, ECS, RDS, VPC 等）

#### 3.2 dry-run 実行
- [ ] Change Set が作成できるか
- [ ] Change Set の内容が確認できるか
- [ ] 意図しないリソース削除がないか
- [ ] 既存リソースへの影響がないか

#### 3.3 本番デプロイ実行
- [ ] Change Set を実行できるか
- [ ] スタックが正常に作成されるか
- [ ] ECS サービスが起動するか
- [ ] ヘルスチェックが通るか
- [ ] アプリケーションにアクセスできるか

#### 3.4 ロールバック確認
- [ ] ロールバックスクリプトが動作するか
- [ ] スタックが削除されるか
- [ ] リソースがクリーンアップされるか

### 4. エラーハンドリング観点

#### 4.1 Claude の対応
- [ ] エラー発生時に適切に対処するか
- [ ] エラーメッセージを解釈して修正案を提示するか
- [ ] ユーザーに分かりやすく説明するか

#### 4.2 リカバリー
- [ ] デプロイ失敗時にロールバックできるか
- [ ] 状態を巻き戻せるか
- [ ] 再実行できるか

---

## 📝 実施手順（詳細版）

### 準備: テスト環境セットアップ

```bash
# 1周目用ディレクトリ作成
mkdir -p /c/dev2/test-projects/round1
cd /c/dev2/test-projects/round1

# aidev コピー
cp -r /c/dev2/aiDev/.claude .
cp -r /c/dev2/aiDev/.claude-state .
cp /c/dev2/aiDev/CLAUDE.md .
cp /c/dev2/aiDev/.gitignore .

# .claude-state をクリア（新規プロジェクトとして開始）
rm -rf .claude-state/*

# AWS 認証情報確認
aws sts get-caller-identity
# 出力例: Account ID, UserId, Arn が表示されれば OK
```

---

### 🔄 1周目: 初見実行

#### Phase 1: 企画フェーズ

**VS Code で `/c/dev2/test-projects/round1` を開く**

**Claude Code を起動し、以下のように話しかける**:

> 「AWS ECS Fargate でコンテナアプリケーションをデプロイするシステムを作りたい」

**検証ポイント**:
- [ ] Claude が CLAUDE.md を読み込んだか
- [ ] `.claude/docs/00_core-principles.md` を読み込んだか
- [ ] `.claude/docs/10_facilitation/2.1_企画フェーズ/PHASE_GUIDE.md` を読み込んだか
- [ ] 一問一答でヒアリングを始めたか

**Claude の質問に回答する**:

Claude が「現在どうしていますか？」「何が困っていますか？」等を聞いてくるので、以下のように回答:

> - 「現在はローカルでDockerコンテナを動かしています」
> - 「本番環境にデプロイする仕組みがないのが課題です」
> - 「開発者は3人のチームです」
> - 「月間アクセス数は約10万PVを想定しています」

**企画書生成を待つ**

Claude が企画書を生成したら:
- [ ] ビジネス背景が記載されているか確認
- [ ] 課題が明確か確認
- [ ] 目的・ゴールが明確か確認

**承認する**:
> 「OKです。次の要件定義フェーズに進んでください」

---

#### Phase 2: 要件定義フェーズ

**検証ポイント**:
- [ ] Claude が `.claude/docs/10_facilitation/2.2_要件定義フェーズ/PHASE_GUIDE.md` を読み込んだか
- [ ] 機能要件を聞いてきたか
- [ ] 非機能要件（性能、可用性、セキュリティ）を聞いてきたか

**Claude の質問に回答する**:

> - 「機能: FastAPI で REST API を提供します」
> - 「データベース: PostgreSQL を使います」
> - 「パフォーマンス: レスポンスタイムは 200ms 以内を目指します」
> - 「可用性: 99.9% を目標とします」
> - 「セキュリティ: HTTPS 必須、認証は JWT を使います」

**要件定義書生成を待つ**

Claude が要件定義書を生成したら:
- [ ] 機能要件が具体的か確認
- [ ] 非機能要件が SMART 原則に沿っているか確認
- [ ] ユーザーストーリーがあるか確認

**承認する**:
> 「OKです。次の設計フェーズに進んでください」

---

#### Phase 3: 設計フェーズ

**検証ポイント**:
- [ ] Claude が `.claude/docs/10_facilitation/2.3_設計フェーズ/PHASE_GUIDE.md` を読み込んだか
- [ ] 技術選定の理由を説明したか
- [ ] システム構成図（Mermaid）を生成したか
- [ ] 代替案・トレードオフを提示したか

**Claude の提案に回答する**:

Claude が「ECS Fargate を使います」「RDS を使います」等を提案してくるので:
> 「提案内容で問題ありません。進めてください」

**基本設計書生成を待つ**

Claude が基本設計書を生成したら:
- [ ] システム構成図があるか確認
- [ ] 技術スタック選定の理由が明確か確認
- [ ] CloudFormation での実装方針が示されているか確認
- [ ] 代替案・トレードオフがあるか確認

**承認する**:
> 「OKです。次の実装フェーズに進んでください」

---

#### Phase 4: 実装フェーズ

**検証ポイント**:
- [ ] Claude が `.claude/docs/10_facilitation/2.4_実装フェーズ/PHASE_GUIDE.md` を読み込んだか
- [ ] 「事前説明 → 生成 → 事後説明」の原則を守っているか
- [ ] `.claude/docs/40_standards/41_python.md` を参照しているか
- [ ] `.claude/docs/40_standards/45_cloudformation.md` を参照しているか

**Claude がコード生成を開始**

以下が生成されることを確認:
- [ ] `src/` - FastAPI アプリケーションコード
- [ ] `tests/` - テストコード
- [ ] `infra/cloudformation/` - CloudFormation テンプレート
- [ ] `scripts/` - デプロイスクリプト
  - [ ] `create-changeset.sh`
  - [ ] `describe-changeset.sh`
  - [ ] `execute-changeset.sh`
  - [ ] `rollback.sh`

**コード品質を確認**:
- [ ] Python コーディング規約に準拠しているか
- [ ] テストコードが存在するか
- [ ] CloudFormation 3 principles に準拠しているか
- [ ] デプロイスクリプトが実行可能か（chmod +x 確認）

**承認する**:
> 「OKです。次のテストフェーズに進んでください」

---

#### Phase 5: テストフェーズ

**検証ポイント**:
- [ ] Claude が `.claude/docs/10_facilitation/2.5_テストフェーズ/PHASE_GUIDE.md` を読み込んだか
- [ ] テスト計画を提示したか
- [ ] テストを実行したか

**Claude がテストを実行**

以下を確認:
- [ ] 単体テストが実行されるか
- [ ] テストカバレッジが表示されるか
- [ ] バグがあれば修正されるか

**テスト結果を確認**:
```bash
# テスト実行
pytest tests/ --cov=src --cov-report=html

# カバレッジ確認
open htmlcov/index.html
```

**承認する**:
> 「OKです。次の納品フェーズに進んでください」

---

#### Phase 6: 納品フェーズ

**検証ポイント**:
- [ ] Claude が `.claude/docs/10_facilitation/2.6_納品フェーズ/PHASE_GUIDE.md` を読み込んだか
- [ ] README.md が生成されたか
- [ ] デプロイ手順書が生成されたか
- [ ] デプロイ手順書に dry-run が含まれているか

**Claude がドキュメント生成**

以下が生成されることを確認:
- [ ] `README.md`
- [ ] `docs/デプロイ手順書.md`
- [ ] `docs/運用手順書.md`（必要に応じて）
- [ ] `docs/トラブルシューティングガイド.md`

**README.md の内容を確認**:
- [ ] プロジェクト概要があるか
- [ ] セットアップ手順が具体的か
- [ ] 使用方法が明確か

**デプロイ手順書の内容を確認**:
- [ ] dry-run 手順があるか
- [ ] デプロイ実行手順があるか
- [ ] ロールバック手順があるか

---

### 🚀 実デプロイ検証（最重要）

#### Step 1: dry-run 実行

```bash
# AWS 認証情報確認
aws sts get-caller-identity

# Change Set 作成（dry-run）
cd /c/dev2/test-projects/round1
chmod +x scripts/*.sh
./scripts/create-changeset.sh test-stack

# 期待される出力:
# ChangeSet "test-stack-changeset-YYYYMMDD-HHMMSS" created successfully
```

**確認ポイント**:
- [ ] スクリプトがエラーなく実行できたか
- [ ] Change Set が作成されたか

#### Step 2: Change Set 内容確認

```bash
# Change Set 詳細表示
./scripts/describe-changeset.sh test-stack

# 期待される出力:
# - 作成されるリソース一覧（VPC, Subnet, ECS Cluster, ECS Service, ALB, RDS 等）
# - 削除されるリソース（なし）
# - 変更されるリソース（なし）
```

**確認ポイント**:
- [ ] 意図しないリソース削除がないか
- [ ] 作成されるリソースが設計通りか
- [ ] パラメータが正しいか

#### Step 3: デプロイ実行

```bash
# Change Set 実行
./scripts/execute-changeset.sh test-stack

# 期待される出力:
# Stack creation in progress...
# [進捗表示]
# Stack created successfully
```

**確認ポイント**:
- [ ] スタックが正常に作成されるか
- [ ] ECS サービスが起動するか
- [ ] ALB のヘルスチェックが通るか

**デプロイ時間の記録**:
- 開始時刻: [記録]
- 終了時刻: [記録]
- 所要時間: [記録]

#### Step 4: 動作確認

```bash
# ALB の DNS 名取得
aws cloudformation describe-stacks \
  --stack-name test-stack \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
  --output text

# ヘルスチェック
curl http://<ALB-DNS>/health

# 期待レスポンス:
# {"status": "ok"}
```

**確認ポイント**:
- [ ] ALB にアクセスできるか
- [ ] ヘルスチェックが通るか
- [ ] API エンドポイントが動作するか

#### Step 5: ロールバック検証

```bash
# ロールバック実行
./scripts/rollback.sh test-stack

# 期待される出力:
# Stack deletion in progress...
# [進捗表示]
# Stack deleted successfully
```

**確認ポイント**:
- [ ] スタックが削除されるか
- [ ] すべてのリソースがクリーンアップされるか
- [ ] 残存リソースがないか（手動確認）

```bash
# 残存リソース確認
aws cloudformation list-stacks --stack-status-filter DELETE_COMPLETE

# EC2 ダッシュボードで確認
# - VPC が削除されているか
# - ECS クラスターが削除されているか
# - RDS インスタンスが削除されているか
```

---

### 📊 1周目レポート作成

**`reports/ROUND1_TEST_REPORT.md` を作成**

テンプレート（ROUND1_TEST_REPORT_TEMPLATE.md）を使って:
- 問題点を記録
- 良かった点を記録
- 改善案を記録

**重点的に記録すべきこと**:
1. **PHASE_GUIDE.md が機能したか**
2. **技術標準が参照されたか**
3. **実デプロイが成功したか**
4. **エラーが発生した場合の対処**

---

### 🔧 改善実施

**1周目の問題点を aidev に反映**:

```bash
cd /c/dev2/aiDev

# 例: PHASE_GUIDE.md の改善
# 問題: 一問一答になっていない
# 対応: PHASE_GUIDE.md に「一問一答の徹底」を追記
```

**改善内容を Git コミット**:
```bash
git add .
git commit -m "1周目テストのフィードバックを反映

- PHASE_GUIDE.md: 一問一答の原則を強調
- CLAUDE.md: 必読ファイルの順序を明確化
- 技術標準: CloudFormation の例を追加"
```

---

### 🔄 2周目: 改善版で再実行

**新しいディレクトリで実施**:

```bash
mkdir -p /c/dev2/test-projects/round2
cd /c/dev2/test-projects/round2

# 改善版 aidev をコピー
cp -r /c/dev2/aiDev/.claude .
cp -r /c/dev2/aiDev/.claude-state .
cp /c/dev2/aiDev/CLAUDE.md .
cp /c/dev2/aiDev/.gitignore .

# .claude-state をクリア
rm -rf .claude-state/*
```

**新しい Claude Code セッションで実行**

**1周目と同じ流れで実行し、改善されているか確認**:
- [ ] 1周目の問題が解消されているか
- [ ] 新しい問題が発生していないか

**2周目レポート作成**:
`reports/ROUND2_TEST_REPORT.md`

---

### 🔄 3周目: 完成度確認

**新しいディレクトリで実施**:

```bash
mkdir -p /c/dev2/test-projects/round3
cd /c/dev2/test-projects/round3

# 最終版 aidev をコピー
cp -r /c/dev2/aiDev/.claude .
cp -r /c/dev2/aiDev/.claude-state .
cp /c/dev2/aiDev/CLAUDE.md .
cp /c/dev2/aiDev/.gitignore .

# .claude-state をクリア
rm -rf .claude-state/*
```

**新しい Claude Code セッションで実行**

**3周目レポート作成**:
`reports/ROUND3_TEST_REPORT.md`

**最終評価**:
- [ ] 実用レベルに達しているか
- [ ] 本番プロジェクトで使えるか
- [ ] ドキュメントは十分か

---

## 📈 最終レポート作成

**`reports/FINAL_EVALUATION_REPORT.md`**

### 内容:
1. **3周の比較**
   - 1周目 vs 2周目 vs 3周目
   - 改善の推移
   - 問題の解消状況

2. **総合評価**
   - aidev の完成度（%）
   - 実用性（実際のプロジェクトで使えるか）
   - 改善提案

3. **Bedrock Multi-Agent への移行判断**
   - aidev で十分か
   - Bedrock が必要か
   - どの部分を Bedrock 化すべきか

---

## ⏱️ 想定スケジュール

- **1周目**: 4-6時間
  - 企画: 30分
  - 要件定義: 30分
  - 設計: 1時間
  - 実装: 2時間
  - テスト: 30分
  - 納品: 30分
  - デプロイ検証: 1時間

- **改善作業**: 2-3時間

- **2周目**: 3-4時間（慣れて早くなる）

- **改善作業**: 1-2時間

- **3周目**: 2-3時間

**合計**: 約 12-18 時間

---

**作成日**: 2025-10-24
**作成者**: Claude（AI開発ファシリテーター）
