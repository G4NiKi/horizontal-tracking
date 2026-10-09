# 水平トラッキング練習

FPS のエイム練習用に、マウスを水平に往復させる練習へ特化したブラウザツール。軌跡のズレ方からクセを推定し、姿勢や構えのアドバイスを表示する。

## 構成

```
index.html          ページ本体
css/style.css
js/analysis.js      ストローク分割・指標計算・アドバイス判定(DOM 非依存の純粋ロジック)
js/app.js           描画・入力・画面更新
js/pictograms.js    アドバイスに添える図(インライン SVG)
js/sensitivity.js   VALORANT 感度から画面上の移動量への換算
test/               node --test によるテスト
```

ビルド不要の静的サイト。外部依存は Google Fonts のみ。

## ローカルで動かす

ES Modules を使っているため、`file://` では開けない。ローカルサーバー経由で開く。

```sh
npm run serve        # または python3 -m http.server
```

## テスト

```sh
npm test
```

Node.js 18 以上が必要。依存パッケージはない。

## GitHub Pages で公開する

1. GitHub にリポジトリを作って push する
2. リポジトリの Settings → Pages → Build and deployment で、Source を「Deploy from a branch」、Branch を `main` / `/ (root)` にする
3. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される

パスはすべて相対パスなので、サブパスでもそのまま動く。GitHub Pages は HTTPS 配信のため Pointer Lock も使える。
