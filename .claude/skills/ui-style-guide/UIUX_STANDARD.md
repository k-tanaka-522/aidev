> 移行元: `.claude/docs/40_standards/41_app/uiux.md`（02文書4.4節、新設Skill `ui-style-guide` へ移管）

# UI/UX 技術標準

## 基本方針

- **ユーザーファースト**: 使いやすさを最優先
- **アクセシビリティ**: WCAG 2.2 AA準拠
- **一貫性**: デザインシステムに従う
- **レスポンシブ**: 主な利用端末を画面分類ごとに決める（例: 現場・一般利用者はスマホ 390px、管理画面は PC 1440px）
- **使い勝手**: 「使い勝手の観点」節に従う

---

## 技術スタック

### 推奨フレームワーク

**Tailwind CSS + daisyUI** (推奨)

```html
<!-- CDN読み込み（プロトタイプ用） -->
<link href="https://cdn.jsdelivr.net/npm/daisyui@4.6.0/dist/full.min.css" rel="stylesheet" />
<script src="https://cdn.tailwindcss.com"></script>
```

**理由**:
- ✅ コンポーネントがすぐ使える
- ✅ プロトタイプ → 実装への移行が楽
- ✅ 日本の行政システムに適したデザイン

---

## デザインシステム

### カラーパレット

#### Primary（メイン）
- **青**: `#3B82F6` (Tailwind blue-500)
- 用途: メインボタン、リンク、アクティブ状態

#### Secondary（サブ）
- **グレー**: `#6B7280` (Tailwind gray-500)
- 用途: サブボタン、無効状態

#### Success（成功）
- **緑**: `#10B981` (Tailwind green-500)
- 用途: 成功メッセージ、完了状態

#### Warning（警告）
- **黄**: `#F59E0B` (Tailwind yellow-500)
- 用途: 注意メッセージ

#### Danger（危険）
- **赤**: `#EF4444` (Tailwind red-500)
- 用途: 削除ボタン、エラーメッセージ

#### Background（背景）
- **明るいグレー**: `#F9FAFB` (Tailwind gray-50)
- 用途: ページ背景

### Tailwind クラス例

```html
<!-- Primary ボタン -->
<button class="btn btn-primary">保存</button>

<!-- Success メッセージ -->
<div class="alert alert-success">
  保存しました
</div>

<!-- Danger ボタン -->
<button class="btn btn-error">削除</button>
```

---

### タイポグラフィ

#### フォント
- **和文**: Noto Sans JP
- **欧文**: Inter

#### サイズ

| 用途 | サイズ | Tailwind クラス | 例 |
|------|--------|-----------------|-----|
| 大見出し | 2rem (32px) | `text-3xl` | ページタイトル |
| 中見出し | 1.5rem (24px) | `text-2xl` | セクションタイトル |
| 小見出し | 1.25rem (20px) | `text-xl` | サブセクション |
| 本文 | 1rem (16px) | `text-base` | 通常テキスト |
| 小 | 0.875rem (14px) | `text-sm` | 補足テキスト |

#### フォントウェイト

| 用途 | ウェイト | Tailwind クラス |
|------|----------|-----------------|
| 見出し | Bold (700) | `font-bold` |
| 本文 | Regular (400) | `font-normal` |
| 補足 | Regular (400) | `font-normal` |

---

### 余白（Spacing）

#### 基本単位: 0.25rem (4px)

| サイズ | 値 | Tailwind クラス | 用途 |
|--------|-----|-----------------|------|
| XS | 0.25rem (4px) | `p-1`, `m-1` | 最小余白 |
| S | 0.5rem (8px) | `p-2`, `m-2` | 小余白 |
| M | 1rem (16px) | `p-4`, `m-4` | 標準余白 |
| L | 2rem (32px) | `p-8`, `m-8` | 大余白 |
| XL | 3rem (48px) | `p-12`, `m-12` | 特大余白 |

#### 推奨パターン

```html
<!-- カード -->
<div class="card bg-base-100 shadow-xl">
  <div class="card-body">  <!-- デフォルト: p-8 -->
    コンテンツ
  </div>
</div>

<!-- セクション間 -->
<section class="mb-8">
  セクション1
</section>
<section class="mb-8">
  セクション2
</section>
```

---

## コンポーネント

### ボタン

#### 基本ボタン

```html
<!-- Primary -->
<button class="btn btn-primary">保存</button>

<!-- Secondary -->
<button class="btn btn-secondary">キャンセル</button>

<!-- Danger -->
<button class="btn btn-error">削除</button>

<!-- Ghost（背景なし） -->
<button class="btn btn-ghost">戻る</button>
```

#### サイズ

```html
<!-- Large -->
<button class="btn btn-lg btn-primary">大きいボタン</button>

<!-- Default -->
<button class="btn btn-primary">通常ボタン</button>

<!-- Small -->
<button class="btn btn-sm btn-primary">小さいボタン</button>
```

#### 無効状態

```html
<button class="btn btn-primary" disabled>無効</button>
```

---

### フォーム

#### テキスト入力

```html
<div class="form-control">
  <label class="label">
    <span class="label-text">氏名 <span class="text-error">*</span></span>
  </label>
  <input type="text" placeholder="山田 太郎" class="input input-bordered" required />
  <label class="label">
    <span class="label-text-alt">姓と名をスペースで区切ってください</span>
  </label>
</div>
```

#### セレクトボックス

```html
<div class="form-control">
  <label class="label">
    <span class="label-text">都道府県</span>
  </label>
  <select class="select select-bordered">
    <option disabled selected>選択してください</option>
    <option>東京都</option>
    <option>大阪府</option>
  </select>
</div>
```

#### チェックボックス

```html
<div class="form-control">
  <label class="label cursor-pointer">
    <span class="label-text">利用規約に同意する</span>
    <input type="checkbox" class="checkbox" />
  </label>
</div>
```

---

### テーブル

```html
<div class="overflow-x-auto">
  <table class="table table-zebra w-full">
    <thead>
      <tr>
        <th>ID</th>
        <th>氏名</th>
        <th>メールアドレス</th>
        <th>操作</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1</td>
        <td>田中 太郎</td>
        <td>tanaka@example.com</td>
        <td>
          <button class="btn btn-sm btn-primary">詳細</button>
        </td>
      </tr>
    </tbody>
  </table>
</div>
```

---

### アラート

```html
<!-- Success -->
<div class="alert alert-success">
  <svg>...</svg>
  <span>保存しました</span>
</div>

<!-- Error -->
<div class="alert alert-error">
  <svg>...</svg>
  <span>エラーが発生しました</span>
</div>

<!-- Warning -->
<div class="alert alert-warning">
  <svg>...</svg>
  <span>注意: 保存されていない変更があります</span>
</div>
```

---

### モーダル

```html
<!-- モーダルボタン -->
<button class="btn" onclick="my_modal.showModal()">モーダルを開く</button>

<!-- モーダル -->
<dialog id="my_modal" class="modal">
  <div class="modal-box">
    <h3 class="font-bold text-lg">確認</h3>
    <p class="py-4">本当に削除しますか？</p>
    <div class="modal-action">
      <form method="dialog">
        <button class="btn btn-ghost">キャンセル</button>
        <button class="btn btn-error">削除</button>
      </form>
    </div>
  </div>
</dialog>
```

---

## レイアウト

### ページレイアウト

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ページタイトル</title>
  <link href="https://cdn.jsdelivr.net/npm/daisyui@4.6.0/dist/full.min.css" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
  <!-- ヘッダー -->
  <div class="navbar bg-base-100 shadow-md">
    <div class="flex-1">
      <a class="btn btn-ghost text-xl">アプリ名</a>
    </div>
    <div class="flex-none">
      <ul class="menu menu-horizontal px-1">
        <li><a>メニュー1</a></li>
        <li><a>メニュー2</a></li>
      </ul>
    </div>
  </div>

  <!-- メインコンテンツ -->
  <div class="container mx-auto p-8">
    <h1 class="text-3xl font-bold mb-6">ページタイトル</h1>

    <!-- コンテンツ -->
    <div class="card bg-base-100 shadow-xl">
      <div class="card-body">
        コンテンツ
      </div>
    </div>
  </div>

  <!-- フッター -->
  <footer class="footer footer-center p-4 bg-base-300 text-base-content mt-8">
    <aside>
      <p>Copyright © 2025 - All rights reserved</p>
    </aside>
  </footer>
</body>
</html>
```

---

### グリッドレイアウト

```html
<!-- 2カラム -->
<div class="grid grid-cols-2 gap-4">
  <div class="card bg-base-100 shadow-xl">カラム1</div>
  <div class="card bg-base-100 shadow-xl">カラム2</div>
</div>

<!-- 3カラム -->
<div class="grid grid-cols-3 gap-4">
  <div class="card bg-base-100 shadow-xl">カラム1</div>
  <div class="card bg-base-100 shadow-xl">カラム2</div>
  <div class="card bg-base-100 shadow-xl">カラム3</div>
</div>

<!-- レスポンシブ（スマホ1列、タブレット2列、PC3列） -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <div class="card bg-base-100 shadow-xl">カラム1</div>
  <div class="card bg-base-100 shadow-xl">カラム2</div>
  <div class="card bg-base-100 shadow-xl">カラム3</div>
</div>
```

---

## アクセシビリティ

### WCAG 2.2 AA 準拠

#### カラーコントラスト

**最低要件**: 4.5:1 (通常テキスト), 3:1 (大きいテキスト)

✅ **OK**:
- 黒 (#000000) on 白 (#FFFFFF): 21:1
- 濃い青 (#2563EB、Tailwind blue-600) on 白 (#FFFFFF): 5.2:1

❌ **NG**:
- 薄いグレー (#CCCCCC) on 白 (#FFFFFF): 1.6:1
- 青 (#3B82F6、Primary) on 白 (#FFFFFF): 3.7:1。通常の文字には足りない（24px 以上、または太字 18.66px 以上の大きい文字なら 3:1 で可）。白い文字を Primary の上に置くときも同じ

> 2026-10-07 訂正: 旧版は「青 (#3B82F6) on 白: 4.6:1」を OK の例に挙げていたが、計算では 3.68:1 である（ux-review の機械検査で判明）。

#### 押せる範囲（2.5.8）

24×24 CSS px 以上、または間隔の例外を満たす。推奨基準（44px）は「使い勝手の観点」節の「押せる範囲」を見る。

#### aria属性

```html
<!-- ボタン -->
<button aria-label="ユーザーを削除" onclick="deleteUser()">
  <svg>...</svg>
</button>

<!-- フォーム -->
<input type="text" aria-label="検索キーワード" placeholder="検索..." />

<!-- リンク -->
<a href="/help" aria-label="ヘルプページを開く">
  <svg>...</svg>
</a>
```

#### キーボード操作

```html
<!-- Tab キーでフォーカス可能 -->
<button class="btn btn-primary" tabindex="0">ボタン</button>

<!-- フォーカスインジケーター -->
<button class="btn btn-primary focus:ring-2 focus:ring-blue-500">
  ボタン
</button>
```

---

## レスポンシブデザイン

### 方針

- **スマホが主の画面**: 現場の業務ユーザーが日々使う画面と、一般利用者の申込み・公開ページは、390px で先に作って確かめる（片手で使う前提）
- **PC が主の画面**: 運営・管理者の画面は 1440px で確かめる。スマホが主の画面も PC で崩れないことは確かめる
- 確かめる幅は 390px と 1440px。390px で横にはみ出さない（document の scrollWidth が clientWidth を超えない）

### ブレークポイント

| デバイス | 幅 | Tailwind プレフィックス |
|----------|-----|------------------------|
| スマートフォン | < 768px | (なし) |
| タブレット | 768px - 1023px | `md:` |
| PC | ≥ 1024px | `lg:` |

### 例

```html
<!-- スマホ: 1列、タブレット以上: 2列 -->
<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div>カラム1</div>
  <div>カラム2</div>
</div>

<!-- スマホ: 小ボタン、タブレット以上: 通常ボタン -->
<button class="btn btn-sm md:btn-md btn-primary">
  ボタン
</button>
```

---

## パフォーマンス

### 画像最適化

```html
<!-- WebP形式推奨 -->
<img src="image.webp" alt="画像説明" class="w-full" loading="lazy" />

<!-- フォールバック -->
<picture>
  <source srcset="image.webp" type="image/webp">
  <img src="image.jpg" alt="画像説明" class="w-full">
</picture>
```

### Lazy Loading

```html
<img src="image.jpg" alt="画像説明" loading="lazy" />
```

---

## ブラウザサポート

### 対応ブラウザ

- ✅ Chrome (最新版)
- ✅ Firefox (最新版)
- ✅ Safari (最新版)
- ✅ Edge (最新版)
- ❌ IE11 (非対応)

---

## 使い勝手の観点

ハリボテを作る・直すときに designer が守り、`prototypes:ux-review`（ux-reviewer）がレビューで見る基準。進め方（機械検査・シナリオ・検証・重大度）は `prototypes/.claude/skills/ux-review/SKILL.md` が正本。

### 画面の分類と重み

| 分類 | 主な幅 | 主に見るもの |
|---|---|---|
| 業務ユーザーのスマホ（現場の担当者が日々使う画面） | 390px | 片手で届くか・業務の頻度に沿った並び |
| 一般利用者の申込み（申込み・予約の画面、公開ページ） | 390px | フォームと、申込みが確定したことの分かりやすさ |
| PC の管理画面（運営・管理者・取引先の画面） | 1440px | グルーピングと一覧での比較 |

重み: ◎ 必須 ／ ○ 通常 ／ △ 軽く。並びは「業務ユーザーのスマホ／一般利用者の申込み／PC の管理画面」。画面分類は案件ごとに見直してよい（決定ログに残す）。この表を変えるときは ux-review の SKILL.md の表も同じに直す。

| 観点 | 重み | 守ること |
|---|---|---|
| A タスクの完遂 | ◎／◎／○ | 目的まで行き着ける。行き止まり・戻れない画面を作らない |
| B 業務の頻度に沿った並び・段階的に見せる | ◎／○／◎ | 毎日使う操作を最初の画面に、まれな設定は奥に。最初から全部を見せない |
| C 片手で届くか・押せる大きさ | ◎／◎／△ | 押せる範囲は 44px 以上（下の「押せる範囲」）。毎日の主な操作は画面の中ほど〜下に置き、上の隅に置くものは大きく。危険な操作はほかの操作から離す |
| D 視覚の階層と視線 | ◎／◎／○ | 最初に目に入る3つを、その画面の目的と主な操作にする。見出しを拾い読みして中身が分かるようにする（F 型の読み方） |
| E グルーピング | ○／○／◎ | 関係するものは近く・同じ枠・同じ見た目に、関係しないものは離す（近接・枠・類似） |
| F フォーム | ○／◎／○ | 項目は最小限。必須と任意を明示する。ラベルは入力欄の上。入力の型（type・inputmode・autocomplete）を合わせる。入力中・離れたときに検証する。一般利用者に不要な会員登録をさせない |
| G 状態とフィードバック | ◎／◎／○ | 読み込み中・空・エラー・完了の各状態を作る。押したら何が起きたか分かるようにする |
| H エラー防止と取り消し | ◎／◎／◎ | 取り返しのつかない操作の前に確認を出す。できるものは取り消せるようにする。間違えにくい選択肢にする |
| I 利用者の言葉か | ◎／◎／○ | 専門用語・社内の言葉を使わない（「文言」節） |
| J 画面をまたぐ一貫性 | ○／○／◎ | 同じ操作は同じ言葉・同じ位置・同じ見た目にする |
| K 情報の密度・一覧での比較・一括操作 | △／△／◎ | 一覧で並べて比べられる。並べ替え・絞り込み・まとめての操作を用意する |
| L 信頼と安心 | △／◎／△ | 一般利用者に提供者の情報・料金・取消の決まり・個人情報の使い道を見せる。確定したら確定と連絡の案内を出す |
| M 既存の規約 | ○／○／○ | 本書のアクセシビリティ（コントラスト・押せる範囲）とレスポンシブの各節。機械検査（ux-review の `check.js`）で確かめる |

### 押せる範囲

- **最低（WCAG 2.2 SC 2.5.8、AA）**: 24×24 CSS px 以上。小さいときは、24px の円（中心は押せる範囲の中心）がほかの押せるものに重ならない間隔を取る。文中のリンクは例外
- **推奨基準**: スマホで使う画面の操作は 44×44 CSS px 以上（WCAG 2.5.5 AAA・Apple HIG と同じ値）。チェックボックス・ラジオは、ラベルまで含めて押せるようにして 44px を満たす
- 危険な操作（削除・解約・停止・OFF 等）は、ほかの操作から 8px 以上離し、確認を出す

---

## 文言

画面の見出し・説明・ボタン・案内文は、簡潔で伝わりやすい表現にする。読み手の多くはスマホで操作する業務ユーザー・一般利用者で、長い言い回しは読まれない。

- 同じ意味なら短い言葉を選ぶ（例: 「最初から最後まで」→「全て」）
- 1文に言いたいことは1つ。長い文は分ける
- 簡潔にしても優しさは残す。命令口調・突き放す言い方にしない（「〜してください」「〜できます」の丁寧さは保つ）
- 専門用語・社内の言葉は使わず、利用者の言葉で書く

### チェックリスト（文言）

- [ ] 同じ意味のもっと短い言い方がないか
- [ ] 短くしすぎて冷たく・不親切になっていないか

---

## テスト

### チェックリスト

- [ ] カラーコントラスト 4.5:1 以上
- [ ] キーボード操作可能
- [ ] スクリーンリーダー対応
- [ ] レスポンシブ確認（390px と 1440px。390px で横にはみ出さない）
- [ ] 押せる範囲 24px 以上（2.5.8）、スマホの操作は 44px 以上
- [ ] 使い勝手のレビュー（`prototypes:ux-review`）で仮 S4・S3 が無い
- [ ] 実機テスト（iOS Safari、Android Chrome）

### ツール

- **Lighthouse**: パフォーマンス・アクセシビリティ測定
- **axe DevTools**: アクセシビリティチェック
- **WAVE**: WCAG準拠チェック

---

