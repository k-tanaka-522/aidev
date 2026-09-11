---
name: impact-analysis
description: Mode Bのチケット影響範囲特定。分母はZone3成果物。静的解析によるHB-ID→実装ファイル→API→モジュール列を逆引きの材料とする。Zone3内ミニチケットでも軽量モードとして流用する。
argument-hint: "[Issue番号 or --scope=<ID>]"
disable-model-invocation: true
---

# impact-analysis（影響範囲分析）

> 版数: M0雛形（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 5.1節・9.1.1節・10.4節・12章）
> `disable-model-invocation: true` はM0限定の安全策。設計書5.1節の本来のfrontmatterは`argument-hint`のみ。
> M5でMode B機構が実装され次第、外すこと。

## 責務

Mode B: チケットの影響範囲特定（分母はZone3成果物）。9.1.1節の静的解析結果（`HB-ID`→実装ファイル→API→モジュール列）を逆引きの材料とする。Zone3内ミニチケット（10.4節）でも軽量モードとして流用する（MAY）。

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`（Mode B、Zone3内ミニチケット）
- 連携先: `src/{layer}:execute`

## 分母（12章）

**Zone3で生成されたIPA成果物（RTM・API設計書等）**。9.1.1節の静的解析結果（実装ファイル→API→モジュール列）を逆引きの材料とする。Mode B開始時点（`GZ3`通過後）では要件定義書・設計書が実在するため、この時点からは「設計書を分母とする」原則に復帰する。

<!-- M5で実装: Zone3成果物からの分母抽出処理、9.1.1節の静的解析結果の逆引き処理 -->

## Zone3内ミニチケットでの軽量モード（10.4節）

`gate-check --kind=zone3-hotfix`向けに、10.1.2節の各ID（`HB-ID`・`SCR-ID`・`API-ID`・`NFR-ID`）を機械的に洗い出す軽量モードを持つ（MAY）。

<!-- M4/M5で実装: 軽量モードの具体的な洗い出し処理 -->
