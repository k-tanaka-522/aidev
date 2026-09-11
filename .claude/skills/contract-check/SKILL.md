---
name: contract-check
description: 設計⇔実装の契約検証（02文書16章）。.claude/contracts/MANIFEST.json登録済みの契約（CT-ID）を一括実行し、合否・MANIFEST未登録参照・未評価（契約化するかどうかの判定が未了）のMUSTを報告する。
context: fork
allowed-tools: Read, Grep, Glob, Bash
disable-model-invocation: true
---

# contract-check（設計⇔実装の契約検証）

> 版数: M7新設（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 16章、特に16.5.2節）
> `context: fork` と `allowed-tools`（`Bash`を含む）は設計書5.1節・16.5.2節が定める本来の値。
> `Bash`は`gate-check`・`decision-check`には無いが、契約テストという**コードを実行して
> 結果を得る**必要があるため本Skillにのみ追加されている（16.5.2節「`Bash`が必要な理由」）。
> `disable-model-invocation: true` は他の横断Skill（`gate-check`・`decision-check`）と同じく
> `.claude/settings.json`がM6本切替されるまでの安全策として維持する（M3の既存慣行を踏襲）。

## 責務

1. **一括実行（フルモード、引数無し）**: `.claude/contracts/MANIFEST.json`の`status: active`
   全件について`node <testFile>`を実行し、合格/不合格件数を報告する（一次証跡は自ら数える、
   01文書7.2節）。
2. **見える化（フルモードのみ）**: `.claude/lib`・`.claude/hooks`・各Skill`scripts/`配下の
   ヘッダーコメントを走査し、次の3分類を報告する（16.6節「選別自体が人間の判断であることの
   明記」、16.10節「契約が無いことを隠さない」）。
   - `noTag`: `【契約】`欄そのものが無い（16.3.3節MUSTに未追随）
   - `unregisteredRef`: `【契約】`欄がCT-IDを参照しているが`MANIFEST.json`のactive契約に
     存在しない（記載と実体の乖離）
   - `unevaluated`: `【契約】`欄に「対象外」の宣言もCT-ID参照も無い（契約化するかどうかの
     判定がまだ行われていない候補）
3. **差分実行（`--target=<path>`）**: 指定パス（ファイルまたはディレクトリ）に関連する
   契約のみを実行する。`contract-drift-guard.js`と同じ`.claude/lib/contract-registry.js`
   （`contractsForModule`/`runContract`）を共有する（16.5.2節SHOULD、9.1.2節と同型の設計
   判断）。

## 呼び出し元・連携先

- 呼び出し元: PM（M7完了条件の確認時、14.2節）、Routines（週次フル実行、16.5.4節）
- 連携先: `.claude/contracts/`（読み取りのみ）、`00-13_課題管理表.md`（Routine不合格時の
  登録先。本Skill自身は`Write`/`Edit`を持たないため登録は行わない。呼び出し元が行う）

## 実装構成（M7で新設）

```
.claude/skills/contract-check/scripts/
└── contract-check.js   # フル/差分実行、見える化レポートをJSON/人間可読で出力
```

本スクリプトは読み取り専用であり、`.claude/contracts/**`・`.claude/lib/**`・
`.claude/hooks/**`・`.claude/skills/**`のいずれも書き換えない（`Write`/`Edit`を持たない
という本Skillのツール権限方針と整合させるため。`decision-check`と同じ設計）。

### 呼び出し方

```bash
node .claude/skills/contract-check/scripts/contract-check.js                  # 人間可読サマリ + JSON詳細
node .claude/skills/contract-check/scripts/contract-check.js --json           # JSON詳細のみ
node .claude/skills/contract-check/scripts/contract-check.js --target=<path>  # 指定パスに関連する契約のみ実行（見える化レポートは付与しない）
```

exit code: 1件でも不合格があれば`1`、全合格（対象0件を含む）なら`0`。

### 出力される主なフィールド（`--json`時）

```jsonc
{
  "mode": "full" | "target:<path>",
  "total": <int>, "pass": <int>, "fail": <int>,
  "results": [{ "id": "CT-0001", "testFile": "...", "targetModule": "...", "pass": <bool>, "summary": <string|null> }],
  "visibility": {  // フルモードのみ
    "noTag": ["<相対パス>", ...],
    "unregisteredRef": [{ "file": "...", "missing": ["CT-9999"], "body": "..." }],
    "unevaluated": [{ "file": "...", "body": "..." }]
  }
}
```

## 週次Routineでの利用（16.5.4節）

フル実行（引数無し）を週次で行う（環境変数で上書き可能な暫定値、8.2.2節「15分」と同様に
実測に基づかない暫定値）。不合格が検出された場合、`doc-link-check`・生成可能性検査と同じ
着地点である`00-13_課題管理表.md`へ登録する（本Skill自身ではなく、Routineの呼び出し側が
登録処理を行う。5.1節「連携先」参照）。

## 本Skillが対象としないもの（16.2節）

顧客プロジェクトの`src/`・`tests/`のトレーサビリティ充足は対象外（`gate-check`・
`sync-check`の責務）。本Skillが検証するのは、aidevフレームワーク自身の`.claude/lib`・
`.claude/hooks`・各Skill`scripts/`が01/02文書のMUSTを満たしているかのみである。
