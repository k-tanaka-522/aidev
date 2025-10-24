# aidev 3周テスト実行手順

**目的**: 設計→実装→テスト→納品フェーズの品質を検証し、技術標準・PHASE_GUIDE.md をブラッシュアップする

---

## 🚀 前提条件

1. **AWS-ECS-Forgate リポジトリを VS Code で開いている**
2. **Git Bash が使える**
3. **AWS CLI が設定済み**（実デプロイする場合のみ）

---

## 📋 全体の流れ

1. **1周目**: Git Bash で環境準備 → Claude Code で設計～納品を実行 → 問題点を記録
2. **aidev を改善**: 1周目の問題を `.claude/` に反映
3. **2周目**: Git Bash で環境準備 → Claude Code で実行 → 改善確認
4. **aidev を改善**: 2周目の問題を反映
5. **3周目**: Git Bash で環境準備 → Claude Code で実行 → 最終評価

---

## 🔄 1周目テスト

### Step 1: Git Bash で環境準備

**Git Bash を開き、以下をコピペで実行**:

\`\`\`bash
# 1周目ディレクトリ準備
cd /c/dev2/AWS-ECS-Forgate/test/round1

# aidev の .claude をコピー
cp -r /c/dev2/aiDev/.claude .
cp /c/dev2/aiDev/CLAUDE.md .
cp /c/dev2/aiDev/.gitignore .

# 既存の企画書・要件定義書をコピー
mkdir -p docs
cp ../../docs/01_企画書.md docs/
cp ../../docs/02_要件定義書.md docs/

# .claude-state を初期化（設計フェーズから開始）
mkdir -p .claude-state
cat > .claude-state/project-state.json <<'EOF'
{
  "projectName": "AWS-ECS-Forgate",
  "currentPhase": "design",
  "status": "ongoing",
  "updatedAt": "2025-10-24T10:00:00Z"
}
EOF

# ディレクトリ作成
mkdir -p src tests infra scripts

echo "✅ 1周目環境準備完了"
echo "次: VS Code で /c/dev2/AWS-ECS-Forgate/test/round1 を開いてください"
\`\`\`

### Step 2: VS Code で test/round1 を開く

1. VS Code で **File → Open Folder**
2. `/c/dev2/AWS-ECS-Forgate/test/round1` を開く
3. Claude Code を起動
4. **新しい会話を開始**

### Step 3: Claude Code で設計～納品を実行

**Claude に以下を指示**（コピペ）:

\`\`\`
設計フェーズから開始します。

docs/01_企画書.md と docs/02_要件定義書.md を読んで、AWS ECS Fargate でコンテナアプリケーションをデプロイするシステムの基本設計を行ってください。

技術要件:
- FastAPI バックエンド（Python 3.11）
- PostgreSQL データベース（RDS）
- ALB + ECS Fargate
- CloudFormation でインフラ構築

設計が完了したら、実装フェーズ、テストフェーズ、納品フェーズと順番に進めてください。
\`\`\`

**Claude が自動的に以下を実行するはず**:
1. ✅ CLAUDE.md を読み込む
2. ✅ `.claude/docs/00_core-principles.md` を読み込む
3. ✅ `.claude/docs/10_facilitation/2.3_設計フェーズ/PHASE_GUIDE.md` を読み込む
4. ✅ 基本設計書を生成
5. ✅ 実装フェーズに移行
6. ✅ コード・インフラ・スクリプトを生成
7. ✅ テストフェーズに移行
8. ✅ テスト実行
9. ✅ 納品フェーズに移行
10. ✅ README・デプロイ手順書等を生成

### Step 4: 実行中の観察ポイント

**以下を観察・記録してください**:

#### 設計フェーズ
- [ ] PHASE_GUIDE.md を読み込んだか？
- [ ] 技術選定の理由を説明したか？
- [ ] 代替案・トレードオフを提示したか？
- [ ] システム構成図（Mermaid）が生成されたか？
- [ ] CloudFormation 3 principles に言及したか？

#### 実装フェーズ
- [ ] 技術標準（41_python.md, 45_cloudformation.md）を参照したか？
- [ ] 事前説明 → 生成 → 事後説明の原則を守ったか？
- [ ] FastAPI コードが生成されたか？（src/）
- [ ] テストコードが生成されたか？（tests/）
- [ ] CloudFormation テンプレートが生成されたか？（infra/）
- [ ] **デプロイスクリプトが生成されたか？（scripts/）** ⭐最重要

#### テストフェーズ
- [ ] テスト計画が提示されたか？
- [ ] テストが実行されたか？
- [ ] カバレッジが表示されたか？

#### 納品フェーズ
- [ ] README.md が生成されたか？
- [ ] デプロイ手順書が生成されたか？
- [ ] デプロイ手順書に dry-run が含まれているか？

### Step 5: 生成物の確認

**Git Bash で以下を実行**:

\`\`\`bash
cd /c/dev2/AWS-ECS-Forgate/test/round1

# 生成されたファイルを確認
echo "=== ドキュメント ==="
ls -la docs/

echo ""
echo "=== コード ==="
ls -la src/

echo ""
echo "=== テスト ==="
ls -la tests/

echo ""
echo "=== インフラ ==="
ls -la infra/

echo ""
echo "=== スクリプト（重要）==="
ls -la scripts/

echo ""
echo "=== README ==="
cat README.md | head -20
\`\`\`

**期待されるファイル**:
- `docs/03_基本設計書.md`
- `src/main.py` 等の FastAPI コード
- `tests/test_*.py` 等のテストコード
- `infra/cloudformation/*.yaml` 等の CloudFormation テンプレート
- `scripts/create-changeset.sh` ⭐
- `scripts/describe-changeset.sh` ⭐
- `scripts/execute-changeset.sh` ⭐
- `scripts/rollback.sh` ⭐
- `README.md`
- `docs/デプロイ手順書.md`

### Step 6: 実デプロイ検証（オプション）

**デプロイスクリプトが生成された場合のみ実施**:

\`\`\`bash
cd /c/dev2/AWS-ECS-Forgate/test/round1

# AWS認証確認
aws sts get-caller-identity

# スクリプトを実行可能に
chmod +x scripts/*.sh

# dry-run（Change Set作成）
./scripts/create-changeset.sh test-stack-round1

# Change Set 確認
./scripts/describe-changeset.sh test-stack-round1

# 問題なければデプロイ実行
# ./scripts/execute-changeset.sh test-stack-round1

# ロールバック
# ./scripts/rollback.sh test-stack-round1
\`\`\`

### Step 7: 1周目レポート作成

**Git Bash で以下を実行**:

\`\`\`bash
cd /c/dev2/AWS-ECS-Forgate/test

# レポートテンプレートをコピー
cp /c/dev2/aiDev/reports/ROUND1_TEST_REPORT_TEMPLATE.md reports/round1-report.md

echo "✅ レポートテンプレート作成完了"
echo "次: reports/round1-report.md を編集して問題点を記録してください"
\`\`\`

**reports/round1-report.md を編集**:
- 観察した問題点を記録
- デプロイスクリプトが生成されたか？
- 技術標準が参照されたか？
- PHASE_GUIDE.md が機能したか？

---

## 🔧 aidev 改善（1周目→2周目）

### Step 8: 問題点を aidev に反映

**例: デプロイスクリプトが生成されなかった場合**

\`\`\`bash
cd /c/dev2/aiDev

# 45_cloudformation.md を編集
# デプロイスクリプト生成の指示を強化

# 2.4.6.1.7_デプロイ自動化設計.md を編集
# Good Example を追加

# Git コミット
git add .claude/docs/40_standards/45_cloudformation.md
git add .claude/docs/10_facilitation/2.4_実装フェーズ/2.4.6_IaC構築プロセス/2.4.6.1_CloudFormation構築/2.4.6.1.7_デプロイ自動化設計.md
git commit -m "1周目レビュー: デプロイスクリプト生成の指示を強化

問題: デプロイスクリプトが生成されなかった
対応:
- 45_cloudformation.md に「必須成果物」としてデプロイスクリプトを明記
- 2.4.6.1.7 に具体的な Good Example を追加"
\`\`\`

---

## 🔄 2周目テスト

### Step 9: Git Bash で2周目環境準備

\`\`\`bash
# 2周目ディレクトリ準備
cd /c/dev2/AWS-ECS-Forgate/test/round2

# 改善版 aidev の .claude をコピー
cp -r /c/dev2/aiDev/.claude .
cp /c/dev2/aiDev/CLAUDE.md .
cp /c/dev2/aiDev/.gitignore .

# 既存の企画書・要件定義書をコピー（1周目と同じ）
mkdir -p docs
cp ../../docs/01_企画書.md docs/
cp ../../docs/02_要件定義書.md docs/

# .claude-state を初期化
mkdir -p .claude-state
cat > .claude-state/project-state.json <<'EOF'
{
  "projectName": "AWS-ECS-Forgate",
  "currentPhase": "design",
  "status": "ongoing",
  "updatedAt": "2025-10-24T12:00:00Z"
}
EOF

mkdir -p src tests infra scripts

echo "✅ 2周目環境準備完了"
echo "次: VS Code で /c/dev2/AWS-ECS-Forgate/test/round2 を開いてください"
\`\`\`

### Step 10: VS Code で test/round2 を開く

1. VS Code で **File → Open Folder**
2. `/c/dev2/AWS-ECS-Forgate/test/round2` を開く
3. Claude Code を起動
4. **新しい会話を開始**

### Step 11: Claude Code で実行（1周目と同じ指示）

\`\`\`
設計フェーズから開始します。

docs/01_企画書.md と docs/02_要件定義書.md を読んで、AWS ECS Fargate でコンテナアプリケーションをデプロイするシステムの基本設計を行ってください。

技術要件:
- FastAPI バックエンド（Python 3.11）
- PostgreSQL データベース（RDS）
- ALB + ECS Fargate
- CloudFormation でインフラ構築

設計が完了したら、実装フェーズ、テストフェーズ、納品フェーズと順番に進めてください。
\`\`\`

### Step 12: 改善確認

**以下を確認**:
- [ ] 1周目の問題が解消されているか？
- [ ] デプロイスクリプトが生成されたか？（1周目で生成されなかった場合）
- [ ] 新しい問題が発生していないか？

### Step 13: 2周目レポート作成

\`\`\`bash
cd /c/dev2/AWS-ECS-Forgate/test/reports

# 2周目レポート作成
cat > round2-report.md <<'EOF'
# 2周目テストレポート

## 改善された点
- [ ]

## 新たな問題点
- [ ]

## 残存する問題点
- [ ]

## 次回（3周目）への改善アクション
1.
EOF

echo "✅ 2周目レポート作成完了"
echo "次: round2-report.md を編集してください"
\`\`\`

### Step 14: aidev 改善（2周目→3周目）

\`\`\`bash
cd /c/dev2/aiDev

# 2周目の問題を反映
# （1周目と同じ要領で .claude/ を編集）

git add .
git commit -m "2周目レビュー: [改善内容]"
\`\`\`

---

## 🔄 3周目テスト

### Step 15: Git Bash で3周目環境準備

\`\`\`bash
# 3周目ディレクトリ準備
cd /c/dev2/AWS-ECS-Forgate/test/round3

# 最終版 aidev の .claude をコピー
cp -r /c/dev2/aiDev/.claude .
cp /c/dev2/aiDev/CLAUDE.md .
cp /c/dev2/aiDev/.gitignore .

# 既存の企画書・要件定義書をコピー（1・2周目と同じ）
mkdir -p docs
cp ../../docs/01_企画書.md docs/
cp ../../docs/02_要件定義書.md docs/

# .claude-state を初期化
mkdir -p .claude-state
cat > .claude-state/project-state.json <<'EOF'
{
  "projectName": "AWS-ECS-Forgate",
  "currentPhase": "design",
  "status": "ongoing",
  "updatedAt": "2025-10-24T14:00:00Z"
}
EOF

mkdir -p src tests infra scripts

echo "✅ 3周目環境準備完了"
echo "次: VS Code で /c/dev2/AWS-ECS-Forgate/test/round3 を開いてください"
\`\`\`

### Step 16: VS Code で test/round3 を開く

1. VS Code で **File → Open Folder**
2. `/c/dev2/AWS-ECS-Forgate/test/round3` を開く
3. Claude Code を起動
4. **新しい会話を開始**

### Step 17: Claude Code で実行（1・2周目と同じ指示）

\`\`\`
設計フェーズから開始します。

docs/01_企画書.md と docs/02_要件定義書.md を読んで、AWS ECS Fargate でコンテナアプリケーションをデプロイするシステムの基本設計を行ってください。

技術要件:
- FastAPI バックエンド（Python 3.11）
- PostgreSQL データベース（RDS）
- ALB + ECS Fargate
- CloudFormation でインフラ構築

設計が完了したら、実装フェーズ、テストフェーズ、納品フェーズと順番に進めてください。
\`\`\`

### Step 18: 最終確認

**以下を確認**:
- [ ] 1周目・2周目の問題がすべて解消されているか？
- [ ] 実用レベルに達しているか？
- [ ] 本番プロジェクトで使えるか？

### Step 19: 3周目レポート作成

\`\`\`bash
cd /c/dev2/AWS-ECS-Forgate/test/reports

# 3周目レポート作成
cat > round3-report.md <<'EOF'
# 3周目テストレポート

## 改善の推移（1周目→2周目→3周目）
- デプロイスクリプト:
- FastAPI コード品質:
- テストカバレッジ:

## 最終評価
- aidev 完成度: XX%
- 実用レベル判定: [本番使用可能 / 一部改善必要 / 改善必要]

## Bedrock Multi-Agent 化の判断
- [aidev継続 / Bedrock移行]
- 理由:
EOF

echo "✅ 3周目レポート作成完了"
\`\`\`

---

## 📊 最終レポート作成

### Step 20: 最終評価レポート

\`\`\`bash
cd /c/dev2/AWS-ECS-Forgate/test/reports

# 最終レポート作成
cat > final-report.md <<'EOF'
# aidev 3周テスト 最終レポート

## 3周の比較

| 項目 | 1周目 | 2周目 | 3周目 |
|------|-------|-------|-------|
| デプロイスクリプト生成 | | | |
| スクリプト品質 | | | |
| FastAPI コード品質 | | | |
| テストカバレッジ | | | |
| CloudFormation 3 principles | | | |
| 代替案・トレードオフ | | | |
| dry-run 実行 | | | |
| 本番デプロイ成功 | | | |

## 総合評価
- aidev 完成度: XX%
- 実用レベル判定:

## Bedrock Multi-Agent 化の判断
-

## 今後のロードマップ
1.
2.
3.
EOF

echo "✅ 最終レポート作成完了"
echo ""
echo "🎉 3周テスト完了！"
echo ""
echo "次のステップ:"
echo "1. reports/final-report.md を編集"
echo "2. aidev を本番運用 or Bedrock Multi-Agent 実装を開始"
\`\`\`

---

## 📝 重要な観察ポイント（全周共通）

### 必須確認項目

#### PHASE_GUIDE.md の読み込み
- [ ] Claude が各フェーズの PHASE_GUIDE.md を読み込んだか
- [ ] 読み込みの証拠: 会話ログに PHASE_GUIDE.md の内容が反映されているか

#### 技術標準の参照
- [ ] 41_python.md を参照したか
- [ ] 45_cloudformation.md を参照したか
- [ ] 参照の証拠: 技術標準に沿ったコード・インフラが生成されたか

#### デプロイスクリプトの生成（最重要）
- [ ] scripts/create-changeset.sh が存在するか
- [ ] scripts/describe-changeset.sh が存在するか
- [ ] scripts/execute-changeset.sh が存在するか
- [ ] scripts/rollback.sh が存在するか
- [ ] スクリプトが実行可能か（chmod +x 済みか）
- [ ] スクリプトにエラーハンドリングがあるか

#### CloudFormation 3 Principles
- [ ] 責任分離原則（スタック分割）
- [ ] テンプレート分割原則（ネスト or クロススタック参照）
- [ ] 段階的デプロイ原則（Change Set）

---

## 🎯 成功基準（3周目終了時点）

### 必須項目（すべて満たす必要あり）
- [ ] デプロイスクリプトが自動生成される
- [ ] dry-run が成功する
- [ ] 本番デプロイが成功する（オプション実施時）
- [ ] ロールバックが成功する（オプション実施時）
- [ ] テストカバレッジ 80%+
- [ ] CloudFormation 3 principles 準拠

### 推奨項目（8割以上満たすことが望ましい）
- [ ] 技術標準を正しく参照している
- [ ] 代替案・トレードオフが提示される
- [ ] システム構成図が分かりやすい
- [ ] README.md が十分に詳細
- [ ] デプロイ手順書が実用的
- [ ] 運用手順書が具体的
- [ ] コード品質が高い
- [ ] エラーハンドリングが適切
- [ ] セキュリティベストプラクティス準拠
- [ ] コストが最適化されている

---

**作成日**: 2025-10-24
**更新日**: 2025-10-24
