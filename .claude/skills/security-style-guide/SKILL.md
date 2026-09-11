---
name: security-style-guide
description: v2のセキュリティ標準（受動自動参照専用）。src/**・infra/**・decisions/contracts/**・prototypes/**編集時にSECURITY_STANDARD.mdが自律的に参照される。能動的なコンプライアンス検査はsecurity-guard（context:fork）を使うこと。
user-invocable: false
paths: "src/**, infra/**, decisions/contracts/**, prototypes/**"
---

# security-style-guide（セキュリティ標準・受動自動参照）

> 版数: M2実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 4.4節・5.1節、版1.7で新設）
> 版1.6までは`security-guard`が`context: fork`（能動検査）と`paths`（受動自動参照）の
> 両方を1つのSkillに併設していたが、版1.7（15章旧#23の結論）により**用途別に分離**した。
> 理由: `context: fork`のSkillは呼ばれるたびに独立コンテキストで実行され結果テキストのみが
> 返る（ラウンドトリップが発生する）のに対し、`code-style-guide`等の非fork自動参照Skillは
> 本文がそのまま呼び出し元のコンテキストへ展開される。受動的な自動参照という用途には
> forkを使わない非fork Skillが適切であるため、能動検査専用の`security-guard`と、
> 受動参照専用の本Skillに分離した（`security-guard`側の検証記録・却下した代替案は
> `security-guard/SKILL.md`の履歴として残す）。

## 責務

`SECURITY_STANDARD.md`（`.claude/docs/40_standards/49_common/security.md`の移管先）を、
`src/**`・`infra/**`・`decisions/contracts/**`・`prototypes/**`のいずれかを編集した際に
自律的に参照可能にする（`code-style-guide`・`iac-style-guide`・`ui-style-guide`と同型の
「自動参照Skill」パターン、02文書2.2節）。**検査は行わない**（検査は`security-guard`の責務）。

## 規約本体の所在（MUST NOT複製）

`SECURITY_STANDARD.md`は本Skill直下を正本として保持する。`security-guard`
（能動検査）・`code-style-guide`・`iac-style-guide`・`ui-style-guide`・`contract-design`は
内容を転記・複製せず、`.claude/skills/security-style-guide/SECURITY_STANDARD.md`への
リンク参照に留める（02文書4.4節、MUST NOT複製）。

主な内容: シークレット管理（AWS Secrets Manager優先）、セキュリティチェックリスト
（アプリ: SQLインジェクション対策・XSS対策・CSRF対策・パスワードハッシュ化・HTTPS強制・
セキュリティヘッダー、インフラ: SecurityGroup最小化・IAM最小権限・VPCプライベートサブネット・
RDS暗号化・S3パブリックアクセス無効化・CloudTrail・GuardDuty、依存関係: 脆弱性スキャン）、
監視・ログ（構造化ログ、シークレットのログ出力禁止）、バックアップ・復旧（RTO/RPO目標）。

## 呼び出し元・連携先

- 呼び出し元: `src/{layer}:execute`/`review`、`infra/{layer}:execute`/`review`、
  `contract-design`、`mockup-generate`/`mockup-update`（いずれも自動、`paths`一致時）
- 連携先: `security-guard`（能動検査時、同じ標準を参照する）

## `paths`書式に関する注意（M1で判明、版1.7で確定済み、再掲）

`paths`は**カンマ区切りの単一文字列**として与えなければならない（YAMLリスト構文は
常時ロードのSkillとして扱われてしまう）。実装ソース確認済みの事実であり本ファイルは
これに準拠する（02文書版1.7 5章冒頭のMUST注記）。

## ツール権限

非fork・自動参照Skillのため、独自のツール実行は行わない（本文が展開されるのみ）。

## 動作確認（M2）

- `security-guard/SECURITY_STANDARD.md`から本ファイルへ内容を移動し、旧ファイルを
  削除したことを確認済み（複製を作らない、MUST NOT複製）
- `code-style-guide`・`iac-style-guide`・`ui-style-guide`・`doc-style-guide`・
  `iac-style-guide/testing/INFRA_TEST_STANDARD.md`の参照リンクを本Skillへ更新したことを確認済み
