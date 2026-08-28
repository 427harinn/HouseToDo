# Symptoms

The reported symptoms are:

- On opening Home, task rows are not immediately visible and appear after a short wait.
- After pressing task completion, the tap and the start of the completion motion are immediate, but the completed-state display is reflected later.

# Scope

This Phase 1 investigation covers the data reflection path:

`UI → API → Worker → D1 → JSON → client state → DOM`

CSS animation duration, transitions, gesture responsiveness, and animation tuning are intentionally out of scope. The existing completion motion wait is recorded where it gates the data refresh, but it is not treated as a CSS rendering bottleneck.

# Fresh Load Sequence

Source evidence: `src/App.tsx:379-415`, `src/App.tsx:1200-1215`, `src/api/auth.ts`, `src/api/households.ts`, and `src/api/dashboard.ts`.

For an authenticated fresh navigation to `/home`, the exact sequence is:

```text
browser navigation / first App render
  ↓
App bootstrap effect starts GET /api/auth/me
  ↓ SERIAL
auth/me response succeeds → setAuth(authenticated)
  ↓ SERIAL (.then(refreshHousehold))
refreshHousehold starts GET /api/households/current
  ↓
households/current response succeeds → setHousehold(ready)
  ↓ SERIAL via React state/effect gating
HomeScreen mounts
  ↓
useDashboardData effect starts GET /api/dashboard/today
  ↓
dashboard JSON resolves → setData(...), setLoading(false)
  ↓
React commits HomeScreen
  ↓
first active task row becomes visible
```

`/api/households/current` does not start in parallel with `/api/auth/me`; it is called only from the successful `me(...).then(...)` continuation. Home is not mounted until authenticated state and household-ready state have both been established. Dashboard is then fetched by the newly mounted Home hook.

Conditional branches are:

- Auth failure: household and dashboard requests are skipped and the route moves to login.
- No household: Home is skipped and the route moves to household creation.
- `homeTasks` is preferred by Home; `todayTasks` is only a fallback when `homeTasks` is absent. The current dashboard response always supplies `homeTasks`.

# Dashboard Server Path

Source evidence: `worker/app.ts:244-245`, `worker/routes/tasks.ts:307-312`, `worker/services/dashboard-service.ts`, `worker/services/task-service.ts`, and the task/record/household/member/shopping repositories.

The authenticated dashboard request executes this path:

```text
GET /api/dashboard/today
  ↓ requireAuth
session lookup → user lookup
  ↓
DashboardService.getToday
  ↓
requireCurrentHousehold (household lookup + membership lookup)
  ↓ Promise.all
  ├─ TaskService.listHome
  │   ├─ requireCurrentHousehold again
  │   ├─ list all tasks including inactive
  │   ├─ one task_weekdays SELECT per returned task
  │   └─ daily records, period records, weekly records, action records in Promise.all
  ├─ TaskService.listToday
  │   ├─ requireCurrentHousehold again
  │   ├─ list active tasks
  │   ├─ one task_weekdays SELECT per returned task
  │   └─ daily records and optional period records
  ├─ TaskService.listWeek
  │   ├─ requireCurrentHousehold again
  │   ├─ weekly records
  │   ├─ list active tasks
  │   ├─ one task_weekdays SELECT per returned task
  │   └─ one period-record SELECT per canonical weekly task
  ├─ members.listByHouseholdId
  ├─ shoppingItems.countPending
  └─ shoppingItems.listPendingPreview(limit = 3)
```

The six dashboard branches are concurrent at the service level, but each branch has its own internal serial portions. The three task projections independently load overlapping task data and independently resolve the same household.

Home task rendering does not require `weeklyTasks`, `todayTasks` when `homeTasks` is present, shopping preview items, or the complete members list except for optional assignee avatar/details. Nevertheless, all six branches must finish before the single dashboard JSON response is returned.

# D1 Query Count

This is a `STATIC QUERY COUNT ESTIMATE`, not a D1 instrumentation count. It is derived directly from repository method calls for the representative local seed used below:

- 12 daily tasks
- 3 canonical weekly-flexible tasks
- 1 scheduled task
- 5 pending shopping items
- 16 active tasks total
- 3 canonical weekly tasks requiring per-task period lookup

The authenticated dashboard request is estimated at **74 D1 prepared statements**:

| Area | Estimate | Breakdown |
|---|---:|---|
| `requireAuth` | 2 | session lookup + user lookup |
| Initial `requireCurrentHousehold` | 2 | household lookup + membership lookup |
| `listHome` | 23 | household 2 + task list 1 + 16 weekday lookups + 4 record queries |
| `listToday` | 21 | household 2 + task list 1 + 16 weekday lookups + daily record 1 + period record 1 |
| `listWeek` | 23 | household 2 + weekly records 1 + task list 1 + 16 weekday lookups + 3 per-task period queries |
| Members | 1 | member profile list |
| Shopping count | 1 | pending count |
| Shopping preview | 1 | pending preview |
| **Total** | **74** | static estimate for this seed |

The count changes with task shape. `listByPeriodKeys` returns without a query when there are no period keys; the per-canonical-task queries in `listWeek` increase with canonical weekly tasks.

Observed duplication patterns:

- Four `requireCurrentHousehold` calls occur in one dashboard request: the dashboard itself plus `listHome`, `listToday`, and `listWeek`. Each repeats both the household lookup and the membership lookup.
- The same household's task table is loaded three times.
- `task_weekdays` is queried once per task for each of those three task-list calls: 48 weekday SELECTs for the representative 16-task seed.
- Daily/period/weekly records are loaded by multiple projections with overlapping purpose, and canonical weekly summaries add one record SELECT per canonical task.
- The query count is not an N+1 across all records, but it contains clear per-task N+1 patterns for weekdays and canonical weekly period records.

# Local API Measurements

Measured against the local Worker and local D1 after warm-up. These are loopback measurements for relative comparison inside the current architecture; they are not Cloudflare production or staging latency.

The API harness used 15 measured samples after 3 warm-up calls for GET endpoints. Completion POST and its immediately following dashboard refresh used 10 distinct seeded daily tasks.

| Endpoint | min (ms) | p50 / median (ms) | p95 (ms) | max (ms) |
|---|---:|---:|---:|---:|
| `GET /api/auth/me` | 5.35 | 5.92 | 6.73 | 6.73 |
| `GET /api/households/current` | 6.20 | 6.86 | 8.04 | 8.04 |
| `GET /api/dashboard/today` | 69.24 | 72.14 | 91.97 | 91.97 |
| Complete `POST /api/tasks/:id/complete` | 14.08 | 15.18 | 18.99 | 18.99 |
| `GET /api/dashboard/today` after complete | 70.38 | 73.16 | 90.59 | 90.59 |

The repeatable API harness is `scripts/performance-api-baseline.mjs`. It refuses non-loopback targets and creates representative data only through the local Worker.

# Client Display Measurements

Measured with Playwright against the local built client using controlled API delays: auth 25ms, household 30ms, dashboard 60ms. Fresh load used 10 samples. Fetch marks and MutationObserver DOM marks use the browser `performance.now()` clock.

| Phase | p50 (ms) | p95 (ms) |
|---|---:|---:|
| Navigation → dashboard request start | 143.19 | 156.51 |
| Auth request → auth response | 32.26 | 42.23 |
| Auth response → household request start | 0.82 | 1.11 |
| Household request → household response | 38.12 | 46.29 |
| Dashboard request → dashboard response | 65.20 | 65.80 |
| Dashboard response → first task DOM visible | 2.00 | 2.40 |
| Navigation → first task DOM visible | 279.41 | 290.99 |

The controlled result separates the useful display from the server/API wait: once dashboard JSON is available, the first task DOM commit is approximately 2ms at p50.

# Completion Measurements

The Home completion path requires opening the inline detail and pressing `完了`. The client immediately sets the completing state, sends the POST, waits for `Promise.all([request, wait(MOTION_MS.completion)])`, then calls `refresh()`. `MOTION_MS.completion` is 350ms in `src/motion/constants.ts`.

The completion browser harness used 10 samples with a controlled 45ms completion POST and 60ms dashboard refresh. “Completed row visible” is operationalized as the `.m2-home__history--completed` section becoming visible; the individual history list is collapsed by default.

| Phase | p50 (ms) | p95 (ms) |
|---|---:|---:|
| Complete click → POST starts | 14.30 | 14.60 |
| Complete click → POST response | 73.80 | 77.40 |
| POST response → refresh request starts | 295.50 | 309.10 |
| Refresh request → dashboard response | 63.70 | 78.10 |
| Dashboard response → completed-history section visible | 1.30 | 1.50 |
| Complete click → completed-history section visible | 435.70 | 451.40 |

The controlled result is `CLIENT_RENDER_NOT_PRIMARY_BOTTLENECK`: the response-to-DOM phase is approximately 1–2ms, while the request/refresh path is hundreds of milliseconds. The POST response is not used to update Home state directly; the client waits for the existing completion hold and then refetches the full dashboard.

The repeatable client harness is `scripts/performance-client-baseline.mjs`.

# Navigation Refetch Behavior

Controlled Playwright request counts for one sequence `Home → Calendar → Home → Shopping → Home`:

| Request | Count | Behavior |
|---|---:|---|
| `/api/auth/me` | 1 | fresh App bootstrap only |
| `/api/households/current` | 1 | fresh App bootstrap only |
| `/api/dashboard/today` | 3 | initial Home, Home after Calendar, Home after Shopping |
| `/api/tasks/calendar` | 1 | Calendar entry |
| `/api/shopping/items` | 1 | Shopping entry |
| `/api/shopping/templates` | 1 | Shopping entry |
| `/api/households/current/members` | 1 | Shopping entry |

There is no in-memory data cache. Home, Calendar, and Shopping data live in component-local state and are discarded when their screen unmounts. Returning to Home fetches a new full dashboard. While loading, Home has no previous task data to display and can render its empty-state branch because `data` is initially null.

Calendar entry uses one HTTP request, with the Worker running task-calendar and planned-shopping work in parallel. Shopping entry uses three parallel HTTP requests. Image metadata is included in the shopping response; actual image bytes are separate `/api/shopping/items/:id/image` GETs only when an item has an image. The controlled comparison used no images.

# Dashboard Response Size

Measured from the local dashboard HTTP response for the representative seed after 10 tasks had been completed:

- Total serialized HTTP response: **32,794 bytes**
- `homeTasks`: 6,264 bytes
- `todayTasks`: 17,555 bytes
- `weeklyTasks`: 2,404 bytes
- `completedRecords`: 5,752 bytes
- `passedRecords`: 2 bytes
- `shopping`: 314 bytes
- `members`: 124 bytes

The section totals are approximately 32,415 bytes; the remainder is the envelope and scalar fields.

Overfetch evidence is **YES**:

- Home renders `homeTasks`, completed/passed history, shopping pending count, and member data only for optional assignee display.
- `todayTasks` is not consumed when the current `homeTasks` field is present.
- `weeklyTasks` is not consumed by Home.
- `shopping.previewItems` is not consumed by Home.
- Completed/passed records are below-fold collapsed history, but they are part of the same blocking dashboard response.
- `homeTasks` and `todayTasks` contain overlapping task representations; the latter is especially large in the measured response.

# Query Plan Findings

Read-only local `EXPLAIN QUERY PLAN` was run for suspicious SQL after applying all 18 local migrations. No index was added.

Evidence:

- Household resolution uses `idx_household_members_user_id`, but the plan reports `USE TEMP B-TREE FOR ORDER BY` for `ORDER BY hm.joined_at ASC`.
- Active task loading uses `idx_tasks_household_active`, but the plan reports `USE TEMP B-TREE FOR ORDER BY` for `ORDER BY sort_order, created_at`.
- The all-task Home load also uses an index for the household restriction but reports a temporary B-tree for ordering.
- Daily records use `idx_task_records_household_target_date` without a temporary sort.
- Action records use `idx_task_records_household_calendar_action_date` only for the `household_id` part and report `USE TEMP B-TREE FOR ORDER BY`; the timestamp OR predicates are not fully covered by the chosen index.
- Shopping preview uses `idx_shopping_items_household_sort_order`, but reports `USE TEMP B-TREE FOR LAST TERM OF ORDER BY`.
- Period-key records use `idx_task_records_household_calendar_action_date` only for `household_id` and report a temporary B-tree for ordering; there is no composite `(household_id, period_key, updated_at)` index.

Missing-index evidence: **YES, as candidates only**. Candidate follow-up indexes are a task ordering index suitable for the actual active/all-task predicates, a shopping `(household_id, status, sort_order, created_at)` index, and a task-record household/period/order index. These are hypotheses for Phase 2 and require production-shaped benchmarking before migration.

# Bottlenecks

## P0 — No production-equivalent latency established

**Evidence:** All timings in this report are local loopback or controlled Playwright timings. No authenticated staging timing was available, and no production operation was performed.

**User impact:** The relative architecture is identified, but absolute Cloudflare/D1 user latency is not quantified.

**Recommended next change:** Obtain an approved, existing staging test account and run read-only authenticated timing in a separate phase. Do not infer production latency from these local numbers.

## P1 — Completion always refetches the full dashboard

**Evidence:** `HomeScreen.complete` ignores the successful completion result and calls `refresh()`, which requests `/api/dashboard/today` again. The local p50 is 73.16ms after completion, and the dashboard has a static estimate of 74 D1 statements for the representative seed.

**User impact:** A single-task completion waits on unrelated task projections, history, members, shopping count/preview, and repeated household/task queries before the completed state is reflected.

**Recommended next change:** Phase 2 should evaluate a narrow completion response/state update or a smaller post-action projection, while preserving server-authoritative reconciliation. Do not implement it in Phase 1.

## P1 — Dashboard overfetch and repeated D1 work

**Evidence:** The 32,794-byte response contains 17,555 bytes of `todayTasks` and 2,404 bytes of `weeklyTasks` that Home does not need for its initial visible task list. The static estimate shows three task-list loads, four household resolutions, 48 weekday SELECTs, and per-canonical-task period SELECTs.

**User impact:** More server work and serialization must complete before any Home task row can be displayed.

**Recommended next change:** Profile a consolidated Home projection and defer secondary members/history/shopping data. Keep the response-contract change for Phase 2.

## P2 — Cold bootstrap is serial before Home can request dashboard

**Evidence:** Source code chains `me(...).then(refreshHousehold(...))`; Home does not mount until both auth and household state are ready. Controlled p50 was 143.19ms from navigation to dashboard request start, before the 65.20ms dashboard response phase.

**User impact:** Fresh reload has an unavoidable auth → household → Home mount → dashboard sequence. In-app navigation after the session is established does not repeat auth/household.

**Recommended next change:** Evaluate safe bootstrap overlap or retaining/prefetching authenticated household state in Phase 2, subject to auth/route correctness.

## P2 — Existing completion hold delays refresh start

**Evidence:** `Promise.all([request, wait(MOTION_MS.completion)])` produces a controlled p50 of 295.50ms from POST response to dashboard refresh start, with a 350ms configured completion wait.

**User impact:** The full-dashboard refresh begins later than the POST completion when the POST is faster than the hold.

**Recommended next change:** This is recorded as a data-flow gate only. Animation and motion tuning are intentionally excluded from Phase 1; any change requires a separate UX decision after server/refetch work is evaluated.

# Candidate Phase 2 Improvements

Evidence-backed candidates, not implemented here:

- Reduce dashboard overfetch for initial Home, especially `todayTasks`, `weeklyTasks`, shopping preview, and secondary history/member data.
- Reuse the already resolved household in dashboard subservices instead of repeating household and membership checks.
- Consolidate task and record loading so the same household task set and records are not independently fetched by Home/Today/Week projections.
- Replace per-task weekday and canonical-period lookups with bounded bulk queries.
- Preserve previous Home data during in-app refresh or use an in-memory stale-while-revalidate strategy.
- Evaluate a completion-specific state update or narrow reconciliation response; the current completion response already returns a projected task result but the client ignores it.
- Benchmark candidate D1 indexes identified by the local plans before adding a migration.
- Separately evaluate whether the cold auth/household bootstrap can overlap or prefetch without changing route security behavior.

# Explicit Non-Findings

- React/DOM rendering is not the primary bottleneck in the controlled measurement: dashboard response → first task DOM was p50 2.0ms, and refresh response → completed-history section was p50 1.3ms.
- The measured local dashboard/server/refetch path is materially longer than the response-to-DOM phase.
- No claim is made that local timings equal staging or production timings.
- No production, staging write, migration, R2, cron, secret, or deployment operation was performed.
- Animation responsiveness is not considered the cause based on the requested scope and the immediate user-observed animation start. Animation performance was **NOT INVESTIGATED BY DESIGN**.

## Staging Read-Only

The allowed unauthenticated `GET /api/health` check returned HTTP 200 with `status: ok`. No authenticated staging credentials were available, so authenticated timing is recorded as `STAGING_AUTH_TIMING_NOT_AVAILABLE`. No staging write, deploy, migration, or data-changing request was made.

# Test / Quality Gates

The diagnostic scripts are non-production helpers. The Phase 1 working tree should be validated with:

```text
npm run lint
npm run typecheck
npm test
npm run build
npm run db:migrate:local
git diff --check
```
