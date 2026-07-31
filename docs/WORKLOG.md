# 作業記録

## 2026-07-31 Task backend foundation

### Purpose
Implement the backend/API foundation for household task management: task templates, daily/scheduled/weekly targeting, task records, state changes, history, and home aggregation.

### Starting state
- Branch: `main`.
- `git status --short`: clean.
- Recent commits checked with repository-scoped `safe.directory` because normal Git commands reported dubious ownership.
- Existing frontend/auth/household flows were present and left in place.

### Implemented structure
- `tasks`: task template definition.
- `task_weekdays`: scheduled weekday mapping.
- `task_records`: action records for target dates and target week starts.
- `pending` is derived from absence of records and is not stored.
- Weekly completions are stored one record per completion. Weekly `in_progress` and `skipped` are limited to one open record per task/week.

### Date and week handling
- Added `worker/lib/date-time.ts`.
- Uses explicit `Intl.DateTimeFormat` with household timezone, initially `Asia/Tokyo`.
- Week ranges use `households.week_starts_on`.

### State transition summary
- `start`, `complete`, `skip`, and `reset` are implemented.
- Same-user repeat actions are idempotent where practical.
- Other users cannot overwrite an `in_progress` record.
- Existing completed records are not overwritten by a different user.
- Reset deletes the current target date/week scope for MVP.

### Concurrency notes
- Daily records keep a unique target-date scope.
- Weekly open states use a partial unique index for `in_progress`/`skipped`.
- Multiple weekly completions are allowed for target counts.
- Complete serialization of simultaneous weekly completion remains a known future hardening area.

### Changed files
- `migrations/0004_task_foundation.sql`
- `worker/app.ts`
- `worker/lib/date-time.ts`
- `worker/lib/date-time.test.ts`
- `worker/lib/errors.ts`
- `worker/lib/validation.ts`
- `worker/repositories/task-repository.ts`
- `worker/repositories/task-record-repository.ts`
- `worker/routes/tasks.ts`
- `worker/services/task-service.ts`
- `worker/services/dashboard-service.ts`
- `worker/test-utils/memory-d1.ts`
- `worker/app.test.ts`
- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/DEVELOPMENT_PLAN.md`
- `docs/WORKLOG.md`
- `README.md`

### Added API
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

### Added tests
- Date/time helper tests for JST, week starts, month/year boundaries, leap day, weekday matching, and invalid dates.
- Worker API tests for task creation, scheduled/specific assignment, weekly progress, today list, state sharing, conflict rejection, history, dashboard aggregation, and rejecting non-household assignees.

### Commands run
```text
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo status --short
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo branch --show-current
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo log --oneline -5
npm run typecheck
docker-compose run --rm app npm run typecheck
docker-compose run --rm app npm test
docker-compose run --rm app npm run lint
```

### Results so far
- Host `npm run typecheck`: failed because host `node_modules` is intentionally absent.
- Docker typecheck: passed.
- Docker test: passed, 39 tests.
- Docker lint: passed.
- Docker build: passed.
- Docker local D1 migration: passed; `0004_task_foundation.sql` applied locally.
- npm audit: failed with 14 high severity advisories in transitive dev/runtime tooling paths. Reported chains include `brace-expansion` through eslint-related packages and `sharp` through `wrangler`/`miniflare`. Suggested fixes require `npm audit fix --force` and breaking/out-of-range upgrades, so no automatic fix was applied.
- Host generated artifact check: `node_modules`, `dist`, and `.wrangler` were not created in the workspace root.
- Manual Wrangler dev API check: passed for two-user household, daily/scheduled/weekly creation, today/week lists, duplicate start conflict 409, completion sharing, skip/reset, history, and dashboard aggregation.

### Frontend compatibility
- Existing frontend unit tests passed.
- Manual API flow covered registration/session, household creation/join, member listing, and dashboard-compatible task aggregation.
- Full browser click-through was not performed in this pass.

### Next candidates
- Add a small home-screen API status/count display only if needed.
- Build the full task-management UI in the next phase.
- Decide whether to upgrade eslint/wrangler-related dependency chains to resolve `npm audit` findings.

## 2026-07-31 Task backend manual regression check

### Purpose
Before starting task UI implementation, verify the task backend API behavior through Wrangler dev and local D1 only. No new feature implementation, commit, push, deploy, or production Cloudflare operation was performed.

### Environment
- Wrangler dev endpoint: `http://127.0.0.1:8787`
- Frontend/dev origin used for state-changing API calls: `http://127.0.0.1:5174`
- Docker Compose services were already running:
  - `app`: host port `5174`
  - `worker`: host port `8787`
- Test data used temporary `example.test` users and local D1 records only.
- Session cookies, invite codes, and passwords were not recorded.

### Check Method
A PowerShell regression script created isolated local test households and users, then called the existing APIs through Wrangler dev. The first script pass reported false failures because single-object PowerShell `.Count` handling and one Monday date value were wrong in the harness. The corrected script was rerun without changing application code.

### Results
All 14 requested checks passed on the corrected run.

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | daily task appears in today list for an arbitrary date | Passed | `dailyPresent=1; total=2` for `2026-08-15` |
| 2 | scheduled task appears only on target weekday | Passed | Friday count `1`, Thursday count `0` |
| 3 | weekly task is excluded from today list and included in week list | Passed | today weekly count `0`, week weekly count `1` |
| 4 | weekly target count 2 after one completion is 1/2 | Passed | `completed=1/2`, `status=pending` |
| 5 | weekly target count 2 after two completions is 2/2 completed | Passed | `completed=2/2`, `status=completed` |
| 6 | inactive daily/weekly tasks are excluded from today/week lists | Passed | disabled daily `0`, disabled weekly `0` |
| 7 | scheduled weekday update removes old weekday and adds new weekday | Passed | old Friday `0`, new Monday `1` |
| 8 | another user cannot duplicate-start an in-progress task | Passed | HTTP `409` |
| 9 | another user cannot overwrite completed actor | Passed | actor remained `Reg2 A` after user B complete retry |
| 10 | reset returns task to pending | Passed | `status=pending` |
| 11 | another household taskId is inaccessible for detail/update/state/history | Passed | detail/update/state/history all returned `404` |
| 12 | `week_starts_on` Monday/Sunday changes week range | Passed | Monday `2026-07-27..2026-08-02`, Sunday `2026-07-26..2026-08-01` |
| 13 | month and year boundary week ranges are correct | Passed | month `2026-07-27..2026-08-02`, year `2026-12-28..2027-01-03` |
| 14 | dashboard summary matches task statuses | Passed | summary and computed counts both `total=5`, `pending=2`, `inProgress=1`, `completed=1`, `skipped=1` |

### Defects
No application defect was found during this regression pass. No code fix or additional automated test was required.

### Commands
```text
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo status --short
docker-compose ps
PowerShell API regression script against http://127.0.0.1:8787
```

### Quality Commands
Because no application code was changed for a defect fix, lint/typecheck/test/build/local D1 migration were not rerun in this manual regression-only pass. The previous task backend implementation pass had already completed those checks, except `npm audit`, which remained failed due to upstream advisories requiring breaking or out-of-range upgrades.

Codexが作業した内容は、このファイルへ追記する。過去の記録を安易に削除・上書きしない。

## 記録テンプレート

```markdown
## YYYY-MM-DD 作業タイトル

### 作業目的

### 作業前の状態

### 変更ファイル

### 変更内容

### 設計判断

### 実行したコマンド

### 確認結果

### テスト結果

### 仕様書の更新有無

### 未対応事項

### 次回の作業候補
```

## 2026-07-21 開発土台と運用ルールの整備

### 作業目的

機能本実装へ進む前に、既存仕様書と画面ラフを確認し、Docker中心の開発環境、Codex向け指示書、開発計画、設計判断ログ、READMEを整備する。

### 作業前の状態

- ブランチ: `main`
- 直近コミット: `fa4c406 Initial commit`
- `docs/` が未追跡として存在。
- 既存実装、Node.js設定、Docker設定、Cloudflare設定はなし。
- `docs/PROJECT_SPEC.md` と `docs/images/household-todo-screen-rough.png` が存在。
- `git branch` と `git log` はGitのdubious ownership判定により通常実行では失敗したため、`git -c safe.directory=...` で確認。

### 変更ファイル

- `README.md`
- `.gitignore`
- `.dockerignore`
- `.env.example`
- `.dev.vars.example`
- `Dockerfile`
- `compose.yaml`
- `.devcontainer/devcontainer.json`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vite.config.ts`
- `eslint.config.js`
- `.prettierrc.json`
- `index.html`
- `src/`
- `worker/index.ts`
- `wrangler.jsonc`
- `migrations/0001_initial.sql`
- `docs/CODEX_INSTRUCTIONS.md`
- `docs/DEVELOPMENT_PLAN.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/WORKLOG.md`

### 変更内容

- React + TypeScript + Vite の最小プレースホルダー画面を追加。
- Cloudflare Workerの `/api/health` と未実装API用404レスポンスを追加。
- D1初期マイグレーション案を追加。
- Docker ComposeとDev Containerを追加。
- Lint、型チェック、テスト、ビルド、Wrangler、D1マイグレーション用npm scriptsを追加。
- `package-lock.json` を生成し、依存関係解決を固定。
- Codex向け作業ルール、開発フェーズ、アーキテクチャ、設計判断ログを追加。
- READMEにDocker中心のセットアップ手順を追加。

### 設計判断

- Cloudflare Workers Static AssetsでSPAとAPIを同居する方針にした。
- ホストへNode.jsを直接入れない前提で、Docker Composeの `app` サービスを標準にした。
- 画面は本実装ではなく、後から置き換えやすい最小プレースホルダーにした。
- D1 database_idはCloudflareリソース未作成のためプレースホルダーにした。

### 実行したコマンド

```bash
git status --short
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo branch --show-current
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo log --oneline -5
rg --files
npm install --package-lock-only --ignore-scripts
npm audit --json
docker compose build
docker-compose build
```

### 確認結果

- 仕様書を確認済み。
- 画面ラフ画像の存在とサイズ `1055x1491` を確認済み。
- 縮小プレビューを一時生成して、ログイン、ホーム、タスク詳細、買い物、設定の5画面と、家庭向けのやさしいトーン、ボトムナビゲーション構成を目視確認済み。

### テスト結果

- `npm install --package-lock-only --ignore-scripts`: 成功。`node_modules` は作成されていない。
- `npm audit --json`: レジストリエンドポイント側のエラーで詳細取得に失敗。`npm install` の概要では6件の脆弱性が報告された。
- `docker compose build`: この端末では `docker compose` サブコマンドが利用できず失敗。
- `docker-compose build`: Docker DesktopのLinux Engineが起動しておらず、`dockerDesktopLinuxEngine` へ接続できなかったため失敗。
- Lint、型チェック、テスト、ビルドはDockerビルド不可のため未実行。

### 仕様書の更新有無

`docs/PROJECT_SPEC.md` は変更なし。追加ドキュメントで運用ルールと開発計画を補完した。

### 未対応事項

- Cloudflare上のD1/R2実リソース作成。
- `wrangler.jsonc` のD1 database_id置き換え。
- 本番用認証、タスク、買い物、画像、通知の実装。
- iPhone実機確認。
- Docker Desktop起動後の `docker-compose build`、Lint、型チェック、テスト、ビルド確認。
- npm audit詳細の再取得と、必要に応じた依存バージョン調整。

### 次回の作業候補

- Dockerビルドと依存関係固定後、Lint、型チェック、テスト、ビルドを確認する。
- Cloudflareリソース名と作成手順を確定する。

## 2026-07-21 Docker開発環境の検証と調整

### 作業目的

前回作成した初期基盤について、ホスト環境へNode.jsや依存パッケージを直接インストールせず、Dockerコンテナ内で開発・検証できる状態にする。

### 作業前の状態

- ブランチ: `main`
- 直近コミット: `fa4c406 Initial commit`
- 前回追加したファイル群は未コミット。
- 通常の `git branch --show-current` と `git log --oneline -5` は dubious ownership で失敗するため、`git -c safe.directory=...` で確認。
- Docker Desktopは起動済み。
- 別プロジェクトのDockerコンテナがホストの `5173` を使用中。

### 変更ファイル

- `README.md`
- `compose.yaml`
- `vite.config.ts`
- `src/App.tsx`
- `src/App.test.tsx`
- `src/styles.css`
- `worker/index.ts`
- `package.json`
- `package-lock.json`
- `eslint.config.js`
- `docs/ARCHITECTURE.md`
- `docs/WORKLOG.md`

### 変更内容

- `worker` serviceをComposeに追加し、Wrangler devをDocker内で起動できるようにした。
- Vite dev serverから `/api/*` を `worker:8787` へプロキシする設定を追加。
- React画面に `/api/health` の接続状態を表示する最小UIを追加。
- `/api/health` のレスポンスに `status: "ok"` を追加。
- `vite`、`vitest`、`wrangler`、`@cloudflare/workers-types` を更新し、npm audit 0件にした。
- `dist`、`.wrangler`、`node_modules` がホスト直下へ残らないよう、Composeのbind mountを必要なファイル/ディレクトリ単位へ変更。
- Dev Container相当の `app` コンテナでREADME、docs、Git状態を参照できるようにmountを追加。
- READMEを実測済みの `docker-compose` コマンド、`127.0.0.1:5174`、ログ確認、よくあるエラー、再作成手順に合わせて更新。

### 発生したエラー

- サンドボックス内の通常実行では Docker のユーザー設定領域へアクセスできず、Dockerコマンドが失敗。
- 初回の品質コマンド並列実行で named volume 作成が競合。
- `eslint.config.js` が型付きESLintの解析対象になり、Lintが失敗。
- `npm audit` で `undici`、`vite`、`vitest`、`ws` 由来の脆弱性が報告された。
- `docker-compose up -d` でホスト `5173` が使用中。
- `localhost:5174` が別プロセス側へ解決される挙動があった。
- 旧Compose mount構成で空の `node_modules`、`dist`、`.wrangler` がホスト側に見えた。

### エラーの原因

- Docker操作にはDocker Desktopの設定、buildx、Engineへのアクセスが必要だった。
- `docker-compose run` を並列に実行したことで、初回ネットワーク/volume作成が同時に走った。
- `parserOptions.project` を使うESLint設定で、`eslint.config.js` が `tsconfig.json` のinclude外だった。
- 依存固定バージョンが古く、監査対象パッケージに既知脆弱性があった。
- 別プロジェクト `tech-catchup-frontend` が `5173` を使用していた。
- Windows環境の `localhost` 解決が期待と異なる応答を返したため、`127.0.0.1` に固定する必要があった。
- `.:/workspace` とサブパスnamed volumeの組み合わせで、ホスト側に空のmount pointが作られた。

### 対応内容

- Docker操作は必要な範囲で権限付き実行した。
- 依存volumeは `docker-compose run --rm app npm ci` で明示的に整備した。
- `eslint.config.js` をESLint対象から除外した。
- `vite` を `6.4.3`、`vitest` を `3.2.7`、`wrangler` を `4.112.0`、`@cloudflare/workers-types` を `5.20260721.1` へ更新した。
- ホスト側フロントポートを `5174` に変更した。
- READMEでは確認済みURLとして `http://127.0.0.1:5174` を明記した。
- Composeのbind mountを個別mountに変更し、ホスト直下に `node_modules`、`dist`、`.wrangler` が作られないことを確認した。

### 設計判断

- `docker-compose up` で `app` と `worker` の2サービスを起動する構成にした。
- Viteは開発画面とHMRを担当し、Worker APIはWrangler devで起動する。
- Reactからの `/api/health` はVite proxy経由でWorkerへ疎通させる。
- ホスト生成物を避けるため、開発時のmountはリポジトリ全体ではなく必要なファイル/ディレクトリ単位にした。

### 実行したコマンド

```bash
git status --short
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo branch --show-current
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo log --oneline -5
docker-compose build
docker-compose run --rm app npm ci
docker-compose run --rm app npm run lint
docker-compose run --rm app npm run typecheck
docker-compose run --rm app npm test
docker-compose run --rm app npm run build
docker-compose run --rm app npm audit
docker-compose run --rm app npm run db:migrate:local
docker-compose up -d
docker-compose restart
docker-compose down
docker-compose up -d --force-recreate
docker-compose ps
docker-compose logs app
docker-compose logs worker
```

### Lint結果

成功。

### 型チェック結果

成功。

### テスト結果

成功。`src/App.test.tsx` の1件が通過。

### ビルド結果

成功。Vite buildで `dist/client` がDocker volume内に生成された。

### Docker起動確認

成功。`housetodo-app-1` と `housetodo-worker-1` が起動。

### ブラウザ表示確認

成功。in-app browserで `http://127.0.0.1:5174/` を開き、`おうちTodo` と `Worker API 接続OK` を確認。

### ホットリロード確認

成功。`src/App.tsx` の画面文言を一時変更し、ブラウザへ自動反映されることを確認後、元に戻した。

### Worker API疎通確認

成功。

```json
{"status":"ok","ok":true,"service":"house-to-do","bindings":{"db":true,"r2":true}}
```

`http://127.0.0.1:8787/api/health` と `http://127.0.0.1:5174/api/health` の両方で確認。

### npm audit結果

成功。`found 0 vulnerabilities`。

### ローカルD1確認

成功。`0001_initial.sql` がローカルD1へ適用された。リモートD1操作は行っていない。

### 仕様書更新の有無

`docs/PROJECT_SPEC.md` は変更なし。Docker構成とローカル開発手順に関わるため、`README.md` と `docs/ARCHITECTURE.md` を更新した。

### 未対応事項

- Cloudflare本番リソース作成。
- `wrangler.jsonc` の本番D1 database_id置き換え。
- 本番用Secrets登録。
- 認証、タスク、買い物、画像、Web Push、Cronの本実装。
- iPhone実機確認。

### 次回の作業候補

- Cloudflareのローカル設定と本番リソース作成手順を整理する。
- Worker APIのルーティング基盤と認証方式の検討へ進む。

## 2026-07-21 Worker API基盤と認証方式の技術検証

### 作業目的

今後の認証、家庭グループ、タスク、買い物APIで共通して使用するWorker API基盤、共通レスポンス、共通エラー処理、入力検証、D1アクセス層、認証方式、セッション方式、Cookie方針、CSRF方針を整える。

### 作業前の状態

- ブランチ: `main`
- 直近コミット: `36bd094 開発用Docker・Cloudflare基盤を初期構築`
- `git status --short`: 差分なし。
- 通常の `git branch --show-current` と `git log --oneline -5` は dubious ownership で失敗したため、`git -c safe.directory=...` で確認。
- `worker/index.ts` に `/api/health` と未実装API 404がまとまっていた。
- `migrations/0001_initial.sql` には `users` と `sessions` が存在したが、`sessions` に `token_hash` はなかった。

### 調査内容

- 既存ドキュメント、README、Wrangler設定、Compose設定、Worker実装、初期マイグレーションを確認した。
- APIルーターはHonoなどの導入も検討したが、現段階では小さな独自ルーターで十分と判断した。
- 入力検証はZod、Valibot、独自実装を比較し、現段階では追加依存なしの独自ユーティリティを採用した。
- パスワードハッシュはWeb Crypto PBKDF2、Argon2系、bcrypt系、SHA-256単体を比較し、Workers標準APIで安定して動作するPBKDF2-SHA-256を採用した。

### 検討した選択肢

- APIルーティング: 小さな独自ルーター、Hono、その他Workers対応フレームワーク。
- 入力検証: Zod、Valibot、独自バリデーション。
- パスワードハッシュ: Web Crypto PBKDF2、Argon2系ライブラリ、bcrypt系ライブラリ、SHA-256単体。
- セッション: D1生トークン保存、D1トークンハッシュ保存、JWT Cookie。
- CSRF: SameSiteのみ、SameSite + JSON限定、CSRFトークン。

### 採用した構成

- `worker/index.ts` は起動入口に限定し、`worker/app.ts` でルーティングする。
- `worker/routes/` にAPIハンドラー、`worker/middleware/` にエラー処理と認証、`worker/lib/` に共通レスポンス、エラー、バリデーション、Cookie、暗号、日付処理を配置した。
- `worker/repositories/` に `UserRepository` と `SessionRepository` を配置した。
- `worker/services/auth-service.ts` に認証ビジネスロジックを集約した。

### 採用理由

- 現段階では依存を増やさず、Workers標準機能とTypeScriptで管理できる規模だった。
- 今後APIが増えた場合も、ルート、サービス、Repository単位で拡張できる。
- Honoやスキーマライブラリへの移行が必要になっても、境界を分けているため影響範囲を限定しやすい。

### 作成・変更ファイル

- `worker/index.ts`
- `worker/app.ts`
- `worker/types/env.ts`
- `worker/types/api.ts`
- `worker/types/domain.ts`
- `worker/lib/constants.ts`
- `worker/lib/errors.ts`
- `worker/lib/response.ts`
- `worker/lib/validation.ts`
- `worker/lib/crypto.ts`
- `worker/lib/cookies.ts`
- `worker/lib/date.ts`
- `worker/middleware/error-handler.ts`
- `worker/middleware/request-context.ts`
- `worker/middleware/auth.ts`
- `worker/routes/health.ts`
- `worker/routes/auth.ts`
- `worker/repositories/user-repository.ts`
- `worker/repositories/session-repository.ts`
- `worker/services/auth-service.ts`
- `worker/lib/*.test.ts`
- `worker/repositories/repository.test.ts`
- `migrations/0002_auth_foundation.sql`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/PROJECT_SPEC.md`
- `README.md`
- `docs/WORKLOG.md`

### マイグレーション

`migrations/0002_auth_foundation.sql` を追加した。

- `sessions.token_hash` を追加。
- `idx_sessions_token_hash` を追加。
- `idx_sessions_user_id` を追加。
- `idx_sessions_expires_at` を追加。

既存の `0001_initial.sql` は上書きしなかった。

### API変更

- `GET /api/health` は共通成功レスポンス `{ ok: true, data, requestId }` へ変更。
- `POST /api/auth/register` を追加。
- `POST /api/auth/login` を追加。
- `POST /api/auth/logout` を追加。
- `GET /api/auth/me` を追加。
- 未実装APIは共通エラーレスポンスで404を返す。

### セキュリティ上の判断

- パスワードはPBKDF2-SHA-256、ランダムソルト、反復回数付き形式で保存する。
- SHA-256単体でのパスワード保存は採用しない。
- セッショントークンは32バイトの暗号学的乱数をbase64url化する。
- D1にはセッショントークンのSHA-256ハッシュのみ保存する。
- Cookie名は `house_todo_session` とし、HttpOnly、SameSite=Lax、Path=/、Max-Age=30日を付与する。
- `APP_ENV=production` の場合のみSecureを付与し、ローカルHTTP開発を可能にする。
- MVPではセッション期限延長やローテーションは行わない。
- CSRFは同一オリジン前提でSameSite=Lax、JSON限定、GETで状態変更しない方針とした。必要になればOrigin検証とCSRFトークンを追加する。
- ログにはパスワード、セッショントークン、Cookie全文、リクエストBody全文を出さない方針とした。

### 実行したコマンド

```bash
git status --short
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo branch --show-current
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo log --oneline -5
rg --files
docker-compose run --rm app npm run typecheck
docker-compose run --rm app npm run lint
docker-compose run --rm app npm test
docker-compose run --rm app npm run build
docker-compose run --rm app npm audit
docker-compose run --rm app npm run db:migrate:local
```

### Lint結果

成功。

### 型チェック結果

成功。

### テスト結果

成功。7ファイル、20件が通過。

### ビルド結果

成功。

### npm audit結果

成功。`found 0 vulnerabilities`。

### ローカルD1確認結果

成功。既存のローカルD1に `0002_auth_foundation.sql` を適用できた。

空のローカルDBへの再適用確認は、既存ローカルD1状態を壊さないため今回は実施していない。

### Worker API手動確認結果

成功。Wrangler dev経由で `GET /api/health` が共通レスポンス形式で返ることを確認した。

成功。`POST /api/auth/register`、`GET /api/auth/me`、`POST /api/auth/logout` の最小フローを `curl.exe` とCookie jarで確認した。

### ドキュメント更新内容

- `docs/ARCHITECTURE.md` にAPI構成、共通レスポンス、エラーコード、入力検証、D1アクセス層、認証、セッション、Cookie、CSRF方針を追記。
- `docs/DECISIONS.md` にAPIルーター、入力検証、パスワードハッシュ、セッション、CSRFの判断を追記。
- `docs/PROJECT_SPEC.md` の `sessions` へ `token_hash` の追加方針を追記。
- `README.md` に現在の最小APIと実装状況を追記。
- `docs/WORKLOG.md` に本記録を追記。

### 未対応事項

- 完成版のログイン画面、新規登録画面。
- メール確認、パスワード再設定。
- 家庭グループ、招待、タスク、買い物、画像、Web Push、Cronの本実装。
- 状態変更APIのOriginヘッダー検証。
- CSRFトークン方式。
- セッション期限延長、ローテーション、端末管理。
- PBKDF2反復回数のWorkers実環境での応答時間測定。
- 空のローカルD1でのマイグレーション再適用確認。
- Cloudflare本番リソース作成、デプロイ、push、コミット。

### 次回の作業候補

- 認証APIをWrangler dev経由で手動疎通確認する。
- 状態変更API向けのOrigin検証ミドルウェアを追加する。
- 家庭グループ作成とメンバー所属確認のRepository/Service設計へ進む。
- PBKDF2反復回数のWorkers環境での実測を行う。

## 2026-07-21 家庭グループとメンバー管理バックエンド基盤

### 作業目的

認証後に利用できる最小APIとして、状態変更APIのOrigin検証、家庭作成、現在の家庭取得、家庭更新、メンバー一覧、招待コード発行、招待参加、家庭所属確認、owner権限確認を実装する。

### 作業前の状態

- ブランチ: `main`
- 直近コミット: `f0394c6 APIと認証追加`
- `git status --short`: 差分なし
- 通常のGitコマンドは dubious ownership で失敗したため、`git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo ...` で確認。
- Worker API基盤、認証API、PBKDF2、D1セッション管理は実装済み。
- 家庭グループ、招待、Origin検証は未実装。

### 調査内容

- `docs/PROJECT_SPEC.md`、`docs/CODEX_INSTRUCTIONS.md`、`docs/DEVELOPMENT_PLAN.md`、`docs/ARCHITECTURE.md`、`docs/DECISIONS.md`、`docs/WORKLOG.md`、`README.md` を確認した。
- 画面ラフ `docs/images/household-todo-screen-rough.png` を確認した。今回は画面実装には進まない方針を維持。
- 既存の `worker/app.ts`、`routes/auth.ts`、`middleware/auth.ts`、`lib/validation.ts`、Repository実装、テスト構成を確認した。

### Origin検証方式

- `POST`、`PUT`、`PATCH`、`DELETE` を状態変更APIとして扱う。
- 状態変更APIでは `Origin` ヘッダーを必須にし、`ALLOWED_ORIGINS` に含まれないOriginを `INVALID_ORIGIN` の403で拒否する。
- 状態変更APIでは `Content-Type: application/json` も必須にした。
- 開発用Originは `http://127.0.0.1:5174,http://localhost:5174`。
- `Origin` が存在しない状態変更リクエストは拒否する。

### 家庭・メンバー設計

- 家庭は `households`、所属は `household_members`、招待は `household_invites` で管理。
- 家庭作成者は `owner` として自動参加。
- 権限は `owner` と `member`。
- 家庭名はtrim後1文字以上50文字以下。
- `weekStartsOn` は0から6の整数、初期値は1。
- タイムゾーンは初期版では `Asia/Tokyo` 固定。

### 招待コード設計

- 招待コードは暗号学的乱数24バイトから生成したURL-safe文字列。
- 有効期限は24時間。
- 使用回数は1回。
- D1には平文コードではなくSHA-256ハッシュのみ保存。
- レスポンスでは作成直後だけ平文コードを返す。
- 使用時は `used_at IS NULL` 条件付き更新で同時利用を抑止する。

### MVP制限

- 案Bを採用。DB上は複数家庭所属に拡張できる構造を維持し、MVPの1ユーザー1家庭制限はService層で行う。
- Service層だけでは同時実行時に完全な二重所属防止にならない可能性があるため、`docs/DECISIONS.md` と `docs/ARCHITECTURE.md` にトレードオフを記録した。

### 作成・変更ファイル

- `.dev.vars.example`
- `compose.yaml`
- `wrangler.jsonc`
- `README.md`
- `migrations/0003_household_foundation.sql`
- `worker/app.ts`
- `worker/lib/constants.ts`
- `worker/lib/crypto.ts`
- `worker/lib/date.ts`
- `worker/lib/errors.ts`
- `worker/lib/validation.ts`
- `worker/middleware/security.ts`
- `worker/middleware/household-auth.ts`
- `worker/repositories/household-repository.ts`
- `worker/repositories/household-member-repository.ts`
- `worker/repositories/household-invite-repository.ts`
- `worker/services/household-service.ts`
- `worker/services/household-invite-service.ts`
- `worker/routes/households.ts`
- `worker/test-utils/memory-d1.ts`
- `worker/app.test.ts`
- `worker/lib/crypto.test.ts`
- `worker/lib/validation.test.ts`
- `worker/repositories/repository.test.ts`
- `worker/types/domain.ts`
- `worker/types/env.ts`
- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/DEVELOPMENT_PLAN.md`
- `docs/WORKLOG.md`

### マイグレーション

`migrations/0003_household_foundation.sql` を追加した。

- `household_invites.used_by` を追加。
- `household_invites(code_hash)` の一意インデックスを追加。
- `household_invites(household_id)`、`household_invites(expires_at)` のインデックスを追加。
- `household_members(user_id)` のインデックスを追加。

### 実装API

- `POST /api/households`
- `GET /api/households/current`
- `PATCH /api/households/current`
- `GET /api/households/current/members`
- `POST /api/households/current/invites`
- `POST /api/households/join`

### 追加Repository / Service / Middleware

- `HouseholdRepository`
- `HouseholdMemberRepository`
- `HouseholdInviteRepository`
- `HouseholdService`
- `HouseholdInviteService`
- `withStateChangingRequestProtection`
- `requireCurrentHousehold`
- `requireHouseholdRole`

### 追加テスト

- Origin検証: 許可Origin、不正Origin、GET許可、非JSON拒否。
- 家庭作成: 認証済み作成、owner登録、未所属時null、2つ目作成409、更新。
- 家庭更新: owner更新、member更新403、空更新、不正な週開始曜日。
- メンバー一覧: owner/member取得、2人表示。
- 招待: owner発行、平文コードがDB保存されない、有効コード参加、使用済み拒否、member化。
- Repository: 家庭作成、メンバー追加/検索/一覧、招待作成/検索/使用済み更新。
- バリデーション: 家庭作成、家庭更新、招待参加。

### PBKDF2計測結果

Wrangler devローカル環境で、認証API経由の往復時間として計測した。実パスワードは出力していない。

```text
ハッシュ生成を含む登録API: 495.9ms、497.7ms、41.9ms、118.7ms
照合を含むログインAPI: 34.2ms、32.5ms、31.6ms
```

この値はローカルWrangler devとローカルD1、PowerShell `Invoke-WebRequest` を含む参考値であり、本番性能の保証ではない。

### 実行コマンド

```bash
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo status --short
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo branch --show-current
git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo log --oneline -5
rg --files
docker-compose run --rm app npm run lint
docker-compose run --rm app npm run typecheck
docker-compose run --rm app npm test
docker-compose run --rm app npm run build
docker-compose run --rm app npm audit
docker-compose run --rm app npm run db:migrate:local
docker-compose up -d
docker-compose up -d --force-recreate worker app
docker-compose up -d --force-recreate worker
```

### Lint結果

成功。

### 型チェック結果

成功。

### テスト結果

成功。7ファイル、30件が通過。

### ビルド結果

成功。

### npm audit結果

成功。`found 0 vulnerabilities`。

### ローカルD1結果

成功。`0003_household_foundation.sql` がローカルD1へ適用された。最終実行では `No migrations to apply!` を確認。

### 手動確認結果

Wrangler dev環境で以下をAPI手動確認した。

- ユーザーA登録: 201
- ユーザーAで家庭作成: 201
- ユーザーAで招待コード発行: 201
- ユーザーB登録: 201
- ユーザーBで招待コード参加: 200
- ユーザーA/Bでメンバー一覧取得: 200
- メンバー数: 2
- memberによる家庭更新: 403
- ownerによる家庭更新: 200

実パスワードと招待コードは記録していない。

### ドキュメント更新

- `docs/PROJECT_SPEC.md`: 家庭APIパス、招待コード方式、Origin/JSON検証要件を更新。
- `docs/ARCHITECTURE.md`: Origin検証、家庭/メンバー/招待設計、PBKDF2計測結果、MVP制限の注意を追記。
- `docs/DECISIONS.md`: Origin検証、MVP制限方式、家庭未所属時レスポンス、`auth/me` の責務分離を追記。
- `docs/DEVELOPMENT_PLAN.md`: Phase 3のWorker API側進捗を追記。
- `README.md`: 現在のAPI、Origin設定、実装状況を更新。
- `.dev.vars.example`: `ALLOWED_ORIGINS` 例を追加。

### 未対応事項

- 完成版フロントエンド。
- 家庭作成/招待参加の画面。
- タスク、買い物、画像アップロード、R2本実装、Web Push、Cron。
- パスワード再設定、メール送信。
- 本番Cloudflareリソース作成、デプロイ、push。
- 招待参加で、条件付き使用済み更新後にメンバー追加が失敗した場合の完全なロールバック。
- MVPの1ユーザー1家庭制限をDBで強制しないことによる同時実行時の残余リスク。

### 次回の作業候補

- 家庭作成/招待参加の最小フロントエンド導線を追加する。
- タスクAPIの設計に進み、家庭所属確認を再利用する。
- D1の同時実行リスクを本番に近い環境で再検証する。

### Gitの状態

- 作業後の `git status --short` では変更ファイルと新規ファイルが存在。
- コミット、push、デプロイ、本番リソース作成は行っていない。
## 2026-07-21 フロントエンド操作基盤

### 目的

既存の認証・家庭APIを実際に操作できるフロントエンドを実装し、未ログインからログイン/登録、家庭作成または招待参加、仮ホーム、メンバー管理までの導線を完成させる。

### 作業前の状態

- 通常のGitコマンドは`dubious ownership`で失敗したため、`git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo ...`で確認した。
- ブランチは`main`。
- 直近コミットは`ea0f089 家族メンバーの作成と招待APIを作成`。
- 既存フロントはヘルスチェック中心の仮画面だった。

### 採用した構成

- ルーティングはReact Routerを導入せず、`window.history`と`Route`型による軽量方式にした。
- 認証状態は`AuthState`、家庭状態は`HouseholdState`としてReactローカル状態で管理した。
- APIクライアントを`src/api/client.ts`へ集約し、`credentials: "include"`、JSON解析、共通エラー型、ネットワークエラーをまとめた。
- 共通UIは`src/components/ui.tsx`に整理した。
- デザイントークンとモバイル向けレイアウトは`src/styles.css`へ集約した。

### 作成・変更ファイル

- `src/App.tsx`
- `src/styles.css`
- `src/constants.ts`
- `src/types.ts`
- `src/api/client.ts`
- `src/api/auth.ts`
- `src/api/households.ts`
- `src/components/ui.tsx`
- `src/App.test.tsx`
- `src/api/client.test.ts`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/DEVELOPMENT_PLAN.md`
- `docs/WORKLOG.md`
- `README.md`

### 実装画面

- ログイン
- 新規登録
- ゲスト
- オンボーディング
- 家庭作成
- 招待コード参加
- 仮ホーム
- メンバー管理

### 追加したテスト

- 未認証時にログイン画面へ遷移するテスト。
- 認証済みかつ家庭所属済みの場合にホームへ遷移するテスト。
- APIクライアントがCookie付きJSONリクエストを送るテスト。
- API失敗レスポンスを型付きエラーとして扱うテスト。

### 実行コマンドと結果

- `npm ci`: 成功。`found 0 vulnerabilities`。
- `npm run lint`: 成功。
- `npm run typecheck`: 成功。
- `npm test`: 成功。8ファイル、33テスト通過。
- `npm run build`: 成功。
- `npm audit`: sandbox内ではregistry audit requestとnpm cacheログ書き込みで失敗。sandbox外実行は依存メタデータを外部registryへ送るリスクとして自動レビューで却下されたため未完了。
- `docker-compose run --rm app npm run lint`: 成功。
- `docker-compose run --rm app npm run typecheck`: 成功。
- `docker-compose run --rm app npm test`: 成功。8ファイル、33テスト通過。
- `docker-compose run --rm app npm run build`: 成功。
- `docker-compose run --rm app npm run db:migrate:local`: 成功。`No migrations to apply!`。

### 未対応・次回作業

- タスク、買い物、画像、通知、PWAの本実装。
- 本番Cloudflareリソース作成、デプロイ、push。
- `npm audit`の明示実行は、外部registryへの依存メタデータ送信をユーザーが明示承認した場合に再実行する。
## 2026-07-31 タスク管理フロントエンド MVP

### 目的
既存のタスク API を使い、iPhone PWA を想定したホーム、タスク一覧、作成・編集、詳細・回答、状態操作、履歴表示を追加した。

### 作業前の状態
- Git は通常コマンドで dubious ownership が出たため、`git -c safe.directory=C:/Users/rinnr/Documents/GitHub/HouseToDo ...` で確認した。
- ブランチ: `main`
- 直近コミット: `150d26b add task management backend`
- 作業開始時の `git status --short`: 変更なし。

### 画面構成
- `/home`: `GET /api/dashboard/today` の実データで、今日の未完了、今やること、今日のタスク、今週のタスクを表示。
- `/tasks`: `GET /api/tasks?includeInactive=true` の管理一覧。daily / scheduled / weekly / inactive に分類。
- `/tasks/new`: タスク作成フォーム。
- `/tasks/:taskId`: タスク詳細、状態操作、最近の履歴。
- `/tasks/:taskId/edit`: タスク編集フォーム。
- `/tasks/:taskId/respond`: 通知からの遷移を想定した簡易回答画面。
- `/shopping`: 今回は準備中ページのみ。

### 採用した状態管理
React の `useState` / `useEffect` / `useCallback` によるローカル状態管理を継続。操作成功後は対象 API を再取得し、古い状態を残さない方針にした。ホームは `visibilitychange` でも再取得する。

### API クライアント
- `src/api/tasks.ts`: タスク一覧、今日、週、作成、更新、無効化、状態変更、履歴取得。
- `src/api/dashboard.ts`: dashboard today 取得。
- `src/task-labels.ts`: recurrence / assignment / notification / status / weekday の日本語表示を一元化。

### 実装内容
- ボトムナビをホーム、タスク、買い物、設定へ更新。買い物は準備中画面へ遷移する。
- ホームに状態バッジ、タスクカード、weekly プログレスバー、空状態、更新ボタンを追加。
- タスクフォームは recurrence に応じて項目を切り替え、scheduled は複数曜日、weekly は 1〜7 回を入力できる。
- daily / scheduled の状態操作は `targetDate`、weekly は `targetWeekStart` を送信。
- pending / in_progress / completed / skipped の表示と操作ボタン切り替えを追加。
- 他人が対応中のときは上書き操作を表示しない。
- reset は `window.confirm` で確認する。
- 履歴は新しい順で最大 10 件表示。
- DELETE は「無効化」文言で扱い、復元ボタンは出していない。

### フォーム・アクセシビリティ
- label と input/select/textarea を関連付け。
- 必須エラーを文字で表示。
- field error は `aria-describedby` で関連付け。
- 曜日ボタンは `aria-pressed` とチェック表示で選択状態を示す。
- フォーム送信中は `aria-busy` とボタン無効化で二重送信を防止。
- 状態変更結果は `SuccessMessage` の status 表示で通知。

### 作成・変更ファイル
- `src/App.tsx`
- `src/App.test.tsx`
- `src/api/dashboard.ts`
- `src/api/tasks.ts`
- `src/api/tasks.test.ts`
- `src/components/ui.tsx`
- `src/styles.css`
- `src/task-labels.ts`
- `docs/PROJECT_SPEC.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `docs/DEVELOPMENT_PLAN.md`
- `docs/WORKLOG.md`
- `README.md`

### 追加依存関係
なし。React Router や状態管理ライブラリは追加していない。

### 追加テスト
- API クライアント: list/today/week/create/update/state/history/dashboard の呼び出し確認。
- App: 未認証時ログイン表示、dashboard 実データ表示、ボトムナビからタスク一覧表示。

### 確認結果
- `docker-compose run --rm app npm run lint`: 成功。
- `docker-compose run --rm app npm run typecheck`: 成功。
- `docker-compose run --rm app npm test`: 成功。10 files / 42 tests passed。
- `docker-compose run --rm app npm run build`: 成功。
- `docker-compose run --rm app npm run db:migrate:local`: 成功。`No migrations to apply!`
- `docker-compose run --rm app npm audit`: 失敗。`brace-expansion` と `sharp/miniflare/wrangler` 系の high vulnerabilities。提示された修正は `npm audit fix --force` で eslint 10 / wrangler 4.118.0 など破壊的更新を伴うため未実施。
- ホスト側に `node_modules`、`dist`、`.wrangler` が残っていないことを確認。

### Playwright / 手動確認
今回の環境には Playwright 設定・依存がなく、ローカルへ直接インストールしない要件があるため、Playwright スクリーンショットと trace は未作成。Docker 内の既存品質確認と Testing Library による主要 UI テストまで実施した。
2ユーザーの実ブラウザ手動確認も、このターンでは実施できていない。

### 未対応事項
- Playwright の Docker 再現可能な最小構成追加、スクリーンショット、trace 保存。
- 実ブラウザでの 2 ユーザー競合確認。
- 320px / 390px / PC 幅のスクリーンショット確認。
- `npm audit` の依存更新方針決定。
- 買い物、画像、R2、Web Push、Cron、本番デプロイは今回未着手。

### 次回候補
- Playwright 専用 Docker サービスまたは npm script を追加し、`artifacts/playwright/task-ui/` にスクリーンショットと trace を保存する。
- 実ブラウザで 2 ユーザー家庭を使った競合確認を行う。
- audit 対応として eslint / wrangler 更新の影響を確認する。

## 2026-07-31 タスクUI Playwright GUI確認・2ユーザー確認

### 目的
前回未完了だったタスク管理フロントエンドのGUI確認と2ユーザー手動相当確認を、ホストへPlaywrightブラウザや `node_modules` を作らずDocker内で実施する。

### 実装・調整
- `@playwright/test` をdevDependencyに追加し、`npm run test:e2e` を追加。
- `e2e` Docker Composeサービスを追加。Playwright公式Dockerイメージを使い、成果物は `artifacts/playwright/task-ui/` に保存する。
- `playwright.config.ts` と `e2e/task-ui.spec.ts` を追加。
- Vite 6のhost検証でDocker内部ホスト `app` が403になるため、`vite.config.ts` に `allowedHosts` を追加。
- Workerの状態変更Origin検証でDocker内部Originが403になるため、`wrangler.jsonc` / `.dev.vars.example` / composeの `ALLOWED_ORIGINS` に `http://app:5173` を追加。
- フロントAPIの `logout`、`createInvite`、`deactivateTask` が状態変更APIへ空JSON bodyを送らず、`Content-Type: application/json` 検証で失敗する問題を修正。
- タスク詳細画面で詳細APIの定義情報より today/week 表示モデルを優先し、編集後タイトルが古く見える問題を修正。
- タスク詳細画面で `getTask` 成功後も today/week/history の遅延に巻き込まれて詳細全体が表示されない問題を緩和し、詳細本体を先に表示するようにした。

### E2E確認結果
- `docker-compose run --rm e2e npm run test:e2e`: 成功。1 test passed。
- 2つの独立BrowserContextでユーザーA/Bを作成し、家庭招待・参加、Cookie分離、同一家庭メンバー表示を確認。
- UI経由で daily / scheduled / weekly / specific assignee タスク作成を確認。
- APIとUIを組み合わせ、pending / in_progress / completed / skipped、開始、完了、パス、リセット、編集、無効化、競合409、ログアウト後保護ルートを確認。
- 320px / 390px / 430px / 1280pxで水平スクロールがないことを確認。

### 成果物
- `artifacts/playwright/task-ui/01-home-empty.png`
- `artifacts/playwright/task-ui/02-home-multiple-statuses.png`
- `artifacts/playwright/task-ui/03-task-list.png`
- `artifacts/playwright/task-ui/04-task-create-daily.png`
- `artifacts/playwright/task-ui/05-task-create-scheduled.png`
- `artifacts/playwright/task-ui/06-task-create-weekly.png`
- `artifacts/playwright/task-ui/07-task-detail-pending.png`
- `artifacts/playwright/task-ui/08-task-detail-in-progress.png`
- `artifacts/playwright/task-ui/09-task-detail-completed.png`
- `artifacts/playwright/task-ui/10-task-detail-skipped.png`
- `artifacts/playwright/task-ui/11-task-conflict.png`
- `artifacts/playwright/task-ui/12-mobile-320.png`
- `artifacts/playwright/task-ui/13-mobile-390.png`
- `artifacts/playwright/task-ui/mobile-430-check.png`
- `artifacts/playwright/task-ui/14-desktop.png`
- `artifacts/playwright/task-ui/html-report/index.html`
- `artifacts/playwright/task-ui/test-results/.../trace.zip`

### 未完了・注意
- E2E完走後に `docker-compose run --rm app npm run lint` / `typecheck` / `npm test` を並列で再実行したが、Docker Desktop Linux Engine APIが500を返す状態になり、後続のlint/typecheck/test/build/audit/D1再実行は未完了。
- Docker Desktop復帰後に、Docker内で `npm run lint`、`npm run typecheck`、`npm test`、`npm run build`、`npm audit`、`npm run db:migrate:local`、`npm run test:e2e` を再実行する。
- ホスト直下に `node_modules`、`dist`、`.wrangler` は作成されていない。`%USERPROFILE%\AppData\Local\ms-playwright` も作成されていないことを確認済み。

## 2026-08-01 最終品質ゲート再実行

### 目的
Docker Desktop復帰後、前回未完了だった最終品質ゲートをDocker内で順番に再実行する。新機能追加、コミット、push、デプロイ、本番Cloudflare操作は行わない。

### Docker Engine確認
- `docker version`: 成功。Client `28.5.1`、Server Docker Desktop `4.49.0 (208700)` / Engine `28.5.1`。
- `docker info`: 成功。Context `desktop-linux`、Server `28.5.1`、Docker Desktop、Running containers `5`。
- `docker-compose ps`: 成功。`housetodo-app-1` と `housetodo-worker-1` がUp。

### 品質ゲート結果
- `docker-compose run --rm app npm run lint`: 成功。
- `docker-compose run --rm app npm run typecheck`: 成功。
- `docker-compose run --rm app npm test`: 成功。10 files / 42 tests passed。
- `docker-compose run --rm app npm run build`: 成功。`dist/client` はDocker volume内に生成。
- `docker-compose run --rm app npm audit`: 失敗終了。16 high severity vulnerabilities。
- `docker-compose run --rm app npm run db:migrate:local`: 成功。`No migrations to apply!`
- `docker-compose run --rm e2e npm run test:e2e`: 初回はE2E待ち不足で失敗したため、テストの待機を最小修正して全ゲートを再実行。最終結果は成功。1 test passed。

### E2E安定化
- 編集フォームでは初期値読み込み完了を待ってから入力するようにした。
- レスポンシブ撮影前の `/home` 表示待ちを30秒に延長した。
- アプリ機能追加はなし。Playwrightの待機条件だけを最小修正した。

### npm audit詳細
- 件数: high 16件。
- `brace-expansion <=5.0.7`: DoS via unbounded expansion length。依存経路は `minimatch`、`@eslint/config-array`、`@eslint/eslintrc`、`eslint`、`@typescript-eslint/*`、`typescript-eslint`。主にLint/開発ツール系。修正には `npm audit fix --force` が提示され、`eslint@10.8.0` へのbreaking changeを伴う。
- `playwright <1.55.1`: ブラウザダウンロード時のSSL証明書検証に関するhigh。依存経路は `@playwright/test -> playwright`。Docker E2E/開発検証用で、本番バンドルやWorker実行環境には含めない。`npm audit fix` で修正可能と表示。
- `sharp <0.35.0`: libvips由来のCVE群。依存経路は `wrangler -> miniflare -> sharp`。Wrangler/MiniflareのローカルWorker開発・検証系で、本番バンドルには含めないが、Workerローカル実行環境には関係する。修正には `npm audit fix --force` が提示され、`wrangler@4.118.0` への範囲外更新を伴う。
- `npm audit fix --force` は実行していない。

### 成果物確認
- `artifacts/playwright/task-ui/01-home-empty.png` から `14-desktop.png` まで、および `mobile-430-check.png` が存在。
- `artifacts/playwright/task-ui/html-report/index.html`: 存在。
- `artifacts/playwright/task-ui/test-results/.../trace.zip`: 存在。

### ホスト生成物確認
- `node_modules=False`
- `dist=False`
- `.wrangler=False`
- `%USERPROFILE%\AppData\Local\ms-playwright=False`
