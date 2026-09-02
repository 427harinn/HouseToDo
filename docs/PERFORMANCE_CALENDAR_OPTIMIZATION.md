# WP6 Calendar Performance Optimization

Date: 2026-09-01
Scope: C1 + C2 + C3 + C4
Status: implementation and local verification complete; staging validation is recorded in the delivery report.

## Before architecture

Calendar used one `GET /api/tasks/calendar?from=&to=&selectedDate=` response for both the 42-cell marker grid and the selected Date Sheet. A same-month date tap therefore downloaded the unchanged `dates` object again. Complete, Pass, and Restore performed a full Calendar refresh after the existing motion gate.

The task projection loaded `task_weekdays` once per task. The task and shopping service branches each resolved the current household independently.

The representative local seed contains 7 tasks: once, 2 daily, weekly_fixed, monthly_fixed, weekly_flexible, and monthly_flexible, plus completed/skipped history and planned Shopping.

## After architecture

- `GET /api/tasks/calendar/range?from=&to=` returns `from`, `to`, `today`, `timezone`, and `dates` only.
- `GET /api/tasks/calendar/day?date=` returns `today`, `timezone`, `selectedDate`, and selected-day detail only, including planned Shopping.
- The old combined endpoint remains as a compatibility wrapper and is no longer used by the Calendar client.
- The client keeps marker state while changing dates in the same grid and requests only selected-day detail.
- Marker and selected-day requests use sequence/generation checks. A late response for an old date or grid cannot overwrite the current view.
- Complete, Pass, and Restore start targeted marker + selected-day reconciliation immediately after the mutation response, while preserving the existing motion gate.
- The request-resolved household is passed to downstream task and Shopping service methods.
- All task weekdays for a task list are loaded with one `task_id IN (...)` query and grouped in memory.

No IndexedDB, Service Worker, local-first, or persistent Calendar cache was introduced. C5 remains deferred.

## Metrics

All values below are controlled/local measurements, not production telemetry. The before payload values are the existing Calendar baseline. The after payload values were captured from the same local loopback Worker seed on this branch.

| Metric | Before | After | Evidence |
| --- | ---: | ---: | --- |
| Initial Calendar requests (no selected Date Sheet) | 1 combined | 1 range | dedicated Playwright |
| Same-month date tap | 1 combined | 0 range + 1 day | dedicated Playwright |
| Month change | 1 combined | 1 range | dedicated Playwright |
| Complete reconciliation | 1 combined | 1 range + 1 day | dedicated Playwright |
| Pass reconciliation | 1 combined | 1 range + 1 day | dedicated Playwright |
| Restore reconciliation | 1 combined | 1 range + 1 day | dedicated Playwright |
| Current-month combined response | 10,790 bytes | — | local API harness |
| Unchanged `dates` section on same-month tap | 6,107 bytes resent | 0 bytes resent | local API harness |
| Marker response | — | 6,270 bytes / 42 dates | local API harness |
| Selected-day response | — | 4,787 bytes | local API harness |

The controlled client harness exercised the full scenario and recorded 9 range requests, 13 day requests, and 5 mutation POSTs (2 Complete, 1 Pass, 2 Restore). The isolated same-month assertion is the important C1 gate: three same-month taps leave the range count at one while the day count increases per selected date.

### D1 query evidence

There is no production query counter in this repository, so these are source-derived statement counts for the 7-task seed, corroborated by the direct batch repository test. Authentication is included in each request count.

| Operation | Before | After | Notes |
| --- | ---: | ---: | --- |
| Initial range request | 16 | 8 | one household resolution, one batch weekday query |
| Same-month day request | 16 | 8 | selected-day task/record/shopping projection |
| Month switch range request | 16 | 8 | same range path as initial load |
| Complete reconciliation | 16 | 16 total | 8 range + 8 day; each endpoint is narrower |
| Household resolutions per Calendar request | 2 | 1 | request-scoped, never globally cached |
| `task_weekdays` statements for 7 tasks | 7 | 1 | direct repository regression test asserts one call |

The old combined compatibility endpoint also uses the optimized single-household and batch-weekday paths, so its per-request count is 8 after the refactor.

### Response task/date evidence

- Marker response: 42 date entries and no `selected` property.
- Selected response: selected task groups, completed history, and planned Shopping; no `dates` property.
- Planned Shopping remains selected-day data and retains planned purchase date, purchased status, purchasedAt, and purchasedBy fields in the API projection.

### DOM timing evidence

The after values use the controlled local Playwright client harness with a 60ms mocked range/day response and 45ms mocked mutation response. Response-to-DOM excludes CSS animation duration.

| Phase | p50 | p95 |
| --- | ---: | ---: |
| Direct Calendar → usable month grid | 367.46ms | 379.21ms |
| Same-month click → Date Sheet task visible | 111ms | 116ms |
| Month click → new month data visible | 85ms | 95ms |
| Complete click → completed state visible | 138ms | 160ms |

These values are reported for traceability only; they should not be treated as a Cloudflare staging or production latency claim. The key verified change is the request/payload boundary and removal of same-month marker transfer.

## Tests and evidence

- `e2e/calendar-data-path-optimization.spec.ts`: deterministic clock, all recurrence types, marker/detail request assertions, stale selected response protection, Complete/Pass/Restore, Shopping, two mobile viewports, and screenshots.
- `worker/calendar-performance.test.ts`: marker/detail response boundary, household isolation, selected Shopping, and one-call batch weekday loading.
- Existing Calendar tests continue to cover completed/skipped filtering, monthly clamping, inactive legacy flexible history, restore compatibility, and recurrence semantics.

Screenshots are saved under `artifacts/playwright/calendar-data-path-optimization/` for 390×844 and 375×812: month, selected Date Sheet, another same-month date, completed, restored, and Shopping detail.

## Compatibility and release boundaries

The old combined Calendar endpoint remains a compatibility wrapper for existing clients/tests. The application client and new tests use the split endpoints, so there is no dead partially-used replacement path.

No D1 migration was added. Production was not touched. C5 and all unrelated performance work remain out of scope.
