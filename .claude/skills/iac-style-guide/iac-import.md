> 移行元: `.claude/docs/40_standards/42_infra/iac/iac-import.md`（02文書4.4節、内容変更なしで移管）
> **v1前提記述の書き換え（M2、02文書版1.7 14.2節の完了条件）**: 「GitHubへの取り込みをAIに依頼」
> 節・「チェックリスト」節が更新先として`docs/03_基本設計/99_パラメーターシート.md`
> （v1のディレクトリ構造）と「ADR追記」（v1にはADRという成果物の置き場が明示されていなかった）を
> 挙げていたため、v2の成果物体系（決定ログ=ADR相当、`docs/04_インフラ設計/`はZone3生成）へ
> 書き換えた。Import手順そのもの（CloudFormation Import操作、Change Setレビュー等）は
> v1/v2で変わらない技術的内容のため変更していない。

# IaC Import 標準（AI活用前提）

**目的**: 緊急対応で作成した管理外リソースを、AIと協力してIaC・設計書に取り込む

---

## 対象シナリオ

- PITR復旧後のRDSインスタンス
- 手動で変更したリソース設定
- コンソールで緊急追加したリソース

---

## 標準プロセス

### 1. AWS CLI でリソース情報を取得

**目的**: 実リソースの設定値をJSON形式で取得

**実施者**: エンジニア（または AI に依頼）

**例**:
```bash
# RDS の場合
aws rds describe-db-instances \
  --db-instance-identifier <リソース識別子> \
  --output json > /tmp/resource.json

# ECS の場合
aws ecs describe-task-definition \
  --task-definition <タスク定義名> \
  --output json > /tmp/resource.json

# Security Group の場合
aws ec2 describe-security-groups \
  --group-ids <sg-xxxxx> \
  --output json > /tmp/resource.json
```

---

### 2. AI に CloudFormation 生成を依頼

**目的**: 取得したJSON情報から CloudFormation テンプレートを生成

**AI への依頼内容**:
```
以下のリソース情報から、CloudFormation テンプレートを生成してください。

[/tmp/resource.json の内容を貼り付け]

要件:
- 既存の CloudFormation スタック構造に合わせる
- パラメーター化すべき値は Parameters に抽出
- 論理IDは既存の命名規則に従う
```

**AI の作業**:
- CloudFormation YAML 生成
- パラメーター抽出
- 既存テンプレートとの整合性確認

---

### 3. CloudFormation Import 実行を AI に依頼

**目的**: 生成したテンプレートで Import Change Set を作成・実行

**AI への依頼内容**:
```
生成した CloudFormation テンプレートで Import を実行してください。

リソース情報:
- リソースタイプ: AWS::RDS::DBInstance
- 論理ID: RDSInstance
- リソース識別子: <リソース識別子>
- スタック名: <スタック名>
```

**AI の作業**:
- Import Change Set 作成コマンド生成
- Change Set レビュー
- 実行コマンド生成
- 実行結果確認

---

### 4. GitHub への取り込みを AI に依頼（v2、M2で書き換え）

**目的**: IaC コードを Git リポジトリに反映

**v1との違い**: v1は「パラメーターシート」「ADR」をv1の`docs/03_基本設計/`配下に直接更新
していたが、v2では次のいずれかに読み替える。
- **決定ログ（ADR相当）**: `docs/00_プロジェクト管理・ガバナンス/decisions/DL-{4桁}_*.md`
  （`decide` Skill経由で起票。02文書8章。障害内容・対応内容・今後の対策は8.1節の
  「決定内容」「根拠」「検討した代替案と却下理由」節に対応する）
- **パラメーターシート（正式なインフラ設計書）**: Zone2実施時点（本シナリオはZone2硬化中
  または稼働後Mode Bで発生することが多い）では`docs/04_インフラ設計/`へ直接書き込まない
  （Zone3まで空が正常、02文書4.2.1節）。パラメータ値そのものは`infra/parameters/*.json`
  （実行成果物）に反映し、正式な`04-09_環境設計.md`への反映はZone3の`reverse-doc`が
  実物から生成する。ただしZone4（Mode B、稼働後）に発生した場合は既に`docs/04_インフラ設計/`
  が存在するため、`00-14_変更管理台帳.md`に変更を記録した上で該当ファイルを直接更新してよい

**AI への依頼内容（Zone2〜Zone3中、標準ケース）**:
```
以下のファイルを更新して、Git commit してください。

更新対象:
- infra/cloudformation/database.yaml
- infra/parameters/prod.json

続けて decide Skill を呼び出し、次の内容で決定ログを起票してください:
- 対象カテゴリ: アーキ土台（またはインフラ制約に該当するもの）
- 決定内容: PITR復旧後のRDSをCloudFormationに取り込み
- 根拠・検討した代替案: 障害内容、対応内容、今後の対策

コミットメッセージ:
"Import: PITR復旧後のRDSをCloudFormationに取り込み"
```

**AI の作業**:
- ファイル更新（`infra/`配下）
- `decide` Skillによる決定ログ起票（障害内容、対応内容、今後の対策）
- Git commit & push

---

## チェックリスト（v2、M2で書き換え）

AI に以下を確認してもらってください：

- [ ] CloudFormation Import 成功
- [ ] IaC ファイル更新（`infra/cloudformation/*.yaml`, `infra/parameters/*.json`）
- [ ] 決定ログ起票（`docs/00_プロジェクト管理・ガバナンス/decisions/DL-*.md`、ADR相当）
- [ ] Zone4（Mode B）中の対応の場合のみ: `docs/04_インフラ設計/`の該当ファイル更新と
      `00-14_変更管理台帳.md`への記録
- [ ] Git commit & push 完了

---

## AI への依頼例（テンプレート）

### 全体フロー

```
RDS障害が発生し、PITRで復旧しました。
復旧後のRDSインスタンス（myapp-prod-db-restored）を CloudFormation に取り込んでください。

手順:
1. AWS CLI でリソース情報を取得
2. CloudFormation テンプレート生成
3. CloudFormation Import 実行
4. GitHub に取り込み（IaC、パラメーターシート、設計書ADR）

【障害情報】
- 日時: 2025-10-26 14:00
- 事象: RDSストレージ容量不足
- 対応: PITR復旧、ストレージ 50GB → 100GB 拡張
- リソース識別子: myapp-prod-db-restored
```

---

## トラブルシューティング

### Import 失敗時

**AI に依頼**:
```
CloudFormation Import が失敗しました。
以下のエラーメッセージを解析して、対処方法を提案してください。

[エラーメッセージを貼り付け]
```

### Drift 検出時

**AI に依頼**:
```
CloudFormation Import 後に Drift が検出されました。
Drift を解消してください。

[Drift 検出結果を貼り付け]
```

---

## まとめ

**AIと協力して進める前提**:
- AWS CLI でリソース情報取得
- AI に CloudFormation 生成を依頼
- AI に Import 実行を依頼
- AI に GitHub 取り込みを依頼

**所要時間**: 約10-15分（AIと協力）
