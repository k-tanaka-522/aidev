# PHASE_GUIDE設計レポート

**作成日**: 2025-10-24
**目的**: .claudeのPHASE_GUIDE.md設計方針とAgent設計の議論整理

---

## 1. 背景と課題

### 1.1 現状の.claude構成の問題

**問題点:**
- `.claude/docs/10_facilitation/` に170個以上のファイルが存在
- Claude（AI）が読むべきファイルが分からず、物忘れしやすい
- 「What to do（何をするか）」と「How to execute（どうやるか）」が分離している

**具体例:**
- `2.3.5_製造物_基本設計書構成.md` にテンプレートがある
- でも、実際に生成すると「検討した代替案」「トレードオフ」を省略してしまう
- → 実行手順（How）が別ファイルで定義されていないため

### 1.2 ユーザーの重要な洞察

> 「開発プロセスのAIによるファシリテート。ユーザーとの一問一答で開発プロセスが進む。Claude はユーザーとのやりよりで開発プロセスがどのフェーズに当てはまるか考えながら進める。」

**要点:**
- AIファシリテーターとして、ユーザーとの対話でフェーズを判定
- 各フェーズのプロセスを実行
- PDCA 2周で抜け漏れチェック

---

## 2. 解決策の検討過程

### 2.1 アプローチ1: PHASE_GUIDE.md（単一ファイル統合）

**提案内容:**
```
2.3_設計フェーズ/
├── PHASE_GUIDE.md  ← 単一のエントリーポイント
│   ├── §1 このフェーズでやること（What）
│   ├── §2 技術標準参照
│   ├── §3 PDCA 1周目（Plan → Do → Check → Act）
│   ├── §4 PDCA 2周目（Plan → Do → Check → Act）
│   └── §5 次フェーズへの遷移判定
└── 既存のファイル群（参照用）
```

**メリット:**
- ✅ 1ファイルで全体像が分かる
- ✅ What + How を統合

**デメリット:**
- ❌ 1ファイルが長すぎる（設計フェーズで約400行）
- ❌ Claude が全部読むとコンテキストを消費しすぎる
- ❌ PDCA 2周の複雑なフローを1ファイルに詰め込むと読みにくい

**実装状況:**
- 企画フェーズ、要件定義フェーズ、設計フェーズ、実装フェーズのPHASE_GUIDE.mdを作成済み
- テストフェーズ、納品フェーズは簡略版

### 2.2 アプローチ2: プロセスごとにAgent定義

**提案内容:**
```
.claude/agents/
├── planning/
│   ├── initial-hearing.md      # 初回ヒアリング専用Agent
│   ├── problem-deep-dive.md    # 課題深掘り専用Agent
│   ├── goal-clarification.md   # 目的明確化専用Agent
│   ├── risk-analysis.md        # リスク分析専用Agent
│   └── planning-doc.md         # 企画書生成専用Agent
├── requirements/
│   ├── user-story.md           # ユーザーストーリー作成Agent
│   ├── non-functional.md       # 非機能要件定義Agent
│   └── requirements-doc.md     # 要件定義書生成Agent
...
```

**メリット:**
- ✅ 各プロセスが独立している（再利用しやすい）
- ✅ プロセスごとに責務が明確
- ✅ 並列実行も可能

**デメリット:**
- ❌ Agentが多すぎる（企画フェーズだけで5個）
- ❌ Agent間の引き継ぎが複雑
- ❌ メインのClaudeが「どのAgentをどの順番で呼ぶか」を管理する必要がある

**実装状況:**
- `.claude/agents/planning/initial-hearing.md` を作成開始
- `.claude/agents/planning/problem-deep-dive.md` を作成開始
- 途中で方向性を見直し

### 2.3 アプローチ3: 役割ごとにAgent定義

**提案内容:**
```
.claude/agents/
├── planning-facilitator.md         # 企画フェーズ全体を担当
├── requirements-facilitator.md     # 要件定義フェーズ全体を担当
├── design-facilitator.md           # 設計フェーズ全体を担当
└── implementation-facilitator.md   # 実装フェーズ全体を担当
```

**使い方:**
```
ユーザー: 「新しいシステムを作りたい」
メインのClaude: （会話から企画フェーズと判定）
             → Task(planning-facilitator)を起動

planning-facilitator Agent:
  - PHASE_GUIDE.mdを読む
  - ユーザーと初回ヒアリング
  - 課題深掘り
  - 目的明確化
  - リスク分析
  - 企画書生成
  → 完了報告

メインのClaude: 「企画フェーズが完了しました。要件定義フェーズに進みますか？」
```

**メリット:**
- ✅ Agentが少ない（フェーズごとに1個）
- ✅ フェーズ全体の流れをAgentが管理（メインは楽）
- ✅ PDCA 2周もAgentが自分で実行できる
- ✅ メインのClaudeは「フェーズ判定」に専念

**デメリット:**
- ❌ 1つのAgentが複雑になる
- ❌ Agentのコンテキストが大きくなる（物忘れリスク）

**実装状況:**
- まだ実装していない（検討中）

### 2.4 アプローチ4: ハイブリッド（役割Agent + タスクAgent）

**提案内容:**
```
.claude/agents/
├── roles/
│   ├── planning-facilitator.md      # 企画フェーズ全体を統括
│   ├── requirements-facilitator.md  # 要件定義フェーズ全体を統括
│   └── design-facilitator.md        # 設計フェーズ全体を統括
└── tasks/
    ├── document-generator.md        # ドキュメント生成専用Agent
    ├── diagram-generator.md         # 図（Mermaid）生成専用Agent
    └── code-reviewer.md             # コードレビュー専用Agent
```

**メリット:**
- ✅ 役割Agentがフェーズ全体を管理（シンプル）
- ✅ タスクAgentで専門的な作業を委譲（役割Agentが楽）
- ✅ バランスが良い

**デメリット:**
- ❌ 設計がやや複雑

**実装状況:**
- まだ実装していない（検討中）

---

## 3. 現在の状態

### 3.1 作成済みファイル

**PHASE_GUIDE.md（アプローチ1）:**
- `.claude/docs/10_facilitation/2.1_企画フェーズ/PHASE_GUIDE.md` ✅
- `.claude/docs/10_facilitation/2.2_要件定義フェーズ/PHASE_GUIDE.md` ✅
- `.claude/docs/10_facilitation/2.3_設計フェーズ/PHASE_GUIDE.md` ✅（既存）
- `.claude/docs/10_facilitation/2.4_実装フェーズ/PHASE_GUIDE.md` ✅
- `.claude/docs/10_facilitation/2.5_テストフェーズ/PHASE_GUIDE.md` ✅（簡略版）

**プロセスAgent（アプローチ2、途中）:**
- `.claude/agents/planning/initial-hearing.md` ✅
- `.claude/agents/planning/problem-deep-dive.md` ✅

**その他:**
- `.claude/docs/10_facilitation/2.3_設計フェーズ/2.3.13_基本設計書生成手順.md` ✅（前セッション）
- `.claude/docs/10_facilitation/2.4_実装フェーズ/2.4.6_IaC構築プロセス/2.4.6.1_CloudFormation構築/2.4.6.1.7_デプロイ自動化設計.md` ✅（前セッション）
- `.claude/docs/40_standards/45_cloudformation.md` に「デプロイ自動化」セクション追加 ✅（前セッション）

### 3.2 Gitブランチ

現在のブランチ: `phase-guide-test`

### 3.3 未決定事項

**Agent設計の方向性:**
- アプローチ2（プロセスごとにAgent）vs アプローチ3（役割ごとにAgent）vs アプローチ4（ハイブリッド）
- どれが最適か、実際にテストして検証する必要がある

---

## 4. 各アプローチの比較表

| 項目 | アプローチ1<br>PHASE_GUIDE.md | アプローチ2<br>プロセスAgent | アプローチ3<br>役割Agent | アプローチ4<br>ハイブリッド |
|------|---------------------------|------------------------|---------------------|----------------------|
| **Agent数** | 0個（Agent不使用） | 多い（20-30個） | 少ない（4-6個） | 中程度（10-15個） |
| **1ファイルの長さ** | 長い（400行） | 短い（100行） | 中（200-300行） | 短〜中（100-200行） |
| **メインClaudeの責務** | 全プロセス実行 | Agent呼び出し管理 | フェーズ判定のみ | フェーズ判定+タスクAgent管理 |
| **PDCA 2周の管理** | メインClaudeが管理 | メインClaudeが管理 | Agentが管理 | Agentが管理 |
| **並列実行** | ❌ 不可 | ✅ 可能 | ❌ 不可 | △ タスクAgentのみ可能 |
| **物忘れリスク** | 高い | 低い | 中 | 低い |
| **設計複雑度** | 低い | 中 | 低い | 高い |
| **実装工数** | 低い | 高い | 中 | 高い |
| **メンテナンス性** | 中 | 高い | 中 | 中 |

---

## 5. 推奨アプローチ

### 5.1 短期的推奨: アプローチ1（PHASE_GUIDE.md）でテスト

**理由:**
- すでにPHASE_GUIDE.mdを4フェーズ分作成済み
- まずはこれでテストして、実際の問題点を洗い出す
- Agent設計は、実際の問題が見えてから決定する方が良い

**テスト方法:**
1. 新規プロジェクトケースでPHASE_GUIDE.mdを読んで企画フェーズ実行
2. 問題点を記録（物忘れ、抜け漏れ、ユーザー体験等）
3. 問題点に基づいてAgent設計を検討

### 5.2 中期的推奨: アプローチ3（役割Agent）への移行

**理由:**
- アプローチ1のテストで「物忘れリスクが高い」と判明した場合
- 役割Agentならフェーズごとに独立してコンテキストを持てる
- メインのClaudeは「フェーズ判定」に専念できる

**移行方針:**
1. PHASE_GUIDE.mdをベースに、各フェーズのfacilitator Agentを作成
2. メインのClaudeは会話からフェーズを判定し、適切なfacilitator Agentを起動
3. facilitator Agentが PHASE_GUIDE.md を読んで実行

### 5.3 長期的検討: アプローチ4（ハイブリッド）

**理由:**
- アプローチ3でも「Agentのコンテキストが大きすぎる」と判明した場合
- ドキュメント生成、図生成、コードレビュー等の専門タスクを分離
- 役割AgentとタスクAgentを組み合わせてバランスを取る

---

## 6. 次のステップ

### 6.1 即座に実施すべきこと

1. **アプローチ1（PHASE_GUIDE.md）でテスト実施**
   - 新規プロジェクトケースで企画フェーズ→要件定義フェーズ→設計フェーズを実行
   - 問題点を記録

2. **テスト結果をレポート**
   - 物忘れリスク
   - ユーザー体験（一問一答が機能しているか）
   - 抜け漏れ（必須セクションの省略等）

3. **Agent設計の方向性を決定**
   - テスト結果に基づいて、アプローチ2/3/4のどれが最適かを判断

### 6.2 未実装の作業

- [ ] 納品フェーズのPHASE_GUIDE.md（簡略版のまま）
- [ ] テストフェーズのPHASE_GUIDE.md（簡略版のまま）
- [ ] 全変更のコミット・push
- [ ] 新規プロジェクトケースで1周目テスト実施
- [ ] 1周目レポート作成
- [ ] Agent設計の方向性決定
- [ ] 2周目テスト実施
- [ ] 3周目テスト実施

---

## 7. 技術的な課題と検討事項

### 7.1 Claude CodeのAgent機能の理解

**現状の理解:**
- Task tool で subagent_type を指定してAgentを起動
- general-purpose, Explore 等の既存Agent typeがある
- カスタムAgentを定義できるか？（`.claude/agents/` に配置すれば認識されるか？）

**要検証:**
- カスタムAgentの定義方法
- Agentへのpromptの渡し方
- Agent間のデータ受け渡し方法

### 7.2 PDCA 2周の実装

**課題:**
- PDCA 1周目で収集した決定事項を、2周目で振り返る
- 2周目で「もっといい提案」を準備する
- この流れをどう実装するか？

**検討案:**
1. PHASE_GUIDE.mdに明記して、メインのClaudeが実行
2. 役割Agentに委譲して、Agent内で実行
3. 専用のreview Agentを作成して、1周目の結果をレビュー

### 7.3 フェーズ間の引き継ぎ

**課題:**
- 企画フェーズ → 要件定義フェーズ の引き継ぎ
- 企画書の内容を要件定義フェーズで参照
- プロジェクト状態（.claude-state/）の管理

**検討案:**
1. `.claude-state/project-state.json` で状態管理
2. 各フェーズのAgentが前フェーズの成果物を読み込む
3. メインのClaudeが引き継ぎを管理

---

## 8. 参考: 今セッションで作成したファイル一覧

### 設計フェーズ（前セッション）
- `.claude/docs/10_facilitation/2.3_設計フェーズ/2.3.13_基本設計書生成手順.md`

### 実装フェーズ（前セッション）
- `.claude/docs/10_facilitation/2.4_実装フェーズ/2.4.6_IaC構築プロセス/2.4.6.1_CloudFormation構築/2.4.6.1.7_デプロイ自動化設計.md`
- `.claude/docs/40_standards/45_cloudformation.md` に「デプロイ自動化」セクション追加

### PHASE_GUIDE.md（このセッション）
- `.claude/docs/10_facilitation/2.1_企画フェーズ/PHASE_GUIDE.md`
- `.claude/docs/10_facilitation/2.2_要件定義フェーズ/PHASE_GUIDE.md`
- `.claude/docs/10_facilitation/2.4_実装フェーズ/PHASE_GUIDE.md`
- `.claude/docs/10_facilitation/2.5_テストフェーズ/PHASE_GUIDE.md`（簡略版）

### プロセスAgent（途中）
- `.claude/agents/planning/initial-hearing.md`
- `.claude/agents/planning/problem-deep-dive.md`

---

## 9. まとめ

### 9.1 現状

- PHASE_GUIDE.md（アプローチ1）を4フェーズ分作成済み
- Agent設計の方向性は未決定（アプローチ2/3/4のどれが最適か）
- テスト実施前の段階

### 9.2 次のアクション

1. **アプローチ1（PHASE_GUIDE.md）でテスト実施**
   - 実際の問題点を洗い出す
   - ユーザー体験を検証

2. **テスト結果に基づいてAgent設計を決定**
   - 物忘れリスクが高い → アプローチ3（役割Agent）
   - 問題なし → アプローチ1のまま
   - 部分的に問題 → アプローチ4（ハイブリッド）

3. **選択したアプローチで実装・再テスト**

### 9.3 残された疑問

- Claude CodeのカスタムAgent機能はどこまで使えるか？
- Agent間のデータ受け渡しはどうするのが最適か？
- PDCA 2周は本当に必要か？（1周でも十分かもしれない）

---

## 10. Claude Codeの機能調査（AIファシリテーターへの組み込み）

### 10.1 調査した機能

Claude Codeの公式ドキュメントから、AIファシリテーターに組み込めそうな機能を調査しました。

#### 1. **カスタムスラッシュコマンド（Slash Commands）**

**概要:**
- マークダウンファイルで頻繁に使用するプロンプトを定義
- ファイル名（`.md`拡張子除く）がコマンド名になる

**配置場所:**
- プロジェクト: `.claude/commands/`（チーム共有）
- 個人: `~/.claude/commands/`（全プロジェクト共通）

**引数の扱い:**
- `$ARGUMENTS` - 全引数キャプチャ
- `$1`, `$2` - 位置指定パラメータ

**実装例:**
```markdown
---
allowed-tools: Bash(git status:*)
description: コミットメッセージ生成
---

現在の変更内容：!`git diff HEAD`
提案に基づき、簡潔なメッセージを作成
```

**AIファシリテーターでの活用案:**
- `/status` - プロジェクト状態の確認と次のアクション提案（既存）
- `/next` - 次にやるべきことを提案（既存）
- `/phase <phase-name>` - 指定フェーズを開始
- `/generate-doc <doc-type>` - ドキュメント生成（企画書、要件定義書等）
- `/review-phase` - 現在のフェーズの決定事項レビュー（既存）

#### 2. **Subagent機能**

**概要:**
- プロジェクトレベル: `.claude/agents/`
- ユーザーレベル: `~/.claude/agents/`
- プラグイン提供: 外部提供のエージェント

**定義方法:**
- Markdown形式ファイル（YAML frontmatter）
- CLIフラグ（`--agents`）でJSON形式
- `/agents`コマンドでインタラクティブUI（推奨）

**制約:**
- 各エージェントは独立したコンテキストウィンドウで動作
- エージェント間のデータ受け渡し方法は明記されていない
- 並列実行の方法は明記されていない

**AIファシリテーターでの活用案:**
- **役割Agent**: `planning-facilitator`, `requirements-facilitator`, `design-facilitator`
- **タスクAgent**: `document-generator`, `diagram-generator`, `code-reviewer`

**課題:**
- エージェント間のデータ共有方法が不明確
- 並列実行の可否が不明確
- → 実際にテストして検証する必要あり

#### 3. **Hooks機能**

**概要:**
- 特定のイベント時にシェルコマンドまたはPythonスクリプトを実行
- 「アプリレベルのコード」として実装できる

**利用可能なイベント（9種類）:**
- `PreToolUse` - ツール呼び出し前（ブロック可能）
- `PostToolUse` - ツール呼び出し後
- `UserPromptSubmit` - ユーザープロンプト送信時
- `Notification` - 通知時
- `Stop` - 応答完了時
- `SubagentStop` - サブエージェント完了時
- `PreCompact` - コンパクト操作実行前
- `SessionStart/SessionEnd` - セッション開始・終了時

**設定方法:**
- `/hooks`スラッシュコマンドで設定画面を開く
- イベント種類、マッチャー、シェルコマンドを指定

**実装例:**
```bash
# PreToolUse hookで機密ファイルへの編集をブロック
if [[ "$tool_name" == "Edit" ]]; then
  if [[ "$file_path" =~ \.env$ ]]; then
    exit 2  # ブロック
  fi
fi
```

**AIファシリテーターでの活用案:**
- `UserPromptSubmit` - ユーザーのプロンプトから現在のフェーズを判定
- `Stop` - フェーズ完了時にプロジェクト状態を自動更新
- `SubagentStop` - Agent実行完了時に結果を`.claude-state/`に記録
- `PreToolUse(Write)` - ドキュメント生成時に必須セクションチェック

#### 4. **Skills機能**

**概要:**
- モジュール式の拡張機能
- Claudeが自動的に判断して実行（モデル駆動）
- `SKILL.md`ファイルと支援ファイルで構成

**配置場所:**
- 個人用: `~/.claude/skills/skill-name/`
- プロジェクト用: `.claude/skills/skill-name/`

**スラッシュコマンドとの違い:**
- Skills: モデル駆動（Claude自動判断）
- スラッシュコマンド: ユーザー駆動（明示的な指定必要）

**AIファシリテーターでの活用案:**
- `phase-detection` - ユーザーの会話からフェーズを自動判定
- `document-template` - ドキュメントテンプレートの提供
- `tech-standard-lookup` - 技術標準の自動参照

#### 5. **MCP（Model Context Protocol）**

**概要:**
- 外部ツールとデータソースをAIに接続するための標準
- 数百のツール、データベース、APIへアクセス可能

**追加方法:**
```bash
# HTTP（推奨）
claude mcp add --transport http notion https://mcp.notion.com/mcp

# stdio（ローカル）
claude mcp add --transport stdio airtable \
  --env AIRTABLE_API_KEY=YOUR_KEY \
  -- npx -y airtable-mcp-server
```

**スコープ:**
- `--scope local` - デフォルト
- `--scope project` - チーム共有
- `--scope user` - 全プロジェクト

**利用可能なMCPサーバー例:**
- **プロジェクト管理**: Asana, Linear, Monday.com, **Notion**
- **支払い**: Stripe, PayPal, Square
- **インフラ**: Vercel, Netlify, Cloudflare
- **開発ツール**: Sentry, GitHub, Hugging Face
- **データベース**: HubSpot

**Notionとの連携:**
```bash
claude mcp add --transport http notion https://mcp.notion.com/mcp
```
その後、Claude Code内で`/mcp`コマンドで認証し、ドキュメント読み込み・ページ更新・タスク管理が可能。

**AIファシリテーターでの活用案:**
- **Notion連携**: 企画書・要件定義書・設計書をNotionに自動出力
- **GitHub連携**: PR作成、Issue管理
- **Asana/Linear連携**: タスク管理の自動化

### 10.2 推奨する活用方法

#### 即座に活用できる機能

1. **カスタムスラッシュコマンド**
   - `/phase planning` - 企画フェーズ開始
   - `/phase requirements` - 要件定義フェーズ開始
   - `/phase design` - 設計フェーズ開始
   - `/generate-planning-doc` - 企画書生成
   - `/generate-requirements-doc` - 要件定義書生成
   - `/generate-design-doc` - 基本設計書生成

2. **Hooks機能**
   - `UserPromptSubmit` hookで現在のフェーズを判定
   - `Stop` hookでプロジェクト状態を自動更新（`.claude-state/project-state.json`）

3. **MCP（Notion連携）**
   - 企画書・要件定義書・設計書をNotionに自動出力
   - 技術標準をNotionから参照（既に`.claude/docs/NOTION_INDEX.md`にリンクあり）

#### 要検証の機能

1. **Subagent機能**
   - カスタムAgentの定義が可能か？
   - エージェント間のデータ受け渡し方法
   - 並列実行の可否
   - → 実際に`.claude/agents/`に配置してテスト

2. **Skills機能**
   - フェーズ判定Skillが実用的か？
   - モデル駆動で適切に判断できるか？
   - → 実際に`.claude/skills/`に配置してテスト

### 10.3 実装優先順位

#### 優先度1（即座に実装）

- [x] カスタムスラッシュコマンド: `/status`, `/next`, `/review-phase`, `/risks`, `/progress-report` **（既存）**
- [ ] カスタムスラッシュコマンド: `/phase <phase-name>`, `/generate-doc <doc-type>`
- [ ] Hooks: `Stop` hookでプロジェクト状態自動更新

#### 優先度2（中期的に実装）

- [ ] MCP（Notion連携）: 企画書・要件定義書・設計書をNotionに出力
- [ ] Subagent: 役割Agent（planning-facilitator等）の実装とテスト

#### 優先度3（長期的に検討）

- [ ] Skills: フェーズ判定Skillの実装とテスト
- [ ] MCP（GitHub連携）: PR作成、Issue管理の自動化

### 10.4 技術的な課題

#### 課題1: Subagentのデータ受け渡し

**問題:**
- ドキュメントに「各エージェントは独立したコンテキストウィンドウで動作」と記載
- エージェント間のデータ受け渡し方法が不明確

**解決策案:**
- `.claude-state/`ディレクトリでファイル経由で受け渡し
- 前Agentが結果をJSONで保存 → 次Agentが読み込む

**要検証:**
- 実際にSubagentを定義してテスト

#### 課題2: Hooksから情報をClaudeに渡す方法

**問題:**
- Hooksは標準入力でJSONを受け取り、終了コードで制御
- HooksからClaudeに情報を渡す方法が不明確

**解決策案:**
- Hooksで`.claude-state/`にファイル出力
- Claudeが次の応答時に`.claude-state/`を読み込む

**要検証:**
- 実際にHookを定義してテスト

#### 課題3: Skills機能のモデル駆動判断

**問題:**
- Skillsは「Claude自動判断」で実行
- フェーズ判定が適切に機能するか不明

**解決策案:**
- まずはスラッシュコマンドで明示的な指定（ユーザー駆動）
- Skills機能はオプションとして検討

**要検証:**
- 実際にSkillを定義してテスト

---

## 11. 最終推奨アプローチ（統合版）

### 11.1 アーキテクチャ

```
.claude/
├── commands/                      # スラッシュコマンド
│   ├── phase.md                   # /phase <phase-name>
│   ├── generate-doc.md            # /generate-doc <doc-type>
│   ├── status.md                  # /status（既存）
│   ├── next.md                    # /next（既存）
│   └── review-phase.md            # /review-phase（既存）
├── agents/                        # カスタムAgent（要検証）
│   ├── planning-facilitator.md
│   ├── requirements-facilitator.md
│   └── design-facilitator.md
├── hooks/                         # Hooks設定（JSON形式）
│   └── project-state-update.sh    # Stop hookでプロジェクト状態更新
├── skills/                        # Skills（要検証）
│   └── phase-detection/
│       └── SKILL.md
└── docs/
    ├── 10_facilitation/
    │   ├── 2.1_企画フェーズ/
    │   │   └── PHASE_GUIDE.md
    │   ├── 2.2_要件定義フェーズ/
    │   │   └── PHASE_GUIDE.md
    │   ├── 2.3_設計フェーズ/
    │   │   └── PHASE_GUIDE.md
    │   └── 2.4_実装フェーズ/
    │       └── PHASE_GUIDE.md
    └── 40_standards/
```

### 11.2 実行フロー

```
ユーザー: 「新しいシステムを作りたい」
  ↓
メインのClaude:
  - ユーザーの会話から「企画フェーズ」と判定
  - `/phase planning` または Task(planning-facilitator) を起動
  ↓
planning-facilitator Agent:
  - PHASE_GUIDE.md（2.1_企画フェーズ）を読み込む
  - ユーザーと一問一答で企画フェーズを実行
  - 企画書を生成
  - `.claude-state/project-state.json` を更新
  - （オプション）NotionにMCP経由で企画書を出力
  ↓
Stop hook:
  - プロジェクト状態を確認
  - 次のフェーズ（要件定義）への遷移を準備
  ↓
メインのClaude:
  - 「企画フェーズが完了しました。要件定義フェーズに進みますか？」
```

### 11.3 段階的実装計画

#### Phase 1: PHASE_GUIDE.mdでテスト（現在）

1. PHASE_GUIDE.mdを使って手動でフェーズ実行
2. 問題点を洗い出し
3. スラッシュコマンドを追加（`/phase`, `/generate-doc`）

#### Phase 2: Hooks導入

1. `Stop` hookでプロジェクト状態自動更新
2. `UserPromptSubmit` hookでフェーズ判定（オプション）

#### Phase 3: Subagent導入（要検証）

1. `.claude/agents/planning-facilitator.md` を作成
2. 実際にテストして、データ受け渡しを検証
3. 問題なければ全フェーズのfacilitator Agentを作成

#### Phase 4: MCP（Notion連携）導入

1. Notion MCPサーバーを追加
2. 企画書・要件定義書・設計書をNotionに出力
3. 技術標準をNotionから参照

#### Phase 5: Skills導入（長期的）

1. フェーズ判定Skillを作成
2. モデル駆動で適切に判断できるかテスト
3. 問題なければ他のSkillsも追加

---

**作成者**: Claude (Sonnet 4.5)
**作成日時**: 2025-10-24
**最終更新**: 2025-10-24（Claude Code機能調査追加）
