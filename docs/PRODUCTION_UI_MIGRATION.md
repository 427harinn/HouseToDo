# Production UI Migration

HouseToDo-Mockup latest mainをdesign / interaction / motionのcanonical source of truthとし、ProductionのAPI・認証・router・データ・権限・Cloudflare構成はProduction側をsource of truthとする。UI parity auditではMockupの色、spacing、size、copy、layout、interaction、Motionを優先し、Production固有の差は理由をDeviationsへ記録する。

## Milestone overview

| Milestone | Scope | Status |
| --- | --- | --- |
| M1 | Shared UI Foundation: tokens, global foundation, motion constants, App Shell, Bottom Navigation, Add Bottom Sheet | Done |
| M2 | Home + Task: new Home, complete/pass/undo, task add/edit/delete, previous completion, and related Motion | Done |
| M3 | Calendar screen visual migration and Calendar interactions | Done |
| M4 | Shopping screen visual migration and Shopping interactions | Done on `main` after PR #5 |
| M5 | Other / Settings and formal `/other` route | In progress on `feat/production-other-settings-m5` |
| M6 | Auth / Household Entry. Guest and onboarding are removed from the new UI direction, not visually migrated. | Planned |
| M7 | Integration / Legacy UI cleanup: retire user-facing old Task list/detail/respond/templates and Shopping detail/templates routes, then verify 2-user flows, E2E, and PWA behavior | Planned |
| M8 | Legacy backend cleanup: after the new UI is stable, safely remove unused API/DB/compatibility code in separate PRs | Planned |

M1〜M4は`origin/main`で完了。M5 Other / Settingsを`feat/production-other-settings-m5`で実装する。M6には進まない。

## M5 start record (2026-08-25)

- Production base SHA: `585e65f3d976710a19ef5bbc8317d4ebef2c3ddb` (`origin/main`, PR #5 / M4 Shopping merge)
- Mockup reference SHA: `db8941dc3056f07862014242a349ae366da59e9c` (`HouseToDo-Mockup` local `origin/main` reference; fetch was attempted but the environment denied `.git/FETCH_HEAD` writes)
- Branch: `feat/production-other-settings-m5`
- Mockup parity audit scope: `DESIGN.md`, `.uilab/screens.json`, `.uilab/states.json`, `.uilab/components.json`, `OtherPage.tsx/css/test`, Other fixtures, BottomSheet, Bottom Navigation, and rendered `/other` routes.
- Production contract scope: authenticated household members/invite permissions, Push Subscription and browser capability flow, notification schedule persistence, stored image usage/R2 limits, owner-only household updates, profile avatar processing/R2 ownership, profile display-name persistence, logout/session invalidation, and legacy `/settings/members` compatibility.
- Fetch note: `git fetch origin` was attempted for both repositories. The local Git credential helper is unavailable for the remote fetch and the repository `.git/FETCH_HEAD` is read-only in this environment; the verified `origin/main` refs are recorded above.

## M4 start record

- Production base SHA: `485dbfefd93d16d1ae1abd60f849918703d4657c` (`origin/main`, PR #4 / M3 Calendar merge)
- Mockup reference SHA: `db8941dc3056f07862014242a349ae366da59e9c` (`HouseToDo-Mockup` `origin/main`)
- Branch: `feat/production-shopping-m4`
- Mockup parity audit scope: `DESIGN.md`, `.uilab/screens.json`, `.uilab/states.json`, `.uilab/components.json`, Shopping list/add/edit implementation, fixtures, and motion.
- Production contract scope: Shopping API/auth/household authorization, D1 persistence, shared `sort_order`, Calendar planned-date projection/deep-link, Home pending count, and existing R2 image validation/compression/upload/cleanup.
- Initial migration differences: Production legacy card/detail/template UI and manual purchased cleanup are replaced by the Mockup interaction model; templates remain available through legacy routes/backend but are not exposed in the new primary reuse flow. Shared reorder requires an additive household-scoped reorder contract because the existing `sort_order` field had no write endpoint.

## M4 completion record

- Production render target SHA: `c86486a99155dd8ba529bbdec88030bf29b516fb`
- Mockup reference SHA: `db8941dc3056f07862014242a349ae366da59e9c`
- Implemented list flat rows, one-row expand/collapse, seven-day purchased visibility, purchaser/time display, purchase/restore, pointer swipe Edit, and persisted household reorder with oldest-first fallback.
- Implemented Add/Edit canonical form, unified Recent/Template-backed reuse search, OS image picker preservation, R2/image validation flow preservation, and Edit-only delete confirmation.
- Verified Home pending count, Calendar planned markers/Date Sheet/deep-link contract, planned-date preservation, household isolation, and no-delete swipe behavior.
- Evidence: `docs/evidence/m4/production/`, `mockup/`, `motion/`, `motion/previews/`, and clean eight-file `review-upload/`.
- Remaining review/deployment work: human review and merge; staging/production deploy and remote migration were intentionally not performed.

## M2 backend contract decision

- `GET /api/dashboard/today` retains the legacy `todayTasks`, `summary`, and `weeklyTasks` fields and adds `homeTasks`, `completedRecords`, `passedRecords`, household timezone, member avatar URLs, and the pending Shopping count. Home reads the single active `homeTasks` projection plus the two today-only record collections, so reload reconstructs the same state without fixture data.
- Home projection queries are scope-bounded: active-task projection reads only the relevant household-local day, week, and period records, while today history uses a UTC range derived from the household timezone. It does not load the household's complete `task_records` history on every Home request.
- `task_records` uses additive nullable action-time snapshots for title and assigned member identity/display/color/avatar URL. Existing NULL snapshots fall back to the current task/member projection.
- `POST /api/tasks/:taskId/restore` removes only the requested today record and reactivates an inactive task. It does not delete any other history.
- Migration `0016_task_record_snapshots.sql` is local-only in M2; no remote D1 or Cloudflare operation was performed.

## M3 Calendar contract decision

- `GET /api/tasks/calendar` keeps its legacy marker/count fields and additively returns month-cell task summaries plus snapshot-aware selected-date completed records. Month cells contain only unfinished date-specific/fixed occurrences and flexible deadline dates; daily tasks remain Date Sheet-only.
- Calendar Shopping is pending and `planned_purchase_date = selectedDate` only. Purchased and unplanned items are excluded from both markers and the Date Sheet section. Shopping rows deep-link to `/shopping?item=<itemId>` without migrating the Shopping UI.
- Calendar completion accepts `calendarDate` and stores it in additive nullable `task_records.calendar_action_date`; period identity and existing uniqueness remain unchanged. NULL records use target date, then household-local completion date as fallback.
- `POST /api/tasks/:taskId/calendar-restore` is a Calendar-only historical restore. It validates household, task, record, completed status, and selected date, removes only that record, and reactivates inactive tasks. The existing Home today-only restore contract is unchanged.
- Migration `0017_calendar_action_date.sql` is additive and local-only. No remote D1, deployment, secrets, or Cloudflare operation was performed.

## M3 Mockup parity audit

Before creating the Draft PR, Codex rendered the latest Mockup main and Production Calendar at 390×844 and compared normal, dense, Shopping, Date Sheet, completed, restore, month-swipe, and day-swipe states. The audit evidence is kept under `docs/evidence/m3/`; any Production-only behavior is listed under `Deviations` in the PR body.

## Visual Evidence operation

Production UI migration PRs must include a Mockup comparison gallery and Motion preview in the PR body itself. Pinned GitHub image URLs are used for the main screenshots; animated GIFs are review previews and the original WebM files remain the canonical Motion evidence.

For visible UI migrations, generate a clean reviewer upload package after the final capture. The package contains only a small set of labeled Production/Mockup comparison boards and the canonical WebM files; it must include the Production HEAD SHA, Mockup SHA, and Evidence source so stale captures are not confused with the final state.

## M1 transitional mapping

最終Bottom Navigationは`Home / Calendar / Add / Shopping / Other`の5枠とする。M1では正式なOther screenをまだ作らないため、Otherは既存の`/settings/members`へ遷移し、`/settings/members`表示時はOtherをcurrent扱いにする。この暫定mappingはM5で正式な`/other`へ置き換える。

中央Addは既存の`/tasks/new`（家事）と`/shopping/new`（買い物）へ遷移する。form自体のデザイン移植はM2/M4で行う。

## Reference commits

- Production base: `585e65f3d976710a19ef5bbc8317d4ebef2c3ddb`（M4 / PR #5 merge後に確認した`origin/main`）
- HouseToDo-Mockup reference: `db8941dc3056f07862014242a349ae366da59e9c`（PR #18 merge後の`origin/main`）

## M4 review correction record (2026-08-25)

- PR #5 M4 Shopping is merged to `main`; M5 is the current milestone on `feat/production-other-settings-m5`.
- `scripts/capture-m4-evidence.mjs` now routes Mockup captures with the canonical `uilabState` query only and asserts each requested Mockup state in the rendered DOM before taking a screenshot.
- Production fixture assertions cover the 20-state semantic matrix. The Production Edit normal review fixture is equivalent in layout/photo semantics to Mockup Edit normal (an existing item with no attachment), while labels and values remain Production data.
- Long-press reorder uses pointer capture and a window-level pointerup fallback; the Evidence capture fails unless an actual pointer drag changes DOM order and persists through reload. The additive backend contract remains household-scoped `POST /api/shopping/items/reorder` with exact pending-item-set validation and existing `sort_order` persistence; no new migration was required.
- Latest Evidence consists of 20 Production and 20 Mockup screenshots, four settled-state canonical WebM files, four GIF previews, four review boards, and exactly eight files in `docs/evidence/m4/review-upload/`.
- Production reuse Recent data still intentionally excludes source item identity and image. This prevents copying or exposing an existing R2 object outside the established attachment ownership/upload contract, so Production `reuse-selected` remains no-photo; this is the documented Production-only deviation from the Mockup photo fixture.

## M5 parity audit decisions

- `/other` is the primary Other landing route. `/settings/members` remains available as the legacy member-management route until M7; it is not removed or used as the primary Bottom Navigation destination.
- Other landing keeps the five canonical rows and Bottom Navigation. Members, Notifications, Storage, Household Settings, and Account detail routes use the canonical centered title/back header and omit Bottom Navigation.
- Production members, invite codes, push subscription state, notification settings, image usage, household data, user profile, and permissions remain API-backed. Review fixtures, `uilabState`, hash routing, and Mockup fixture data are Evidence-only.
- Device notification OFF unsubscribes the current browser subscription but preserves morning/evening schedule values. Unsupported, denied, iPhone home-screen requirements, unknown stored-byte state, pending cleanup, and member read-only behavior are small Production-only safety/status deviations recorded in the Draft PR.
- Existing avatar processing/compression/R2 ownership and storage limits are reused. No migration is required for household timezone or profile display-name persistence.

## M5 completion record (2026-08-25)

- Production render target SHA: `fb449e33b66c4a4e98d68d43b0c5501a5ef2b0f0`
- Mockup reference SHA: `db8941dc3056f07862014242a349ae366da59e9c`
- Evidence: 16 semantic captures (including the Production-only stored-byte unknown safety state), four canonical WebM files from pointer/click/input interactions, four GIF previews, four labeled Production/Mockup boards, and exactly eight files in `docs/evidence/m5/review-upload/`.
- Backend additions are additive: household PATCH now accepts validated timezone, and authenticated `PATCH /api/account/profile` persists the current user's validated display name with no migration. Existing push, image usage, avatar, R2, auth, permission, and logout contracts remain in use.
- Production-only deviations are browser notification unsupported/denied/home-screen safety messaging, owner/member read-only enforcement, and storage unknown/pending-cleanup messaging. These do not alter canonical primary layout.
- Review corrections include the flat row button border reset, green timezone selection check, read-only-but-not-disabled email styling, clipboard success/fallback coverage, and single-flight display-name commits (Enter and blur each issue exactly one PATCH).
- Local gates passed: lint, typecheck, build, full Vitest (37 files / 228 tests), M5 Playwright (6 tests), and semantic Evidence capture. Clipboard success asserts `コードをコピーしました`; rejected clipboard asserts the safe selection fallback. Docker authenticated E2E was unavailable and was not treated as passed.
- Calendar/Shopping baseline comparison used the same command and allowed-origin Worker environment at base `585e65f3d976710a19ef5bbc8317d4ebef2c3ddb` and the M5 branch. Base failed at the pre-existing legacy heading/selector assumptions: Calendar `カレンダー` heading, Shopping `買い物` strict locator, and Home `ホーム` heading. The branch reached later local fixture failures: `.calendar-cell--today` count 0, Shopping reorder remained `牛乳` before `パン`, and the M1 smoke still expected legacy `買い物リスト`. These are recorded as pre-existing regression-suite/fixture incompatibilities; no M5 behavior regression was identified.
- Deployment status: staging/production not performed; remote D1 migration, secrets, Cron, and PR merge not performed; M6 not started.
