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
  `decision-stop-check.js`・`task-payload-observer.js`（M3新設の観測専用フック）の
  4件のみ。いずれも`process.exit(0)`固定（何もブロックしない）
- `role-boundary-guard.js`・`gate-transition-guard.js`・`doc-header-guard.js`・
  `lint-guard.js`・`task-boundary-guard.js`・`artifact-emptiness-guard.js`・
  `ops-item-guard.js` は **実装は完成させたが、実配置の`settings.json`には登録していない**
  （本ファイルの「本来の配置」列にある `.claude/v2-staging/settings.json` にのみ記載）
- 既存の `.claude/settings.local.json`（v1の`prevent-pm-layer-violation.sh`を登録）は
  変更していない

この段階1配置の目的は、14.2節M3完了条件の「Task完了ペイロードのフィールド名を実機で
確認する」を、ブロックのリスクゼロで達成することである。

## 段階2（M6で実施）: 完全版への切替

M6（旧資産削除・`.claude/agents/*.md`の昇格と**同時**）に、以下の手順で切り替える。

1. **前提条件の確認**
   - [ ] M4・M5が完了し、`artifact-emptiness-guard.js` が実際に `reverse-doc` 群と
         組み合わせて動作確認済みであること
   - [ ] `task-boundary-guard.js` が、M3で確認したTask完了ペイロードのフィールド名で
         実際に警告を出せることを再確認していること（実機のサブエージェント名
         `agent_type` が `consultant`/`app-architect`/`infra-architect`/`designer`/
         `coder`/`qa`/`sre` のいずれかと一致することも合わせて確認する）
   - [ ] `.claude/v2-staging/agents/*.md`（7ファイル）の内容が確定していること
2. **`.claude/agents/` の昇格**
   - `.claude/agents/<name>/AGENT.md`（v1、ディレクトリ形式）を削除する
   - `.claude/v2-staging/agents/<name>.md`（フラット形式）を `.claude/agents/<name>.md`
     へ移動する
3. **`.claude/settings.json` の全面差し替え**
   - `.claude/v2-staging/settings.json`（本ディレクトリの完全版）の内容を
     `.claude/settings.json` としてコミットする（`permissions` 2表＋7章の全hookを含む）
   - 差し替え後、**最初の数回のツール呼び出しをPM自身が慎重に確認する**（`role-boundary-guard.js`
     が意図せずPM自身の `docs/00_.../` 書込までブロックしていないか等）
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
M3新設の観測専用フック1種）は、v1と名前が衝突しないため既にこのセッションでも
読み込まれる実配置に置いてある（`.claude/skills/`, `.claude/hooks/`）。M3時点の状態は
次のとおり。

- 横断スキル: 大半に`disable-model-invocation: true`または`user-invocable: false`を
  付与済みのため、ユーザーが明示的に呼ばない限り起動しない
- hook: `.claude/settings.json`（段階1の安全な有効化版）には
  `decision-log-guard.js`・`sync-ledger-guard.js`・`decision-stop-check.js`・
  `task-payload-observer.js`の4件のみが登録されている。いずれも`process.exit(0)`固定で
  ブロックしない。それ以外の`.claude/hooks/*.js`（`role-boundary-guard.js`等）は
  実装済みだが未登録のため一切発火しない
- `.claude/settings.local.json`が登録する`prevent-pm-layer-violation.sh`（v1）は
  そのまま有効に動作し続けている

これらが「7章の設計どおり全面的に発火する」ようになるのはM6で`.claude/v2-staging/settings.json`
の内容が`.claude/`直下に昇格した時点である。

## 移行時のチェックリスト（PM向け、更新版）

- [ ] M3完了時点で、本タスクの最終報告に記載された「Task完了ペイロードのフィールド名」
      確定結果（確定できた／できなかった）を確認する。できていない場合はM4着手前に
      再度サブエージェントを起動して確認すること
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
