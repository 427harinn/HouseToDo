# Staging runbook

## 2026-08-26 Staging smoke recovery / cleanup dry-run

- Source SHA: `28e341a1bfab70a18e00bb39386252b113a22361`. This recovery turn used no migration, deploy, registration, or production operation.
- Runner diagnosis: `RUNNER_LOCATOR_BUG`. The prior fixed `STG-B` exact accessible-name locator failed; local verification now uses the actual member display name from `/api/households/current/members`, the `担当` dialog, and a dialog-scoped text locator. Registration settles on pathname, canonical heading, and loader disappearance. Calendar uses the production `grid` accessible name and semantic date-cell `aria-label`.
- Local runner reproduction passed `3/3`; related local Chromium suites passed `10/10` (Calendar, Auth entry, and M7 two-user coverage). Vitest passed 38 files / 238 tests; lint, typecheck, and build passed.
- Read-only staging inventory found 6 synthetic users and 3 synthetic households. Each candidate household had a synthetic creator and exactly two synthetic members. Non-synthetic members: 0. Cross-household references: 0.
- Matching row counts were limited to users 6, sessions 6, household members 6, household invites 3, and household image usage 1. Task, task record, task template, Shopping, attachment, push, notification, image-reservation, and orphan-R2 rows: 0.
- Previous failed synthetic fixtures remain retained. No account/household canonical deletion API exists. A fixed-ID dependency-ordered cleanup SQL was prepared in a private ignored artifact; it was not executed. Cleanup execution: `NO`.
- Staging D1 remains 17/17 with no pending migrations. Worker `6ee2b2d8-13a8-4ab0-a01c-740af3b4e78c` and `/api/health` remained unchanged and healthy. Cron, R2, and secrets were unchanged; production was untouched.
- Final recovery verdict: `READY_FOR_TARGETED_STAGING_FIXTURE_CLEANUP`. This does not advance the release to real iPhone validation.

## 2026-08-27 Targeted staging synthetic fixture cleanup

- The retained failed synthetic fixtures were cleaned up once from the explicit staging D1 using the pre-resolved fixed-ID manifest. Six users, three households, six sessions, six household members, three household invites, and one household image-usage row were deleted: 25 rows total, matching the expected count.
- Pre-cleanup recovery bookmark was captured: `YES`. The bookmark itself remains private and is not recorded here. No non-synthetic member or cross-household reference was affected.
- Critical application aggregates were preserved: tasks `62 -> 62`, task records `28 -> 28`, Shopping items `28 -> 28`, and Shopping templates `3 -> 3`. Total users changed `16 -> 10`, households `10 -> 7`, and sessions `75 -> 69` as expected.
- Staging D1 remains `17/17` with no pending migrations. Worker `6ee2b2d8-13a8-4ab0-a01c-740af3b4e78c` was unchanged; `/api/health` remained HTTP 200 with `db: true` and `r2: true`. Cron and R2 remained unchanged, and secrets were unchanged.
- Migration, deploy, registration, Time Travel restore, and production operations were not run. The cleanup SQL and recovery bookmark remain ignored private artifacts; no private IDs or credentials were committed.
- Cleanup verdict: `READY_FOR_FINAL_SYNTHETIC_VALIDATION`. New registration is not authorized by this step; the next boundary requires separate approval.

## 2026-08-18 Shopping planned purchase date / Calendar staging verification

- Implementation commit `ef5a89bf0ff8c3789fc0702670b2c5c77a32582e` passed lint, typecheck, 201 tests, build, local migration, staging-config validation, and diff-check. Docker was unavailable, so the documented host gates were used.
- The pre-apply migration list showed only `0014_shopping_planned_purchase_date.sql` pending after `0013`. The additive migration was applied to staging D1; the post-check reported no pending migrations and confirmed nullable `shopping_items.planned_purchase_date` plus `idx_shopping_items_household_planned_purchase_date (household_id, planned_purchase_date)`.
- Staging dry-run and deployment succeeded for `house-to-do-staging`. Version ID: `88403adb-b678-4528-916e-a67829cc5812`. `/api/health` returned HTTP 200 with `db: true` and `r2: true`; Cron remained `*/5 * * * *`.
- Authenticated staging verification passed for Shopping create/detail/edit/clear, purchase/unpurchase date persistence, Calendar's separate `買うもの` section and distinct marker/count/aria-label, purchased text/icon state, Shopping detail navigation, and date movement between Calendar cells. Existing fixed Task markers and weekly/monthly flexible sections remained intact.
- Recent reused pending and purchased items while leaving the planned date empty. Template direct-add created items without a planned date, and `shopping_templates` has no planned-date column. The bounded range and household isolation remain covered by the passing local API tests; staging used a representative in-range household fixture without creating another household.
- The Shopping planned-date form and Calendar marker/section passed a 390px staging smoke with no horizontal overflow. Browser warning/error logs were empty. Read-only D1 checks found no notification deliveries for the temporary items, confirming that Shopping remains outside scheduler/Push behavior.
- All temporary Shopping items were deleted after clearing their planned dates. The temporary template was deactivated (`active = 0`) using existing semantics; final read-only checks found zero temporary Shopping items and zero active temporary templates. Images/R2, secrets, production resources, production migrations/deploys, and git push were untouched.

## 2026-08-14 Shopping image picker simplification staging verification

- Commit `cfbe70465313279137915c38de15281a980a8443` was deployed to `house-to-do-staging` as version `c3ee3b68-6978-4857-8045-ca6551d9c59d` after local gates, the read-only migration check, and dry-run success.
- The staging migration list reported no pending migrations; read-only D1 inspection confirmed `0001` through `0013_task_templates.sql` are applied. No remote migration was applied.
- `/api/health` returned HTTP 200 with `db: true` and `r2: true`. Authenticated staging browser smoke loaded Shopping list, Shopping new, Shopping templates, and Calendar without browser errors.
- Shopping new exposes one `写真を選ぶ` button and no `写真を撮る` button or camera input. `#shopping-image` has `accept="image/*"` and no `capture` attribute.
- A staging browser fixture selection passed preview, remove, and re-selection. Image item save/R2 upload was not repeated because the existing staging verification already covered the unchanged upload flow; no temporary item or attachment was created.
- Real iPhone OS picker behavior was not exercised by Codex. Manual iPhone verification remains: confirm that the OS picker offers options such as Library and Take Photo from `写真を選ぶ`.
- Production resources, secrets, Cron, production migrations, and git push remain untouched.

## 2026-08-14 Shopping UX Phase 1 staging verification result

- Implementation commit `7d150a72e19a3ac0c1f368eccda54269a549eac7` passed all local gates. The remote migration check reported no pending migrations; read-only schema inspection confirmed the existing `task_templates` table/index and no migration was applied.
- `npx wrangler deploy --env staging --dry-run` and `npx wrangler deploy --env staging` succeeded for `house-to-do-staging`. Version ID: `e409489e-26a3-4955-bc97-da5301da4fcf`. Cron remained `*/5 * * * *`; no production/default deploy was run.
- `/api/health` returned HTTP 200 with `db: true` and `r2: true`. Authenticated staging navigation loaded Home, Shopping, Shopping new, Shopping templates, Calendar, and Settings.
- Shopping Recent and Template flows passed: purchased items remained eligible for Recent, Recent/Template selection prefilling did not immediately create an item, name/quantity/note were copied, and a Recent-derived item was saved as pending with no purchaser, purchase time, or historical image preview.
- Camera and library inputs both reached the same preview/remove flow. The camera input exposed `capture="environment"`; the library input had no capture attribute. A library-selected image was saved successfully through the existing compression and R2 attachment flow. The camera-oriented input was also exercised with a staging browser file chooser; real iOS/Android OS picker behavior remains device-dependent.
- Existing Shopping list, purchase, unpurchase, detail, edit, template management, and Calendar smoke behavior passed. Temporary items were deleted; the temporary template was deactivated (`active = 0`) using the existing semantics. Read-only cleanup checks found zero temporary Shopping items and zero active temporary templates. Browser error logs were empty.
- Production resources, secrets, Cron configuration, production migrations, and git push remain untouched.

## 2026-08-14 Task reuse / template staging verification result

- Implementation commit `4e538ad510fbc1156b07f2c92349f8db578280c9` was deployed to `house-to-do-staging` as version `6d104f8e-2705-44d4-93b6-1776801c6628` after all local gates, migration 0013 pre-check, and dry-run passed. `0013_task_templates.sql` was applied to staging; the post-check reported no pending migrations and confirmed `task_templates` plus its two indexes.
- Authenticated staging Playwright verification passed for the existing staging test account without recording credentials: login/session/household load, `GET /api/tasks/recent`, recent task UI and form prefill, start-date exclusion, task creation with a new ID, Task detail -> template save, template list/edit/reuse/deactivate, canonical recurrence/deadline/reminder/assignment prefill, and 390px mobile overflow checks.
- Home/dashboard and Calendar API/UI checks confirmed the template itself did not appear as a task, marker, selected-date detail, or dashboard count. Shopping, member settings, and existing navigation loaded. D1 read-only cleanup aggregate found zero active temporary tasks, zero active temporary templates, and zero notification delivery rows containing the temporary template ID. Browser page errors, unexpected console errors, and request failures were empty; expected authentication behavior was not treated as an error.
- Temporary verification tasks were logically deactivated and the temporary template was deactivated. No existing task, template, record, or history was deleted. Production resources, secrets, Cron, and git push remain untouched.

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
| R2 | `house-to-do-attachments-staging` |
| Static Assets | `dist/client`、SPA fallback |
| Observability | 有効（stagingのみ） |
| Cron | `*/5 * * * *` |
| migration source | repositoryの `migrations/`（現在0017まで） |

Worker名、binding、Cron、originの現在値は `wrangler.jsonc` をsource of truthとします。Version IDは固定記載しません。remote migrationの適用済み状態は次の確認コマンドで都度確認します。

## Secret名

staging Workerには必要に応じて次のsecret名を登録します。値はこのrepositoryやrunbookへ書きません。

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
