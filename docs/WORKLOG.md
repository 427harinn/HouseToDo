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
