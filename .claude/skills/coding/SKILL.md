# コーディングスキル

## 概要

コーディング規約、言語別標準、クリーンコード原則に関する専門知識。

## 主な利用エージェント

- **coder**: 実装の主担当
- **app-architect**: 実装パターンの設計
- **qa**: コードレビュー

## 参照ドキュメント

### 技術標準（言語別）
- [.claude/docs/40_standards/41_app/languages/python.md](../../docs/40_standards/41_app/languages/python.md)
- [.claude/docs/40_standards/41_app/languages/typescript.md](../../docs/40_standards/41_app/languages/typescript.md)
- [.claude/docs/40_standards/41_app/languages/csharp.md](../../docs/40_standards/41_app/languages/csharp.md)
- [.claude/docs/40_standards/41_app/languages/go.md](../../docs/40_standards/41_app/languages/go.md)

### 技術標準（フレームワーク）
- [.claude/docs/40_standards/41_app/frameworks/react_nextjs.md](../../docs/40_standards/41_app/frameworks/react_nextjs.md)
- [.claude/docs/40_standards/41_app/frameworks/flutter.md](../../docs/40_standards/41_app/frameworks/flutter.md)

### フェーズ別ガイド（実装）
- [.claude/docs/10_facilitation/2.4_実装フェーズ/PHASE_GUIDE.md](../../docs/10_facilitation/2.4_実装フェーズ/PHASE_GUIDE.md)
- [2.4.3_技術標準適用チェックリスト.md](../../docs/10_facilitation/2.4_実装フェーズ/2.4.3_技術標準適用チェックリスト.md)
- [2.4.5_言語別コーディング規約適用/](../../docs/10_facilitation/2.4_実装フェーズ/2.4.5_言語別コーディング規約適用/)

## クイックリファレンス

### SOLID 原則
- **S**ingle Responsibility: 単一責任
- **O**pen/Closed: 拡張に開き、修正に閉じる
- **L**iskov Substitution: リスコフの置換原則
- **I**nterface Segregation: インターフェース分離
- **D**ependency Inversion: 依存性逆転

### クリーンコード原則
- **意味のある名前**: 意図が明確
- **小さな関数**: 1つのことだけする
- **コメント最小化**: コードで説明
- **DRY**: Don't Repeat Yourself
- **YAGNI**: You Aren't Gonna Need It

### TDD（テスト駆動開発）
1. **Red**: 失敗するテストを書く
2. **Green**: テストが通る最小限のコードを書く
3. **Refactor**: コードを改善する
4. 繰り返し

### コードレビュー観点
- **ロジックの正確性**: 仕様通りか
- **技術標準準拠**: 規約に従っているか
- **セキュリティ**: 脆弱性はないか
- **パフォーマンス**: 効率的か
- **可読性・保守性**: 理解しやすいか

### エラーハンドリング
- **例外設計**: カスタム例外クラス
- **ログ記録**: エラー内容を記録
- **ユーザーへの通知**: 分かりやすいメッセージ
- **リトライロジック**: 一時的エラーは再試行

### コメント規約（全言語共通）
すべての関数/メソッド/クラスに、以下3点を日本語でコメント：
1. **目的・理由**（なぜ）- この処理が必要な理由
2. **影響範囲**（どこに）- この処理がどこに影響するか
3. **前提条件・制約**（何が必要）- 実行条件、制約事項

### Git コミット規約
```
<type>: <subject>

<body>

<footer>
```
- **type**: feat, fix, docs, style, refactor, test, chore
- **subject**: 簡潔な説明（50文字以内）
- **body**: 詳細な説明（オプショナル）

## 関連スキル
- [architecture](../architecture/) - 設計パターン
- [testing](../testing/) - TDD、テスタブルなコード
- [security](../security/) - セキュアコーディング
- [standards](../standards/) - 業界標準
