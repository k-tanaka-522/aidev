---
name: test-design-guide
description: v2の試験設計規約。試験レベル責務分担と6種ID体系（E2E分母=HB-ID、IT分母=API-ID、ST分母=NFR-ID、機械抽出単位=SCR-ID）を定める。qa・gate-checkから参照される。
user-invocable: false
paths:
  - "src/**/*.e2e.ts"
  - "src/**/*.test.ts"
  - "src/**/*.test.tsx"
  - "tests/**"
  - "docs/05_テスト/**"
---

# test-design-guide（試験設計規約）

> 版数: M0雛形（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.1節・10.1節・10.1.2節）
> `user-invocable: false`, `paths` は設計書5.1節が定める本来の値。`paths`の具体的なパターンはM1で確定する
> （本ファイルではannotation資産を参考にした暫定値を置く）。

## 責務

試験レベル責務分担、6種ID体系（版1.4で拡張）を明記する。

- E2Eの分母: `HB-ID`
- ITの分母: `API-ID`
- STの分母: `NFR-ID`
- 機械抽出単位: `SCR-ID`
- 帳票の機械抽出単位: `RPT-ID`
- バッチの分母: `BAT-ID`

## 呼び出し元・連携先

- 呼び出し元: `qa`、`gate-check`

## docblock記載規約（10.1節・4.3節）

- `tests/e2e/`: `HB-ID`起点のシナリオ。docblockに`HB-ID`と経由する`SCR-ID`/`RPT-ID`を記載する
- `tests/integration/`: `API-ID`起点のシナリオ。docblockに`API-ID`を記載する
- 非機能検証テスト: docblockに`NFR-ID`を記載する

<!-- M1で実装: テストレベルの責務分担表（annotation資産を参考に、
     E2E=HB-ID/IT=API-ID/ST=NFR-IDの分母置き換えに合わせて再構成）、
     E2Eシナリオの禁止事項・必須事項・記述フォーマット、報告フォーマットの具体化 -->

## カバレッジ判定の原則

**カバレッジの分母は要件・設計（本規約が定めるID体系）から取る。実装から取らない。** 合格率のみの報告（例:「E2E 34件中29件パス」）はカバレッジとして受理しない。`skip`/`fixme`/握りつぶしは分子に数えない（`gate-check`10.1.2節と整合）。
