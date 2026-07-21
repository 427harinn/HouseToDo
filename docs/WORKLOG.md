# 作業記録

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
