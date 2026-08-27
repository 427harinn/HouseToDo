# Staging runbook

## 2026-08-27 M8B compatibility fixture date regression

- The local baseline stopped because the compatibility fixture requested fixed date `2026-08-26`, while the production action timestamp used wall-clock time. On 2026-08-27 JST, the completed record therefore fell outside the household-local date-filtered history. Diagnosis: `TEST_TIME_DEPENDENCY`.
- The target test now pins Date-only fake time to `2026-08-26T03:00:00.000Z` (2026-08-26 JST), asserts the action timestamps and fixture date, and always restores real timers. Product runtime change: `NONE`.
- M8B targeted test passed 3/3; Vitest passed 38 files / 238 tests; lint, typecheck, build, related local Chromium (10/10), and local runner reproduction (3/3) passed. Staging was not written; registration, migration, deploy, production operations, and Evidence finalization were not run.
- Verdict: `LOCAL_BASELINE_RESTORED`. Final synthetic validation remains paused pending approval.

## 2026-08-27 Notification settings HTTP 400 diagnosis

- The failed runner PATCH sent only `morningSummaryEnabled` and `morningSummaryTime`. The staging smoke was not retried and no remote notification PATCH was made during this diagnosis.
- The server contract requires the full notification settings object: `eveningSummaryEnabled`, `eveningSummaryTime`, `morningSummaryEnabled`, `morningSummaryTime`, and `timezone`. Diagnosis: `RUNNER_NOTIFICATION_PATCH_CONTRACT_BUG`.
- The runner now performs GET current settings, sends a full-object temporary PATCH while preserving the other fields, verifies persistence, and restores the original full object. Production runtime change: `NONE`.
- Local isolated notification settings flow passed `3/3`: defaults, temporary full PATCH persistence, and restore. The partial PATCH `400` contract is covered by the worker test; full PATCH remains covered by the existing `200` test.
- Lint, typecheck, Vitest (38 files / 238 tests), build, and local runner reproduction (3/3) passed. Staging registration, notification PATCH, migration, deploy, production operations, Evidence finalization, and PR creation were not run.
- Verdict: `READY_FOR_FINAL_SYNTHETIC_VALIDATION_RETRY_2`. Staging smoke retry and real iPhone validation remain paused pending approval.

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

## 2026-08-27 Final synthetic validation retry result

- Preflight、local gate、recording context local reproduction 3/3、Cloudflare Docker read access、staging D1 17/17、health PASSを確認した。
- Synthetic A/B registration、dedicated household作成、invite/join、core Home / Calendar / Shopping / Other navigationまでは成功した。Notificationsのtemporary setting changeでHTTP 400が発生し、`AUTHENTICATED_SMOKE_FAILED` として停止した。Task snapshot、Calendar action date、Shopping sync、two-user、isolationのfinal smokeは未実行で、成功扱いにしていない。
- 失敗後の追加registrationは行わず、今回作成したfixtureだけをfresh recovery bookmark取得・fixed-ID scope確認後にtargeted cleanupした。users 2 → 0、households 1 → 0、実削除9行。Task/TaskRecord/Shopping fixtureは作成されていない。
- Cleanup後のcritical rowsは tasks 62、task_records 28、shopping_items 28、shopping_templates 3 で保持された。Workerはunchanged、migration/deployはNOT RUN、productionはNOT TOUCHED。
- credentials、ID、invite code、bookmark本体は保存・記録していない。Evidence finalization、PR作成、real iPhone validationは実行していない。
- Verdict: `AUTHENTICATED_SMOKE_FAILED`。Notifications HTTP 400の原因調査と別途承認後の再試行が必要。追加registrationは禁止。

## 2026-08-27 Recording context recovery / retained fixture cleanup

- Authenticated validation attempt は、録画用context作成後の初期遷移不足により停止した。診断は `RUNNER_RECORDING_CONTEXT_INITIALIZATION_BUG`。recording context helperにstaging `/home`への明示遷移、auth/household bootstrap settled、Home heading、loader消失、Bottom Navigation確認を追加した。production runtime変更はない。
- local Worker/D1でA/Bのin-memory storageStateを新しいrecording contextへ渡し、両contextの `/home` 初期遷移と Home → Calendar → Shopping → Other → Home を3/3 PASS。Task assignee、Calendar semantic locator、redirect settledもPASS。
- Docker app serviceのWrangler OAuth read accessを復旧し、staging D1 read-only確認は `house-to-do-staging`、migration 17/17 / pending 0、health `db: true` / `r2: true`。
- retained failed synthetic fixtureのみを、read-only scope再解決・fresh Time Travel recovery bookmark取得・fixed-ID SQL preflight後にtargeted cleanupした。users 2 → 0、households 1 → 0、members 2 → 0、sessions 2 → 0、invites 1 → 0、実削除8行。Task/TaskRecord/Shopping fixtureは作成されておらず、既存critical rowsは tasks 62、task_records 28、shopping_items 28、shopping_templates 3 のまま保持された。
- Task/Shopping fixtureはNOT CREATED。credentials、ID、invite code、bookmark本体は保存・記録していない。今回のcleanup後にsynthetic fixtureは0 users / 0 households。
- Worker `6ee2b2d8-13a8-4ab0-a01c-740af3b4e78c` はunchanged。migration、deploy、registrationは今回実行していない。Cron、R2、secrets、productionはNOT TOUCHED。
- Verdict: `READY_FOR_FINAL_SYNTHETIC_VALIDATION_RETRY`。次工程の承認までは新規registration、authenticated smoke、cleanup retryを実行しない。

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

## 2026-08-27 Retained fixture cleanup / task history runner diagnosis

- Final retry 2 は `AUTHENTICATED_SMOKE_FAILED`（Task completed-history locator timeout）で停止した。Task/Shoppingのstaging smoke再試行は行っていない。
- 前回cleanupのtransport failureは `DOCKER_PRIVATE_ARTIFACT_NOT_MOUNTED`。private SQLを一時的にapp containerへコピーして、fresh recovery bookmark取得後、固定ID scopeのtargeted cleanupを1回実行した。実削除は12行、users 2 → 0、households 1 → 0、Task 1 → 0、TaskRecord 1 → 0。Shoppingは0のまま。
- cleanup前後のcritical rowsは tasks 63 → 62、task_records 29 → 28、shopping_items 28 → 28、shopping_templates 3 → 3。今回fixture以外のデータ減少は確認されなかった。
- Task history diagnosis は `RUNNER_OWNER_SMOKE_CONTEXT_INITIALIZATION_BUG`。owner/member smoke pageへ共有のauthenticated `/home` initializationを追加し、local runner reproductionは3/3 PASS。production runtime変更はない。
- Notification local flowは3/3 PASS。lint、typecheck、Vitest 38 files / 238 tests、buildもPASS。
- 関連Chromium suiteは10 tests中4 PASS / 6 FAILED。baseline悪化として自動retryせず停止した。staging registration、migration、deploy、production操作は行っていない。
- recovery bookmark本体、ID、credentials、email、invite codeは記録・commitしていない。Verdict: `LOCAL_RELATED_CHROMIUM_FAILED`。追加registrationとstaging smoke retryは保留。

## 2026-08-27 Related Chromium diagnosis

- 同じlocal-only related Chromium 10件を3回確認した結果は、初回 4/10、2回目 5/10、3回目 5/10。自動snapshot更新、staging操作、production操作は行っていない。
- 再現した5件（Calendar 1件、M7 Task/Shopping/Task Pass/Other 4件）は登録後の `POST /api/auth/register` HTTP 500。画面は `/register` に留まり、alertはサーバー内部エラーだった。workerの安全な診断ログは `user-lookup-start`、`SQLITE_ERROR` / `no such column`。
- local D1のread-only migration listで `0009`〜`0017` が未適用と確認した。production codeの `users` lookupが0015追加列を参照するため、失敗分類は `TEST_ENVIRONMENT_DRIFT`。local D1 migrationは今回のmigration禁止条件により適用していない。
- 初回のみ失敗したM6 guest-route mocked testは、2回目・3回目に再現せず、`TEST_ENVIRONMENT_DRIFT` の一過性結果として記録した。runner/production runtimeの追加変更はない。
- local worker healthはHTTP 200。既存runner reproductionは3/3 PASS、Vitest 38 files / 238 tests、lint/typecheck/buildはPASS。Related Chromiumは未復旧のため、commit/pushは保留。Verdict: `LOCAL_RELATED_CHROMIUM_FAILED`。

## 2026-08-27 Local D1 schema recovery / Chromium recheck

- Related Chromiumの5件（Calendar、M7 Task sync、M7 Shopping sync、M7 Task Pass、M7 Other/isolation）は、local D1の`0009`〜`0017`未適用による`POST /api/auth/register` HTTP 500（`SQLITE_ERROR` / `no such column`）として`TEST_ENVIRONMENT_DRIFT`に分類した。M6の一過性failureを含む6件も同じlocal environment driftの履歴として扱った。
- local D1へ`0009`〜`0017`を順当に適用し、local migration listは0017まで適用・pending 0となった。local worker restart後、local auth registration smokeは成功し、既知の5件は5/5 PASS。production runtimeは変更していない。
- 関連10件はschema recovery後に10/10 PASSを2回確認した。その後の最終コード再確認では、worker containerが`ExitCode=1`・`OOMKilled=false`で停止し、Calendar/M6の6件はPASS、M7の4件はworker health待ちまたは停止に伴う共有反映待ちでFAILEDとなった。これは`TEST_ENVIRONMENT_DRIFT`（local worker lifecycle drift）であり、production app regressionとは判定していない。
- worker再起動後のM7 Task単体はPASS、local runner reproductionは3/3 PASS、Vitest 38 files / 238 tests、lint/typecheck/buildはPASS。snapshot更新、staging/production操作、remote writeは行っていない。Verdict: `LOCAL_RELATED_CHROMIUM_FAILED`。commit/pushは保留。
- 追加診断では、Chromiumなしのidle worker healthを10回確認して10/10がrunning・HTTP 200。同じworkerでrelated 10件を実行すると6/10 PASS・4/10 FAILとなり、workerは`ExitCode=1`・`OOMKilled=false`で停止した。Docker eventは該当イベントなし、ログの安全な分類でもport conflict、D1/state lock、I/O、OOM、signal、fatalの根因シグネチャは確認できなかったため、root-cause分類は`UNKNOWN`。自動restart設定やproduction runtime変更は行わず、commit/pushは保留。

## 2026-08-27 Normalized local worker topology stability

- host側のHouseToDo Wranglerは`MANUAL_TERMINAL_WRANGLER`と特定した。親Wrangler PIDへforceなしの停止要求を行い、host `workerd.exe`は終了、8787の再生成はなく、Docker workerのみの構成へ正規化した。
- Docker workerは`Up (healthy)`を維持し、`/api/health`はHTTP 200、`db=true`、`r2=true`。復旧後の8787 ownerはDocker Desktop系の`wslrelay.exe` / `com.docker.backend`で、host HouseToDo `workerd.exe`は不在だった。
- host実行時のRelated Chromium 10件は、`e2e/calendar-ui.spec.ts`（1件）、`e2e/m6-auth-entry.spec.ts`（5件）、`e2e/m7-real-integration.spec.ts`（4件）を、`PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174`、`--workers=1 --reporter=line`で実行した。Run 1は10/10 PASS、Run 2も10/10 PASSで、各run後worker healthy・health PASS・host workerd不在を確認した。
- 最初にbaseURL未指定で実行した試行は、hostからcontainer名`app`を解決できない`ERR_NAME_NOT_RESOLVED`で10/10失敗したため、stability結果には算入していない。これはtest environment configuration mismatchであり、worker exitではない。
- local runner reproductionは3/3 PASS。Task history、Notification、Recording context、Task assignee、Calendar semantic locator、Redirect settledを含む既存flowも各回通過した。Vitestは38 files / 238 tests、lint、typecheck、build、git diff --checkもPASS。local D1は0017適用・pending 0のまま。
- このlocal環境ではhost Wrangler/workerdとDocker workerが同時に存在していた履歴があり、Docker workerのみへ正規化後にRelated Chromiumが2回連続安定した。分類は`LOCAL_WORKER_TOPOLOGY_CONFLICT`とし、host processが過去のworker exitを直接引き起こしたとは断定しない。staging/production操作、remote write、migration、deployは行っていない。Verdict: `READY_FOR_FINAL_SYNTHETIC_VALIDATION_RETRY_3`。
