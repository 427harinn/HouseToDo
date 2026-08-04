# アーキテクチャ

## 2026-08-01 Shopping backend architecture

Shopping follows the existing Worker layering.

- Routes: `worker/routes/shopping.ts`
- Services: `ShoppingService`, `ShoppingTemplateService`
- Repositories: `ShoppingItemRepository`, `ShoppingTemplateRepository`
- Migration: `migrations/0005_shopping_foundation.sql`

Routes parse HTTP input and shape responses. Services own household membership checks, input normalization, idempotent purchase/unpurchase behavior, template activity checks, and template-to-item copying. Repositories own D1 SQL and always include `household_id` in household data queries.

Implemented API surface:

```text
GET    /api/shopping/items
POST   /api/shopping/items
GET    /api/shopping/items/:itemId
PATCH  /api/shopping/items/:itemId
DELETE /api/shopping/items/:itemId
POST   /api/shopping/items/:itemId/purchase
POST   /api/shopping/items/:itemId/unpurchase
POST   /api/shopping/items/clear-purchased
GET    /api/shopping/templates
POST   /api/shopping/templates
GET    /api/shopping/templates/:templateId
PATCH  /api/shopping/templates/:templateId
DELETE /api/shopping/templates/:templateId
POST   /api/shopping/templates/:templateId/add
```

`shopping_items` are physically deleted because MVP shopping items are short-lived list entries and no durable purchase history screen exists yet. `shopping_templates` use `active = 0` so repeated-use definitions can be hidden without affecting copied shopping items. Dashboard aggregation adds `shopping.pendingCount` and `shopping.previewItems` without changing existing task fields.

## 2026-07-31 Task backend architecture

Task management now follows the existing Worker layering:

- Routes: `worker/routes/tasks.ts`
- Services: `TaskService`, `DashboardService`
- Repositories: `TaskRepository`, `TaskRecordRepository`
- Shared date helpers: `worker/lib/date-time.ts`

Routes parse HTTP input and shape responses. Services own household membership checks, assignee checks, recurrence validation, target date/week calculation, status merging, idempotency, and conflict handling. Repositories own D1 SQL.

Task definitions are stored in `tasks`. Scheduled weekdays are stored in `task_weekdays`. User actions create `task_records`; missing records are returned as derived `pending`.

Implemented API surface:

```text
GET    /api/tasks
POST   /api/tasks
GET    /api/tasks/:taskId
PATCH  /api/tasks/:taskId
DELETE /api/tasks/:taskId
GET    /api/tasks/today
GET    /api/tasks/week
POST   /api/tasks/:taskId/start
POST   /api/tasks/:taskId/complete
POST   /api/tasks/:taskId/skip
POST   /api/tasks/:taskId/reset
GET    /api/tasks/:taskId/history
GET    /api/dashboard/today
```

Weekly tasks store `target_week_start` and count completed records in that week. D1 partial unique indexes prevent duplicate open weekly `in_progress` and `skipped` rows for the same task/week, while allowing multiple `completed` rows for weekly target counts.

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

- Cookie認証を採用するため、`SameSite=Lax` を基本防御とし、状態変更APIではOrigin検証を行う。
- 対象メソッドは `POST`、`PUT`、`PATCH`、`DELETE` とする。
- 状態変更APIでは `Origin` ヘッダーが必須。`ALLOWED_ORIGINS` に含まれないOrigin、またはOriginなしの状態変更リクエストは `INVALID_ORIGIN` の403で拒否する。
- 状態変更APIでは `Content-Type: application/json` のみ受け付ける。
- ローカル開発の既定許可Originは `http://127.0.0.1:5174`、`http://localhost:5174`、Docker E2E用の `http://app:5173`。本番では `ALLOWED_ORIGINS` に実際のアプリOriginのみを明示する。
- GETリクエストで状態変更しない。
- CORSは不要に広げず、同一オリジン構成を基本にする。
- 将来multipart APIが必要になった場合は、JSON限定とは別の許可条件を個別に設計する。
- 公開範囲が広がる、別オリジンフロントエンドを採用する、または外部連携が増える場合は、CSRFトークンを追加検討する。

## 家庭・メンバー・招待方針

- 家庭は `households`、所属は `household_members`、招待は `household_invites` で管理する。
- 家庭の初期値は `timezone = Asia/Tokyo`、`week_starts_on = 1`。
- 権限は `owner` と `member`。家庭作成者は自動的に `owner` として追加する。
- MVPでは1ユーザー1家庭に制限する。ただしDB上は複数所属可能な構造を維持し、MVP制限はService層で判定する。
- `GET /api/households/current` は家庭未所属を正常なユーザー状態として扱い、`household: null` を200で返す。
- `GET /api/auth/me` はユーザー情報のみを返し、家庭情報は `GET /api/households/current` で取得する。
- 家庭作成時の家庭レコード作成とowner追加はD1 `batch` でまとめる。
- 今後の家庭内APIでは、認証と家庭所属確認を分ける。認証は `requireAuth`、家庭所属と権限は `HouseholdService.requireCurrentHousehold` / `requireHouseholdRole` を使う。
- memberは家庭情報の参照とメンバー一覧取得ができるが、家庭設定更新と招待発行はownerだけができる。
- 招待コードは暗号学的乱数から生成したURL-safe文字列を使用し、有効期限は24時間、使用回数は1回とする。
- D1には招待コードのSHA-256ハッシュのみ保存し、平文コードは作成直後のレスポンスでのみ返す。
- 招待の同時利用は `used_at IS NULL` 条件付き更新で1回だけ使用済みにする。
- DB上の主な一意性は `household_members(household_id, user_id)` と `household_invites(code_hash)`。

## DB設計方針

- D1にはユーザー、家庭、タスク、履歴、買い物、通知購読、添付メタデータを保存する。
- 画像本体はD1へ保存しない。
- マイグレーションは `migrations/` へ追加する。
- 既存マイグレーションは原則書き換えない。
- 日付保存はUTCを基本とし、表示と当日判定では家庭のタイムゾーンを使う。
- D1操作はRepository層へ分離する。`UserRepository` はユーザー作成、ID検索、メール検索を担当し、`SessionRepository` はセッション作成、有効セッション検索、削除、期限切れ削除を担当する。家庭関連は `HouseholdRepository`、`HouseholdMemberRepository`、`HouseholdInviteRepository` に分ける。
- SQLはD1のbind変数を使用し、ユーザー入力をSQL文字列へ直接連結しない。

## PBKDF2ローカル計測

2026-07-21時点のWrangler devローカル計測では、認証API経由のPBKDF2-SHA-256処理時間は以下だった。パスワード値は出力していない。

```text
ハッシュ生成を含む登録API: 495.9ms、497.7ms、41.9ms、118.7ms
照合を含むログインAPI: 34.2ms、32.5ms、31.6ms
```

これはWrangler dev、ローカルD1、PowerShell `Invoke-WebRequest` を含むAPI往復時間であり、本番Cloudflare Workers上の性能を保証するものではない。初回または起動直後はばらつきが大きいため、反復回数を変更する場合は本番に近い環境で再計測する。

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
- MVPの1ユーザー1家庭制限をService層だけで完全に同時実行防止できるか。将来の複数家庭対応と、MVP期間だけの一意インデックス追加のトレードオフを継続検討する。
## 2026-07-21 フロントエンド基盤

今回、既存Worker APIを操作するReactフロントエンドを追加した。

- `src/api/client.ts`: 共通APIクライアント。`credentials: "include"`、JSON Content-Type、共通レスポンス解析、APIエラー型、ネットワークエラーを扱う。
- `src/api/auth.ts`: 登録、ログイン、ログアウト、ログイン状態確認。
- `src/api/households.ts`: 現在の家庭取得、家庭作成、招待コード参加、メンバー一覧、招待コード発行。
- `src/types.ts`: 認証、家庭、メンバー、招待コード、画面状態のフロント側型。
- `src/components/ui.tsx`: Button、FormField、TextInput、PasswordInput、Card、PageHeader、LoadingScreen、ErrorMessage、SuccessMessage、EmptyState、MemberAvatar、BottomNavigation、GuestBanner。
- `src/App.tsx`: 軽量ルーティング、認証ガード、家庭所属ガード、ログイン/登録/ゲスト/オンボーディング/家庭作成/招待参加/仮ホーム/メンバー管理画面。
- `src/styles.css`: デザイントークン、フォーム、カード、下部ナビ、モバイル幅のレイアウト。

ルーティングはReact Routerを導入せず、`window.history`と内部状態で開始した。今回の必須画面数では十分であり、将来ルート数やネストが増えた段階でルーター導入を再検討する。
## 2026-07-31 Task frontend architecture

The task UI keeps the existing lightweight `window.history` routing instead of adding React Router.

- API clients live in `src/api/tasks.ts` and `src/api/dashboard.ts`.
- Shared display labels live in `src/task-labels.ts`.
- Task screen state is local React state with explicit reloads after create, edit, deactivate, start, complete, skip, and reset.
- Home uses `GET /api/dashboard/today`; task management uses `GET /api/tasks?includeInactive=true`; task detail combines task detail, today/week status, and history APIs.
- Daily and scheduled task actions send `targetDate`. Weekly task actions send `targetWeekStart`, calculated from the household `weekStartsOn`.
- The shopping tab routes to a preparation page and only calls shopping APIs for a minimal connection/count check. Full shopping UI remains deferred.
## 2026-08-04 Shopping frontend architecture

The shopping UI keeps the lightweight `window.history` route parser and React local state model used by the task UI. Shopping screens call `src/api/shopping.ts` only; components do not call `fetch` directly. The list screen loads shopping items, active templates, and household members together so cards can show human-readable added/purchased actors.

Shopping state is refreshed on first display, after create/edit/delete/purchase/unpurchase/template-add/clear operations, by a manual update button, and when `visibilitychange` returns to visible. This supports MVP two-user sharing without WebSocket or polling.

Images and R2 are intentionally not represented as active controls in the UI. Cards are structured so a future image area can be added without changing the item API contract.
