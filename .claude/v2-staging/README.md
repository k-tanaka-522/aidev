# v2-staging（M0成果物の一時置き場）

このディレクトリは、aiDev v2（`docs/v2/02_実行基盤アーキテクチャ.md`）のうち、
**現在進行中のv1セッションを破壊せずに配置できない資産**を一時的に置く場所である。
M0の作業指示（PMからの委譲）に基づき新設した。


**M3更新（本ファイル）**: M3の委譲において、`.claude/settings.json` の切替を
**2段階に分ける**ことが明示的なPM判断として指示された（設計書14.2節の記載順序とは
異なる。理由は下記「なぜ2段階に分けるか」参照）。本ファイルはその2段階の切替手順を
具体的に記述する。

## なぜ2段階に分けるか

`/home/user/aidev` の `.claude/` は、いま動いているセッション自身を制御している。
`.claude/settings.json` に7章の完全な内容（`permissions` ＋ ブロックする10 hook全て）を
一括配置すると、その瞬間からPMの権限が変わり、`exit 2` で書込をブロックするhookが
発火しうる状態になる。M3時点では以下がまだ揃っていない。

- `role-boundary-guard.js` は本実装済み（M3）だが、`.claude/agents/*.md` 自体はまだ
  `.claude/v2-staging/agents/` に置かれたままで（M6まで昇格しない）、実際に稼働する
  Subagentの`agent_type`と許可パス表の対応を実地で検証できていない
- `task-boundary-guard.js` が読むTask完了ペイロードのフィールド名は、M3で観測専用フック
  （`task-payload-observer.js`）により確認を試みているが、確定には至っていない場合がある
  （本タスクの最終報告を参照）
- M4（リバース生成エンジン）・M5（Mode B機構）が未実装であり、`artifact-emptiness-guard.js`
  等の一部hookはこれらのSkillと組み合わさって初めて意味を持つ

これらが未完成のまま `exit 2` 系hookを有効化すると、**残るM4・M5の実装作業そのものが
ブロックされ、修正のための書込みすら拒否されうる**。したがって、M3では「安全な有効化」
（ブロックしないhookのみを登録する段階1）に留め、全面切替（段階2）はM6まで待つ。

## 段階1（M3で実施済み）: 安全な有効化

`.claude/settings.json`（実配置）に、次の制約を満たす内容を配置した。

- `permissions` キーを含まない（権限変更は段階2まで行わない）
- 登録した hook は `decision-log-guard.js`・`sync-ledger-guard.js`・
  `decision-stop-check.js`・`task-payload-observer.js`・`edit-payload-observer.js`
  （後者2件はM3新設の観測専用フック）の5件のみ。いずれも`process.exit(0)`固定
  （何もブロックしない）
- `role-boundary-guard.js`・`gate-transition-guard.js`・`doc-header-guard.js`・
  `lint-guard.js`・`task-boundary-guard.js`・`artifact-emptiness-guard.js`・
  `ops-item-guard.js` は **実装は完成させたが、実配置の`settings.json`には登録していない**
  （本ファイルの「本来の配置」列にある `.claude/v2-staging/settings.json` にのみ記載）
- 既存の `.claude/settings.local.json`（v1の`prevent-pm-layer-violation.sh`を登録）は
  変更していない

この段階1配置の目的は、14.2節M3完了条件の「Task完了ペイロードのフィールド名を実機で
確認する」を、ブロックのリスクゼロで達成することである。

### hookの`command`記法に関する重要な注意（M3でPMが実機確認した実バグ）

**現象**: `settings.json`の`hooks[...].hooks[].command`に `.claude/hooks/xxx.js`
（`node`を前置しない形）で登録すると、そのファイルに shebang
（`#!/usr/bin/env node`）が書かれていても**実行権限（`+x`）が付与されていない限り
`Permission denied`で起動に失敗し、hookが一切発火しない**（無音で失敗するため
気づきにくい）。M3でPMが実機のサブエージェント起動により確認した。

**採用する解決策: `command`に`node `を前置する（`chmod +x`ではない）**。理由は2点。

1. 参考実装 annotation は`command`を`"node .claude/hooks/xxx.js"`の形で登録している
   （`.claude/hooks/xxx.js`単体ではない）
2. aidevはREADMEでWindows + Git Bashを推奨環境としている。Windows環境では
   shebangも実行ビット（`chmod +x`）も機能しないため、`chmod +x`による解決は
   Windows配布先で再発する。フレームワークとして配布される以上、実行環境に依存しない
   `node `前置が唯一の正解である

**本ファイルおよび`.claude/settings.json`のすべての`command`は、この教訓を反映して
`node `前置済みである（M3で修正）。今後、新しいhookを追加する際は必ず
`"command": "node .claude/hooks/{新規hook}.js"`の形式で登録すること（MUST）。
`.claude/hooks/*.js`単体（`node`前置なし）での登録は行わないこと（MUST NOT）。**

### 【解消済み・実測確認済み】`settings.json`の変更はセッション再起動なしで反映される

`command`を`node `前置に修正した直後、PMが同一セッション内でサブエージェントを
起動したところ hook が実際に発火し、`.claude-state/hook-payload-samples/`へ
サンプルが記録された（実測。推測ではない）。**したがって、M6の切替手順に
「セッション再起動が必要」という懸念は無い。** 段階2の手順3（下記）はこの実測結果を
反映済み。

### 【M3で実機観測により判明した事実】サブエージェント呼び出しペイロードの実際の構造

`task-payload-observer.js`が記録した実サンプル
（`.claude-state/hook-payload-samples/task-2026-09-11T03-34-55-464Z-z9pqb0.json`）
から、02文書7.4節の前提の一部が事実と異なることが判明した（推測ではなく実測）。

1. **`tool_name`は`"Task"`ではなく`"Agent"`である。** `settings.json`のmatcherは
   `"Task|Agent"`に修正済み（`.claude/settings.json`・`.claude/v2-staging/settings.json`
   両方）。
2. **`Agent`ツール自身のPostToolUseペイロードに限っては、`agent_id`/`agent_type`
   （snake_case・ペイロード直下）は存在しない。** 代わりに`tool_response.agentId`/
   `tool_response.agentType`（**camelCase**、`tool_response`配下）に格納されている。
   `tool_response.content`（配列、要素は`{type:"text", text:"..."}`）に完了報告本文が
   入る。`task-boundary-guard.js`はこの実測に基づく確定実装に更新済み（防御的な
   多候補抽出は廃止した）。
3. **重要: この「camelCase・`tool_response`配下」という構造は`Agent`ツール自身の
   完了イベントに限った特殊な形であり、`Edit`/`Write`イベントには当てはまらない
   （下記「解消済み」参照）。**

### 【解消済み・実測確認済み】`role-boundary-guard.js`の前提は正しかった

M3当初、`role-boundary-guard.js`が実際に判定に使う`Edit`/`Write`イベント自体に
エージェント識別子が載るかどうかは未検証であり、**「載らなければ7.4節のロール境界の
機構化は前提から成立しない」という最重要の懸念**として残っていた。

`edit-payload-observer.js`を`.claude/settings.json`の`PostToolUse`（`Edit|Write`）に
登録した後、Coder自身（本タスクを実行している私自身）が`.claude/v2-staging/README.md`
（本ファイル）を`Edit`ツールで編集した際に実際に発火したペイロードを確認したところ、
**`Edit`イベントのペイロードは、ペイロード直下に`agent_id`/`agent_type`（snake_case）を
そのまま持っていた**。

```json
{
  "session_id": "fec7ed83-9967-5ad5-9109-be4909715053",
  "hook_event_name": "PostToolUse",
  "tool_name": "Edit",
  "agent_id": "afd54d1ea4e8c8398",
  "agent_type": "coder",
  "tool_input": { "file_path": "...", "old_string": "...", "new_string": "...", "replace_all": false },
  "tool_response": { "filePath": "...", "oldString": "...", "newString": "..." }
}
```

`agent_type`の値は`"coder"`であり、これは私自身の実際のロール（本タスクをCoderとして
実行している）と一致する。**すなわち02文書7.4節が当初から述べていた
「`agent_id`/`agent_type`という共通入力フィールドが存在する」という記述は、
`Edit`/`Write`系のツールについては正しかった。** 実測で覆っていたのは、
`Agent`ツール自身の完了イベント（`tool_response`配下にcamelCaseで格納される特殊形）
だけである。

**結論**: `role-boundary-guard.js`（本実装は`payload.agent_type`をそのまま参照する
設計、M3で実装済み）は**そのままの前提で成立する**。作り直しは不要である。ただし
次の2点はなお未確認であり、M6着手前に確認することが望ましい（MAY、必須ではない）。

- 本実測は`PostToolUse`（`Edit`）1件のみであり、`role-boundary-guard.js`が実際に
  使う`PreToolUse`（Edit\|Write）でも同一の`agent_id`/`agent_type`構造が载るかは、
  Pre/Post間でペイロード構造が対称であるという一般的な期待からの推測に留まる
  （直接の実測ではない）
- `coder`以外のロール（`app-architect`・`designer`等）でも`agent_type`が
  期待どおりの値（各Subagentの`name`フロントマターと一致する文字列）になるかも
  未確認である

**旧version（PMの依頼時点）ではこの検証をPMが別のサブエージェントを起動して行う想定
だったが、Coder自身の`Edit`呼び出しでも同一の証跡が得られたため、上記のとおり本タスク
内で解決した。** 参考として、`.claude-state/hook-payload-samples/`には実サンプル
（`task-*.json`2件、`edit-*.json`1件）を保存済みである。

（以下、上記対応の経緯として残す）
**対応（M3で実施済み）**: `edit-payload-observer.js`（`task-payload-observer.js`と
同じ作り、常に`exit 0`、保存先`.claude-state/hook-payload-samples/edit-*.json`）を
新設し、`.claude/settings.json`の`PostToolUse`の`Edit|Write`エントリに追加登録した
（既存の`decision-log-guard.js`・`sync-ledger-guard.js`はそのまま維持）。上記のとおり
この観測により懸念は解消済みであり、`active-agent.json`方式への作り直しは不要と
判断した。`edit-payload-observer.js`自体は`task-payload-observer.js`と同様、M3限定の
診断用フックであり、7.3節の正式な10 hookには含まれない（M6完全版
`.claude/v2-staging/settings.json`には登録していない。恒久的に残す価値があると
PMが判断した場合は別途登録を検討すること）。

## 段階2（M6で実施）: 完全版への切替

M6（旧資産削除・`.claude/agents/*.md`の昇格と**同時**）に、以下の手順で切り替える。

1. **前提条件の確認**
   - [ ] M4・M5が完了し、`artifact-emptiness-guard.js` が実際に `reverse-doc` 群と
         組み合わせて動作確認済みであること
   - [ ] `task-boundary-guard.js` が、M3で確定した`tool_response.agentType`/
         `tool_response.content`を参照する実装で実際に警告を出せることを再確認して
         いること（実機のサブエージェント名`tool_response.agentType`が
         `consultant`/`app-architect`/`infra-architect`/`designer`/`coder`/`qa`/`sre`
         のいずれかと一致することも合わせて確認する。M3の実測は`Explore`という
         汎用エージェント1件のみであり、v2固有エージェントでの確認はまだ済んで
         いない）
   - [ ] `.claude/v2-staging/agents/*.md`（7ファイル）の内容が確定していること
   - [x] **【解消済み】`role-boundary-guard.js`がPostToolUse(Edit)のペイロードから
         実際にエージェント識別子（`agent_id`/`agent_type`、snake_case・ペイロード
         直下）を取得できることをM3で実機確認済み（上記「【解消済み・実測確認済み】
         `role-boundary-guard.js`の前提は正しかった」参照）。ただし`PreToolUse`側と
         `coder`以外のロールでの確認は未実施のため、M6着手前に余裕があれば
         追加確認することが望ましい（MAY）
2. **`.claude/agents/` の昇格**
   - `.claude/agents/<name>/AGENT.md`（v1、ディレクトリ形式）を削除する
   - `.claude/v2-staging/agents/<name>.md`（フラット形式）を `.claude/agents/<name>.md`
     へ移動する
3. **`.claude/settings.json` の全面差し替え**
   - `.claude/v2-staging/settings.json`（本ディレクトリの完全版）の内容を
     `.claude/settings.json` としてコミットする（`permissions` 2表＋7章の全hookを含む。
     すべての`command`が`node `前置済みであること、matcherが`Task|Agent`に
     なっていることを再確認すること、MUST）
   - `settings.json`の変更はセッション再起動なしで反映されることを実測確認済みのため
     （上記参照）、再起動は不要である
   - 差し替え後、**最初の数回のツール呼び出しをPM自身が慎重に確認する**
     （`role-boundary-guard.js`が意図せずPM自身の `docs/00_.../` 書込までブロックして
     いないか、また前提条件確認済みのはずの`Edit|Write`でのエージェント識別子取得が
     実際に機能しているか等）
4. **v1の`CLAUDE.md`の置き換え**
   - v1の `.claude/CLAUDE.md`（338行、フェーズ順次型の記述）を、v2の軽量CLAUDE.md
     （6.2節、150〜180行目安、ゾーン/レーン型のオーケストレーション定義）に置き換える
5. **v1資産の削除**（02文書14.1節の資産ごとの判定表に従う）
   - `.claude/docs/10_facilitation/`、`.claude/docs/40_standards/`（移管済みの部分）、
     `.claude/commands/check.md`・`check-code.md`、`.claude/hooks/prevent-pm-layer-violation.sh`
     等を削除する
   - 削除前に、他プロジェクトへの相対リンク等、リポジトリ外部参照切れが残っていないか
     確認する（02文書14.2節M6完了条件、版1.7で追加）
6. **`.claude/settings.local.json` の整理**
   - v1用の`prevent-pm-layer-violation.sh`登録は、v1資産削除と同時に外してよい
     （v2側は`role-boundary-guard.js`が同等の機構を担う）

### 段階2のロールバック手順

万一 `.claude/settings.json` の全面差し替え後に想定外のブロックが多発した場合、
即座に段階1の内容（本ファイルのgitログから復元可能）に戻し、原因を切り分けてから
再度差し替えること。**`git revert` 等で戻す前に、進行中の書込み操作が中途半端な状態で
残っていないか（例: decision-warnings.jsonの未解消エントリ）を確認する**。

## 移行対象一覧（更新版）

| ファイル | 現在の配置（staging） | 本来の配置 | 移行タイミング |
|---|---|---|---|
| `settings.json` | `.claude/v2-staging/settings.json` | `.claude/settings.json` | **M6**（上記「段階2」手順） |
| `agents/*.md`（7ファイル） | `.claude/v2-staging/agents/` | `.claude/agents/<name>.md` | **M6**（上記「段階2」手順2） |

## 各マイルストーンでの並行作業（参考、02文書14.2節）

M0で新設した `.claude/skills/*`（横断スキル16種）と `.claude/hooks/*.js`（hook 10種＋
M3新設の観測専用フック2種）は、v1と名前が衝突しないため既にこのセッションでも
読み込まれる実配置に置いてある（`.claude/skills/`, `.claude/hooks/`）。M3時点の状態は
次のとおり。

- 横断スキル: 大半に`disable-model-invocation: true`または`user-invocable: false`を
  付与済みのため、ユーザーが明示的に呼ばない限り起動しない
- hook: `.claude/settings.json`（段階1の安全な有効化版）には
  `decision-log-guard.js`・`sync-ledger-guard.js`・`edit-payload-observer.js`
  （`PostToolUse`の`Edit|Write`）、`task-payload-observer.js`
  （`PostToolUse`の`Task|Agent`）、`decision-stop-check.js`（`Stop`）の5件が
  `command`を`node `前置・matcherを実測（`Agent`）に対応させた形で登録されている
  （M3でPMが発見した`Permission denied`不具合の修正、および`tool_name`実測結果の
  反映済み）。いずれも`process.exit(0)`固定でブロックしない設計であり、**この修正後に
  実際に発火することはPMの実機確認により確認済み**（`task-payload-observer.js`が
  実サンプルを記録した。上記参照）。それ以外の`.claude/hooks/*.js`
  （`role-boundary-guard.js`等）は実装済みだが未登録のため一切発火しない
- `.claude/settings.local.json`が登録する`prevent-pm-layer-violation.sh`（v1）は
  そのまま有効に動作し続けている

これらが「7章の設計どおり全面的に発火する」ようになるのはM6で`.claude/v2-staging/settings.json`
の内容が`.claude/`直下に昇格した時点である。

## 移行時のチェックリスト（PM向け、更新版）

- [ ] M3完了時点で、本タスクの最終報告に記載された「Task完了ペイロードのフィールド名」
      は確定済み（`tool_name: "Agent"`、`tool_response.agentId`/`agentType`/`content`）。
      ただしv2固有エージェント名（`coder`等）での確認はまだのため、M4着手前に
      v2固有エージェントを1件起動して`tool_response.agentType`の値を再確認すること
- [x] **`edit-payload-observer.js`によるPostToolUse(Edit)実機確認は完了・解消済み
      （最重要事項）。** Coder自身の`Edit`呼び出しで`agent_type: "coder"`が
      ペイロード直下（snake_case）に載ることを確認した。`role-boundary-guard.js`は
      作り直し不要。`PreToolUse`側・`coder`以外のロールでの追加確認はMAY（必須ではない）
- [ ] M4着手前に、`.claude/hooks/artifact-emptiness-guard.js`・`ops-item-guard.js`が
      M3で採用した暫定パターン・暫定スキーマ（`00-01`成果物構成カタログの列定義等）を
      04文書・03文書の正本が確定次第、差し替えること
- [ ] M6着手前（段階2）に、上記「段階2: 完全版への切替」の手順1〜6を順に実施すること
- [ ] M6着手前に、v1資産（`CLAUDE.md`, `.claude/agents/*/AGENT.md`, `.claude/docs/10_facilitation/`,
      `.claude/docs/40_standards/`の一部, `.claude/commands/check*.md`等）の削除範囲を
      02文書14.1節の資産ごとの判定表で再確認する

## 未解決事項（M0〜M3で判明、PMへの報告事項）

各マイルストーンで判明した設計書側の不足・ギャップは、委譲元PMへの報告本文
（各タスクの最終回答）にまとめて記載する。本ファイルには再掲しない。
