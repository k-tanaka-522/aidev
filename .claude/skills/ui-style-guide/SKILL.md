---
name: ui-style-guide
description: v2のUI/UX規約。デザインシステム（カラー・タイポグラフィ・コンポーネント）、アクセシビリティ（WCAG 2.1 AA）、レスポンシブ方針を定める。prototypes/配下のハリボテ生成・改修時に自動参照される。
user-invocable: false
paths: "prototypes/**"
---

# ui-style-guide（UI/UX規約、版1.6で新設）

> 版数: M1実装（新設。実装対象: docs/v2/02_実行基盤アーキテクチャ.md 4.4節「技術標準の移管マッピング」）
> `user-invocable: false`, `paths` は`code-style-guide`/`iac-style-guide`と同型の
> 自動参照Skillパターン（02文書2.2節）をレーンA向けに適用したもの。`paths`は
> カンマ区切りの単一文字列で与える（`paths`書式の注意は`code-style-guide/SKILL.md`と同じ）。

## 責務

UI/UX規約（デザインシステム、アクセシビリティ、レスポンシブデザイン）を定める。
`.claude/docs/40_standards/41_app/uiux.md`から移管した(02文書4.4節)。旧版は
`code-style-guide`/`iac-style-guide`のいずれにも属さず配置先が未定義だったため、
本Skillとして独立新設した。

## 呼び出し元・連携先

- 呼び出し元: `prototypes/.claude/skills/mockup-generate`・`mockup-update`
  （レーンA、自動。M2でこれらのSkillが実装され次第、ウォームアップ時に自動参照される想定）

## 規約ファイル

| ファイル | 移行元 |
|---|---|
| `UIUX_STANDARD.md` | `.claude/docs/40_standards/41_app/uiux.md` |

内容: 技術スタック（Tailwind CSS + daisyUI推奨）、デザインシステム（カラーパレット・
タイポグラフィ・余白）、コンポーネント（ボタン・フォーム・テーブル・アラート・モーダル）、
レイアウト、アクセシビリティ（WCAG 2.1 AA、カラーコントラスト・aria属性・キーボード操作）、
レスポンシブデザイン（ブレークポイント）、パフォーマンス（画像最適化・Lazy Loading）。

## v1からの変更点

移行元末尾の「参照: `.claude/agents/designer/AGENT.md`」はv1資産であり、v2の
Designer定義（`.claude/v2-staging/agents/designer.md`、M6で`.claude/agents/designer.md`
へ昇格予定）とは直接リンクしないため削除した。本Skill自体が独立して完結する内容と
なっている。

## セキュリティ標準への参照

ハリボテはUI表示専用であり、通常はセキュリティ標準を直接参照する必要は薄いが、
入力フォームのXSS対策等、`security-style-guide`の`SECURITY_STANDARD.md`と重複しうる観点が
生じた場合はそちらを参照する（複製しない。版1.7で参照先を`security-guard`から`security-style-guide`へ変更）。

## 動作確認（M1）

- `paths: "prototypes/**"`（文字列形式）で新設。実機での条件付き活性化の確認は
  `code-style-guide`と同様「未確認」（ソースコード上のパース仕様の確認に留まる）
