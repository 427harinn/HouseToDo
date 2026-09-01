# WP5 Home Local-First Mutations

## Scope

WP5 changes only the Home Complete, Pass, and Restore interaction. Calendar keeps its existing Date Sheet mutation flow.

The pre-WP5 Home lifecycle was:

```text
tap
  -> start existing row motion
  -> POST /api/tasks/:id/{complete|skip|restore}
  -> wait for POST and the motion hold
  -> GET /api/home/today
  -> apply server Home data
  -> active/history row moves
```

The local-first lifecycle is:

```text
tap
  -> accept action after first authoritative Home sync
  -> start existing row motion
  -> POST starts immediately in background
  -> motion boundary applies transient Home projection
  -> POST success starts authoritative GET
  -> GET result reconciles the transient projection
```

The existing motion constants remain the boundary contract:

| Action | Motion boundary |
|---|---:|
| Complete | 350 ms |
| Pass | 200 ms |
| Restore | 180 ms |

## Architecture and correctness

Home state is split into an authoritative server baseline and a session-only transient mutation journal. The displayed Home is the baseline projected through matching mutations. The journal is held in React memory only; it is not an offline queue and is never written to IndexedDB.

Each mutation contains a unique mutation id, identity/date scope, task id, phase, original record, optional full original `TodayTask` projection, temporary display record, start time, and POST outcome. Same-task actions are locked by the journal; different tasks can proceed concurrently.

Complete and Pass create display-only `HomeHistoryRecord` values with a local timestamp and authenticated actor. Restore can reconstruct a full active task only when the original projection was retained by a current-session Complete/Pass mutation. Older history records remove the history row locally but do not fabricate recurrence, deadline, assignment, or period fields.

Memory and IndexedDB contain only successful `/api/home/today` results. A successful authoritative GET updates the baseline and cache and clears matching transitioned mutations. A stale or invalidated GET cannot overwrite newer mutation state. Identity, household, and date changes clear the transient journal.

POST failure removes only its mutation and refreshes the authoritative baseline, allowing rollback without erasing another task's mutation. If POST succeeds but the follow-up GET fails, the local committed projection remains visible and the existing non-blocking latest-information status is shown. A later successful refresh reconciles it; the committed mutation is not rolled back as if the POST had failed.

## Controlled timing evidence

Evidence comes from `e2e/home-local-first-mutations.spec.ts` with held Playwright routes. These are controlled local browser timings, not production or staging latency claims.

| Action | Controlled network condition | Local DOM result |
|---|---|---|
| Complete | POST held unresolved | completed history is visible at the normal 350 ms motion boundary; the test asserts click-to-local state is under 900 ms |
| Complete | POST succeeds, post-mutation GET held | transient completed history remains visible until the GET is released |
| Pass | POST held unresolved | passed history is visible at the normal 200 ms motion boundary |
| Restore, current session | POST/GET continue in background | retained full task projection returns to active Home at the 180 ms restore boundary |
| Restore, old history | authoritative record lacks full task projection | history row leaves locally; active task appears only from authoritative data |

The controlled result is that local DOM movement is tied to the configured motion boundary rather than POST/GET latency. The suite explicitly holds the POST and GET responses to prove the separation. It does not estimate production latency.

## Verification artifacts

Dedicated scenarios cover Complete, Pass, both Restore modes, POST rollback, POST-success/GET-failure retention, duplicate same-task taps, concurrent different-task mutations, stale refresh invalidation, IndexedDB cache safety, and the initial cache mutation lock.

Screenshots are under `artifacts/playwright/home-local-first-mutations/`:

- `01-home-normal-390x844.png`
- `01-home-normal-375x812.png` (initial cache-lock viewport)
- `02-complete-local-transient-390x844.png`
- `03-pass-local-transient-390x844.png`
- `04-restore-current-session-390x844.png`
- `05-post-failure-rollback-390x844.png`
- `06-get-failure-retained-390x844.png`

Visual review checks the motion boundary, transient/server row styling, no duplicate restore, no blank gap, per-item availability, Bottom Nav stability, and subtle refresh/error status. Review iteration count: 2 (initial review plus a follow-up capture pass to make the normal and Pass evidence frames stable after their list-enter motion).

No D1 migration was added or required. Production was not touched.
