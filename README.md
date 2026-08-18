# HouseToDo

家庭内の家事・買い物・通知を共有するモバイルファーストPWAです。現在の実装は、認証、家庭・メンバー、タスク、買い物、買い物画像、PWA、Push購読、Web Push送信、通知schedulerまでを含みます。

## 現在できること

- Cookieベースの認証、家庭作成・招待・参加、メンバー管理
- daily / scheduled（曜日指定） / weeklyタスク、担当者、状態遷移、完了履歴、今日・今週表示
- 買い物項目、購入状態、テンプレート、家庭内共有
- 買い物項目ごとの画像アップロード・表示・削除（ブラウザでWebP化、R2非公開保存、容量管理）
- PWA manifestとService Worker、通知権限・Push購読の設定
- staging/development/testでのテストPush、タスク通知設定、evening summary、5分間隔scheduler

新しいtask model（deadline、notification offset、recurrence redesign等）とcanonical monthly Calendar UIは実装済みです。詳細は [PROJECT_SPEC](docs/PROJECT_SPEC.md) と [ROADMAP](docs/ROADMAP.md) を参照してください。

## 技術スタック

React + TypeScript + Vite、Cloudflare Worker、D1、R2、Workers Static Assets、Web Crypto、Web Pushです。主要な構成は [ARCHITECTURE](docs/ARCHITECTURE.md) に集約しています。

## ローカルセットアップ

必要環境: Node.js、Docker Desktop（推奨）。

```powershell
Copy-Item .env.example .env
Copy-Item .dev.vars.example .dev.vars
docker compose up
```

秘密値は `.env` / `.dev.vars` にのみ設定し、コミットしないでください。必要なsecret名は [STAGING_DEPLOYMENT](docs/STAGING_DEPLOYMENT.md) に記載しています。

## 開発コマンド

```powershell
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
npm run db:migrate:local
npm run cf:dev
```

Dockerが利用できる場合は、プロジェクトのcompose設定に従ってコンテナ内で実行します。Dockerが利用できない場合は、host実行に切り替えたことと確認範囲を報告してください。

## ドキュメント案内

- [PROJECT_SPEC](docs/PROJECT_SPEC.md): 現在のプロダクト仕様。behaviorのsource of truth
- [ARCHITECTURE](docs/ARCHITECTURE.md): 現在の技術構成。進捗ログではない
- [DECISIONS](docs/DECISIONS.md): 長期的に残す設計判断
- [ROADMAP](docs/ROADMAP.md): 未実装のfuture work
- [STAGING_DEPLOYMENT](docs/STAGING_DEPLOYMENT.md): staging runbook
- [CODEX_INSTRUCTIONS](docs/CODEX_INSTRUCTIONS.md): 開発時のCodexルール
- [.ai/MILESTONE.md](.ai/MILESTONE.md): 現在のmilestone
- [.ai/TASKS.md](.ai/TASKS.md): current milestoneの未完了task

`docs/images/household-todo-screen-rough.png` は初期コンセプト用の参考画像であり、現在UIの正確な仕様ではありません。

## staging / production

stagingは `house-to-do-staging` Worker、`house-to-do-staging` D1、`house-to-do-attachments-staging` R2を使います。現在のCronはwrangler設定上 `*/5 * * * *` です。手順と確認コマンドは [STAGING_DEPLOYMENT](docs/STAGING_DEPLOYMENT.md) を参照してください。

productionは明示的な承認なしに操作しません。push、deploy、remote migration、secret変更も作業範囲に明記された場合のみ実行します。

## E2E verification

Local/self-contained E2Eは次で実行します。Dockerが使える場合は`docker compose run --rm e2e`でも同じsuiteを実行できます。

```powershell
npm run test:e2e
```

Docker unavailable時のhost Worker実行では、認証APIのOrigin許可に合わせて`PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174`を使います。local configはstaging-only specを実行せず、`staging-only E2E; run npm run test:e2e:staging with staging URL and credentials`として明示skipします。

Staging E2Eは専用commandだけを使います。

```powershell
npm run test:e2e:staging
```

`STAGING_E2E_BASE_URL`、`STAGING_E2E_OWNER_EMAIL`、`STAGING_E2E_OWNER_PASSWORD`、`STAGING_E2E_MEMBER_EMAIL`、`STAGING_E2E_MEMBER_PASSWORD`、`STAGING_E2E_CROSS_EMAIL`、`STAGING_E2E_CROSS_PASSWORD`がすべて必要です。不足時はlocal URLへfallbackせず、明示skipになります。値はrepositoryへ記録しません。
