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
