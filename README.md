# aiDev — AI駆動IPA標準フレームワーク（v2）

**Claude Code環境専用**のAI開発ファシリテーターです。AIとの対話を通じてシステム開発プロセス全体を支援します。

> **本READMEはv2（ゾーン/レーン型、ハリボテ駆動＋ローンチ時リバース）を前提とする。**
> v2の設計根拠は `docs/v2/01_プロセス定義書.md`（プロセスのWhat/なぜ）と
> `docs/v2/02_実行基盤アーキテクチャ.md`（実行機構のHow）にある。

## ⚠️ v1からの破壊的変更（必ず読むこと）

aiDev v2 は、v1（企画→要件定義→設計→実装→テスト→デプロイの直列フェーズ進行）から
**プロセスモデルそのもの**をゾーン/レーン型（ハリボテ駆動＋ローンチ時リバース）へ全面改訂した。

- **v1で進行中の案件をv2へ移行する経路は提供しない。** v2は**新規案件立ち上げ時のみ**選択可能である。
  フェーズ順次型からゾーン/レーン型への転換は単純なフォーマット変換では済まないため
  （`docs/v2/02_実行基盤アーキテクチャ.md` 14.3節）。v1で進行中の案件は、そのプロジェクトのブランチ・
  コミット上でv1のまま継続すること。
- `docs/02_要件定義/`・`docs/03_アプリケーション設計/`等のIPA標準ディレクトリに`plan`/`execute`
  相当のSkillを置かないという構成自体が破壊的変更である。**これらのディレクトリはZone 3（ローンチ時
  リバース）に到達するまで空であることが正常状態である。** 要件定義書・設計書を先に書き始める運用には
  戻れない。
- `.claude-state/`の形式が変わる（決定ログ、`current-zone.json`、`process-option.json`、
  `decision-warnings.json`が新設される）。v1状態ファイルからの自動マイグレーションは提供しない。

## 開発プロセスの考え方（Mode A: ハリボテ駆動 + ローンチ時リバース）

AI駆動開発では、動くもの（プロトタイプ・実装）を作るコストが人間主体の開発より劇的に低い。したがって、
机上で要件・設計を固めてから作るより、**先に動くもの（ハリボテ）を出してそれを見ながら合意形成する**
ほうが速く、かつ正確である。IPA共通フレーム2013が求める標準成果物は破棄せず、**確定させるタイミングを
ローンチ直前（Zone 3）に後ろ倒しし、実物と決定ログから逆生成する**。

| Zone | 内容 | レーン（並行） | ゾーンゲート |
|---|---|---|---|
| 0: 不可逆決定（Fix First） | 後戻りコストが跳ねる事項のみ先に確定。決定ログのみ記録し、分厚い企画書は作らない | - | → `GZ0` |
| 1: 探索・収束ループ | ハリボテ駆動で機能・UI・構成を収束 | A: UI/ハリボテ（Designer）／B: ロジック・契約モック（App-Architect+Consultant）／C: インフラ（Infra-Architect+SRE） | ミニゲート（無番号） |
| 2: 実装・硬化 | ハリボテ・契約モックが実装に置き換わる。機能単位でZone1と重なるのが正常 | B/C | 準ゲート（無番号） |
| 3: ローンチ時リバース | 動く実物＋決定ログからIPA標準成果物一式をas-built生成（IPA準拠の担保点） | - | GZ2（コードフリーズ→リリース実施）→ `GZ3` |
| 4: Mode B（稼働後） | チケット駆動アジャイル。Zone3成果物が影響範囲分析の分母 | - | チケットGate |

戻り作業（ゾーン間・レーン間）は異常ではなく**正常系**である。差し戻し回数のカウント対象はゾーンゲート
（`GZ0`/`GZ2`/`GZ3`）のみで、ミニゲートやZone1⇄2の機能単位往復はカウントしない。

### 前提条件

- **VSCode** がインストールされていること
- **Claude Code拡張機能** がインストールされていること
- Git がインストールされていること（Windows Git Bashを推奨）
- Node.js（`.claude/hooks/*.js`・各Skillのscriptsを実行するため）

## クイックスタート（新規プロジェクトとして開始）

v2は新規案件立ち上げ専用である（上記「破壊的変更」参照）。既存プロジェクトへの`.claude/`のみの
追加導入は本バージョンではサポート対象外とする。

```bash
# 1. リポジトリをクローン
git clone https://github.com/k-tanaka-522/aidev.git my-project
cd my-project

# 2. 新規プロジェクト初期化スクリプトを実行（重要！）
# Windows
scripts\init-new-project.bat

# Mac/Linux
./scripts/init-new-project.sh

# 3. VSCodeで開く
code .

# 4. Claude Codeで /init コマンドを実行
/init
```

**重要**: ダウンロード後、必ず `init-new-project` スクリプトを実行してください。aiDev自身の開発履歴
（企画書・要件定義書・設計書等）が削除され、git履歴がクリーンになり、v2の空スケルトン（Zone0未着手の
状態）から開始できます。

### 開発を開始

**まず `/init` コマンドを実行してから**、Claude Codeとの会話を始めてください。

```
/init
```

初期化が完了したら、プロジェクトの内容を伝えます。

```
新しいECサイトを作りたいです
```

PMが自動的に以下を行います。

- ビジネス背景のヒアリング（一問一答）
- Zone0の不可逆決定の確定（決定ログへ記録）
- Designer/App-Architect/Infra-Architectへの委譲によるハリボテ・契約モック・インフラ構成の並行収束（Zone1）
- 実装への置き換え（Zone2）
- ローンチ時のIPA標準成果物一式のas-built生成（Zone3）

## ディレクトリ構造（v2レイアウト）

詳細は `docs/v2/02_実行基盤アーキテクチャ.md` 4章を正本とする。以下は概要。

```
.
├── .claude/
│   ├── CLAUDE.md               # PMの主体定義（軽量・ゾーンマップの索引のみ）
│   ├── settings.json           # permissions + hooks 登録（プロジェクト共有）
│   ├── agents/                 # サブエージェント定義（consultant/app-architect/
│   │                           #   infra-architect/designer/coder/qa/sre）
│   ├── skills/                 # 横断Skill（orchestrate, decide, gate-check,
│   │                           #   sync-check, code-style-guide, iac-style-guide,
│   │                           #   ui-style-guide, security-style-guide 等）
│   ├── hooks/                  # 機構による強制（role-boundary-guard.js 等）
│   ├── lib/                    # Skill/hook共有ライブラリ
│   ├── commands/{init,status,next}.md
│   └── docs/00_core-principles.md   # 全体原則（PM＋全サブエージェント共通）
│
├── .claude-state/               # ランタイム状態（.gitignoreで除外）
│   └── current-zone.json, decision-warnings.json 等
│
├── docs/
│   ├── v2/                      # aiDevフレームワーク自体のv2設計書（01〜04）
│   └── 00_プロジェクト管理・ガバナンス/
│       ├── decisions/           # 決定ログ（Zone0〜2）、contracts/ に契約モック（OpenAPI等）
│       └── 00-01〜00-14         # 各種台帳（成果物カタログ、トレーサビリティ台帳等）
│   # 02_要件定義/ 〜 07_運用・保守/ は Zone3（ローンチ時リバース）まで空であることが正常
│
├── prototypes/                  # レーンA。ハリボテ（第一級の作業媒体）
│   ├── SCREEN_ID_INDEX.md       # SCR-ID採番台帳
│   ├── REPORT_ID_INDEX.md       # RPT-ID採番台帳（帳票）
│   └── reports/                 # 帳票ハリボテ
│
├── src/                         # レーンB実装（Zone2以降）
├── infra/                       # レーンC実装（Zone2以降）
├── tests/                       # e2e（HB-ID起点）／integration（API-ID起点）
│
└── scripts/
    ├── init-new-project.sh / .bat   # v2レイアウトでの新規プロジェクト初期化
    └── cutover-v2.sh                # フレームワーク開発者向け: v1→v2のセッション制御切替
                                      # （aiDevというフレームワーク自身の開発専用。利用者は使わない）
```

## サブエージェントアーキテクチャ

PM（プロジェクトマネージャー）が `orchestrate` Skill 経由で7つの専門サブエージェントに委譲する。

| サブエージェント | 主担当 |
|----------------|------|
| consultant | Zone0ヒアリング支援、ビジネス整合レビュー、決定ログ起票 |
| app-architect | レーンB主担当、Zone3アプリ系リバース生成 |
| infra-architect | レーンC主担当、Zone3インフラ系リバース生成 |
| designer | レーンA主担当（画面・帳票ハリボテ） |
| coder | Zone2実装（ハリボテ・契約モック→実装置換） |
| qa | 試験設計・実施、`HB-ID`/`API-ID`/`BAT-ID`採番、Zone3 RTM生成 |
| sre | レーンC実務、運用移行、本番リリース実施 |

役割境界（誰がどこに書き込めるか）は`settings.json`のpermissionsと`role-boundary-guard.js`等のhooksが
機械的に強制する。PMが自然言語の指示で言い聞かせる方式（v1）は廃止した。

## カスタムコマンド

- `/init` — プロジェクト初期化（最初に実行）
- `/status` — プロジェクトの現在地（ゾーン・ゲート状況）を確認
- `/next` — 次に優先すべきアクションを1つ提案

## 技術標準

技術標準は`.claude/skills/`配下の自動参照Skillへ集約されている（v1の`.claude/docs/40_standards/`は
廃止し移管済み）。

| 領域 | Skill |
|---|---|
| コーディング規約（言語別・フレームワーク別・DB） | `.claude/skills/code-style-guide/` |
| IaC・CI/CD・インフラテスト規約 | `.claude/skills/iac-style-guide/` |
| UI/UX規約（ハリボテ向け） | `.claude/skills/ui-style-guide/` |
| セキュリティ規約 | `.claude/skills/security-style-guide/` |
| API設計規約（契約モック向け） | `docs/00_プロジェクト管理・ガバナンス/decisions/contracts/.claude/skills/contract-design/` |

いずれも `paths` によりサブエージェントが対象ディレクトリを読み書きした時点で自動参照される
（手動で読みに行く必要はない）。

## 対応する開発手法

- Mode A（0→1開発）: ゾーン/レーン型（本README上部参照）
- Mode B（稼働後）: チケット駆動アジャイル（Zone4、`ticket-triage`→`impact-analysis`）

## トラブルシューティング

### AIが設定を読み込まない / 期待通りに動作しない

1. まず `/init` コマンドを実行する
2. それでも解決しない場合、VSCodeを再起動し、`.claude/CLAUDE.md`・`.claude/docs/00_core-principles.md`
   が存在するか確認する

### 現在のゾーン・進捗がわからない

```
/status
```

`.claude-state/current-zone.json` と各種台帳（`docs/00_プロジェクト管理・ガバナンス/`）を参照して
現在地を確認できる。

### 状態がリセットされる

`.claude-state/`は`.gitignore`で除外されている。Git管理したい場合は`.gitignore`から該当行を削除する。

## フレームワーク開発者向け（aiDev自身の開発）

このリポジトリを「aiDevというフレームワーク自体」として開発する場合（利用者としてこのフレームワークで
自分のプロダクトを開発する場合ではない）は、`docs/v2/`配下の設計書と`scripts/cutover-v2.sh`を参照する。
このスクリプトは**現在進行中のPMセッション自身の制御を切り替える**危険な操作を伴うため、実行前に
必ず`--dry-run`で内容を確認すること。詳細はスクリプト冒頭のコメントおよび`.claude/v2-staging/README.md`
を参照する。

## ライセンス

（ここにライセンス情報を記載）

## コントリビューション

（コントリビューションガイドラインを記載）

## サポート

質問や問題が発生した場合は、Issueを作成してください。
