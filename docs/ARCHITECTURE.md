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
- 全APIで認証確認を行う。
- householdに紐づくAPIでは、必ずユーザーの家庭所属を確認する。
- 入力値検証をWorker側で行う。
- エラーには内部情報を含めない。
- Dashboard APIなど、画面でまとめて必要な情報は集約して返し、不要な複数リクエストを避ける。

## DB設計方針

- D1にはユーザー、家庭、タスク、履歴、買い物、通知購読、添付メタデータを保存する。
- 画像本体はD1へ保存しない。
- マイグレーションは `migrations/` へ追加する。
- 既存マイグレーションは原則書き換えない。
- 日付保存はUTCを基本とし、表示と当日判定では家庭のタイムゾーンを使う。

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
- パスワードハッシュ方式。
- Service Worker実装方式。
- Workers Static Assetsのみで進めるか、将来Pagesを併用するか。
