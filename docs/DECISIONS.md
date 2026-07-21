# 設計判断ログ

重要な技術判断や仕様変更理由を、ADRに近い簡潔な形式で記録する。軽微な修正は `docs/WORKLOG.md` のみでよい。

## 2026-07-21 Workers Static AssetsでSPAとAPIを同居

### 背景

仕様書ではCloudflare PagesまたはWorkers Static Assetsを選択するとされている。初期段階では、React SPAとWorker APIを不要に分散させず、無料枠内で扱いやすい構成にしたい。

### 検討した選択肢

- Cloudflare Pages + Pages Functions
- Cloudflare Workers + Workers Static Assets
- フロントエンドとAPIを別サービスに分離

### 決定

Cloudflare Workers Static AssetsでReact SPAとWorker APIを同じWorkerにまとめる。

### 理由

- `wrangler.jsonc` で静的アセットとWorker APIを一体管理できる。
- `/api/*` のみWorkerを先に通し、それ以外はSPAとして扱いやすい。
- サービスを分散させず、初期MVPの運用が単純になる。

### 影響

- `dist/client` を静的アセットの出力先にする。
- Worker entryは `worker/index.ts` とする。
- Cloudflare上の実リソース作成後にD1/R2のIDやbucket名を調整する。

### 将来の見直し条件

- Pages固有のプレビューやデプロイ運用が必要になった場合。
- Workers Static Assetsの制限がMVP要件に合わないと判明した場合。

## 2026-07-21 Docker中心の開発環境を採用

### 背景

依頼ではローカルPCへNode.jsや依存関係を直接入れず、Dockerコンテナ内で開発できることが求められている。

### 検討した選択肢

- ホストNode.jsで直接開発
- Docker Composeのみ
- Docker Compose + Dev Container

### 決定

Docker Composeを標準とし、VS Code利用者向けにDev Containerも用意する。

### 理由

- ホスト側の前提をGit、Docker、Docker Compose、エディタに限定できる。
- `node_modules` をDocker volumeに保持できる。
- Codexの作業環境と利用者の作業環境を揃えやすい。

### 影響

- READMEとCodex指示書ではDocker内コマンドを標準にする。
- 依存関係インストール、Lint、型チェック、テスト、ビルドはコンテナ内で実行する。

### 将来の見直し条件

- CI環境やCloudflare公式テンプレートとの整合で構成変更が必要になった場合。

## 2026-07-21 Worker API基盤は小さな独自ルーターで開始

### 背景

今後、認証、家庭、タスク、買い物などのAPIが増えるため、`worker/index.ts` に処理を集中させない構成が必要になった。一方で、現段階のAPI数は少なく、大きなWebフレームワークを導入すると依存と学習コストが増える。

### 検討した選択肢

- `switch` ベースの小さな独自ルーター
- Hono
- その他のWorkers対応フレームワーク

### 決定

MVP初期は小さな独自ルーターで開始し、`worker/app.ts`、`routes`、`middleware`、`lib`、`repositories`、`services` に責務を分離する。

### 理由

- 現在のAPI規模では独自ルーターで十分に読みやすい。
- 追加依存なしでWorkerの起動とビルドを単純に保てる。
- 今後、パスパラメータやミドルウェアが増えて複雑化した場合にHonoへ移行しやすい構造にできる。

### 影響

- `GET /api/health`、`POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me` を同じレスポンス形式で扱う。
- APIバージョニングは導入せず、MVPでは `/api` プレフィックスに統一する。

### 将来の見直し条件

- 動的パス、ネストしたミドルウェア、ルート数が増えて `switch` が読みにくくなった場合。
- 型安全なルーティングやOpenAPI生成が必要になった場合。

## 2026-07-21 入力検証は追加依存なしの独自ユーティリティで開始

### 背景

全APIで入力検証を共通化する必要がある。ZodやValibotは型推論やエラー整形に強いが、現段階では検証対象が少なく、依存を増やすほどの複雑さではない。

### 検討した選択肢

- Zod
- Valibot
- 独自の小さなバリデーション関数

### 決定

MVP初期は独自の小さなバリデーション関数を採用する。

### 理由

- Cloudflare Workersで追加設定なしに動作する。
- 外部入力を `unknown` として受け、検証後に型付き入力へ変換できる。
- 日本語エラーメッセージを共通レスポンスへ直接変換しやすい。
- バンドルサイズと依存管理を増やさない。

### 影響

- 認証APIではJSON Body、必須項目、メール形式、文字列長、不要プロパティの扱いを検証する。
- 不要プロパティはMVPでは無視し、保存やレスポンスには含めない。

### 将来の見直し条件

- フォームやAPI入力が増え、スキーマ再利用や型推論の恩恵が大きくなった場合。
- フロントエンドとWorkerで同じスキーマを共有したくなった場合。

## 2026-07-21 パスワードハッシュはWeb Crypto PBKDF2-SHA-256を採用

### 背景

Cloudflare Workers上でパスワードを安全に保存するため、ソルト付きのパスワードハッシュ方式が必要になった。SHA-256単体は高速すぎるため採用しない。

### 検討した選択肢

- Web Crypto APIのPBKDF2
- Argon2系ライブラリ
- bcrypt系ライブラリ
- SHA-256単体

### 決定

MVP初期はWeb Crypto APIのPBKDF2-SHA-256を採用する。ハッシュ文字列は `pbkdf2-sha256$iterations$salt$hash` 形式で保存する。

### 理由

- Cloudflare Workers標準のWeb Crypto APIで動作する。
- WASMやNode互換APIへの依存を避けられる。
- ランダムソルトと十分な反復回数を使用できる。
- Vitest上でも技術検証できた。

### 影響

- 現在の反復回数は `120000` とする。
- 無料枠CPU時間と実運用の応答時間を見て、反復回数は後で調整する可能性がある。
- Argon2やbcryptは、Workersでの安定性、WASMサイズ、CPU時間を再評価するまで採用しない。

### 将来の見直し条件

- Workers上で保守性が高くCPU時間も現実的なArgon2id実装を採用できると確認できた場合。
- ログイン処理の実測でPBKDF2の反復回数調整が必要になった場合。

## 2026-07-21 セッションはCookieの生トークンとD1のトークンハッシュで管理

### 背景

ログイン状態を保持しつつ、DB流出時にセッションの生トークンを再利用されないようにする必要がある。

### 検討した選択肢

- D1に生セッショントークンを保存する
- D1にトークンハッシュのみ保存する
- JWTをCookieへ保存する

### 決定

ブラウザへはランダムな生トークンをHttpOnly Cookieで渡し、D1にはSHA-256ハッシュのみ保存する。

### 理由

- サーバー側でログアウトや期限切れ削除を管理できる。
- DBには生トークンを残さない。
- JWTの署名鍵管理や失効リストを持ち込まずに済む。

### 影響

- `sessions.token_hash` を追加する `migrations/0002_auth_foundation.sql` を作成した。
- Cookie名は `house_todo_session`、有効期限は30日、MVPでは期限延長なしとする。

### 将来の見直し条件

- セッションローテーション、端末一覧、強制ログアウトが必要になった場合。
- 高頻度アクセスによりセッション照会の負荷が問題になった場合。

## 2026-07-21 CSRFはSameSite LaxとJSON限定から開始

### 背景

HttpOnly Cookieで認証するため、CSRF対策方針を明確にする必要がある。

### 検討した選択肢

- SameSite=Laxのみ
- SameSite=Lax + JSON限定 + 同一オリジン前提
- CSRFトークン必須

### 決定

MVPの同一オリジン構成では、`SameSite=Lax`、状態変更APIのJSON限定、GETで状態変更しない方針から開始する。

### 理由

- React SPAとWorker APIを同一Worker・同一オリジンで提供する前提に合う。
- `application/json` 以外のBodyを共通バリデーションで拒否できる。
- 初期段階でCSRFトークン管理を過剰に持ち込まない。

### 影響

- 認証APIのPOSTは `Content-Type: application/json` を要求する。
- CORSは不要に広げない。

### 将来の見直し条件

- 別オリジンのフロントエンドを採用する場合。
- 公開範囲が広がり、より強いCSRF耐性が必要になった場合。
- 外部サイトからの誘導や連携APIが増えた場合。
