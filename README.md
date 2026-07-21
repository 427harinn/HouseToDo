# おうちTodo

家庭内の家事・買い物・通知を二人で共有するための、モバイルファーストなPWAです。現在は開発環境とWorker API基盤、認証方式の最小技術検証を整備した初期段階です。

## 採用技術

- React
- TypeScript
- Vite
- Cloudflare Workers
- Cloudflare D1
- Cloudflare R2
- Wrangler
- Vitest
- ESLint
- Prettier
- Docker / Docker Compose

Cloudflare Workers Static Assets で、React SPA と Worker API を同じ Worker にまとめる方針です。

## 前提環境

ホスト側に必要なものは以下です。

- Git
- Docker
- Docker Compose
- VS Code または任意のエディタ

Node.js、npm、Wrangler、Lint、テスト、ビルドは原則として Docker コンテナ内で実行します。

## コマンドについて

この環境では `docker-compose` で動作確認しています。`docker compose` が使える環境では、同じコマンドを `docker compose ...` に読み替えて実行できます。

## 初期セットアップ

```bash
docker-compose build
```

必要に応じて、ローカル用の秘密情報ファイルを作成します。

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` には本番用の値を入れず、Git 管理しないでください。

## 開発サーバー

```bash
docker-compose up
```

バックグラウンドで起動する場合:

```bash
docker-compose up -d
```

起動後、ホストのブラウザから以下を開きます。

```text
http://127.0.0.1:5174
```

`localhost:5174` は環境によって別プロセスへ解決されることがあるため、確認済みURLとして `127.0.0.1` を使ってください。

Worker APIのヘルスチェック:

```text
http://127.0.0.1:8787/api/health
http://127.0.0.1:5174/api/health
```

`5174/api/health` は、Vite dev server から Worker service へプロキシされます。

現在の最小API:

```text
GET  /api/health
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/households
GET  /api/households/current
PATCH /api/households/current
GET  /api/households/current/members
POST /api/households/current/invites
POST /api/households/join
```

認証APIと家庭APIは基盤検証用の最小実装です。完成版のログイン画面、新規登録画面、家庭作成画面、招待参加画面、パスワード再設定、メール確認はまだ未実装です。

Cookie認証を使う状態変更APIでは、`Origin` ヘッダーと `Content-Type: application/json` を検証します。ローカル開発では `.dev.vars` の `ALLOWED_ORIGINS` に以下を設定します。

```text
ALLOWED_ORIGINS=http://127.0.0.1:5174,http://localhost:5174
```

停止する場合:

```bash
docker-compose down
```

ログ確認:

```bash
docker-compose logs app
docker-compose logs worker
docker-compose logs -f
```

コンテナを再ビルドする場合:

```bash
docker-compose build
```

コンテナとネットワークを作り直す場合:

```bash
docker-compose down
docker-compose up -d
```

Volumeも含めて初期化する場合は、Docker内の `node_modules`、Wrangler状態、ビルド出力も消えます。

```bash
docker-compose down -v
docker-compose build
docker-compose up -d
```

## コンテナ内でのコマンド実行

```bash
docker-compose run --rm app npm run lint
docker-compose run --rm app npm run typecheck
docker-compose run --rm app npm test
docker-compose run --rm app npm run build
docker-compose run --rm app npm audit
```

依存関係をDocker volume内へ入れ直す場合:

```bash
docker-compose run --rm app npm ci
```

ホスト直下へ `node_modules` を作らないでください。

## ホットリロード確認

`docker-compose up` 起動中に `src/App.tsx` などを編集し、`http://127.0.0.1:5174` の表示が自動更新されることを確認します。

今回の検証では、画面文言の一時変更がブラウザへ反映されることを確認済みです。

## Cloudflare / Worker 開発

通常の開発起動では `worker` service が次を実行します。

```bash
npm run build
npm run cf:dev
```

D1 のローカルマイグレーション:

```bash
docker-compose run --rm app npm run db:migrate:local
```

リモート D1 への反映は本番環境に影響するため、明示的な依頼なしに実行しないでください。

```bash
docker-compose run --rm app npm run db:migrate:remote
```

## よくあるエラー

### Docker Desktopが起動していない

次のようなエラーが出ます。

```text
dockerDesktopLinuxEngine: The system cannot find the file specified.
```

Docker Desktopを起動してから再実行してください。

### `docker compose` が使えない

この環境では `docker-compose` が動作確認済みです。

```bash
docker-compose build
docker-compose up
```

### ポートが使用中

`5173` は別プロジェクトで使われていたため、このプロジェクトではホスト側 `5174` を使います。`8787` はWorker API用です。

### ホスト側に `node_modules` ができた

現在のCompose設定では、依存関係、ビルド出力、Wrangler状態をDocker volumeへ保持します。ホスト側に `node_modules`、`dist`、`.wrangler` が残っている場合は、古い設定や手動コマンドで作られた生成物の可能性があります。中身を確認し、不要な生成物であることを確認して削除してください。

## 主要ドキュメント

- [プロジェクト仕様書](docs/PROJECT_SPEC.md)
- [Codex向け開発指示書](docs/CODEX_INSTRUCTIONS.md)
- [開発計画](docs/DEVELOPMENT_PLAN.md)
- [アーキテクチャ](docs/ARCHITECTURE.md)
- [作業記録](docs/WORKLOG.md)
- [設計判断](docs/DECISIONS.md)

画面ラフ:

```text
docs/images/household-todo-screen-rough.png
```

## 現在の実装状況

- React/Vite のプレースホルダー画面を追加済み
- Worker のルーティング、共通レスポンス、共通エラー処理、入力検証、Repository層を追加済み
- Worker の `/api/health` と最小認証APIを追加済み
- 状態変更APIのOrigin検証を追加済み
- 家庭作成、現在の家庭取得、家庭更新、メンバー一覧、招待コード発行、招待参加APIを追加済み
- React画面から `/api/health` へ疎通し、接続状態を表示
- D1 初期マイグレーション案、`sessions.token_hash`、家庭招待関連インデックス追加マイグレーションを追加済み
- PBKDF2-SHA-256によるパスワードハッシュ、D1にはセッショントークンハッシュのみ保存する方式を技術検証済み
- Docker / Dev Container を追加済み
- Lint、型チェック、テスト、ビルド用 npm scripts を追加済み
- Dockerコンテナ内で Lint、型チェック、テスト、ビルド、npm audit を確認済み

完成版の認証UI、家庭UI、タスク、買い物、画像アップロード、Web Push、Cron 通知、本番デプロイは未実装です。

## 今後の開発フェーズ

1. 基盤の調整と Cloudflare リソース作成
2. 認証とゲストモード
3. 家庭グループと招待
4. タスク管理
5. ホーム画面
6. 買い物リスト
7. 画像添付
8. PWA と通知
9. 品質改善と iPhone 実機確認
