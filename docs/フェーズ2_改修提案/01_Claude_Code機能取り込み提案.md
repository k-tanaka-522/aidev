# aiDevへのClaude Code機能取り込み提案

**作成日**: 2025-10-31
**バージョン**: 1.0
**ステータス**: 提案中

---

## 📋 エグゼクティブサマリー

現在のaiDevには、Claude Codeが提供する以下の重要機能が未実装です：

1. **Hooks（フック機能）** - ツール実行の前後で検証・制御
2. **settings.json** - プロジェクト設定と権限管理
3. **Skills** - 再利用可能なタスク定義
4. **Status Line** - プロジェクト状態の常時表示

これらを段階的に導入することで、aiDevの**安全性**、**自動化**、**使いやすさ**を大幅に向上できます。

---

## 🔍 調査結果

### 参考資料
- [Claude Code 公式ドキュメント - Hooks](https://docs.claude.com/en/docs/claude-code/hooks)
- [Claude Code 公式ドキュメント - Settings](https://docs.claude.com/en/docs/claude-code/settings)
- [Claude Code 公式ドキュメント - Skills](https://docs.claude.com/en/docs/claude-code/skills)

### 現在のaiDev実装状況
- ✅ カスタムコマンド（/init, /status, /next, /check）
- ✅ ドキュメント体系（.claude/docs/）
- ✅ ヘルパー機能（.claude/helpers/）
- ✅ 技術標準（.claude/docs/40_standards/）
- ❌ settings.json（未実装）
- ❌ Hooks（未実装）
- ❌ Skills（未実装）
- ❌ Status Line（未実装）

---

## 🎯 未実装機能の詳細

### 1. Hooks（フック機能）

#### 概要
ツール実行の前後で、カスタムスクリプトを実行できる機能。9種類のイベントフックが利用可能。

#### 利用可能なフック
| フック名 | タイミング | 用途 |
|---------|----------|------|
| PreToolUse | ツール実行前 | 検証、ブロック、パラメータ修正 |
| PostToolUse | ツール実行後 | ログ記録、状態更新 |
| UserPromptSubmit | ユーザー入力後 | コンテキスト注入、検証 |
| Stop | メインエージェント完了時 | クリーンアップ、記録 |
| SubagentStop | サブエージェント完了時 | 結果検証 |
| SessionStart | セッション開始時 | 初期化、状態読み込み |
| SessionEnd | セッション終了時 | 状態保存 |
| PreCompact | コンパクション前 | 重要情報の保存 |
| Notification | 通知時 | カスタム処理 |

#### aiDevでの活用例
- **PreToolUse (Write/Edit)**: 実装前に設計書の実装方針をチェック（設計駆動実装の強制）
- **SessionStart**: `.claude-state/project-state.json` を自動読み込み
- **PostToolUse**: ツール実行後にタスク状態を自動更新
- **UserPromptSubmit**: プロジェクトコンテキストを自動注入

---

### 2. settings.json（プロジェクト設定）

#### 概要
プロジェクトレベルでClaude Codeの動作を制御する設定ファイル。

#### 主要設定項目

##### 権限管理
```json
{
  "permissions": {
    "allow": [
      {"toolPattern": "Read", "pathPattern": "**"}
    ],
    "ask": [
      {"toolPattern": "Write|Edit", "pathPattern": "**"}
    ],
    "deny": [
      {"toolPattern": "*", "pathPattern": ".env*"},
      {"toolPattern": "*", "pathPattern": "**/secrets/**"}
    ]
  }
}
```

##### 環境変数
```json
{
  "env": {
    "AIDEV_PROJECT_ROOT": ".",
    "AIDEV_STATE_DIR": ".claude-state"
  }
}
```

##### モデル指定
```json
{
  "model": "claude-sonnet-4-5-20250929"
}
```

##### その他
- `includeCoAuthoredBy`: Gitコミットにco-authored-byを含める
- `cleanupPeriodDays`: チャット履歴の保持期間
- `sandbox.*`: サンドボックス設定（macOS/Linux）

#### aiDevでの活用
- **シークレット保護**: `.env*`, `**/*.pem`, `**/*.key` へのアクセスを自動拒否
- **本番環境保護**: 本番リソースへの操作を制限
- **チーム共有**: settings.jsonをgitコミットして設定を共有
- **個人設定**: settings.local.json（.gitignore）で個人用設定

---

### 3. Skills（再利用可能なタスク定義）

#### 概要
Claudeが自動判断して実行する、モジュール化された機能群。

#### 構造
```
.claude/skills/
└── skill-name/
    ├── SKILL.md          # 必須: Skill定義
    └── support-files/    # オプション: 補助ファイル
```

#### SKILL.mdの形式
```markdown
---
name: skill-name
description: このSkillが何をするか、いつ使うべきか
allowed-tools: ["Read", "Write"]  # オプション: 使用可能ツール制限
---

このSkillの詳細な説明とプロンプト
```

#### 特徴
- **自動実行**: ユーザーが明示的に呼び出す必要なし
- **モデル判断**: Claudeが文脈から使用すべきSkillを自動選択
- **チーム共有**: gitコミットで自動配布

#### aiDevでの活用例

##### planning-phase Skill
```markdown
---
name: planning-phase
description: 企画フェーズのヒアリングと企画書作成を実行する。ユーザーがプロジェクトを開始したい、新しいシステムを作りたいと言った時に使用。
---

企画フェーズを開始します。
`.claude/docs/10_facilitation/2.1_企画フェーズ/` を参照し、ヒアリングを実施してください。
```

##### implementation-check Skill
```markdown
---
name: implementation-check
description: 実装前に設計書の実装方針をチェックする。コード生成前に必ず実行。
allowed-tools: ["Read", "Grep"]
---

実装チェッカーを実行します。
`.claude/helpers/implementation-checker.md` に従い、設計書の実装方針を検証してください。
```

---

### 4. Status Line（カスタムステータスライン）

#### 概要
IDEのステータスバーにプロジェクト状態を常時表示する機能。

#### 設定例
```json
{
  "statusLine": {
    "type": "command",
    "command": "node .claude/hooks/status-line.js"
  }
}
```

#### スクリプト例
```javascript
const fs = require('fs');
const path = require('path');

const stateFile = path.join(process.cwd(), '.claude-state/project-state.json');

if (fs.existsSync(stateFile)) {
  const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const phase = state.project.phase;
  const name = state.project.name || '未設定';

  console.log(JSON.stringify({
    text: `📂 ${name} | Phase: ${phase}`
  }));
}
```

#### aiDevでの活用
- 現在のフェーズを常時表示
- 未完了タスク数の表示
- ブロッカーの警告表示

---

## 🚀 実装計画

### Phase 1: 基盤整備（即時実装）

#### 1.1 settings.jsonの作成

**ファイル**: `.claude/settings.json`

```json
{
  "permissions": {
    "allow": [
      {"toolPattern": "Read", "pathPattern": "**"},
      {"toolPattern": "Grep", "pathPattern": "**"},
      {"toolPattern": "Glob", "pathPattern": "**"}
    ],
    "ask": [
      {"toolPattern": "Write", "pathPattern": "**"},
      {"toolPattern": "Edit", "pathPattern": "**"},
      {"toolPattern": "Bash", "pathPattern": "*"}
    ],
    "deny": [
      {"toolPattern": "*", "pathPattern": ".env*"},
      {"toolPattern": "*", "pathPattern": "**/secrets/**"},
      {"toolPattern": "*", "pathPattern": "**/.aws/credentials"},
      {"toolPattern": "*", "pathPattern": "**/*.pem"},
      {"toolPattern": "*", "pathPattern": "**/*.key"}
    ]
  },
  "env": {
    "AIDEV_PROJECT_ROOT": ".",
    "AIDEV_STATE_DIR": ".claude-state"
  },
  "includeCoAuthoredBy": true,
  "model": "claude-sonnet-4-5-20250929",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/session-start.js"
          }
        ]
      }
    ]
  }
}
```

#### 1.2 SessionStart Hookの実装

**ファイル**: `.claude/hooks/session-start.js`

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// プロジェクト状態ファイルのパス
const stateFile = path.join(process.cwd(), '.claude-state/project-state.json');

try {
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

    // プロジェクト情報を抽出
    const projectName = state.project.name || '未設定';
    const currentPhase = state.project.phase || 'planning';
    const lastUpdated = state.project.updated_at;

    // Claudeに追加コンテキストを注入
    const context = {
      decision: "allow",
      additionalContext: `
# プロジェクトコンテキスト（自動読み込み）

- **プロジェクト名**: ${projectName}
- **現在のフェーズ**: ${currentPhase}
- **最終更新**: ${lastUpdated}

このプロジェクトは既に開始されています。
\`.claude-state/project-state.json\` に現在の状態が記録されています。

前回の続きから作業を再開してください。
`
    };

    console.log(JSON.stringify(context));
  } else {
    // 新規プロジェクト
    const context = {
      decision: "allow",
      additionalContext: `
# 新規プロジェクト

\`.claude-state/\` ディレクトリが見つかりません。
新しいプロジェクトを開始する場合は、\`/init\` コマンドを実行してください。
`
    };

    console.log(JSON.stringify(context));
  }

  process.exit(0);
} catch (error) {
  console.error(JSON.stringify({
    decision: "allow",
    additionalContext: `SessionStart hook でエラーが発生しました: ${error.message}`
  }));
  process.exit(0);
}
```

#### 1.3 .gitignoreの更新

`.gitignore` に以下を追加：

```
# Claude Code 個人設定
.claude/settings.local.json
```

---

### Phase 2: 自動化強化（1週間以内）

#### 2.1 PreToolUse Hookの実装

**ファイル**: `.claude/hooks/pre-write-check.js`

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// stdinからhook入力を読み込み
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const hookInput = JSON.parse(input);
    const toolName = hookInput.toolName;
    const filePath = hookInput.input?.file_path || hookInput.input?.path;

    // Write/Edit時のチェック
    if ((toolName === 'Write' || toolName === 'Edit') && filePath) {
      // 実装フェーズかチェック
      const stateFile = path.join(process.cwd(), '.claude-state/project-state.json');

      if (fs.existsSync(stateFile)) {
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));

        // 実装フェーズの場合、設計書をチェック
        if (state.project.phase === 'implementation') {
          const designDoc = path.join(process.cwd(), 'docs/04_詳細設計書.md');

          if (!fs.existsSync(designDoc)) {
            // 設計書が存在しない場合、警告
            console.error(JSON.stringify({
              decision: "block",
              additionalContext: `
⚠️ 警告: 実装フェーズですが、詳細設計書が見つかりません。

設計駆動実装の原則に従い、先に設計書を作成してください。

【推奨アクション】
1. 設計フェーズに戻る
2. \`.claude/docs/10_facilitation/2.3_設計フェーズ/\` を参照
3. 詳細設計書に「実装方針」セクションを追加

このまま進めますか？（推奨しません）
`
            }));
            process.exit(2); // ブロックエラー
          }
        }
      }
    }

    // 問題なければ許可
    console.log(JSON.stringify({ decision: "allow" }));
    process.exit(0);

  } catch (error) {
    console.error(`PreWriteCheck hook error: ${error.message}`);
    process.exit(0); // エラーでもブロックしない
  }
});
```

#### 2.2 settings.jsonへのフック追加

```json
{
  "hooks": {
    "SessionStart": [...],
    "PreToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/pre-write-check.js"
          }
        ]
      }
    ]
  }
}
```

#### 2.3 Skillsの作成

##### `.claude/skills/planning-phase/SKILL.md`

```markdown
---
name: planning-phase
description: 企画フェーズのヒアリングと企画書作成を実行する。ユーザーがプロジェクトを開始したい、新しいシステムを作りたい、企画フェーズを始めたいと言った時に使用。
---

# 企画フェーズの開始

企画フェーズを開始します。

## 参照ドキュメント
`.claude/docs/10_facilitation/2.1_企画フェーズ/` 配下のドキュメントをすべて参照してください。

## 実行手順
1. **事前調査** (2.1.0_事前調査.md)
   - ビジネス背景の確認
   - 市場調査（必要に応じて）

2. **ヒアリング** (2.1.2_ヒアリング項目/)
   - 一問一答形式で丁寧に
   - ビジネス背景を最優先
   - 段階的に深掘り

3. **決定事項の確認** (2.1.3_決定事項チェックリスト.md)
   - 必須項目の充足確認
   - 抜け漏れチェック

4. **企画書の作成** (2.1.4_製造物_企画書構成.md)
   - テンプレートに従う
   - Mermaid図を活用

5. **完了基準の確認** (2.1.6_フェーズ完了基準.md)

6. **ユーザーレビュー**
   - レビュータスクを生成
   - 承認後、次フェーズへ
```

##### `.claude/skills/design-phase/SKILL.md`

```markdown
---
name: design-phase
description: 設計フェーズのアーキテクチャ設計と設計書作成を実行する。要件定義が完了し、設計に進みたい時に使用。
---

# 設計フェーズの開始

設計フェーズを開始します。

## 参照ドキュメント
`.claude/docs/10_facilitation/2.3_設計フェーズ/` 配下のドキュメントをすべて参照してください。

## 実行手順
1. **アーキテクチャ選定** (2.3.2_アーキテクチャ選定プロセス.md)
   - 要件に基づく選定
   - トレードオフの検討

2. **技術標準の確認** (2.3.3_技術標準参照ガイド.md)
   - `.claude/docs/40_standards/` を参照
   - プロジェクトに適用する標準を選択

3. **インフラ設計** (2.3.8_インフラ設計パターン選定.md)

4. **セキュリティ設計** (2.3.9_セキュリティ設計チェックリスト.md)

5. **設計書の作成**
   - 基本設計書
   - 詳細設計書
   - **重要**: 詳細設計書に「実装方針」セクションを必ず含める

6. **完了基準の確認**

7. **ユーザーレビュー**
```

##### `.claude/skills/implementation-check/SKILL.md`

```markdown
---
name: implementation-check
description: 実装前に設計書の実装方針をチェックする。コード生成前、実装フェーズ開始時に必ず実行。
allowed-tools: ["Read", "Grep", "Glob"]
---

# 実装チェッカー

実装フェーズに入る前に、設計書の実装方針を検証します。

## チェック項目

1. **設計書の存在確認**
   - `docs/03_基本設計書.md` が存在するか
   - `docs/04_詳細設計書.md` が存在するか

2. **実装方針セクションの存在確認**
   - 詳細設計書に「## 10. 実装方針」セクションがあるか

3. **実装方針の内容確認**
   - 10.1 ファイル分割方針が具体的か
   - 10.2 ディレクトリ構成が明記されているか
   - 10.3 モジュール分割が明記されているか
   - 10.4 命名規則が明記されているか
   - 10.5 技術標準への参照があるか
   - 10.6 推定行数と分割理由が記載されているか

## 参照ドキュメント
`.claude/helpers/implementation-checker.md` の詳細手順に従ってください。

## エラー時の対応
実装方針に不備がある場合：
1. ユーザーに警告を表示
2. 設計フェーズに戻ることを推奨
3. 強行する場合は、リスクを明示
```

---

### Phase 3: 可視化強化（2週間以内）

#### 3.1 Status Lineの実装

**ファイル**: `.claude/hooks/status-line.js`

```javascript
#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const stateFile = path.join(process.cwd(), '.claude-state/project-state.json');
const tasksFile = path.join(process.cwd(), '.claude-state/tasks.json');

try {
  if (fs.existsSync(stateFile)) {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    const projectName = state.project.name || '未設定';
    const phase = state.project.phase || 'planning';

    let text = `📂 ${projectName} | Phase: ${phase}`;

    // タスク数の追加
    if (fs.existsSync(tasksFile)) {
      const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
      const pendingCount = tasks.tasks.filter(t => t.status === 'pending').length;
      const issueCount = tasks.issues.filter(i => i.status === 'open').length;

      if (pendingCount > 0 || issueCount > 0) {
        text += ` | Tasks: ${pendingCount}`;
      }
      if (issueCount > 0) {
        text += ` ⚠️ Issues: ${issueCount}`;
      }
    }

    console.log(JSON.stringify({ text }));
  } else {
    console.log(JSON.stringify({ text: "📂 aiDev | 未初期化" }));
  }
} catch (error) {
  console.log(JSON.stringify({ text: "📂 aiDev | エラー" }));
}
```

**settings.jsonに追加**:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node .claude/hooks/status-line.js"
  }
}
```

#### 3.2 UserPromptSubmit Hookの実装

プロジェクトコンテキストをユーザー入力時に自動注入。

---

## 📁 新規作成ファイル一覧

```
aiDev/
├── .claude/
│   ├── settings.json                    # Phase 1
│   ├── settings.local.json.template     # Phase 1（テンプレート）
│   ├── hooks/                           # Phase 1-3
│   │   ├── session-start.js             # Phase 1
│   │   ├── pre-write-check.js           # Phase 2
│   │   └── status-line.js               # Phase 3
│   └── skills/                          # Phase 2
│       ├── planning-phase/
│       │   └── SKILL.md
│       ├── requirements-phase/
│       │   └── SKILL.md
│       ├── design-phase/
│       │   └── SKILL.md
│       ├── implementation-check/
│       │   └── SKILL.md
│       └── state-sync/
│           └── SKILL.md
├── .gitignore                           # Phase 1（更新）
└── docs/
    └── フェーズ2_改修提案/
        ├── 01_Claude_Code機能取り込み提案.md  # このファイル
        ├── 02_settings.json設計.md
        ├── 03_Hooks実装ガイド.md
        └── 04_Skills実装ガイド.md
```

---

## ⚠️ 注意事項と考慮事項

### 1. 既存機能との関係

#### コマンドとSkillsの使い分け

| 機能 | 用途 | トリガー |
|-----|------|---------|
| **コマンド** (`/init`, `/status`) | 明示的な操作 | ユーザーが呼び出し |
| **Skills** | 自動実行 | Claudeが文脈判断 |

**併用方針**:
- コマンド: ユーザーが「今すぐ実行したい」操作
- Skills: Claudeが「この状況なら実行すべき」と判断する操作

### 2. Windows環境対応

現状、hookスクリプトはNode.jsで実装しているため、クロスプラットフォーム対応済み。
ただし、以下を確認：

- Node.jsがインストールされているか
- パス区切り文字（`path.join`で自動対応済み）

### 3. チーム共有

#### Gitコミット対象
- ✅ `.claude/settings.json`
- ✅ `.claude/hooks/`
- ✅ `.claude/skills/`

#### Gitコミット対象外（.gitignore）
- ❌ `.claude/settings.local.json` （個人用設定）

### 4. パフォーマンス

#### Hook実行時間
- デフォルトタイムアウト: 60秒
- SessionStart hook: 高速化必須（1秒以内）
- PreToolUse hook: 軽量化必須（ユーザー待機時間に影響）

#### 最適化方針
- ファイル読み込みを最小限に
- 複雑な処理は非同期化
- キャッシュの活用

---

## 📊 期待される効果

### 安全性の向上
- ✅ シークレット情報への自動アクセス拒否
- ✅ 本番環境への誤操作防止
- ✅ 設計なし実装の防止（設計駆動実装の強制）

### 自動化の向上
- ✅ プロジェクト状態の自動読み込み
- ✅ タスク状態の自動更新
- ✅ フェーズ判断の自動化

### 使いやすさの向上
- ✅ コンテキスト切り替えの自動化
- ✅ 状態の可視化（Status Line）
- ✅ 明示的コマンド不要（Skills）

---

## 🗓️ 実装スケジュール

| Phase | 項目 | 期間 | 担当 |
|-------|------|------|------|
| Phase 1 | settings.json作成 | 即時 | - |
| Phase 1 | SessionStart hook | 即時 | - |
| Phase 1 | .gitignore更新 | 即時 | - |
| Phase 2 | PreToolUse hook | 1週間以内 | - |
| Phase 2 | Skills作成（3つ） | 1週間以内 | - |
| Phase 3 | Status Line | 2週間以内 | - |
| Phase 3 | UserPromptSubmit hook | 2週間以内 | - |

---

## ✅ 承認・レビュー

- [ ] 提案内容のレビュー
- [ ] Phase 1の実装承認
- [ ] Phase 2の実装承認
- [ ] Phase 3の実装承認

---

## 📚 参考資料

- [Claude Code 公式ドキュメント](https://docs.claude.com/en/docs/claude-code)
- [Hooks リファレンス](https://docs.claude.com/en/docs/claude-code/hooks)
- [Settings リファレンス](https://docs.claude.com/en/docs/claude-code/settings)
- [Skills リファレンス](https://docs.claude.com/en/docs/claude-code/skills)

---

**次のステップ**: Phase 1の実装を開始しますか？
