# Staging runbook

## 2026-08-14 Calendar staging verification result

- Commit `45b6e1f2212b221c338b406fd8b65cbce854f431` passed the local lint, typecheck, test, build, local migration, staging-config, and diff-check gates. The remote migration list was read-only checked: `0001` through `0012_task_model_foundation.sql` are applied and no migration is pending.
- `npx wrangler deploy --env staging --dry-run` and `npx wrangler deploy --env staging` succeeded for `house-to-do-staging`. Version ID: `5cb54728-1dac-441b-aaa6-d803ad350351`. Cron remained `*/5 * * * *`; no remote migration apply was run.
- `/api/health` returned HTTP 200 with `db: true` and `r2: true`. Existing staging login loaded Home, Calendar, Shopping, and Settings. Calendar displayed the household-local August 2026 month, selected date, previous/next month, and Today navigation.
- Staging Calendar smoke verified the existing daily task plus temporary `weekly_fixed`, `monthly_fixed`, `weekly_flexible`, and `monthly_flexible` tasks. Fixed markers appeared on the expected dates; flexible tasks stayed out of grid markers and appeared in the selected-date weekly/monthly sections. Task detail navigation and browser back returned to Calendar. One flexible completion displayed `1回実施` and `完了`.
- Temporary Calendar fixtures were identified by exact title and marked inactive after verification. Calendar returned to the existing-task-only state. Browser error logs were empty. The active once marker remained covered by the local projection tests and the existing inactive staging once fixture; no existing staging data was changed.
- Production resources, secrets, Cron, and migrations were untouched; no git push was performed.

## 2026-08-14 Phase 5 staging verification result

- Staging-only migration `0012_task_model_foundation.sql` was applied successfully. The remote migration list is clean, and the canonical task columns plus `task_records.occurrence_key` / `period_key` are present.
- `wrangler deploy --env staging --dry-run` and `wrangler deploy --env staging` succeeded for `house-to-do-staging`; `/api/health` returned HTTP 200 with D1/R2 bindings available. Cron remained `*/5 * * * *`.
- Existing staging login, household, task, shopping, and settings screens loaded. The six canonical task types were created and displayed in separate UI groups. A daily `5 minutes before` reminder produced one `sent` delivery with a canonical occurrence target key.
- Verification stopped at the flexible recurrence achievement gate: after one weekly-flexible completion, a second completion did not increase `completedCount`; the remote task-record aggregate remained one completed record. No code fix or follow-up deploy was performed.
- The six temporary `P5 verify ...` tasks were limited to an exact-title staging cleanup and marked inactive. Existing records and delivery evidence were retained. Production resources, migrations, deploys, Cron, and secrets were untouched; no git push was performed.

## 2026-08-14 Phase 5.1 staging re-verification result

- Local fix commit `d49868a49ff074eac3897506c690129f7d154ef9` was deployed after the staging migration read-only check and dry-run passed. The target was `house-to-do-staging`; `/api/health` returned HTTP 200 with D1/R2 bindings available.
- `weekly_flexible` and `monthly_flexible` each passed the staging UI flow `complete -> もう一度実施`: `completedCount` changed from 1 to 2 and two completed history entries remained in the same `period_key`. Canonical period records used `target_date = NULL`.
- A completed weekly-flexible task with a 15:20 JST deadline and five-minute reminder was completed at 15:12 before the reminder window. After the next Cron window, its delivery aggregate remained zero. Skip state was also confirmed for a separate temporary flexible task. No duplicate notification target scopes were found.
- Existing offset-positive smartphone Push receipt and notification tap navigation remain accepted from Phase 5. Legacy compatibility and scheduler retry/lease behavior remain covered by the local regression suite. The four temporary `P5.1 verify ...` tasks were deactivated by exact title; records and delivery evidence were retained.
- The repository staging validator now expects the configured `*/5 * * * *` Cron. Production resources, migrations, deploys, Cron, and secrets were untouched; no git push was performed.

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
| migration source | repositoryの `migrations/`（現在0012まで） |

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
