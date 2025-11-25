# スキル体系

## 概要

`.claude/skills/` は、各サブエージェントが参照する専門知識のインデックスです。
既存の `.claude/docs/` の充実したコンテンツを活用し、スキルとして体系化しています。

## スキルカテゴリ

| カテゴリ | 説明 | 主な利用エージェント |
|---------|------|------------------|
| [requirements](requirements/) | 要件定義、ユーザーストーリー、受入基準 | consultant |
| [architecture](architecture/) | アーキテクチャ設計、設計パターン | app-architect, consultant |
| [infrastructure](infrastructure/) | インフラ設計、IaC、AWS | infra-architect, sre |
| [security](security/) | セキュリティ、脆弱性、OWASP | infra-architect, sre |
| [testing](testing/) | テスト戦略、テスト技法 | qa, coder |
| [sre](sre/) | 運用、SLO/SLI、インシデント管理 | sre |
| [project-management](project-management/) | プロジェクト管理、フェーズ管理 | PM |
| [design](design/) | UI/UX、デザインシステム | designer |
| [coding](coding/) | コーディング規約、言語別標準 | coder, app-architect |
| [standards](standards/) | 国際標準（PMBOK, BABOK等） | 全エージェント |

## 使い方

各エージェントは、自分の専門領域のスキルを参照します：

```markdown
# 例: app-architect が設計を行う際

参照スキル:
- .claude/skills/architecture/SKILL.md → 設計パターン、ADR
- .claude/skills/coding/SKILL.md → 実装を意識した設計
- .claude/skills/standards/SKILL.md → 国際標準の適用
```

## 既存docsとの関係

スキルは既存の `.claude/docs/` へのインデックスとして機能します：
- **重複なし**: 内容は既存docsに存在
- **ナビゲーション**: スキルから該当docsへのリンク
- **クイックリファレンス**: 概要とポイントのみ記載

## 設計原則

1. **既存資産の活用** - docs/を最大限再利用
2. **段階的充実** - 最初は簡易版、徐々に充実
3. **エージェント視点** - 「何を参照すべきか」が明確

## 今後の拡張

- 各SKILL.mdの内容充実
- チュートリアル・サンプル追加
- 新規スキルカテゴリ追加
