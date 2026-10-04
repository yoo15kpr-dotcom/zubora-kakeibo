# ズボラ家計簿

**公開版**: https://yoo15kpr-dotcom.github.io/zubora-kakeibo/ （スマホで開いて「ホーム画面に追加」）

話し言葉（音声または文字）をそのまま入力すると記録される、ズボラ向けの家計簿。
目標金額との差と、ゆるい応援の言葉を表示します。データは端末の `localStorage`（キー `zubora_v1`）にだけ保存します。

## 構成

```
public/            ブラウザで動く部分（静的ファイルだけでも動作）
  index.html
  style.css
  app.js           画面・記録・集計
  parse.js         入力の解釈（amount / dateOf / split / normalize / cat）。DOM 非依存
  sw.js            Service Worker（オフライン用）
  manifest.webmanifest, icons/
lib/receipt.js     レシート画像 → {store, total, date, category}（Anthropic API）
server.js          静的配信 + POST /api/receipt
test/              node:test の単体テスト
```

## 動かし方

```sh
npm install
ANTHROPIC_API_KEY=sk-ant-... npm start   # http://localhost:8787
npm test
```

- `npm install` のときに、端末内の文字認識（Tesseract.js）の部品が `public/vendor/ocr/` にコピーされます（`npm run vendor:ocr` でも可）。
- `public/` だけを静的ホスティングに置いても動きます。その場合も先に `npm install` して `public/vendor/` を含めて置いてください。
- Service Worker は HTTPS か `localhost` でのみ有効です。

### 環境変数

| 変数 | 既定 | 内容 |
|---|---|---|
| `ANTHROPIC_API_KEY` | なし | レシート読み取りに使用。ブラウザには渡りません |
| `PORT` | 8787 | 待ち受けポート |
| `RECEIPT_MODEL` | `claude-sonnet-5-5` | 読み取りに使うモデル |
| `RECEIPT_ACCESS_KEY` | なし | 合言葉。設定するとレシート読み取りに必須になる（日本語可）。**公開するなら設定推奨** |
| `RECEIPT_LIMIT_PER_HOUR` | 30 | IP ごとの1時間あたり上限（合言葉の誤りも数える。プロセス内メモリなので複数台構成では効かない） |
| `CLIENT_IP_HEADER` | なし | 中継サーバーの後ろで動かすとき、利用者の IP が入るヘッダー名。未設定なら接続元アドレスを使う |

### 合言葉

`RECEIPT_ACCESS_KEY` を設定すると、アプリで初めて 📷 を押したときに合言葉を聞かれます（端末ごとに1回だけ）。
`https://<あなたのURL>/#key=<合言葉>` で開くと入力を省けます（読み込んだあと URL からは消えます）。
iPhone ではホーム画面に追加したアプリと Safari の保存領域が別なので、ホーム画面のアプリ側で一度入力してください。

### 中継サーバーの後ろで動かす場合（Render など）

未設定のままだと全員が中継サーバーの同じ IP に見え、回数上限が全員で共有になります。
利用者の IP を入れるヘッダーをサービスの仕様で確認し、`CLIENT_IP_HEADER` に指定してください。

- Render: `true-client-ip`（Render サポートが案内しているとされるヘッダー。公式ドキュメントでは未確認なので、デプロイ後に実際の値を確かめてください）
- 中継サーバーが必ず上書きするヘッダーを指定すること。利用者が自由に付けられるヘッダーを指定すると、IP を偽って上限を回避されます。

## レシート読み取り

読み取り方法は自動で決まります。

| 条件 | 方法 | 費用 |
|---|---|---|
| サーバーに `ANTHROPIC_API_KEY` がある | Anthropic API（下記） | API 利用料 |
| ない（静的ホスティングも含む） | 端末内の文字認識（Tesseract.js、日本語軽量データ） | なし。画像は端末の外に出ない |

端末内の文字認識について:
- 初回だけ部品を読み込みます（端末に合う1つ、約4MB ＋ 日本語データ約2MB）。以後は Service Worker が保存するのでオフラインでも動きます。
- 文字を読んだあと「合計」「お会計」などの行から金額を、日付の書式から日付を探します（`parse.js` の `receiptFromText`）。小計・預り・お釣り・合計点数は除外します。
- 文字認識の前に白黒化・コントラスト強調をします。
- 合計が見つからなければ写真を回転させて読み直します（横長の写真は 90°/270° から）。それでも見つからなければ金額の入力を求めます。
- 確認画面で店名と金額を直せます。
- 精度の確認: 合成画像3枚と実物1枚（向き4通り）。実物はそれ以上確かめていません。

**貼り付けでも読めます**: iPhone のテキスト認識表示や Google レンズでコピーしたレシートの文字を入力欄に貼ると、「合計」などの言葉と数字が3つ以上ある場合はレシートとして確認画面を出します。

## レシート読み取り API

`GET /api/receipt` → `{"enabled": true|false, "locked": true|false}`（📷 ボタンの表示と、合言葉が必要かの判定）

`POST /api/receipt`
```json
{ "image": "<base64。data: 接頭辞なし>", "mediaType": "image/jpeg" }
```
合言葉ありのときはヘッダー `X-Access-Key: <encodeURIComponent した合言葉>` が必要です。
→ `{ "store": "店名", "total": 1234, "date": "YYYY-MM-DD" | null, "category": "食費|交通|日用品|趣味|固定費|その他" }`

- ブラウザ側で長辺 1568px の JPEG に縮小してから送ります。
- 画像入力 + 構造化出力（JSON スキーマ）で呼び出し、サーバー側で整数化・日付形式・カテゴリを正規化します。
- 安全分類で断られた場合に備え、サーバー側フォールバック（`fallbacks: "default"`）を有効にしています。
- エラー時は `{"error": "bad_request" | "unsupported_type" | "too_large" | "rate_limited" | "unauthorized" | "refused" | "unreadable" | "upstream" | "disabled"}`。

## 今月画面
- ◀▶ で月を切り替えます。記録のある一番古い月まで戻れます（最大5年前）。
- 「バックアップ」で全データを JSON に書き出し／読み込みできます。読み込みは今のデータに足すだけで、同じ記録は増えません。新しい端末（記録が空）に読み込んだときは目標金額も移ります。形の崩れた記録は読み込みません（`public/data.js`）。

## 音声入力

🎤 を押すと、ブラウザの音声認識（Web Speech API、`ja-JP`）で聞き取ってそのまま記録します。
非対応のブラウザや、マイクを使えない画面（埋め込み表示など）では、入力欄にカーソルを置いて「キーボードのマイクで話してね」と案内します（iPhone・Android の標準キーボードの音声入力を使う）。

## 入力の解釈ルール

`test/parse.test.js` に例をそのままテストとして書いています。

- 全角数字は半角化。`円` で区切って1件ずつ（「コンビニ500円 コンビニ1000円」→2件）
- 円なしの数字にも円を補う（「コンビニ500 1000」→2件、名前は引き継ぎ）
- 金額: `1,200` `3千` `1万2千` `15万`
- 名前: 先頭/末尾の「と」「や」「で」「、」を除去。名前なしは「支出」
- 日付語: `明日` `あさって` `N日` `来月N日` `来月` `今日`（後続の項目にも引き継ぐ）
- 繰り返し: `毎月N日` / `隔週` / `毎週`（曜日指定可: 隔週月曜）。登録月以降のみ表示、今月分は未来日でも「使った額」に含める
- カテゴリ: キーワードで自動判定

## GitHub Pages への公開

`gh-pages` ブランチに `public/`（`npm install` 後の `public/vendor/` を含む）をそのまま置いています。API キーを使わない構成なので、サーバーは不要です。

```sh
npm install
npm run publish:pages   # dist-pages/ を作って gh-pages ブランチに push する
```

## 更新時の注意

`public/` のファイルを変えたら `sw.js` の `CACHE` の値（`zubora-v1`）を上げると、古いキャッシュが確実に消えます（ネット優先で取得するので、上げなくてもオンライン時は新しい版が表示されます）。

## 未実装

- 端末間の自動同期（手動のバックアップ書き出し・読み込みで代用）
