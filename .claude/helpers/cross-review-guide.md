# クロスレビューガイド

## 概要

**クロスレビュー**: 成果物の作成者とは異なるサブエージェントがレビューを行う仕組み。
品質向上と知見共有を目的とする。

---

## クロスレビューマトリクス

| 成果物 | 作成者 | レビュアー | レビュー観点 |
|-------|-------|----------|------------|
| IaC (CloudFormation/Terraform) | SRE | Infra-Architect | 設計との整合性、ベストプラクティス |
| インフラ設計書 | Infra-Architect | SRE | 実装可能性、運用性 |
| アプリ設計書 | App-Architect | Coder | 実装可能性、技術的課題 |
| コード | Coder | QA | テスト可能性、品質 |
| テストコード | QA | Coder | カバレッジ、実装との整合性 |

---

## PMのレビュー委譲フロー

```
1. 成果物作成を委譲（Task ツール）
   ↓
2. 成果物完成報告を受領
   ↓
3. クロスレビューマトリクスを参照
   ↓
4. 適切なレビュアーに委譲（Task ツール）
   ↓
5. レビュー結果を受領
   ↓
6. レビュー記録を保存（.claude-state/reviews/）
   ↓
7. 結果に応じて対応
   - approved: 次のタスクへ
   - approved_with_comments: 軽微な修正後に承認
   - rejected: 修正タスクを作成し作成者に委譲
```

---

## レビュー委譲時のプロンプト例

### IaCレビュー（SRE → Infra-Architect）

```
以下のIaCコードをレビューしてください。

**対象**: infra/cloudformation/stacks/01-network/main.yaml
**作成者**: SRE
**設計書**: docs/design/infra/network-design.md

**レビュー観点**:
1. 設計書との整合性
2. CloudFormation ベストプラクティス
3. 技術標準準拠（.claude/docs/40_standards/42_infra/iac/cloudformation.md）
4. セキュリティ観点

**出力形式**:
- result: approved / approved_with_comments / rejected
- checklist: 各観点のpass/warn/fail
- feedback: 具体的なフィードバック
```

### 設計書レビュー（Infra-Architect → SRE）

```
以下のインフラ設計書をレビューしてください。

**対象**: docs/design/infra/network-design.md
**作成者**: Infra-Architect

**レビュー観点**:
1. 実装可能性（IaCで実現可能か）
2. 運用性（監視、アラート、復旧手順）
3. コスト最適化
4. 技術標準との整合性

**出力形式**:
- result: approved / approved_with_comments / rejected
- checklist: 各観点のpass/warn/fail
- feedback: 具体的なフィードバック
```

---

## レビュー記録のフォーマット

### ファイル名規則

```
.claude-state/reviews/review-{YYYY-MM-DD}-{NNN}.json
```

例: `review-2025-11-26-001.json`

### JSONスキーマ

```json
{
  "id": "review-2025-11-26-001",
  "created_at": "2025-11-26T10:00:00Z",
  "artifact": {
    "type": "iac|design|code|test",
    "path": "infra/cloudformation/stacks/01-network/main.yaml",
    "created_by": "sre"
  },
  "reviewer": "infra-architect",
  "checklist": [
    { "item": "設計との整合性", "status": "pass", "note": "" },
    { "item": "ベストプラクティス", "status": "pass", "note": "" },
    { "item": "技術標準準拠", "status": "warn", "note": "パラメータ化が不十分" },
    { "item": "セキュリティ", "status": "pass", "note": "" }
  ],
  "result": "approved_with_comments",
  "feedback": "パラメータ化を強化することを推奨。現状でも動作に問題なし。",
  "follow_up_task": null
}
```

### フィールド説明

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `id` | string | 一意のレビューID |
| `created_at` | ISO8601 | レビュー日時 |
| `artifact.type` | enum | iac / design / code / test |
| `artifact.path` | string | 対象ファイルパス |
| `artifact.created_by` | string | 作成者エージェント名 |
| `reviewer` | string | レビュアーエージェント名 |
| `checklist` | array | レビュー項目と結果 |
| `checklist[].status` | enum | pass / warn / fail |
| `result` | enum | approved / approved_with_comments / rejected |
| `feedback` | string | 総合フィードバック |
| `follow_up_task` | string? | 差し戻し時のタスクID |

---

## レビュー結果の対応

### approved（承認）

- レビュー記録を保存
- 次のタスクに進む

### approved_with_comments（条件付き承認）

- レビュー記録を保存
- 軽微な修正は作成者に伝達
- 次のタスクに進む（修正は並行可）

### rejected（差し戻し）

- レビュー記録を保存
- 修正タスクを作成
- 作成者に修正を委譲
- 修正完了後、再レビューを実施

---

## レビュー観点チェックリスト

### IaC（CloudFormation/Terraform）

- [ ] 設計書との整合性
- [ ] ディレクトリ構造（stacks/templates/parameters）
- [ ] パラメータ化（環境差分の分離）
- [ ] ネストスタック/モジュール活用
- [ ] セキュリティグループ設定
- [ ] タグ付け規則

### 設計書

- [ ] 要件との整合性
- [ ] 実装可能性
- [ ] 運用性（監視、復旧手順）
- [ ] 非機能要件の充足
- [ ] コスト見積もり

### コード

- [ ] 設計書との整合性
- [ ] コーディング規約準拠
- [ ] エラーハンドリング
- [ ] テスト可能性
- [ ] セキュリティ（OWASP Top 10）

### テストコード

- [ ] カバレッジ（80%以上推奨）
- [ ] 境界値テスト
- [ ] 異常系テスト
- [ ] 実装との整合性
- [ ] テストの独立性
