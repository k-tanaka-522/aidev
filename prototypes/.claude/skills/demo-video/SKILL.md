---
name: demo-video
description: ハリボテ（または dev の実画面）を Playwright のスクリプトで録画し、カーソル・波紋・ズーム・日本語字幕つきの製品デモ動画（MP4/WebM/ポスター）を作る。UI を変えたときの撮り直しにも使う。
argument-hint: "[対象の流れ名 or 再生成]"
---

# demo-video（製品デモ動画の作成・撮り直し）

> 由来: salon-booking-platform で確立した手順を一般化した。
> 記述系文書ではない。動画は「UI が変わったら撮り直す」生成物であり、手で編集しない（MUST NOT）。

## 責務

1. 録画スクリプトを `prototypes/demo/` に置き、`node` 1コマンドで再生成できる状態を保つ
2. UI（ハリボテ・実画面）を変えたら、スクリプトのセレクタと字幕を直して撮り直す
3. 動画・ポスターを入口ページの `<video>` に載せる（自動再生は prefers-reduced-motion で止める）

## 場所

- 録画スクリプト: `prototypes/demo/record-<流れ名>-demo.mjs`（流れごとに別ファイル）
- 出力: `prototypes/demo/<流れ名>-demo.mp4`（配信用）／`.webm`（予備）／`<流れ名>-demo-poster.png`
- 使う画面は `prototypes/*.html` をそのまま `file://` で開く（サーバ不要）

## 手順（MUST）

```
1. Playwright を npx キャッシュに入れる（初回のみ。package.json には依存を足さない）:
     npx -y playwright@<固定の版> --version
   Chromium が無ければ: npx -y playwright@<固定の版> install chromium
2. MP4 化用の ffmpeg を「リポジトリ外」に入れる（初回のみ。例: OS の一時ディレクトリで npm i ffmpeg-static）
   （Playwright 同梱の ffmpeg は VP8 専用で MP4 が作れない）
3. 録画（所要 約2〜3分。VP9 の書き出しが遅い）:
     node prototypes/demo/record-<流れ名>-demo.mjs < /dev/null
   バックグラウンドで回すときは必ず < /dev/null（stdin を閉じないとハングする）
4. 出力を確認する（長さ・サイズ・字幕・カーソル）。ffmpeg のフレーム抜き出しで数枚を Read して見る
5. 入口ページの <video> が新しいファイルを指していることを確認し、スマホ幅でスクショを撮る
```

## 演出の入れ方（実際にうまくいったやり方）

- **すべてページへの注入**（`context.addInitScript`）。ffmpeg は MP4 変換と倍速化だけに使う。ズームを ffmpeg の zoompan でやらない（ガクつく）
- **カーソル**: `position:fixed; pointer-events:none` の要素を `html` 直下に置く。スマホ UI なら既定は「指の丸」。mousedown で縮み、波紋が広がる
- **動かし方**: `page.mouse.move` を自前の補間（ease-in-out、20ms 刻み）で連続して呼んでから down/up。`steps` オプションだけでは時間が空かず飛んで見える
- **ズーム**: `body` に `transform: scale()` と `transform-origin`（ページ座標）。カーソルと字幕は `html` 直下なので動かない。`position:fixed` のシート内は `body` の transform の影響を受けるので、ボトムシートを出している場面ではズームしない
- **字幕**: ページ内の DOM（日本語フォントの問題を避ける）。画面上部に固定。ページ遷移で消えるので、遷移後に再表示する
- **スワイプ**: 実際のポインタ操作（down → move → up）で撮る
- CSP のある実画面は `newContext({ bypassCSP: true })` と `element.style` 直当てで注入する
- **見せ場の演出**（吸い込み・ポンと完成・キラキラ等）は、録画中のページに CSS keyframes と少量の JS を注入して作る。ハリボテ本体の HTML・CSS は触らない。外部ライブラリは不要

## 出力設定

- **録画**: viewport 390×844、`recordVideo.size` も同じ（recordVideo は CSS ピクセルで撮り、size を大きくしても拡大されず左上に小さく写る）。VP8・約1Mbps 固定のため、書き出し時に 2 倍へ lanczos 拡大
- **高画質版**: `page.screencast.start({ onFrame, size: {W*2, H*2}, quality: 92 })` で JPEG フレームを受け取ると `deviceScaleFactor: 2` の実解像度で撮れる（Playwright 1.59 以降）。フレームは変化時のみ届く（可変フレームレート）ため、タイムスタンプから concat デマクサの `duration` を作り `-vf fps=30` で固定 fps に複製する
- **MP4**: `-c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p -movflags +faststart -an`、WebM は `libvpx-vp9 -crf 36 -b:v 0`。目安 1〜3MB
- **長さ**: 10〜30秒。待ちが長いときは倍速化（既定 1.25）で収める。字幕は1つ約2秒以上出す
- 録画の待機は「時間」ではなく「要素の出現」を優先する（再現性のため）。データは固定のダミー値

## 入口ページへの載せ方

`<video muted playsinline loop preload="metadata" poster="…">` に MP4 と WebM を並べる。停止ボタン付き。`prefers-reduced-motion: reduce` のときは `play()` を呼ばない（ポスターと「再生する」ボタンのみ）。縦長動画なので `max-height` を付ける。

## UI 変更時の撮り直し

1. セレクタが当たらなくなったらスクリプトを直す
2. 字幕の文言が画面と合っているか確認する
3. 手順 3〜5 を再実行する
4. 本実装後は、対象 URL を dev の実画面に切り替えて撮り直す（資格情報はシークレットストアから、接続先アカウントを確認、保存操作は押さない）

## 注意

- 一時ファイル（ffmpeg-static、生の録画）はリポジトリに入れない
- 動画に実在の店名・社名・個人情報を写さない（モデルは架空名）
- 動画ファイルのコミットは、ポスター画像・MP4・WebM の合計サイズを確認してから
- **AI 生成の写真素材を使う場合**: 実在の店舗・人物と誤認させない（「※画像はイメージです」を常時表示）。指示文には「文字・ロゴ・透かしを入れない」「実在の人物や店に似せない」を入れ、その業界の服装・道具・店内の常識（例: 美容師はエプロンをしない）とコンセプトの雰囲気を先に洗い出して指示に入れる。生成後はコンタクトシートで全点を並べて確認し、浮いた1枚を撮り直す。生成枠の上限で止まったら無理をせず報告する
