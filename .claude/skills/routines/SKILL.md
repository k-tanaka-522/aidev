---
name: routines
description: 02文書12章が定めるRoutines(依存更新チェック/IaCドリフト検知/文書陳腐化チェック/文書間リンク検査/生成可能性検査/成果物カタログ全件走査)のスケジュール定義と手動実行ランナー。この環境にスケジューラが無くても個々のRoutineを手動実行できる。
argument-hint: "[--list | --name=<routine名> | --all]"
---

# routines（定期タスクのスケジュール定義と手動実行）

> 版数: M5新設（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 12章、
> 7.3節#8「Routines稼働開始に伴う定期全件走査の追加登録」、
> docs/v2/03_成果物体系定義書.md 5.4節・8.2節）

## 責務

02文書12章が定めるRoutines（定期タスク）を実行する。**Routines機構自体（cron等のスケジューラ）はこの実行環境で使えるとは限らない**（タスク指示）。したがって本Skillは「いつ実行すべきか」（`routines.json`のスケジュール定義）と「何を実行するか」（`scripts/*.js`の実行スクリプト）を分離し、スケジューラの有無に関わらず`scripts/run-routine.js`で手動実行できる形にする。

## 定義済みRoutine一覧（`routines.json`が正）

| Routine名 | 内容 | 既定スケジュール | 実行スクリプト |
|---|---|---|---|
| `dependency-update-check` | 依存更新チェック | 週次 | `scripts/dependency-update-check.js` |
| `iac-drift-detection` | IaCドリフト検知（**この環境では実クラウドAPIを叩けないため、コードフリーズ基準点からの`git diff`による代理指標に限定**。真のクラウドドリフトは検知できない、後述の限界参照） | 週次 | `scripts/iac-drift-check.js` |
| `doc-staleness-check` | 文書陳腐化チェック（`reverse-doc`差分検出モード） | 月次 | `scripts/doc-generation-drift-check.js` |
| `generation-possibility-check` | 生成可能性検査（`reverse-doc`差分検査モード、03文書5.4節） | 四半期 | `scripts/doc-generation-drift-check.js`（`doc-staleness-check`とスクリプト共用。9.1.1節・10.3節が確立した「抽出基盤は共有してよい」方針を踏襲） |
| `doc-link-check` | 文書間リンク検査（03文書8.2節） | 四半期 | `../doc-link-check/scripts/check-links.js`（M4実装済みSkillをそのまま呼ぶ） |
| `artifact-emptiness-fullscan` | IPA成果物カタログ未生成項目の定期全件走査（`artifact-emptiness-guard.js`のPostToolUse差分検査を補助、02文書7.3節#8、MAY） | 週次 | `scripts/artifact-emptiness-fullscan.js` |

## スケジューラが無い場合の運用（既定）

`orchestrate`または`PM`が、上表の周期を目安に`scripts/run-routine.js --name=<name>`または`--all`を手動で呼ぶ。02文書12章のフロー図が示す「ROUT → DRIFT/LINKCHK/GENCHK → ISSUE/00-13」の後段（検出結果のIssue化・課題管理表登録）は各実行スクリプト自身が担う（`doc-link-check`は既存実装がそのまま`00-13`へ登録する。`doc-generation-drift-check`・`dependency-update-check`・`iac-drift-check`・`artifact-emptiness-fullscan`は検出結果を標準出力するのみに留め、Issue化はorchestrate/PMが`ticket-triage`経由で行う設計とする。理由: これらのスクリプトは読み取り専用の検査に徹し、Issue起票というGitHub側の副作用を持たせないことで、単体動作確認をGitHub MCP無しで完結させるため）。

## スケジューラが利用可能な環境への拡張（設計、MAY）

`routines.json`の`schedule`フィールド（`weekly`/`monthly`/`quarterly`）を読み、外部cron・GitHub Actions等のスケジューラへ`node .claude/skills/routines/scripts/run-routine.js --name=<name>`の呼び出しを登録する橋渡しスクリプトを追加すればよい。本Skillの既存スクリプトは変更不要である（スケジュール定義と実行スクリプトを分離した設計が活きる）。

## 実行方法

```bash
node .claude/skills/routines/scripts/run-routine.js --list
node .claude/skills/routines/scripts/run-routine.js --name=doc-link-check
node .claude/skills/routines/scripts/run-routine.js --all
```

## できる範囲・できない範囲（正直な限界表明、MUST）

- できる: `doc-link-check`・`doc-staleness-check`/`generation-possibility-check`（`verify.js`の逆差分・生成漏れ検査を流用）・`artifact-emptiness-fullscan`は、既存の読み取り専用ロジックの範囲でこの環境でも完全に動作する
- できない: `iac-drift-detection`の本来の意味（実クラウド環境とIaC定義の差分）。実クラウドAPIへの認証済みアクセスが必要でありこの環境では行えないため、git diffによる代理指標に縮退している（`scripts/iac-drift-check.js`のコメント参照）
- できない: `dependency-update-check`のパッケージレジストリ照会。ネットワークアクセスが制限されている場合は「実行できなかった」ことを明示し、黙って「更新なし」と報告しない（`scripts/dependency-update-check.js`参照）
- できない: 実際のcron等によるスケジュール起動そのもの。本Skillは手動実行のランナーに留まる（要検証、15章#7と同根の制約）

## 動作確認（M5）

PMへの最終報告を参照。
