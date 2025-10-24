# 3周テスト スコープ定義

**目的**: 設計→実装→テスト→納品フェーズの実行品質を検証する

---

## 🎯 テスト範囲

### 対象フェーズ

- ❌ **企画フェーズ**: テスト範囲外
- ❌ **要件定義フェーズ**: テスト範囲外
- ✅ **設計フェーズ**: **テスト範囲**
- ✅ **実装フェーズ**: **テスト範囲**
- ✅ **テストフェーズ**: **テスト範囲**
- ✅ **納品フェーズ**: **テスト範囲**

### 理由

**企画・要件定義は固定**:
- AWS-ECS-Forgate の企画書・要件定義書は既に存在（`docs/01_企画書.md`, `docs/02_要件定義書.md`）
- これらを**そのまま使用**する
- 毎回同じインプットで、設計以降がどう変わるかを検証

**設計以降を0から実施**:
- 基本設計書を**削除**して白紙状態から開始
- aidev がどのような設計・実装・テスト・納品を行うか検証
- 3周で改善されていくか確認

---

## 📋 各周の実施内容

### 🔄 1周目: 初見実行

#### 準備

```bash
# 1周目ディレクトリ作成
mkdir -p /c/dev2/test-projects/round1
cd /c/dev2/test-projects/round1

# aidev コピー
cp -r /c/dev2/aiDev/.claude .
cp /c/dev2/aiDev/CLAUDE.md .
cp /c/dev2/aiDev/.gitignore .

# AWS-ECS-Forgate リポジトリをクローン（企画書・要件定義書を取得）
git clone https://github.com/k-tanaka-522/AWS-ECS-Forgate.git temp
cp temp/docs/01_企画書.md docs/
cp temp/docs/02_要件定義書.md docs/
rm -rf temp

# .claude-state を初期化（設計フェーズから開始）
mkdir -p .claude-state
cat > .claude-state/project-state.json <<EOF
{
  "projectName": "AWS-ECS-Forgate",
  "currentPhase": "design",
  "status": "ongoing",
  "updatedAt": "$(date -Iseconds)"
}
EOF
```

#### 実行

**Claude Code を起動し、以下のように話しかける**:

> 「設計フェーズから開始します。
>
> `docs/01_企画書.md` と `docs/02_要件定義書.md` を読んで、基本設計を行ってください。」

**期待される動作**:
1. Claude が企画書・要件定義書を読み込む
2. `.claude/docs/10_facilitation/2.3_設計フェーズ/PHASE_GUIDE.md` を読み込む
3. 設計フェーズを実行
4. 基本設計書を生成
5. 実装フェーズに進む
6. コード・インフラを生成
7. テストフェーズに進む
8. テストを実行
9. 納品フェーズに進む
10. README・デプロイ手順書等を生成

#### 検証ポイント

**設計フェーズ**:
- [ ] 企画書・要件定義書を正しく読み込んだか
- [ ] 技術選定の理由が明確か
- [ ] 代替案・トレードオフが提示されたか
- [ ] システム構成図（Mermaid）が生成されたか
- [ ] CloudFormation 3 principles に言及したか

**実装フェーズ**:
- [ ] 技術標準（41_python.md, 45_cloudformation.md）を参照したか
- [ ] 事前説明 → 生成 → 事後説明の原則を守ったか
- [ ] FastAPI のコードが生成されたか
- [ ] テストコードが生成されたか
- [ ] CloudFormation テンプレートが生成されたか
- [ ] **デプロイスクリプトが生成されたか** ⭐重要

**テストフェーズ**:
- [ ] テスト計画が提示されたか
- [ ] テストが実行されたか
- [ ] カバレッジが確認されたか

**納品フェーズ**:
- [ ] README.md が生成されたか
- [ ] デプロイ手順書が生成されたか（dry-run含む）
- [ ] 運用手順書が生成されたか（必要に応じて）

#### 実デプロイ検証

```bash
# スクリプトが存在するか確認
ls -la scripts/

# 期待されるファイル:
# - create-changeset.sh
# - describe-changeset.sh
# - execute-changeset.sh
# - rollback.sh

# スクリプトが実行可能か確認
chmod +x scripts/*.sh

# dry-run 実行
./scripts/create-changeset.sh test-stack-round1
./scripts/describe-changeset.sh test-stack-round1

# Change Set の内容を確認
# - 意図しないリソース削除がないか
# - 作成されるリソースが設計通りか

# デプロイ実行
./scripts/execute-changeset.sh test-stack-round1

# 動作確認
# ALB の DNS 名を取得してアクセス
aws cloudformation describe-stacks \
  --stack-name test-stack-round1 \
  --query 'Stacks[0].Outputs[?OutputKey==`LoadBalancerDNS`].OutputValue' \
  --output text

curl http://<ALB-DNS>/health

# ロールバック
./scripts/rollback.sh test-stack-round1
```

#### レビュー（システムアーキテクト・CTO視点）

**`reports/ROUND1_REVIEW.md` を作成**:

```markdown
## 1周目レビュー

### 問題点

#### デプロイスクリプト
- [ ] スクリプトが生成されなかった
- [ ] スクリプトのエラーハンドリングが不足
- [ ] スクリプトのログ出力が不十分

#### 技術標準の不足
- [ ] FastAPI のベストプラクティスがない
- [ ] Docker 標準がない
- [ ] GitHub Actions 標準がない

#### PHASE_GUIDE.md の改善点
- [ ] 設計フェーズ: 代替案・トレードオフの提示方法が不明確
- [ ] 実装フェーズ: デプロイスクリプト生成の指示が不足
- [ ] 納品フェーズ: dry-run の確認ポイントが不明確

### 改善アクション

#### 優先度: 高（2周目開始前に対応）
1. `45_cloudformation.md` にデプロイスクリプトの品質基準を追加
2. `2.4.6.1.7_デプロイ自動化設計.md` に Good Example を追加
3. `41_python.md` に FastAPI セクションを追加

#### 優先度: 中（3周目開始前に対応）
1. `47_docker.md` を新規作成
2. `48_github_actions.md` を新規作成
```

#### 改善実施

```bash
cd /c/dev2/aiDev

# 問題点を修正
# 例: 45_cloudformation.md にデプロイスクリプトの品質基準を追加

git add .
git commit -m "1周目レビュー: デプロイスクリプトの品質基準を追加"
```

---

### 🔄 2周目: 改善版で再実行

#### 準備

```bash
# 2周目ディレクトリ作成
mkdir -p /c/dev2/test-projects/round2
cd /c/dev2/test-projects/round2

# 改善版 aidev コピー
cp -r /c/dev2/aiDev/.claude .
cp /c/dev2/aiDev/CLAUDE.md .
cp /c/dev2/aiDev/.gitignore .

# 企画書・要件定義書をコピー（1周目と同じもの）
cp /c/dev2/test-projects/round1/docs/01_企画書.md docs/
cp /c/dev2/test-projects/round1/docs/02_要件定義書.md docs/

# .claude-state を初期化（設計フェーズから開始）
mkdir -p .claude-state
cat > .claude-state/project-state.json <<EOF
{
  "projectName": "AWS-ECS-Forgate",
  "currentPhase": "design",
  "status": "ongoing",
  "updatedAt": "$(date -Iseconds)"
}
EOF
```

#### 実行

**新しい Claude Code セッションを起動し、同じように話しかける**:

> 「設計フェーズから開始します。
>
> `docs/01_企画書.md` と `docs/02_要件定義書.md` を読んで、基本設計を行ってください。」

**検証ポイント**:
- [ ] 1周目の問題が解消されているか
- [ ] デプロイスクリプトが生成されたか
- [ ] スクリプトの品質が向上しているか
- [ ] 新しい問題が発生していないか

#### 実デプロイ検証

```bash
# 1周目と同じ手順でデプロイ検証
./scripts/create-changeset.sh test-stack-round2
./scripts/describe-changeset.sh test-stack-round2
./scripts/execute-changeset.sh test-stack-round2

# 動作確認
curl http://<ALB-DNS>/health

# ロールバック
./scripts/rollback.sh test-stack-round2
```

#### レビュー

**`reports/ROUND2_REVIEW.md` を作成**:

```markdown
## 2周目レビュー

### 改善された点
- [ ] デプロイスクリプトが生成されるようになった
- [ ] スクリプトの品質が向上した

### 新たな問題点
- [ ] [具体的な問題]

### 残存する問題点
- [ ] [1周目から改善されていない問題]

### 改善アクション（3周目前）
1. [改善項目1]
2. [改善項目2]
```

#### 改善実施

```bash
cd /c/dev2/aiDev

# 2周目の問題点を修正

git add .
git commit -m "2周目レビュー: [改善内容]"
```

---

### 🔄 3周目: 完成度確認

#### 準備

```bash
# 3周目ディレクトリ作成
mkdir -p /c/dev2/test-projects/round3
cd /c/dev2/test-projects/round3

# 最終版 aidev コピー
cp -r /c/dev2/aiDev/.claude .
cp /c/dev2/aiDev/CLAUDE.md .
cp /c/dev2/aiDev/.gitignore .

# 企画書・要件定義書をコピー（1周目と同じもの）
cp /c/dev2/test-projects/round1/docs/01_企画書.md docs/
cp /c/dev2/test-projects/round1/docs/02_要件定義書.md docs/

# .claude-state を初期化（設計フェーズから開始）
mkdir -p .claude-state
cat > .claude-state/project-state.json <<EOF
{
  "projectName": "AWS-ECS-Forgate",
  "currentPhase": "design",
  "status": "ongoing",
  "updatedAt": "$(date -Iseconds)"
}
EOF
```

#### 実行

**新しい Claude Code セッションを起動し、同じように話しかける**:

> 「設計フェーズから開始します。
>
> `docs/01_企画書.md` と `docs/02_要件定義書.md` を読んで、基本設計を行ってください。」

**検証ポイント**:
- [ ] 1周目・2周目の問題がすべて解消されているか
- [ ] 実用レベルに達しているか
- [ ] 本番プロジェクトで使えるか

#### 実デプロイ検証

```bash
# 1周目・2周目と同じ手順でデプロイ検証
./scripts/create-changeset.sh test-stack-round3
./scripts/describe-changeset.sh test-stack-round3
./scripts/execute-changeset.sh test-stack-round3

# 動作確認
curl http://<ALB-DNS>/health

# ロールバック
./scripts/rollback.sh test-stack-round3
```

#### 最終レビュー

**`reports/ROUND3_REVIEW.md` を作成**:

```markdown
## 3周目レビュー

### 改善の推移（1周目→2周目→3周目）
- デプロイスクリプト: なし → 生成されるが品質低 → 高品質
- FastAPI コード: 規約準拠せず → 一部準拠 → 完全準拠
- テストカバレッジ: 30% → 60% → 85%

### 最終評価
- aidev 完成度: XX%
- 実用レベル判定: [本番使用可能 / 一部改善必要 / 改善必要]

### Bedrock Multi-Agent 化の判断
- [aidev継続 / Bedrock移行]
- 理由: [具体的な理由]
```

---

## 📊 3周の比較

### 比較観点

| 項目 | 1周目 | 2周目 | 3周目 |
|------|-------|-------|-------|
| **デプロイスクリプト生成** | ❌ | ⚠️ | ✅ |
| **スクリプト品質** | - | ⚠️ | ✅ |
| **FastAPI コード品質** | ⚠️ | ⚠️ | ✅ |
| **テストカバレッジ** | 30% | 60% | 85% |
| **CloudFormation 3 principles** | ❌ | ⚠️ | ✅ |
| **代替案・トレードオフ** | ❌ | ⚠️ | ✅ |
| **dry-run 実行** | ❌ | ✅ | ✅ |
| **本番デプロイ成功** | ❌ | ✅ | ✅ |
| **ロールバック成功** | - | ✅ | ✅ |

凡例:
- ✅ 合格
- ⚠️ 一部問題あり
- ❌ 不合格
- `-` 未実施

### 改善の推移グラフ（イメージ）

```
完成度
100% │                          ●
     │                      ●
 80% │                  ●
     │              ●
 60% │          ●
     │      ●
 40% │  ●
     │
 20% │
     │
  0% └──────────────────────────
      1周目  2周目  3周目
```

---

## 🎯 成功基準

### 3周目終了時点での合格基準

#### 必須項目（すべて満たす必要あり）

- [ ] デプロイスクリプトが自動生成される
- [ ] dry-run が成功する
- [ ] 本番デプロイが成功する
- [ ] ロールバックが成功する
- [ ] テストカバレッジ 80%+
- [ ] CloudFormation 3 principles 準拠

#### 推奨項目（8割以上満たすことが望ましい）

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

### 実用レベル判定

**本番使用可能**（80点以上）:
- 必須項目すべて合格
- 推奨項目 8割以上合格
- 重大な問題なし

**一部改善必要**（60-79点）:
- 必須項目すべて合格
- 推奨項目 6-7割合格
- 軽微な問題のみ

**改善必要**（60点未満）:
- 必須項目に不合格あり
- または推奨項目 6割未満

---

## 💡 リファクタリングの観点

**各周で技術標準・PHASE_GUIDE.md をリファクタリング**

### 1周目→2周目のリファクタリング

**対象**:
- デプロイスクリプトの品質基準追加
- FastAPI ベストプラクティス追加
- PHASE_GUIDE.md の指示明確化

### 2周目→3周目のリファクタリング

**対象**:
- Docker 標準追加
- GitHub Actions 標準追加
- セキュリティチェックリスト拡充

### リファクタリングの効果測定

**改善前後の比較**:
```markdown
## リファクタリング効果

### 改善項目1: デプロイスクリプト品質基準追加

**改善前（1周目）**:
- デプロイスクリプトが生成されない
- 手動でデプロイする必要がある

**改善後（2周目）**:
- デプロイスクリプトが自動生成される
- エラーハンドリング、ログ出力、パラメータ検証が含まれる

**効果**:
- デプロイ作業時間: 30分 → 5分（83%削減）
- デプロイミス: 3回に1回 → ほぼなし
```

---

**作成日**: 2025-10-24
**作成者**: Claude（AI開発ファシリテーター）
