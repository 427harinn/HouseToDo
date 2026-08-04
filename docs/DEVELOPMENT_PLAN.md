# 開発計画

## 2026-08-01 Phase 6 backend progress

Completed in this phase:

- Shopping item and shopping template schema migration.
- Shopping item CRUD, purchase, unpurchase, and purchased-item clearing APIs.
- Shopping template CRUD and template-to-item add API.
- Household member authorization for all shopping APIs.
- Dashboard shopping pending count and preview.
- Minimal `/shopping` API connection/count display.

Remaining for later phases:

- Complete shopping list UI and template management UI.
- Images, R2, barcode scanning, prices, stores, categories, inventory, notifications, and production deployment.
- Stronger audit/history model if shopping purchase history becomes important.

## 2026-07-31 Phase 4 backend progress

Completed in this phase:

- Task database foundation migration `0004_task_foundation.sql`.
- Task template CRUD API.
- Daily, scheduled weekday, and weekly task support.
- Today task API.
- Weekly progress API.
- Start, complete, skip, and reset APIs.
- Task history API.
- Dashboard today aggregation API.
- Explicit timezone/date helper tests.
- Worker API tests for core task creation, status sharing, conflict rejection, history, and dashboard aggregation.

Remaining for later phases:

- Full task creation/list/detail UI.
- Drag ordering and sort-order mutation UI.
- Task duplication.
- Attachment and R2 workflows.
- Web Push, Cron notifications, and notification preferences.
- Stronger transaction/serialization strategy for highly concurrent weekly completions.
- Production Cloudflare resources and deployment.

本計画は `docs/PROJECT_SPEC.md` の実装順序を、依存関係に沿って整理したものです。

## Phase 0: 開発土台

### 目的

Codexが継続して安全に開発できる環境と運用ルールを整える。

### 前提条件

- 仕様書と画面ラフが存在する。
- Gitリポジトリが初期化されている。

### 実施する作業

- Docker / Docker Compose / Dev Container を用意する。
- React、TypeScript、Vite、Workers の最小雛形を用意する。
- Lint、型チェック、テスト、ビルドを実行できるようにする。
- README、Codex指示書、作業記録、設計判断ログを作る。

### 作成・変更予定の主なファイル

- `Dockerfile`
- `compose.yaml`
- `.devcontainer/devcontainer.json`
- `package.json`
- `wrangler.jsonc`
- `src/`
- `worker/`
- `docs/CODEX_INSTRUCTIONS.md`
- `docs/WORKLOG.md`
- `docs/DECISIONS.md`

### 完了条件

- Dockerコンテナ内で開発サーバー、Lint、型チェック、テスト、ビルドを実行できる。
- READMEにセットアップ手順がある。
- 作業記録が残っている。

### 確認方法

- `docker compose build`
- `docker compose up`
- `docker compose run --rm app npm run lint`
- `docker compose run --rm app npm run typecheck`
- `docker compose run --rm app npm test`
- `docker compose run --rm app npm run build`

### 次のフェーズへの依存関係

Phase 1以降は、この環境で実行・検証できることを前提にする。

## Phase 1: Cloudflare基盤

### 目的

Workers、D1、R2、環境変数、マイグレーションの基礎を整える。

### 前提条件

- Phase 0が完了している。
- Cloudflareアカウントを用意できる。

### 実施する作業

- Cloudflare Worker名、D1 DB名、R2 bucket名を確定する。
- `wrangler.jsonc` の仮IDを実リソースに置き換える。
- D1マイグレーションをローカルで適用する。
- Worker APIの共通レスポンス、エラー処理、環境型を整える。

### 作成・変更予定の主なファイル

- `wrangler.jsonc`
- `migrations/`
- `worker/`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`

### 完了条件

- `wrangler dev` でWorkerが起動する。
- `/api/health` が応答する。
- ローカルD1へマイグレーションできる。

### 確認方法

- `docker compose run --rm --service-ports app npm run cf:dev`
- `docker compose run --rm app npm run db:migrate:local`

### 次のフェーズへの依存関係

認証、家庭、タスクAPIはD1接続と共通API基盤に依存する。

## Phase 2: 認証とゲストモード

### 目的

実家庭データとゲストデータを分離し、ログイン状態を安全に扱う。

### 前提条件

- Phase 1が完了している。
- セッションSecretのローカル値を用意している。

### 実施する作業

- 登録、ログイン、ログアウト、`/api/auth/me` を実装する。
- Cookieセッションを実装する。
- パスワードハッシュ方式を決定する。
- ゲストモードの一時データ構造を実装する。

### 作成・変更予定の主なファイル

- `worker/routes/auth.ts`
- `worker/lib/session.ts`
- `worker/lib/password.ts`
- `src/`
- `docs/SECURITY.md` または `docs/ARCHITECTURE.md`

### 完了条件

- ログイン、ログアウト、ログイン保持ができる。
- ゲスト操作が実データに影響しない。

### 確認方法

- APIテスト
- ブラウザ操作確認
- Cookie属性確認

### 次のフェーズへの依存関係

家庭グループはログインユーザーとセッションに依存する。

## Phase 3: 家庭グループ

### 目的

二人が同じ家庭に参加できる土台を作る。

### 現在の進捗

2026-07-21時点で、Worker API側の家庭作成、現在の家庭取得、家庭更新、メンバー一覧、招待コード発行、招待参加、家庭所属確認、owner権限確認の最小基盤を実装済み。完成版フロントエンド、タスク、買い物、画像、通知には未着手。

### 前提条件

- Phase 2が完了している。

### 実施する作業

- 家庭作成APIを実装する。
- メンバー管理APIを実装する。
- 招待コード作成、参加APIを実装する。
- APIごとに家庭所属確認を行う。

### 作成・変更予定の主なファイル

- `worker/routes/households.ts`
- `worker/lib/authorization.ts`
- `src/pages/`
- `migrations/`

### 完了条件

- 二人が同じ家庭に参加できる。
- 別家庭データへアクセスできない。

### 確認方法

- APIテスト
- 別ユーザー、別家庭の拒否テスト

### 次のフェーズへの依存関係

タスクと買い物は家庭IDとメンバー権限に依存する。

## Phase 4: タスク管理

### 目的

毎日、曜日指定、週内タスクを作成し、状態変更できるようにする。

### 前提条件

- Phase 3が完了している。

### 実施する作業

- タスクCRUDを実装する。
- 今日と今週の対象タスク判定を実装する。
- 未完了、対応中、完了、パスを実装する。
- 履歴を記録する。
- 日付、週境界、JST/UTC変換をテストする。

### 作成・変更予定の主なファイル

- `worker/routes/tasks.ts`
- `worker/lib/date.ts`
- `worker/lib/tasks.ts`
- `src/pages/tasks/`
- `src/pages/home/`

### 完了条件

- 今日の対象タスクが正しく表示される。
- 完了者と日時が記録される。
- 二重完了を防げる。

### 確認方法

- 単体テスト
- APIテスト
- ブラウザ操作確認

### 次のフェーズへの依存関係

ホーム画面はタスク集計APIに依存する。

## Phase 5: ホーム画面

### 目的

今日の残タスク、今週の進捗、買い物プレビューを一目で確認できるようにする。

### 前提条件

- Phase 4の基本APIが利用できる。

### 実施する作業

- `/api/dashboard/today` と `/api/dashboard/week` を実装する。
- 画面ラフを参考にモバイルファーストUIを作る。
- ボトムナビゲーションを整える。

### 作成・変更予定の主なファイル

- `worker/routes/dashboard.ts`
- `src/pages/home/`
- `src/components/navigation/`

### 完了条件

- iPhone幅で主要情報が読みやすい。
- 不要な複数APIリクエストが発生しない。

### 確認方法

- ブラウザ幅320pxから430pxで確認
- アクセシビリティ確認

### 次のフェーズへの依存関係

買い物プレビューは買い物機能の本実装で拡張する。

## Phase 6: 買い物リスト

### 目的

家庭内で買うものと購入済み状態を共有できるようにする。

### 前提条件

- Phase 3が完了している。

### 実施する作業

- 買い物項目CRUDを実装する。
- テンプレートから追加できるようにする。
- 購入済み、解除、一括削除を実装する。
- 重複追加を制御する。

### 作成・変更予定の主なファイル

- `worker/routes/shopping.ts`
- `src/pages/shopping/`
- `src/components/forms/`

### 完了条件

- 二人で同じ買い物リストを共有できる。
- 購入済みが分かる。

### 確認方法

- APIテスト
- ブラウザ操作確認

### 次のフェーズへの依存関係

画像添付は買い物項目とタスク履歴に依存する。

## Phase 7: 画像添付

### 目的

買い物項目やタスク完了記録へ画像を1枚添付できるようにする。

### 前提条件

- Phase 4または6が完了している。
- R2 bucketが用意されている。

### 実施する作業

- ブラウザ側で画像をWebPへ圧縮する。
- R2へ保存する。
- D1へメタデータを保存する。
- 認証付き画像取得APIを実装する。
- 30日後削除方針を整理する。

### 作成・変更予定の主なファイル

- `worker/routes/attachments.ts`
- `worker/lib/images.ts`
- `src/lib/imageCompression.ts`
- `src/components/image/`

### 完了条件

- R2 bucketを公開せずに画像を表示できる。
- ゲストモードではR2へ保存しない。

### 確認方法

- 画像サイズ、MIMEタイプ、権限確認テスト
- iPhone撮影画像の添付確認

### 次のフェーズへの依存関係

通知にはタスク状態とユーザー購読情報が必要。

## Phase 8: PWAとWeb Push通知

### 目的

iPhoneホーム画面追加、Push購読、朝夜通知、通知タップ導線を実装する。

### 前提条件

- Phase 4が完了している。
- VAPID keyを用意できる。

### 実施する作業

- `manifest.webmanifest` とService Workerを実装する。
- Push購読APIを実装する。
- 通知テストAPIを実装する。
- Cron Triggerで朝9時、夜21時通知を送る。
- 二重送信防止を実装する。

### 作成・変更予定の主なファイル

- `public/manifest.webmanifest`
- `public/sw.js` またはVite管理のService Worker
- `worker/routes/push.ts`
- `worker/cron.ts`

### 完了条件

- iPhoneで通知許可と受信ができる。
- 通知タップで対象画面へ遷移できる。

### 確認方法

- iPhone実機確認
- 通知購読APIテスト
- Cron相当の手動テスト

### 次のフェーズへの依存関係

品質改善はMVP範囲の画面とAPIが揃っていることに依存する。

## Phase 9: 品質改善とデプロイ準備

### 目的

MVPを継続利用できる品質へ引き上げる。

### 前提条件

- MVP主要機能が実装済み。

### 実施する作業

- アクセシビリティ改善。
- エラー表示、空状態、ローディングを整える。
- 単体/API/E2Eテストを拡充する。
- iPhone実機で確認する。
- Cloudflareへのデプロイ手順を確定する。

### 作成・変更予定の主なファイル

- `docs/TESTING.md`
- `docs/DEPLOYMENT.md`
- `src/`
- `worker/`

### 完了条件

- MVP完成条件を満たす。
- デプロイ手順とロールバック方針が文書化されている。

### 確認方法

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- iPhone実機確認

### 次のフェーズへの依存関係

一般公開や独自ドメイン設定は、MVP検証後に判断する。
## 2026-07-21 フロントエンド操作基盤の進捗

Phase 2からPhase 3のフロントエンド最小導線として、以下を実装済み。

- 未ログイン時のログイン画面表示。
- 新規登録、ログイン、ログアウト。
- ログイン後の`GET /api/households/current`による家庭所属確認。
- 家庭未所属時のオンボーディング、家庭作成、招待コード参加。
- 家庭所属後の仮ホーム画面。
- メンバー管理画面、owner向け招待コード発行、member向け権限制限表示。
- ゲスト画面はサンプル表示のみで、実データへ保存しない。
- タスク、買い物、画像、通知の本実装は未着手のまま残す。

次フェーズでは、今回追加したAPIクライアント、状態ガード、共通UI、下部ナビを再利用してタスクAPIと画面へ進む。
## 2026-07-31 Phase 4/5 frontend progress

- Added task API clients and dashboard client.
- Added real-data home screen with today tasks and weekly task progress.
- Added task management list grouped by daily, scheduled, weekly, and inactive tasks.
- Added task create/edit form with recurrence-specific fields.
- Added task detail/respond screen with start, complete, skip, reset, and history.
- Added bottom navigation for home, tasks, shopping preparation, and settings.
- Deferred shopping, image/R2, Web Push, Cron, production deployment, and final Docker quality-gate rerun after Docker Desktop recovers.
## 2026-08-04 Phase 6 frontend progress

Completed in this phase:

- Shopping list UI using existing item APIs.
- Pending and purchased sections with purchased collapse.
- Item create, detail, edit, delete, purchase, unpurchase, and clear-purchased flows.
- Purchaser and purchased-time display.
- Active shopping template list, create, edit, logical delete, and template-to-item add flows.
- Shopping tab enabled in bottom navigation.
- Shopping route guards continue to use existing auth/household guard.
- Frontend tests and Playwright shopping scenario were added.

Validated on 2026-08-04 after Docker Desktop recovered:

- Docker quality gates completed in Docker: lint, typecheck, unit/integration tests, build, audit recording, and local D1 migration check.
- Playwright E2E completed in Docker for both the existing task scenario and the shopping scenario.
- Shopping screenshots, HTML report, and trace were generated under `artifacts/playwright/shopping-ui/`.

Remaining out of scope:

- Image/R2/barcode/price/store/category/inventory/notification/production deployment work remains out of scope.
