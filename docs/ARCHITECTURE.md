# アーキテクチャ

## 基本方針

本プロジェクトは、Cloudflare Workers Static Assets を使い、React SPA と Worker API を同じWorkerにまとめる構成を基本とする。無料枠を意識し、不要にサービスを分散させない。

## 現在の構成

```text
Browser / PWA
  |
  | HTTPS
  v
Cloudflare Worker
  |-- Static Assets: React + TypeScript + Vite
  |-- /api/*: Worker API
  |-- D1: relational data
  |-- R2: attachment images
  |-- Cron Triggers: notifications and cleanup
```

## 採用技術

| 用途 | 技術 |
| --- | --- |
| フロントエンド | React |
| 言語 | TypeScript |
| ビルド | Vite |
| API | Cloudflare Workers |
| 静的アセット | Workers Static Assets |
| DB | Cloudflare D1 |
| 画像保存 | Cloudflare R2 |
| 通知 | Web Push / VAPID |
| 定時実行 | Workers Cron Triggers |
| CLI | Wrangler |
| テスト | Vitest |

## Wrangler設定

`wrangler.jsonc` では以下を設定する。

- Worker entry: `worker/index.ts`
- Static assets: `dist/client`
- API routing: `/api/*` はWorkerを先に実行
- SPA fallback: `single-page-application`
- D1 binding: `DB`
- R2 binding: `ATTACHMENTS`
- Cron: 朝9時、夜21時相当のUTC時刻

D1の `database_id` は現在プレースホルダーであり、Cloudflare上でD1を作成した後に置き換える。

## ローカル開発

Docker Compose の `app` サービスで開発する。

- Vite dev server: container `5173`, host `127.0.0.1:5174`
- Wrangler dev: `8787`
- `node_modules` はDocker volumeに保持し、ホスト直下には作らない。
- `.dev.vars` はローカル秘密情報として扱い、Git管理しない。
- Vite dev server は `/api/*` を `worker` service の `8787` へプロキシする。

## API設計方針

- REST形式を基本にする。
- APIパスはMVP段階では `/api` プレフィックスに統一し、バージョニングは導入しない。互換性維持が必要になった時点で `/api/v1` を検討する。
- Worker entryの `worker/index.ts` は起動入口に限定し、`worker/app.ts`、`worker/routes/`、`worker/middleware/`、`worker/lib/`、`worker/repositories/`、`worker/services/` に責務を分ける。
- APIレスポンスは成功時 `{ ok: true, data, requestId }`、失敗時 `{ ok: false, error, requestId }` に統一する。
- エラーコードは `VALIDATION_ERROR`、`UNAUTHENTICATED`、`FORBIDDEN`、`NOT_FOUND`、`CONFLICT`、`RATE_LIMITED`、`INTERNAL_ERROR` を基本にする。
- 全APIで認証確認を行う。
- householdに紐づくAPIでは、必ずユーザーの家庭所属を確認する。
- 入力値検証をWorker側で行う。現段階では追加依存なしの小さな独自バリデーションを採用し、外部入力は `unknown` として受けてから検証する。
- エラーには内部情報を含めない。
- Dashboard APIなど、画面でまとめて必要な情報は集約して返し、不要な複数リクエストを避ける。

## 認証・セッション方針

- ログインIDは正規化済みメールアドレスとする。前後空白を除去し、小文字化する。
- MVPの認証はメールアドレスとパスワードで行う。メール確認、パスワード再設定はMVP後に実装する。
- パスワード要件は12文字以上128文字以内とし、文字種の強制やコピー＆ペースト禁止は行わない。
- パスワード保存はWeb Crypto APIのPBKDF2-SHA-256を使用し、ランダムソルトと反復回数をハッシュ文字列に含める。
- セッションはランダムトークン方式とし、ブラウザへは生トークンをHttpOnly Cookieで渡す。
- D1にはセッショントークンのSHA-256ハッシュのみ保存する。生トークンは保存しない。
- セッション有効期限は30日。MVPではログイン時に新規セッションを発行し、アクセスごとの期限延長やローテーションは行わない。
- Cookie名は `house_todo_session`。本番では `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000` を使用する。
- ローカル開発ではHTTPで確認するため、`APP_ENV=production` の場合だけ `Secure` を付与する。

## CSRF対策方針

- Cookie認証を採用するため、MVPでは `SameSite=Lax` を基本防御とする。
- 状態変更APIでは `Content-Type: application/json` のみ受け付ける。
- GETリクエストで状態変更しない。
- CORSは不要に広げず、同一オリジン構成を基本にする。
- 公開範囲が広がる、別オリジンフロントエンドを採用する、または外部連携が増える場合は、Originヘッダー検証とCSRFトークンを追加検討する。

## DB設計方針

- D1にはユーザー、家庭、タスク、履歴、買い物、通知購読、添付メタデータを保存する。
- 画像本体はD1へ保存しない。
- マイグレーションは `migrations/` へ追加する。
- 既存マイグレーションは原則書き換えない。
- 日付保存はUTCを基本とし、表示と当日判定では家庭のタイムゾーンを使う。
- D1操作はRepository層へ分離する。`UserRepository` はユーザー作成、ID検索、メール検索を担当し、`SessionRepository` はセッション作成、有効セッション検索、削除、期限切れ削除を担当する。
- SQLはD1のbind変数を使用し、ユーザー入力をSQL文字列へ直接連結しない。

## 画像保存方針

- 画像はR2へ保存する。
- R2 bucketは公開しない。
- 画像取得は認証済みWorker APIを経由する。
- ブラウザ側で圧縮し、WebP、長辺1280px程度、最大1MBを目安にする。
- ゲストモードではR2へ保存しない。

## 通知方針

- Web Pushを使用する。
- VAPID秘密鍵はCloudflare Secretsに保存する。
- 朝9時と夜21時の通知を基本とする。
- 通知ログで二重送信を防ぐ。
- 無効購読は削除または無効化する。

## 未確定事項

- 本番用D1 database_id。
- 本番用R2 bucket名。
- Service Worker実装方式。
- Workers Static Assetsのみで進めるか、将来Pagesを併用するか。
- PBKDF2の反復回数は無料枠CPU時間と実測に応じて見直す可能性がある。
