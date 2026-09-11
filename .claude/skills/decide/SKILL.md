---
name: decide
description: Zone0の不可逆決定ヒアリングと決定ログ起票。Zone1/2進行中の追加決定の起票、Task境界からの直接起票も担う。
argument-hint: "[zone0 | HB-ID | 決定内容の要約]"
disable-model-invocation: true
---

# decide（決定ログ起票）

> 版数: M1実装（実装対象: docs/v2/02_実行基盤アーキテクチャ.md 8章全体、特に8.1節・8.4節・8.7節）
> `disable-model-invocation: true` は現時点でも維持する。理由はM0の当初想定（hook未配線時の誤起動防止）
> から変わり、**M3でsettings.jsonが`.claude/`直下へ昇格しhookが実際に発火するようになるまでは
> 引き続き安全側に倒す**ため。M3のチェックリスト（`.claude/v2-staging/README.md`）でこの値を
> 外すかどうか再判断すること。

## 責務

- Zone0の不可逆決定ヒアリングと決定ログ起票（プロセス・オプションの選択もここで確定、8.7節）
- Zone1/2進行中の追加決定の起票
- **Task境界からの直接起票（8.2.4節）**: `orchestrate`が決定ブロックのテキストをそのまま引数として渡す場合、ヒアリングを省略して直接起票してよい（MAY）
- `decision-warnings.json`の消し込み（8.2.5節、該当警告の`resolved: true`化）

## 呼び出し元・連携先

- 呼び出し元: `orchestrate`、各エージェント（決定発生時）
- 連携先: 決定ログ（`docs/00_プロジェクト管理・ガバナンス/decisions/`）

## 実装構成（M1で新設）

本Skillは、Markdown生成をLLMの自由記述に任せると frontmatter のキー抜け・ID重複・
カンマ区切り記法の不統一など `decision-check` の機械集計を壊す誤りが生じやすいため、
**ファイル生成そのものをスクリプト化**している。decide Skill実行時は、ヒアリングで
得た回答を整理した上で、必ず次のいずれかのスクリプトを呼び出すこと（MUST。手書きで
`decisions/*.md` を直接Writeしない）。

```
.claude/skills/decide/scripts/
├── new-decision.js      # 通常の決定ログ1件を起票する（DL-0001以降を自動採番）
└── process-option.js    # プロセス・オプション選択専用（DL-0000を起票し、
                          #  .claude-state/process-option.json を同一操作内で同期）
```

両スクリプトの引数仕様は各ファイル冒頭のコメントに詳細を記載しているため、実行前に
`.claude/skills/decide/scripts/new-decision.js` を読むこと。要点のみ以下に示す。

### new-decision.js の呼び出し例

日本語の長文・改行を含むフィールドをシェル引数でそのまま渡すのは事故りやすいため、
複雑な内容は `--input=<jsonファイルパス>` を推奨する。単純なケースは個別フラグでもよい。

```bash
node .claude/skills/decide/scripts/new-decision.js \
  --category=アーキ土台 \
  --title="認証基盤にCognitoを採用" \
  --slug=arch-cognito \
  --content="認証基盤としてAWS Cognitoを採用する" \
  --rationale="マルチテナント対応の認証基盤を自前実装するコストを避けるため" \
  --alternatives="Auth0を検討したが、既存AWS契約とのコスト最適化のためCognitoを採用" \
  --irreversibility=高 \
  --irreversibility-reason="認証方式の変更は全画面・全APIに影響するため" \
  --decided-by=ユーザー \
  --roles=app-architect \
  --lanes=A,B
```

- 決定IDは `DL-0000` を除く連番で自動採番される（`decisions/`配下の既存ファイル名を走査）。
- `--resolve=W-0001,W-0002` を指定すると、当該IDの`decision-warnings.json`警告を明示的に
  消し込む（orchestrateが警告IDを把握している場合はこちらを優先すること、8.2.5節）。
- 指定が無い場合は自動の近接一致（生成した決定ログ本文にwarningのファイル名basenameが
  含まれるか、またはwarningの`agent_type`が今回の`--roles`に含まれるか、かつ検知から
  24時間以内）で消し込みを試みる。一致しなかった警告は`decision-check`実行時に一覧化される。

### process-option.js の呼び出し例（8.7節）

```bash
# 標準（既定）
node .claude/skills/decide/scripts/process-option.js \
  --mode=prototype-driven --decided-by=ユーザー --roles=consultant,pm \
  --reason="標準の受託契約であり中間検収物の指定なし"

# 例外（要件定義前倒しオプション、01文書4.10節）
node .claude/skills/decide/scripts/process-option.js \
  --mode=requirements-first \
  --contract-form="準委任・中間検収あり" \
  --reason="契約上、要件定義書が中間検収物として指定されているため" \
  --scope="プロジェクト全体" \
  --decided-by=ユーザー --roles=consultant
```

`--mode=requirements-first` の場合、`--reason` を省略するとスクリプトが exit 1 で拒否する
（01文書4.10節「選択の記録（MUST）」を機械的に強制するため）。実行すると
`docs/00_.../decisions/DL-0000_process-option.md`（正本）と
`.claude-state/process-option.json`（鏡ファイル）が**同一操作内で同期**される。

## ファイル形式とID体系（8.1節）

- 配置: `docs/00_プロジェクト管理・ガバナンス/decisions/DL-{4桁連番}_{タイトルkebab}.md`
- ID体系: `DL-0001`通し番号。画面データ抽出等の中間データ（`mockup-extract`出力）も同一体系のサブタイプとして採番する（例: `DL-0032_screen-data-upload.md`。M2で`mockup-extract`実装時に対応）
- `SCR-ID`・`HB-ID`・`API-ID`・`NFR-ID`・`RPT-ID`・`BAT-ID`は別体系であり混同しない
- `slug`（ファイル名のkebab部分）は英数字ハイフンのみの短い識別子を別途指定する（MUST）。タイトルの自動翻字は行わない（日本語タイトルをASCIIスラグへ機械変換すると可読性の低い文字列になるため、著者が短い英語スラグを明示する運用とした。実装上の判断）

### frontmatterフィールド（`new-decision.js`が生成）

| フィールド | 対応する8.1節の記載項目 |
|---|---|
| `決定ID` | 決定ID |
| `決定内容` | 決定内容 |
| `不可逆度` | 不可逆度（高/中/低。01文書4.7.2節が正本） |
| `状態` | 状態（確定/仮/覆った） |
| `決定日時` | 決定日時 |
| `決定者` | （01文書4.7.2節の「決定者」相当） |
| `決定に関与したロール` | 決定に関与したロール |
| `影響レーン` | 影響レーン（A/B/Cのどれに波及するか） |
| `対象カテゴリ` | 対象カテゴリ（Zone0必須決定項目、下記9値） |
| `関連HB-ID` | 関連HB-ID |
| `対象スロット` | （新設）HB-ID単位分母（8.3節(b)）を機械集計可能にするための構造化フィールド。`"業務ルール=あり, 異常系=該当なし"`形式 |
| `NFR-ID` | NFR-ID |
| `運用項目コード` | 運用項目コード（04文書4.3節のB1〜B6/I1〜I7/M1〜M10） |

本文（body）には `## 決定内容` `## 根拠` `## 検討した代替案と却下理由` `## 不可逆性の理由`
`## 覆す場合の扱い` の各節を`new-decision.js`が自動生成する。空欄で渡した節には
`(未記載)`が入るため、`reverse-doc`（Zone3）が「未記載」として扱う原則（8.6節）と
自然に整合する。

## Zone0ヒアリング項目（8.3節(a)の9値、一問一答）

`事業背景` / `スコープ外周` / `法規制前提` / `非機能骨格` / `アーキ土台` / `外部連携制約` / `予算期限体制` / `案件類型`（03文書7章） / `前倒しオプション`（01文書4.10節）

**進め方（MUST）**: PMの一問一答対話原則（CLAUDE.md）を踏襲し、9項目を1問ずつ順に尋ねる。
`前倒しオプション`のみ、通常の`new-decision.js`ではなく`process-option.js`を使い`DL-0000`
として起票する（8.7節、上記参照）。残り8項目は1項目＝1決定ログ（`new-decision.js`を8回
呼び出す）を基本とするが、粒度の判断（01文書4.7.2節「後から変えたときに他の決定を
巻き込んで手戻りが生じるもの1件につき1エントリ」）に従い、密接に関連する内容は
1件のログにまとめてもよい（例: 予算・期限・体制は3点セットで1件とする等、SHOULD程度の
柔軟性を認める）。

ヒアリングが完了したら、`.claude/skills/decision-check/SKILL.md`（`decision-check`）を
呼び出しGZ0の分母充足状況（9/9か）を確認することを推奨する。

## 運用設計向け追加ヒアリング項目（04文書6.3節、8.4節、MUST）

条件B相当の決定（運用項目コードM2/B5/M10）が生じた際、追加で次の5項目をヒアリングする。
「対象カテゴリ」ではなく「運用項目コード」で記録する。

1. 重大インシデント発生時の一次対応者・エスカレーション先
2. 事業影響の判断基準
3. 対外報告義務の有無と、報告先・期限
4. 本番変更の最終承認者
5. データ廃棄・システム廃止の判断トリガとなる条件（法定保存期間の満了、契約終了等）

`new-decision.js`は`--ops-code=M2|B5|M10`と`--ops-hearing='{"escalation":...,
"businessImpactCriteria":...,"externalReporting":...,"prodChangeApprover":...,
"disposalTrigger":...}'`（JSON文字列）を受け取ると、上記5項目を本文に構造化して
出力する。`decision-check`はこの5項目の見出し文言の有無を機械的にチェックする
（5項目すべて記載されて初めて「ヒアリング充足」とみなす）ため、**5項目すべてに
回答を得てから起票すること（MUST）**。一部が「該当なし」であっても、その旨を明記した
上で該当のキーに文言を入れること（空文字列のままにしない）。

## Task境界からの直接起票（8.2.4節、MAY）

`orchestrate`が決定ブロックのテキストをそのまま引数として渡す場合、ヒアリングを省略し
直接起票してよい。決定ブロックは次の形式（`orchestrate`が委譲プロンプトで指示する形式）。

```
## 決定ブロック
1. 決定内容: ...
   不可逆度: 高 | 中 | 低
   理由: ...
   対象カテゴリ / 関連HB-ID: ...（該当する場合）
```

この場合、`decide`実行者（orchestrateまたはPM経由で起票を担うエージェント）は決定ブロックの
各項目を`new-decision.js`の引数（`--content`, `--irreversibility`, `--rationale`,
`--category`または`--related-hb`等）にマッピングして直接呼び出す。ヒアリング対話は行わない。

## decision-warnings.jsonの消し込み（8.2.5節、MUST）

上記「new-decision.js の呼び出し例」節を参照。実装は`.claude/lib/warnings-store.js`
（読み書き共通処理）と各スクリプトの消し込みロジックに分離されている。

## ツール権限

`Write`は`decisions/**`のみに限定される（`role-boundary-guard.js`が強制、7.1.2節。
M3で実装、それまでは強制されないため実行者が自律的にパスを守ること）。`Read`, `Grep`,
`Bash`（同梱スクリプトの実行のため）も使用する。

## 動作確認済みの事項（M1）

- `process-option.js`による標準/前倒し両モードの起票と`.claude-state/process-option.json`への鏡付けを確認済み
- `new-decision.js`によるZone0の9カテゴリ全件起票、ID自動採番（0000を除く連番）を確認済み
- HB-ID単位の`対象スロット`フィールドによる4スロット充足の記録・集計を確認済み
- 運用ヒアリング5項目の構造化記録を確認済み
- `decision-warnings.json`の明示的消し込み（`--resolve`）・自動近接一致消し込みの両方を確認済み

詳細な確認手順・結果はPMへの報告（本タスクの最終回答）を参照。
