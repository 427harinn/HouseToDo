# HouseToDo Performance Phase 2A

## Scope

This phase reduces the data path required by Home and overlaps server-authoritative action reconciliation with the existing motion gate. It covers browser request flow, Worker services, D1 statement estimates, response size, local API timing, and controlled client timing.

CSS animation duration, transitions, gesture responsiveness, auth bootstrap redesign, persistent cache, and SWR are intentionally out of scope. No production or staging operation was performed.

## Architecture Before

The Phase 1 Home path was:

```text
page load
  -> GET /api/auth/me
  -> GET /api/households/current
  -> Home mounts
  -> GET /api/dashboard/today
  -> set dashboard state
  -> Home renders homeTasks
```

The auth request must succeed before the household request is started, and Home data is requested after the authenticated household context is available. The dashboard request then computed Home, Today, weekly, member, and shopping-preview data in one response. Home used only the Home projection, history, members, and shopping pending count from that response.

For actions, the previous effective path was:

```text
click
  -> POST /api/tasks/:id/{complete|skip|restore}
  -> wait for the existing motion gate
  -> GET /api/dashboard/today
  -> replace Home state
```

The Phase 1 controlled client baseline measured POST response to refresh start at p50 295.50ms because the refresh waited behind that gate.

## Architecture After

The Home path is now:

```text
page load
  -> GET /api/auth/me                         SERIAL bootstrap
  -> GET /api/households/current              SERIAL after auth
  -> Home mounts
  -> GET /api/home/today                      Home-only read
  -> set Home state
  -> Home renders homeTasks
```

`GET /api/home/today` resolves the current household once on the server. After that resolution, Home task projection, member loading, and the shopping pending count run in parallel where their repositories permit. It does not call `listToday`, `listWeek`, or shopping preview.

Completion, pass, and restore now use the same reconciliation shape:

```text
click
  -> start existing motion promise
  -> POST mutation
  -> after mutation success, immediately start GET /api/home/today
  -> wait for both Home GET and existing motion promise
  -> apply server-authoritative Home state
```

The state is not applied before the existing motion gate completes. Mutation failures do not apply speculative state; the existing error fallback performs a normal Home refresh.

## Home Endpoint Contract

The new authenticated endpoint is `GET /api/home/today`, with the same optional `?date=YYYY-MM-DD` semantics as the existing Home projection. It returns:

```text
date
homeTasks
completedRecords
passedRecords
shopping.pendingCount
members
```

It intentionally does not return `todayTasks`, `weeklyTasks`, `summary`, or `shopping.previewItems`. The existing `GET /api/dashboard/today` response and all of its fields remain unchanged for compatibility. Calendar and Shopping APIs were not redesigned.

Authorization still comes from the authenticated session and the server-side current-household lookup. No client-supplied household ID is trusted.

## D1 Query Estimate

This is a `STATIC QUERY COUNT ESTIMATE`, derived from the current repository source and the Phase 1 representative seed: 12 daily tasks, 3 canonical `weekly_flexible` tasks, 1 scheduled task, 5 pending shopping items, and 16 active tasks.

Phase 1 Dashboard exact breakdown:

| Operation | Statements |
| --- | ---: |
| requireAuth | 2 |
| Initial current-household resolution | 2 |
| `listHome` | 23 |
| `listToday` | 21 |
| `listWeek` | 23 |
| Members | 1 |
| Shopping count | 1 |
| Shopping preview | 1 |
| **Total** | **74** |

Phase 2A Home exact breakdown:

| Operation | Statements |
| --- | ---: |
| requireAuth | 2 |
| Current-household resolution | 2 |
| Home projection | 21 |
| Members | 1 |
| Shopping pending count | 1 |
| **Total** | **27** |

The Home projection estimate is `1` task-list query + `16` per-task `task_weekdays` lookups + `4` record queries. Compared with the legacy Dashboard, the new endpoint does not execute `listToday`, `listWeek`, or shopping preview work, and it reuses the already-authorized household context instead of resolving it again inside `TaskService.listHome`. No additional summary or overlap bucket is included in either breakdown.

The remaining `task_weekdays` per-task pattern is not fixed in Phase 2A. No query instrumentation was added to production runtime code, and no index or migration was added.

## Local API Measurements

Measurements were made against a fresh loopback Wrangler Worker and local D1. Each GET endpoint used 3 warm-up calls followed by 15 measured samples. Completion used 10 mutation samples and 10 immediately following Home reads. These numbers compare this local architecture; they do not represent Cloudflare production latency.

| Endpoint | min | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: |
| `GET /api/auth/me` | 5.74ms | 8.47ms | 11.17ms | 11.17ms |
| `GET /api/households/current` | 7.26ms | 7.93ms | 8.47ms | 8.47ms |
| `GET /api/dashboard/today` comparator | 76.94ms | 80.46ms | 118.68ms | 118.68ms |
| `GET /api/home/today` | 31.35ms | 33.91ms | 37.58ms | 37.58ms |
| `POST /api/tasks/:id/complete` | 14.43ms | 16.46ms | 26.92ms | 26.92ms |
| Post-complete `GET /api/home/today` | 32.34ms | 36.28ms | 40.09ms | 40.09ms |

Historical Phase 1 values were Dashboard p50 79.47ms / p95 102.78ms, fresh Dashboard 36,467 bytes, and post-complete Dashboard p50 79.25ms / p95 120.47ms. The fresh comparator in this run is reported separately above rather than replacing the historical baseline.

## Completion Measurements

The completion, pass, and restore implementations all use the lean Home reconciliation path. Home no longer requests `/api/dashboard/today` for any of these actions. The complete response is not used as the final display state; the Home GET remains server-authoritative.

The controlled client harness used 10 fresh-load samples and 10 completion samples with fixed mock delays: auth 25ms, household 30ms, Home 60ms, and complete POST 45ms.

| Fresh-load phase | p50 | p95 |
| --- | ---: | ---: |
| Navigation → Home request start | 142.71ms | 169.02ms |
| Home request → response | 64.70ms | 66.60ms |
| Home response → task DOM visible | 2.00ms | 2.70ms |
| Navigation → task DOM visible | 278.25ms | 329.05ms |

| Completion phase | p50 | p95 |
| --- | ---: | ---: |
| Click → POST response | 76.80ms | 85.10ms |
| POST response → Home refresh start | 0.30ms | 0.30ms |
| Home refresh → response | 76.50ms | 77.80ms |
| Home response → completed section visible | 225.40ms | 246.40ms |
| Click → completed section visible | 372.50ms | 382.30ms |

The previous controlled POST-response-to-refresh-start p50 was 295.50ms. The new p50 is 0.30ms, showing that the GET begins immediately after mutation success while the existing motion gate is still running. The completed display remains gated by the existing motion behavior. No motion duration was changed.

## Navigation Refetch Behavior

The controlled navigation run produced these request counts:

| Request | Count |
| --- | ---: |
| `/api/auth/me` | 1 |
| `/api/households/current` | 1 |
| `/api/home/today` | 3 |
| `/api/tasks/calendar` | 1 |
| `/api/shopping/items` | 1 |
| `/api/shopping/templates` | 1 |
| `/api/households/current/members` | 1 |

Home → Calendar → Home and Home → Shopping → Home each issue a new `/api/home/today` request after Home remounts. No in-memory Home retention was introduced; the refetch is now cheaper rather than cached. The controlled request durations were approximately 45ms for Calendar and 48ms for each Shopping request under the fixture delays.

## Dashboard Response Size

Fresh snapshots were taken after the representative seed and before any completion. The post-completion snapshot was taken after 10 completions.

| Snapshot | Bytes |
| --- | ---: |
| Phase 1 fresh Dashboard | 36,467 |
| Phase 2A fresh Dashboard comparator | 36,467 |
| Phase 2A fresh Home | 17,175 |
| Phase 2A Home after 10 completions | 12,444 |

Fresh section byte measurements are serialized section values, not independent network payloads:

| Section | Dashboard comparator | Home |
| --- | ---: | ---: |
| `homeTasks` | 16,609 | 16,865 |
| `todayTasks` | 16,609 | omitted |
| `weeklyTasks` | 2,428 | omitted |
| `completedRecords` | 2 | 2 |
| `passedRecords` | 2 | 2 |
| `shopping` | 314 | 18 |
| `members` | 124 | 124 |

The Home response omits the duplicate Today task projection, weekly tasks, dashboard summary, and shopping preview. The measured fresh Home response is below the Phase 2A 20,000-byte target. After 10 completions, the active/history mix changes the section distribution, so that snapshot is not used as the fresh-size comparison.

## Query Plan Findings

No new index or migration was added. Phase 2A did not claim a missing-index fix. The current source still contains the known per-task `task_weekdays` lookup pattern; bulk weekday loading is a separate follow-up. Any D1 `EXPLAIN QUERY PLAN` or index change should be measured independently rather than inferred from this endpoint split.

## Bottlenecks

### P0 — No remaining P0 finding

The Phase 2A evidence does not show a release-blocking Home rendering bottleneck after the lean path change. The remaining issues below are follow-up performance work, not production safety or correctness failures.

### P1 — Per-task `task_weekdays` lookups remain

Evidence: the source-derived Home estimate is 27 statements, including 16 weekday lookups for the 16 active representative tasks.

User impact: the lean path is materially smaller, but larger households can still pay a statement per active task.

Recommended next change: measure a bulk weekday query and compare its query plan and response time before changing the repository.

### P1 — Cold auth → household bootstrap remains serial

Evidence: the client request graph still waits for `/api/auth/me` before starting `/api/households/current`; this phase intentionally leaves auth bootstrap unchanged.

User impact: fresh reload retains bootstrap latency even though the Home payload is now lean. In the controlled run, Home request start was p50 142.71ms after navigation.

Recommended next change: profile a safe bootstrap redesign or parallelizable session/household read without weakening authorization.

### P2 — Remount navigation still refetches Home

Evidence: Home request count was 3 in the Home → Calendar → Home → Shopping → Home controlled sequence, and no cache was added.

User impact: returning to Home waits for a new network/server read instead of showing prior data.

Recommended next change: evaluate scoped in-memory stale-while-revalidate or retention after measuring navigation frequency and freshness requirements.

## Candidate Phase 2B Improvements

Evidence-backed candidates are bulk weekday loading, a measured auth/bootstrap reduction, scoped in-memory Home retention or SWR, and a separately verified D1 index if `EXPLAIN QUERY PLAN` identifies one. Optimistic completion, prefetch, and broader response redesign remain candidates only; they are not implemented here.

## Compatibility and Non-Findings

- `/api/dashboard/today` was retained unchanged and remains covered by the existing compatibility tests.
- Calendar and Shopping API paths were not redesigned.
- Home, complete, pass, and restore do not use `/api/dashboard/today` after this change.
- No optimistic UI was added; final Home state is server-authoritative.
- React response-to-DOM work is not the primary bottleneck: fresh Home response → task DOM was p50 2.00ms / p95 2.70ms under the controlled client run.
- Animation performance was not investigated by design. The existing motion gate was preserved and no CSS animation or duration was changed.

## Validation and Safety

- Representative weekly seed: canonical `weekly_flexible` 3/3; legacy weekly among those 0.
- Local migrations: 18/18 applied, pending 0; no migration added.
- Full Vitest: 39 files, 252 tests passed.
- M2 Playwright: 7 tests passed.
- M3 Playwright: not run; Calendar data and shared Calendar behavior were not changed.
- Staging writes/deploy: none/not run.
- Production: not touched.
- Other repositories and worktrees: not touched.
