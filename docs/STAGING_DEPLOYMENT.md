# Staging runbook

> stagingへの安全な確認・デプロイ手順です。productionのresource、secret、migration、deployは対象外で、明示承認なしに操作しません。

## 現在の構成

| 項目 | staging |
|---|---|
| Worker | `house-to-do-staging` |
| URL / origin | `https://house-to-do-staging.427harinn.workers.dev` |
| D1 | `house-to-do-staging` |
| R2 | `house-to-attachments-staging` |
| Static Assets | `dist/client`、SPA fallback |
| Observability | 有効（stagingのみ） |
| Cron | `*/5 * * * *` |
| migration source | repositoryの `migrations/`（現在0011まで） |

Worker名、binding、Cron、originの現在値は `wrangler.jsonc` をsource of truthとします。Version IDは固定記載しません。remote migrationの適用済み状態は次の確認コマンドで都度確認します。

## Secret名

staging Workerには必要に応じて次のsecret名を登録します。値はこのrepositoryやrunbookへ書きません。

- `SESSION_SECRET`
- `WEB_PUSH_VAPID_PUBLIC_KEY`
- `WEB_PUSH_VAPID_PRIVATE_KEY`
- `WEB_PUSH_SUBJECT`

VAPID keyはrepository外で生成し、secret値をコマンド引数やファイルへコミットしないでください。登録・存在確認は必ず `--env staging` を付け、値を表示しない方法を使います。

```powershell
Get-Content -Raw C:\path\to\WEB_PUSH_VAPID_PUBLIC_KEY | npx wrangler secret put WEB_PUSH_VAPID_PUBLIC_KEY --env staging
Get-Content -Raw C:\path\to\WEB_PUSH_VAPID_PRIVATE_KEY | npx wrangler secret put WEB_PUSH_VAPID_PRIVATE_KEY --env staging
npx wrangler secret list --env staging
```

## 確認コマンド

```powershell
npx wrangler whoami
npx wrangler d1 migrations list DB --env staging --remote
npx wrangler r2 bucket list
npm run cf:validate:staging
```

`scripts/validate-staging-config.mjs`には旧Cron値を検証する既知の不整合が残っています。コード/config変更禁止のcleanup範囲では修正せず、stagingのCron判断には `wrangler.jsonc` を使います。validator修正は別タスクです。

## 安全な順序

1. `git status --short` と `git diff --check`を確認する。
2. Dockerが利用可能ならlint、typecheck、test、build、local migrationをDocker内で実行する。
3. 対象がstagingであること、D1名、R2名、migration一覧、originを確認する。
4. 必要な場合だけ `wrangler deploy --env staging --dry-run` を実行する。
5. 承認された場合だけstaging deploy、remote migration、secret操作を行う。
6. `/api/health`、認証、家庭、task、shopping、画像、notificationのsmoke testを行う。

本番操作、production deploy、production migration、production secret、git pushはこのrunbookの通常手順ではありません。

## Web Push smoke test

Push購読後、staging/development/testでのみ利用できる `POST /api/notifications/test` を使います。productionではrouteが無効です。失敗時はstage / category / statusだけを確認し、endpoint、p256dh、auth、VAPID値、Authorization、payload、response bodyを記録しません。

## 復旧と停止条件

対象environment、D1、R2、migration、originが一致しない場合は停止します。secret値・API token・ユーザーパスワード・実データを記録しません。migration失敗時に既存SQLを書き換えず、適用状況とエラーだけを報告します。
