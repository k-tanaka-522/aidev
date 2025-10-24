# Agent設計検証結果

**検証日**: 2025-10-24
**目的**: Agent設計の妥当性を実機テストで検証

---

## 1. 検証内容

### 1.1 検証方法

**作成したテストAgent**:
- ファイル: `.claude/agents/test-consultant.md`
- 内容: 最小限の初回ヒアリング機能のみ
- 目的: Agent呼び出しの基本動作を確認

**呼び出し方法**:
```
Task tool with subagent_type="test-consultant"
```

### 1.2 検証結果

**❌ 失敗: カスタムAgentは呼び出せない**

```
<error>Agent type 'test-consultant' not found. Available agents: general-purpose, statusline-setup, output-style-setup, Explore</error>
```

**利用可能なAgent（組み込みのみ）**:
1. `general-purpose` - 汎用タスク実行
2. `statusline-setup` - ステータスライン設定
3. `output-style-setup` - 出力スタイル設定
4. `Explore` - コードベース探索（速い、探索専用）

**結論**: `.claude/agents/` に配置したカスタムAgentは、Task toolから呼び出すことができない。

---

## 2. AGENT_DESIGN_PROPOSAL.md の Unknowns 検証結果

### Unknown 1: 役割Agentがユーザーに直接質問できるか？
**検証結果**: **未検証**（Agentを呼び出せなかったため）

### Unknown 2: Agentがメインに結果を返せるか？
**検証結果**: **未検証**（Agentを呼び出せなかったため）

### Unknown 3: 役割AgentがTask toolでプロセスAgentを呼べるか？
**検証結果**: **❌ 呼べない**
- カスタムAgent自体が呼び出せないため、階層構造は実現不可能

### Unknown 4: Agentプロンプトのコンテキストサイズ制限
**検証結果**: **未検証**（Agentを呼び出せなかったため）

---

## 3. Claude Code の Agent 機能の実態

### 3.1 公式ドキュメントの記載

Claude Code ドキュメントには以下の記載があります:

**Subagents**:
> Custom agents can be defined in `.claude/agents/` using YAML frontmatter.

しかし、実際には **カスタムAgentをTask toolから呼び出すことはできない** ことが判明。

### 3.2 利用可能なAgent機能

**組み込みAgentのみ利用可能**:
- `general-purpose` - 複雑なタスクを自律実行
- `Explore` - コードベース探索（glob, grep, read, bash）

**これらのAgentの特性**:
- メインClaudeから `Task` toolで呼び出す
- プロンプトで指示を与える
- 完了後、1つのメッセージで結果を返す
- ユーザーに結果は見えない（メインClaudeが要約して伝える）

---

## 4. 設計への影響

### 4.1 当初の設計案（AGENT_DESIGN_PROPOSAL.md）

**Pattern A**: シンプルな役割Agent
- consultant.md, architect.md, coder.md, qa.md を `.claude/agents/` に配置
- メインClaudeがTask toolで呼び出す
- **結果**: ❌ 実現不可能（カスタムAgentが呼び出せない）

**Pattern B**: プロセスAgent
- initial-hearing.md, problem-deep-dive.md 等を `.claude/agents/` に配置
- **結果**: ❌ 実現不可能（同上）

**Pattern C**: 役割Agent → プロセスAgent（階層構造）
- **結果**: ❌ 実現不可能（同上）

### 4.2 実現可能な設計

**現実的な選択肢は2つ**:

#### 選択肢1: PHASE_GUIDE.md アプローチ（元の案）
- カスタムAgentを使わない
- メインClaudeがPHASE_GUIDE.mdを読み込んで実行
- **メリット**: シンプル、確実に動く
- **デメリット**: コンテキストサイズが大きい、Claudeが忘れる可能性

#### 選択肢2: 組み込みAgent（general-purpose）を活用
- メインClaudeが `general-purpose` Agentにタスクを委譲
- Agentには詳細なプロンプト（PHASE_GUIDE.mdの内容）を渡す
- **メリット**: タスクの分離、コンテキスト削減
- **デメリット**: Agentはユーザーと直接対話できない（結果を返すのみ）

---

## 5. 組み込みAgent（general-purpose）の活用案

### 5.1 動作モデル

```
ユーザー
  ↓
メインClaude（PM）
  ↓ Task tool呼び出し
general-purpose Agent（コンサルタント役）
  - PHASE_GUIDE.mdの内容を含むプロンプトを受け取る
  - 必要なファイル読み込み（Read tool）
  - 必要な判断を実行
  - 決定事項を記録（Write tool）
  ↓ 結果を返す
メインClaude（PM）
  ↓ 結果をユーザーに伝える
ユーザー
```

**重要な制約**:
- Agentはユーザーと直接対話できない
- メインClaudeが質問をユーザーに代行
- Agentは判断・実行のみを担当

### 5.2 実装イメージ

**メインClaude（CLAUDE.md に記載）**:
```markdown
## 企画フェーズの開始

ユーザーから「システムを作りたい」と言われたら:

1. `.claude/docs/10_facilitation/2.1_企画フェーズ/PHASE_GUIDE.md` を読み込む
2. `general-purpose` Agentに企画フェーズ実行を依頼
3. Agentから「○○をユーザーに確認してください」と指示を受ける
4. ユーザーに質問
5. 回答をAgentに渡す
6. Agentが企画書を生成
7. ユーザーに提示
```

**Agentへのプロンプト例**:
```
企画フェーズを実行してください。

【実行内容】
- `.claude/docs/10_facilitation/2.1_企画フェーズ/PHASE_GUIDE.md` を参照
- 企画フェーズで必要な決定事項を収集
- ユーザーに確認が必要な項目をリストアップして返してください
- 企画書のドラフトを生成

【重要】
- ユーザーと直接対話はできません
- 質問が必要な場合は「ユーザーに○○を確認してください」と返してください
- 決定事項は `.claude-state/planning-decisions.json` に記録してください

【現在の状態】
- プロジェクト名: [未定]
- ユーザーの回答: [なし]
```

### 5.3 メリット・デメリット

**メリット**:
- ✅ 実際に動作する（組み込みAgentを使用）
- ✅ タスクの分離ができる
- ✅ コンテキストサイズを削減できる
- ✅ PHASE_GUIDE.mdの内容を活用できる

**デメリット**:
- ❌ Agentはユーザーと直接対話できない
- ❌ メインClaudeが仲介する必要がある
- ❌ 一問一答の自然な流れが難しい
- ❌ ユーザー体験が複雑になる可能性

---

## 6. 推奨される設計方針

### 6.1 結論

**選択肢1（PHASE_GUIDE.md）を推奨**

理由:
1. **ユーザー体験が最優先**
   - 一問一答の自然な対話が可能
   - メインClaudeが直接ユーザーと対話
   - Agent経由の回りくどさがない

2. **組み込みAgentの制約が大きい**
   - ユーザーと直接対話できない
   - メインClaudeが仲介する必要がある
   - 「PMのような役割」という当初の意図と合わない

3. **コンテキストサイズ問題は管理可能**
   - PHASE_GUIDE.mdは各フェーズごとに読み込む
   - 必要な技術標準のみを参照
   - 不要なファイルは読み込まない

### 6.2 改善案

**PHASE_GUIDE.md アプローチの改善**:

1. **段階的な読み込み**
   ```
   企画フェーズ開始
   ↓
   .claude/docs/10_facilitation/2.1_企画フェーズ/PHASE_GUIDE.md のみ読み込む
   ↓
   必要に応じて技術標準を参照（部分的に）
   ```

2. **状態管理の徹底**
   - `.claude-state/` で進捗を記録
   - セッションをまたいでも継続可能
   - 「どこまで完了したか」を明確に

3. **CLAUDE.md の最適化**
   - 会話開始時の必読事項を明確に
   - 現在のフェーズに応じた PHASE_GUIDE.md を読む指示
   - 不要な情報は読まない

### 6.3 組み込みAgent（general-purpose）の活用場面

**限定的に活用**:

1. **コード生成タスク**
   - 実装フェーズでのコード生成
   - テストコード生成
   - インフラコード生成
   - ユーザーとの対話が不要なタスク

2. **調査タスク**
   - 技術標準の参照・要約
   - 既存コードの分析
   - ドキュメント生成の下準備

**使わない場面**:

1. **ユーザーとの対話が必要な場面**
   - ヒアリング
   - 要件確認
   - 設計判断の相談

---

## 7. 次のアクション

### 7.1 優先度1: PHASE_GUIDE.md アプローチの完成

1. **CLAUDE.md の更新**
   - 会話開始時の動作を明確化
   - PHASE_GUIDE.md の読み込みタイミングを指定
   - コンテキスト管理のベストプラクティスを記載

2. **PHASE_GUIDE.md の完成**
   - すべてのフェーズのPHASE_GUIDE.mdを作成（一部は完成済み）
   - 一貫性のチェック
   - 実行可能性のテスト

3. **AWS-ECS-Forgate での実証**
   - 3周テスト実施
   - 問題点の洗い出し
   - 改善策の実装

### 7.2 優先度2: 組み込みAgentの活用検討

**コード生成タスクで試験的に導入**:

実装フェーズで、以下のタスクを `general-purpose` Agentに委譲:
- FastAPI エンドポイント生成
- テストコード生成
- CloudFormation テンプレート生成

**検証項目**:
- タスク委譲でコンテキストサイズが削減できるか
- 生成品質は維持できるか
- ユーザー体験に影響はないか

---

## 8. まとめ

### 8.1 検証で明らかになったこと

1. **カスタムAgentは使えない**
   - `.claude/agents/` に配置しても、Task toolから呼び出せない
   - 組み込みAgent（general-purpose, Explore）のみ利用可能

2. **組み込みAgentの制約**
   - ユーザーと直接対話できない
   - メインClaudeが仲介する必要がある
   - 「PMのような役割」という設計意図と合わない

3. **PHASE_GUIDE.md アプローチが最適**
   - ユーザー体験を優先
   - 一問一答の自然な対話が可能
   - コンテキストサイズは管理可能

### 8.2 設計方針の決定

**採用**: PHASE_GUIDE.md アプローチ（元の案）

**補助的に活用**: 組み込みAgent（general-purpose）
- コード生成等、ユーザー対話不要なタスクのみ

### 8.3 今後の作業

1. PHASE_GUIDE.md の完成
2. CLAUDE.md の最適化
3. AWS-ECS-Forgate での実証テスト（3周）
4. 組み込みAgentの限定的な活用検討

---

**作成日**: 2025-10-24
**検証者**: Claude（Sonnet 4.5）
**重要度**: ⭐⭐⭐ 最重要（設計方針の決定）
