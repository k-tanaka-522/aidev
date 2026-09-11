# v2-staging（M0成果物の一時置き場）

このディレクトリは、aiDev v2（`docs/v2/02_実行基盤アーキテクチャ.md`）のうち、
**現在進行中のv1セッションを破壊せずに配置できない資産**を一時的に置く場所である。
M0の作業指示（PMからの委譲）に基づき新設した。詳細な安全上の制約は委譲元のPM指示を参照。

本ディレクトリ自体はClaude Codeから一切参照されない（`.claude/settings.json`にも
`.claude/agents/`にも属さないため無害）。各ファイルは対応するマイルストーンで
本来の配置場所へ**移動**する。

## 移行対象と移行タイミング

| ファイル | 現在の配置（staging） | 本来の配置 | 移行タイミング | 移行時の作業 |
|---|---|---|---|---|
| `settings.json` | `.claude/v2-staging/settings.json` | `.claude/settings.json` | **M3**（Hooks/Permissions強制層の実装完了時） | (1) `.claude/hooks/*.js`の各hookが02文書7.3節の判定ロジックを実装済みであることを確認する。(2) 本ファイルの内容を`.claude/settings.json`としてコミットする。(3) 既存の`.claude/settings.local.json`のPreToolUse hook（`prevent-pm-layer-violation.sh`）はv1用であり、v1資産削除（M6）まで並存させる。(4) `role-boundary-guard.js`が`agent_id`/`agent_type`参照方式で実際に稼働することを確認する |
| `agents/*.md`（7ファイル） | `.claude/v2-staging/agents/` | `.claude/agents/<name>.md` | **M6**（旧資産削除と同時） | (1) `.claude/agents/<name>/AGENT.md`（v1、ディレクトリ形式）を削除する。(2) 本ディレクトリの`<name>.md`（フラット形式）を`.claude/agents/<name>.md`へ移動する。(3) 各ファイル内の「M1で実装」注記箇所（v1 AGENT.md本文からの統合作業）が完了していることを確認する。(4) v1の`.claude/CLAUDE.md`をv2の軽量CLAUDE.md（6.2節、150〜180行目安）に置き換える |

## 各マイルストーンでの並行作業（参考、02文書14.2節）

M0で新設した `.claude/skills/*`（横断スキル16種）と `.claude/hooks/*.js`（hook 10種）は
v1と名前が衝突しないため、既にこのセッションでも読み込まれる実配置に置いてある
（`.claude/skills/`, `.claude/hooks/`）。ただし以下の理由により現時点では無害である。

- 横断スキル: 大半に`disable-model-invocation: true`または`user-invocable: false`を
  付与済み（各SKILL.md冒頭の注記を参照）のため、ユーザーが明示的に呼ばない限り起動しない
- hook: `.claude/settings.json`が存在しない（本ディレクトリの`settings.json`のみに登録が
  記載されている）ため、Claude Codeはこれらの`.claude/hooks/*.js`をイベントに紐付けて
  いない。したがって`.claude/settings.local.json`が登録する`prevent-pm-layer-violation.sh`
  以外のhookは一切発火しない

これらが実際に「発火する」ようになるのはM3で`settings.json`が`.claude/`直下に昇格した
時点である。

## 移行時のチェックリスト（PM向け）

- [ ] M3着手前に、`.claude/hooks/*.js`の`decision-log-guard.js`・`decision-stop-check.js`・
      `task-boundary-guard.js`（M1実装対象）が完了していることを確認する
- [ ] M3着手前に、`.claude/skills/*`のうち`decide`/`decision-check`/`doc-style-guide`/
      `code-style-guide`/`test-design-guide`/`security-guard`（M1実装対象）が完了しており、
      各SKILL.mdの`disable-model-invocation: true`（M0限定の安全策）を外してよい状態か確認する
- [ ] `settings.json`を`.claude/`直下へコピーする前に、本ファイルのJSONが最新のhooks一覧
      （7.3節、10種）と一致しているか再確認する
- [ ] M6着手前に、v1資産（`CLAUDE.md`, `.claude/agents/*/AGENT.md`, `.claude/docs/10_facilitation/`,
      `.claude/docs/40_standards/`の一部, `.claude/commands/check*.md`等）の削除範囲を
      02文書14.1節の資産ごとの判定表で再確認する

## 未解決事項（M0で判明、PMへの報告事項）

`.claude/v2-staging/README.md`作成の過程で判明した設計書側の不足・ギャップは、
委譲元PMへの報告本文（本タスクの最終回答）にまとめて記載する。本ファイルには
再掲しない。
