# HouseToDo Calendar Performance Baseline

## Symptoms / Scope

This investigation covers Calendar data-display latency: client request flow, Worker service composition, D1 query count, response size, server-side projection, and response-to-DOM timing.

The investigation does not change Calendar runtime behavior. CSS animation duration, transitions, gesture responsiveness, motion tuning, optimistic UI, caching, prefetching, API splitting, bulk weekday loading, indexes, and auth bootstrap redesign are out of scope.

These local measurements compare the current architecture. They do not represent Cloudflare staging or production latency.

## Calendar Client Flow

### Home → Calendar initial display

The shared app bootstrap authenticates first and resolves the current household before route content is rendered. On `CalendarScreen` mount:

```text
navigation to /calendar
  -> GET /api/auth/me                       shared auth bootstrap
  -> GET /api/households/current             shared household bootstrap
  -> CalendarScreen mounts
  -> calculate 42-day grid from visibleMonth
  -> GET /api/tasks/calendar?from=...&to=...&selectedDate=...
  -> setData(response)
  -> setLoading(false)
  -> calendar marker grid is usable
```

`from` and `to` cover the 42 cells displayed by the month grid. For August 2026 the range is `2026-07-26` through `2026-09-05`. When no URL date is provided, `selectedDate` is the household-local today; with `?date=YYYY-MM-DD`, that valid query date is used.

The request is started from the `useEffect` depending on `gridStart`, `gridEnd`, and `requestedDate`. Cleanup aborts an obsolete request. The initial grid shell is rendered while `data` is null, but markers are empty until the response arrives. During subsequent refreshes `data` is retained while `loading` is true.

### Same-month date tap and Date Sheet

```text
tap a calendar day
  -> setSelectedDate(date)
  -> navigate to /calendar?date=date
  -> requestedDate changes
  -> GET /api/tasks/calendar with the same from/to range and new selectedDate
  -> setData(response)
  -> Date Sheet selected-day detail becomes current
```

The Date Sheet shell opens immediately when `selectedDate` is set. Its selected detail is still derived from the previous `data` until the request completes; while that request is pending the sheet shows its loading status. The entire month marker payload and planned shopping range are requested again.

### Month change

The previous/next month button and horizontal month swipe both call `moveMonth`, update `visibleMonth`, and cause exactly one refresh effect for the new `gridStart`/`gridEnd` range. The existing data remains in state during the request, and the new marker data replaces it after the response. No intentional motion wait precedes the GET; the month transition timer only clears the existing visual class.

### Date Sheet task actions

The current Calendar action path is:

```text
Complete / Pass
  -> POST /api/tasks/:id/complete or /skip
  -> await mutation response
  -> await existing motion gate
  -> GET /api/tasks/calendar for the full visible range
  -> setData(response)

Restore
  -> POST /api/tasks/:id/calendar-restore
  -> await mutation response
  -> await existing restore motion gate
  -> GET /api/tasks/calendar for the full visible range
  -> setData(response)
```

The mutation result is not used to update Calendar state directly. All three paths perform a full Calendar refresh after the motion wait. No optimistic state is applied and no motion constant was changed.

### Refetch and visibility behavior

Each Calendar mount performs one Calendar GET. Changing `selectedDate` or the visible month performs one additional GET. Calendar has no `visibilitychange` refresh handler. There is no in-memory Calendar cache or stale-while-revalidate retention. Existing data is retained during refresh, but the initial null state has an empty marker grid.

## Calendar Server Path

`GET /api/tasks/calendar` is routed by `worker/routes/tasks.ts` and first passes `requireAuth`. The route then starts these two branches in `Promise.all`:

```text
requireAuth
  -> TaskService.listCalendar(userId, from, to, selectedDate)
       -> HouseholdService.requireCurrentHousehold
       -> TaskRepository.listByHouseholdId(includeInactive: true)
       -> TaskRepository.listWeekdays(taskId) for every returned task
       -> TaskRecordRepository.listCalendarRecords(...)
       -> in-memory date marker and selected-date projection
  -> ShoppingService.listPlannedItems(userId, from, to)
       -> HouseholdService.requireCurrentHousehold
       -> ShoppingItemRepository.listPlannedByHouseholdId
  -> merge planned shopping by date
  -> serialize dates and selected detail
```

The task and shopping branches each resolve the current household independently. No member repository is used by this endpoint; task-record SQL joins the acting user for display fields. The selected date changes filtering and projection in memory, but does not avoid the full task list, record query, or planned shopping query.

## Representative Seed

The diagnostic seed in `scripts/performance-calendar-baseline.mjs` creates one isolated local household with:

- 2 daily tasks, one of which is assigned to the owner;
- 1 `weekly_fixed` task;
- 1 `monthly_fixed` task;
- 1 `weekly_flexible` task;
- 1 `monthly_flexible` task;
- 1 `once` task;
- 1 completed record and 1 skipped record;
- 3 pending planned shopping items on `2026-08-28`, `2026-08-29`, and `2026-09-12`.

The seed therefore contains 7 tasks and covers all requested recurrence models plus assignment, completed history, skipped history, and planned shopping. The local measurement used 3 warm-up requests followed by 15 measured requests per Calendar case.

## D1 Query Count

This is a `STATIC QUERY COUNT ESTIMATE`, derived from the current source and the 7-task representative seed. No production query counter or runtime telemetry was added.

| Operation | Statements |
| --- | ---: |
| `requireAuth` | 2 |
| Task current-household resolution | 2 |
| Shopping current-household resolution | 2 |
| Task list | 1 |
| `task_weekdays` lookups | 7 |
| Calendar record query | 1 |
| Planned shopping query | 1 |
| **Total** | **16** |

The 7 `task_weekdays` statements are sequential in `TaskRepository.attachWeekdays`, one per returned task. The Calendar record query is one household/range query with the flexible period-key additions. Shopping is one planned-range query after a second household resolution. The count is range-independent for these repository calls, although the amount of CPU projection and response data grows with the number of date keys.

## Response Size

These are serialized response byte measurements from the local API harness. Section values are measured independently with `JSON.stringify`; they are not separate network payloads.

| Case | Range | selectedDate | Total bytes | `dates` bytes | selected detail bytes |
| --- | --- | --- | ---: | ---: | ---: |
| Current month | 2026-07-26..2026-09-05 | 2026-08-28 | 10,790 | 6,107 | 4,480 |
| Same month, different date | 2026-07-26..2026-09-05 | 2026-08-29 | 10,941 | 6,107 | 4,631 |
| Next month | 2026-08-30..2026-10-10 | 2026-09-15 | 13,238 | 7,527 | 5,508 |
| Previous month | 2026-06-28..2026-08-08 | 2026-07-15 | 5,830 | 5,545 | 82 |

Current-month section sizes were:

| Section | Bytes |
| --- | ---: |
| `dates` | 6,107 |
| `selected.fixed` | 1,063 |
| `selected.weeklyFlexible` | 1,078 |
| `selected.monthlyFlexible` | 1,095 |
| `selected.completed` | 977 |
| `selected.shopping` | 195 |

`dates` is the largest single logical section in the current-month response. The current and same-month responses had byte-identical `dates` objects, so 6,107 bytes of marker data were downloaded unchanged on the date tap. The selected detail changed from 4,480 to 4,631 bytes. This is direct evidence of full-month overfetch on same-month selected-date changes.

## Local API Timing

Measured against a fresh loopback Wrangler Worker and local D1. Each case used 3 warm-up calls and 15 measured calls.

| Case | min | p50 | p95 | max | Response bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Current month | 22.54ms | 24.98ms | 28.29ms | 28.29ms | 10,790 |
| Same-month different `selectedDate` | 21.92ms | 24.16ms | 39.84ms | 39.84ms | 10,941 |
| Next month | 23.75ms | 25.21ms | 41.22ms | 41.22ms | 13,238 |
| Previous month | 19.35ms | 21.15ms | 58.40ms | 58.40ms | 5,830 |

The full 15-sample results are preserved by the diagnostic script output; the table reports the requested summary statistics.

## Cold direct Calendar Timing

The direct `/calendar` navigation case is reported as a cold direct Calendar load. It used the build-served loopback Worker, 10 samples, and a 60ms mocked Calendar response delay. Browser Performance marks were used for response-to-DOM timing.

| Phase | p50 | p95 |
| --- | ---: | ---: |
| Navigation → Calendar request start | 106.99ms | 138.65ms |
| Calendar request → response | 67.88ms | 75.72ms |
| Response → usable month grid | 2.30ms | 2.70ms |
| Navigation → usable month grid | 281.44ms | 315.42ms |

Cold direct Calendar request count was exactly 1 in all 10 controlled samples.

## In-app Home → Calendar Timing

This controlled case first opened authenticated Home, waited for a Home task row to become visible, and then navigated using the actual bottom-navigation `カレンダー` button without reloading the page. It used 10 samples and the same 60ms mocked Calendar response delay.

| Phase | p50 | p95 |
| --- | ---: | ---: |
| Navigation click → Calendar request start | 4.20ms | 4.30ms |
| Calendar request → response | 82.30ms | 91.60ms |
| Response → usable Calendar DOM | 2.00ms | 2.30ms |
| Navigation click → usable Calendar | 88.30ms | 98.10ms |

All 10 samples issued exactly 1 Calendar request. Additional `/api/auth/me` requests: 0. Additional `/api/households/current` requests: 0.

## Date Tap Timing

The same-month tap changed the selected date from `2026-08-28` to `2026-08-29`.

| Phase | p50 | p95 |
| --- | ---: | ---: |
| Actual date-cell click event → Calendar request start | 3.40ms | 3.80ms |
| Request → response | 84.40ms | 94.40ms |
| Response → Date Sheet task visible | 5.00ms | 5.40ms |
| Actual date-cell click event → current Date Sheet task visible | 92.50ms | 103.40ms |

Each date-cell click produced exactly 1 additional full Calendar request. The total was measured directly from the browser's actual date-cell click event timestamp to the visible task timestamp for each sample; it was not derived by adding phase medians. The Date Sheet shell itself opens before the response, but current selected-date content waits for the new response.

## Month Change Timing

The controlled harness measured the next-month button; the swipe path calls the same `moveMonth` function and has the same request dependency.

| Phase | p50 | p95 |
| --- | ---: | ---: |
| Actual month-button click event → Calendar request start | 2.40ms | 2.50ms |
| Request → response | 69.20ms | 76.30ms |
| Response → new month data visible | 1.40ms | 2.00ms |
| Actual month-button click event → new month data visible | 73.00ms | 80.60ms |

Each month change produced exactly 1 additional full Calendar request. Previous data remained in state while the request was pending.

## Task Action Timing

The controlled harness used 10 complete samples with a 45ms mocked POST and a 60ms mocked Calendar GET. Existing motion behavior was not changed.

| Phase | p50 | p95 |
| --- | ---: | ---: |
| Actual Complete click event → POST start | 0.20ms | 0.30ms |
| Actual Complete click event → POST response | 60.10ms | 64.20ms |
| POST response → Calendar refresh start | 356.90ms | 359.20ms |
| Calendar refresh → response | 63.90ms | 68.70ms |
| Refresh response → completed state visible | 1.90ms | 2.40ms |
| Actual Complete click event → completed state visible | 483.40ms | 488.30ms |

Each complete produced 1 Calendar refresh request. The browser-side capture listener recorded the actual Complete button click event before the normal Playwright click returned, so actionability/stability wait is not included in the click timestamp. The p50 POST-response-to-refresh-start of 356.90ms is consistent with the existing motion gate being awaited before refresh. The final response-to-DOM phase was 1.90ms, so the long action path is dominated by pre-response waiting rather than React state application.

Restore uses `POST /api/tasks/:id/calendar-restore` and the same full-range refresh-after-motion pattern. Restore was covered by the existing M3 suite but was not included as a separate controlled timing sample.

## Shopping Contribution

The route waits for the TaskService and ShoppingService branches in `Promise.all`, so planned shopping is on the Calendar response critical path even though it is not separately serialized as a full shopping list. The shopping branch performs:

1. one current-household resolution (2 D1 statements), then
2. one `shopping_items` planned-date range query.

For the current-month representative response, `selected.shopping` was 195 bytes. The shopping query also populates per-date `shoppingCount` markers. An empty shopping result would still execute the household lookup and planned-range query. A separate service-duration measurement was not added, so the relative TaskService-versus-ShoppingService wall time is `INCONCLUSIVE`; the endpoint-level results and static query contribution are measured/derived above.

## Worker Projection Cost

For the current 42-day range and 7 active seed tasks, the marker loop evaluates 5 month-marker-eligible tasks per date, approximately `42 × 5 = 210` `projectTaskOnDate` calls. The selected-date projection evaluates all 7 active tasks again, approximately 7 additional calls, for about 217 task/date projections before filtering and sorting. Record matching is in memory after the single Calendar record query.

This is a static operation count, not a separately instrumented CPU duration. The local API p50 range was 21.15–25.21ms while the controlled client used a 60ms response delay; there is not enough isolated evidence here to classify Worker CPU projection as the primary bottleneck.

## Query Plan Findings

Read-only local `EXPLAIN QUERY PLAN` was run for the relevant query shapes:

- `tasks` household filtering used `idx_tasks_start_date`, but the task ordering required `USE TEMP B-TREE FOR ORDER BY`.
- `task_weekdays(task_id, weekday)` used the covering index `idx_task_weekdays_task_weekday`; no scan finding was observed for the per-task lookup.
- `task_records` household/calendar-action filtering used `idx_task_records_household_calendar_action_date`, but the ordering required `USE TEMP B-TREE FOR ORDER BY`.
- `shopping_items` planned-date filtering used `idx_shopping_items_household_planned_purchase_date`, but the final ordering terms required `USE TEMP B-TREE`.

Missing index: `INCONCLUSIVE`. The plans show existing filter indexes and temporary sort structures, but this Phase does not establish that an additional composite ordering index would improve end-to-end latency. No index or migration was added.

## Duplicate / Overfetch Findings

### Full-month refetch

YES. Same-month selected-date changes issue the full `/api/tasks/calendar` request again, including `dates`, selected detail, and planned shopping range. The two representative responses had identical `dates` at 6,107 bytes, which is the measured unchanged payload contribution.

### Repeated household resolution

YES. `TaskService.listCalendar` and `ShoppingService.listPlannedItems` each call `requireCurrentHousehold`, producing two independent household-resolution branches under the route. This is separate from the two `requireAuth` statements.

### Task weekday N+1

YES. `TaskRepository.attachWeekdays` performs one `task_weekdays` statement per returned task. The representative 7-task seed contributed 7 statements.

## Bottlenecks

### P0 — No P0 finding

No release-blocking correctness or safety issue was found. The following are Phase 2B-2 performance candidates.

### P1 — Full range and marker payload are refetched for same-month date taps

Evidence: one additional full request per date tap; `dates` was unchanged at exactly 6,107 bytes between two same-month selected dates.

User impact: opening another day waits for a server response even though most month markers are already available, and downloads the same marker data again.

Recommended Phase 2B-2 change: split or reuse month markers and fetch selected-day detail independently, after preserving the existing response contract until consumers are migrated.

### P1 — Repeated household lookup and per-task weekday queries

Evidence: static total is 16 statements for only 7 tasks, including task and shopping household resolution plus 7 sequential weekday lookups.

User impact: larger households add D1 work before Calendar can return, and the same household context is resolved twice in parallel branches.

Recommended Phase 2B-2 change: pass an already-authorized household context to the shopping/task projections where safe, then measure a bulk `task_weekdays` query separately.

### P2 — Action refresh begins only after the existing motion gate

Evidence: controlled POST-response-to-refresh-start p50 was 356.90ms; the refresh itself was about 63.90ms p50 and response-to-DOM was 1.90ms.

User impact: completion state cannot be server-reflected until the motion gate has elapsed, even though the mutation has already succeeded.

Recommended Phase 2B-2 change: begin a server-authoritative Calendar reconciliation GET after mutation success while retaining the existing gate before applying state, mirroring the proven Phase 2A pattern.

## Candidate Phase 2B-2 Improvements

Evidence-backed candidates are:

- reuse current-month marker data for same-month date taps;
- introduce a lean selected-date read path if contract analysis permits it;
- reuse the authenticated household context between task and shopping branches;
- bulk-load task weekdays;
- overlap action reconciliation with the existing motion gate while applying state only after the gate;
- evaluate current/adjacent-month in-memory retention or prefetch after measuring freshness requirements;
- evaluate a specific ordering index only after a separate D1 plan and end-to-end benchmark demonstrate benefit.

No candidate above was implemented in Phase 2B-1.

## Explicit Non-Findings

- React rendering is not the primary bottleneck in the controlled measurements: cold direct response → usable grid was p50 2.30ms, in-app response → usable Calendar DOM was p50 2.00ms, date response → Date Sheet task was p50 3.66ms, month response → new month data was p50 3.14ms, and action refresh response → completed state was p50 1.90ms.
- Worker projection CPU was not isolated enough to call it primary or secondary with confidence.
- A missing index was not established; existing filter indexes were observed, with temporary sort B-trees as candidates for separate investigation.
- Animation performance was not investigated by design. Existing motion gates were observed for ordering only; no duration or CSS behavior was changed.

## Validation and Safety

- Diagnostic API harness: 3 warm-up + 15 measured samples per case.
- Controlled client harness: 10 cold direct, 10 in-app Home → Calendar, 10 date-tap, 10 month-change, and 10 action samples.
- Vitest: 39 test files passed, 252 tests passed.
- Calendar M3 Playwright: 13 tests passed.
- Lint: passed.
- Typecheck: passed.
- Build: passed.
- Local migrations: 18/18 applied, 0 pending; no migration was added.
- `git diff --check`: passed.
- No production runtime behavior changes.
- No index or migration added.
- Staging: not touched.
- Production: not touched.
- Other repositories/worktrees: not touched.
