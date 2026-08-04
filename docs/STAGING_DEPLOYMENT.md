# HouseToDo staging deployment runbook

## 2026-08-04 staging completion record

- Worker: `house-to-do-staging`
- Worker URL and `ALLOWED_ORIGINS`: `https://house-to-do-staging.427harinn.workers.dev`
- D1: `house-to-do-staging`
- R2: `house-to-do-attachments-staging`
- Remote migrations `0001` through `0007`: applied and verified
- Cron: one trigger, `0 18 * * *` UTC
- Workers Observability: enabled for staging only
- Latest verified Version ID: `15d0cd3d-9244-4e9f-a570-f02647c74a55`

The staging registration 500 was caused by Cloudflare Workers Web Crypto rejecting PBKDF2 `120,000` iterations as above the supported limit of `100,000`. The failure occurred in `hashPassword` before the users INSERT. `PBKDF2_ITERATIONS` is now `100_000`.

The stored format remains `pbkdf2-sha256$iterations$salt$hash`, and `verifyPassword` reads iterations from the stored value, preserving compatibility. Staging registration returned HTTP 201 and created users/sessions rows. Browser checks confirmed registration, login, logout, cookie attributes, and Origin checks.

Page-reload persistence was not strictly verified, full remote E2E was not run, and detailed successful Workers Logs stages were not confirmed. Quality gates passed: lint, typecheck, 15 files / 60 tests, build, local migration, and `git diff --check`. Production was not operated on, no migration was added, and API Token contents were not stored.

この手順は、Cloudflare上のstagingだけを初回作成・検証する次回作業用です。この準備フェーズでは、D1/R2作成、remote migration、Worker deploy、Cron登録、Secret登録、カスタムドメイン、commit/pushを実行しません。

## 構成と固定値

| 環境 | Worker | D1 | R2 | URL/Origin |
|---|---|---|---|---|
| local | `house-to-do` | `house-to-do` local | `house-to-do-attachments` local | `http://127.0.0.1:5174`, `http://web:5173` |
| staging | `house-to-do-staging` | `house-to-do-staging` | `house-to-do-attachments-staging` | 初回は実デプロイ後に確定する workers.dev URL |
| production | 将来 | `house-to-do-production` | `house-to-do-attachments-production` | 文書化のみ。設定・リソース未作成 |

`DB`、`ATTACHMENTS`、`ASSETS`、`migrations_dir: migrations`、Static Assetsの`dist/client`、SPA fallback、`run_worker_first: ["/api/*"]`は維持します。R2は非公開のままにし、画像はWorker API経由で配信します。

## 前提と品質ゲート

```bash
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo status --short
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo diff --check
docker-compose run --rm app npm run lint
docker-compose run --rm app npm run typecheck
docker-compose run --rm app npm test
docker-compose run --rm app npm run build
docker-compose run --rm app npm audit
docker-compose run --rm app npm run db:migrate:local
docker-compose run --rm app npm run cf:validate:staging
```

`npm audit`の既知残件は`undici -> miniflare -> wrangler`等です。`npm audit fix --force`は実行しません。validationはD1 IDとOriginが未確定の準備状態では失敗するのが正しい結果です。remote作業開始時はGit clean、migrationファイルcommit済みを再確認します。

## Cloudflare読み取り確認

認証済みであることを確認するだけです。未ログインならブラウザ認証を自動開始せず中断します。

```bash
docker-compose run --rm app npx wrangler whoami
docker-compose run --rm app npx wrangler d1 list
docker-compose run --rm app npx wrangler r2 bucket list
```

アカウント、既存名、`house-to-do-staging`、`house-to-do-attachments-staging`の衝突を確認します。既存リソースは変更・削除しません。

## 初回作成と設定（次回に実行）

1. 想定アカウント、Git clean、品質ゲートを確認する。
2. D1を作成する（この準備では未実行）。

```bash
npx wrangler d1 create house-to-do-staging
```

出力されたUUIDを`wrangler.jsonc`の`env.staging.d1_databases[0].database_id`へ設定し、`npm run cf:validate:staging`を再実行します。

3. R2を作成する（この準備では未実行）。

```bash
npx wrangler r2 bucket create house-to-do-attachments-staging
```

bucketはprivateのまま、public development URL、custom domainを有効化しません。

4. staging Originは実URL確定前に推測値へ固定しません。最初のdeployで表示された`https://house-to-do-staging.<account-subdomain>.workers.dev`を確認してから、`ALLOWED_ORIGINS`へそのOriginだけを設定します。`*`、http、本番/別environment/不要なlocalhostは許可しません。
5. `wrangler deploy --env staging --dry-run`を実行します。これはcompile/upload準備のみでlive deployしません。失敗したら停止し、IDを捏造しません。
6. D1適用前に対象がstagingであること、DB名とUUID、一覧を確認します。

```bash
npx wrangler d1 migrations list DB --env staging --remote
```

未適用一覧が`0001`〜`0007`の順であること、余計なmigrationや欠落がないこと、local migration成功済みであることを確認してから適用します。

```bash
npx wrangler d1 migrations apply DB --env staging --remote
```

適用後は機密データを出さず、次だけを確認します。

```bash
npx wrangler d1 execute DB --env staging --remote --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
npx wrangler d1 execute DB --env staging --remote --command "SELECT name FROM sqlite_master WHERE type = 'index' ORDER BY name;"
```

7. Workerを初回deployし、workers.dev URLを取得します。`ALLOWED_ORIGINS`を実URLへ更新して再deployします。Secretは現時点では新設不要です。将来必要になった場合のみ環境別に`wrangler secret put KEY --env staging`を使用し、値をWrangler設定・リポジトリ・API Tokenへ保存しません。

## Trigger適用順序

初回はWorker deploy、HTTP/API smoke、`/cdn-cgi/handler/scheduled?format=json`によるScheduled手動確認、最後にCron登録の順です。CronはWrangler設定の`env.staging.triggers`で管理し、`0 18 * * *`はUTC毎日18:00、日本時間毎日03:00です。孤児削除の実行時刻として採用します。設定を含めたdeploy時にTriggerが反映されるため、手動確認前に本番登録しません。

## Smoke tests

`GET /api/health`が200で`bindings.db=true`、`bindings.r2=true`を返すことを確認します。テスト用アカウント・テスト用パスワードのみを使い、実メール・本番パスワードは使いません。

- 認証: register、me、logout、再login。Cookieが`HttpOnly; Secure; SameSite=Lax`。
- 家庭: 作成、招待、別ユーザー参加、2 members、memberの家庭更新拒否。
- タスク: daily作成、開始、完了、2ユーザー共有。
- 買い物: 作成、購入、購入者表示、未購入戻し。
- 画像: JPEG選択、WebP保存、取得、private cache、家庭外404、削除。
- Scheduled: orphan queue作成、期限前保護、検証用due化、発火、R2削除、queue削除、正常画像保護。

## 中断条件・復旧

アカウント違い、名前衝突、D1 ID不明、production参照、migration不一致、対象environment違い、public R2、`ALLOWED_ORIGINS`の`*`、Secure欠落、dry-run/品質ゲート失敗、未commit、予期せぬproduction操作要求があれば停止します。

失敗時は追加変更を止め、Wrangler出力と対象environmentを記録します。migrationはファイルを上書きせず、破壊的変更を直接実行しません。D1は適用前バックアップ方針を確認し、Wranglerのapplyが取得するbackupとD1 Time Travel/exportの利用可否をその時点の公式仕様で確認します。失敗migrationはCLIのrollback挙動を確認し、必要なrollback SQLは新しい明示的migrationとして設計します。初回stagingの検証後はテストデータを識別して削除し、productionへ昇格・コピーしません。

## iPhone実機チェック

ログイン保持、ホーム、タスク作成/完了、買い物追加、撮影、プレビュー、アップロード、縦長画像、Safari再読み込み、閉じて再表示、ボトムナビ、キーボード、Safe Area、横スクロール、Cookie保持を確認します。manifest/service worker未実装のためPWAインストールは別フェーズです。

## 既知のローカル制約

Wrangler 4.114.0のローカルesbuild deadlockは依存更新や大規模回避策を行わず既知制約として維持します。単体・統合・build・local D1・Scheduledは個別に確認し、E2Eがdeadlockで止まった場合は成功扱いにしません。過去に全E2E 3件成功実績がありますが、直近の全E2Eはtoolchain停止で未完了でした。staging runtimeで回帰確認し、toolchain障害とアプリ障害を分離します。

## 未実行操作

D1/R2作成、remote migration、Worker upload/deploy、Cron本番登録、Secret本番登録、custom domain、本番R2操作、commit、pushはこの準備では実行しません。
