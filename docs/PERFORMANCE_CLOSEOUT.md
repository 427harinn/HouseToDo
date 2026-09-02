# Performance Closeout — P8 and S3 Decisions

Date: 2026-09-02  
Base: `main` at `940a4d8bbe5c4d47f3fa12d6dad50e70afac7c93`  
Branch: `perf/performance-closeout-decisions`

This is a diagnosis and decision closeout. No product runtime behavior or D1 migration was added.

## 1. Original bottlenecks

The historical baseline identified four related sources of latency:

- Home used a broad dashboard projection, duplicated task data, and a serial auth → household → Home bootstrap path.
- Home completion and pass/restore actions waited on a broad refresh before the UI settled.
- Calendar loaded a larger mixed range/detail projection and repeated weekday work.
- Shopping used full-list refreshes around mutations and had no cache-first/local-first path.

The historical dashboard baseline measured a local API p50 of 79.47 ms and a client navigation-to-first-task p50 of 279.41 ms. The representative dashboard response was 36,467 bytes, including duplicated `homeTasks` and `todayTasks` sections.

## 2. What was implemented

Home now has a narrow `/api/home/today` projection, memory and IndexedDB cache-first reads, local-first Complete/Pass/Restore, and delayed refresh status. Initial Home loading starts the safe `auth/me`, `household/current`, and `home/today` work in parallel; identity/date guards prevent an old bootstrap from being displayed.

Calendar now separates range markers from selected-day detail, batches weekday work, reduces D1 work, uses memory and IndexedDB snapshots, and rejects stale responses.

Shopping now has a performance baseline, memory and IndexedDB cache-first reads, local-first Purchase/Unpurchase with per-item mutation locking and rollback, targeted reconciliation, and Calendar cache invalidation for planned-date changes.

The only code change in this closeout is diagnostic: `scripts/performance-client-baseline.mjs` now uses the current test date and current split Calendar routes. It does not change application behavior.

## 3. Current measurements

Measurements below are controlled local runs against the local Worker/D1. They are comparison evidence, not production SLOs. Client timings include the browser harness and local Vite/Worker process.

### API baseline

| Path | p50 | p95 | Notes |
| --- | ---: | ---: | --- |
| `auth/me` | 6.72 ms | 7.66 ms | 10 samples |
| `household/current` | 8.26 ms | 10.56 ms | 10 samples |
| `home/today` | 30.10 ms | 284.69 ms | one local outlier at p95 |
| `dashboard` historical/current comparison | 50.82 ms | 65.99 ms | broad legacy projection |
| Home completion POST | 23.45 ms | 30.45 ms | 10 samples |
| Home after completion | 28.30 ms | 31.57 ms | narrow projection |

The current fresh Home response was 17,175 bytes versus 36,467 bytes for the dashboard baseline. After completion, the Home response was 12,444 bytes in the representative run.

### Client baseline

| Screen / path | Current controlled result |
| --- | --- |
| Home cold navigation → usable task | p50 299.12 ms, p95 496.41 ms in the mock client harness |
| Home auth → response | p50 29.90 ms, p95 42.70 ms |
| Home household response | p50 41.25 ms, p95 44.43 ms |
| Home response → task visible | p50 6.60 ms, p95 23.90 ms |
| Home memory revisit | 814 ms observed in the E2E harness; revalidation continued in background |
| Home IndexedDB first paint | 379 ms observed; authoritative replacement 1,604 ms with network held |
| Home local-first completion | 319 ms observed in E2E; delayed POST completion remained independent of the held 1,500 ms response |
| Calendar cold month grid | 456 ms observed in E2E |
| Calendar memory range revisit | 266 ms while revalidation was held |
| Calendar IndexedDB range/day | 188 ms cache display; authoritative replacement 263 ms |
| Calendar direct cold month grid | p50 470.36 ms, p95 490.53 ms in the client harness |
| Calendar date tap | p50 121 ms, p95 134 ms to selected-day task display |
| Calendar month change | p50 98 ms, p95 107 ms |
| Shopping cold usable screen | 572 ms observed |
| Shopping memory revisit | 243 ms observed |
| Shopping Purchase local move | 319–336 ms observed; POST 40–69 ms in separate runs |
| Shopping Unpurchase local move | 64–72 ms observed |
| Shopping delayed Purchase | 326–332 ms local move while POST took 1,511–1,514 ms |
| Shopping Add / Edit / Delete | 217 / 154 / 322 ms in the diagnostic write run |

The Shopping cache suite also ran controlled response delays of 100 ms, 500 ms, and 1,500 ms. Purchase and Unpurchase remained usable immediately from the local projection, without waiting for the server response. The Home delayed-status suite covered the fast 100 ms and slow 500 ms status thresholds, plus delayed reconciliation. Calendar’s equivalent evidence is the held-network cache/stale-response suite rather than a separate three-point timing sweep; no false empty or stale overwrite was observed.

## 4. Remaining visible latency and bottlenecks

No major user-facing latency defect remains in the evaluated paths. The remaining visible costs are:

- cold browser/app startup and route/render overhead, especially Calendar and Shopping;
- authoritative revalidation after cache-first paint;
- server-first Shopping Add/Edit/Delete/Clear purchased flows;
- temporary sort B-trees in the current SQLite query plans;
- the legacy broad dashboard path, which is not the current Home critical path.

The Home mock-harness p95 is noisy and should not be treated as a production latency number. The more important architectural result is that Home data request start overlaps auth and household work, so a combined endpoint would not remove a serial critical-path segment.

## 5. P8 decision — Home bootstrap endpoint

**Decision: `P8_REJECT`**

Do not add `/api/bootstrap/home` in this work.

Current Home already starts `home/today` before auth and household responses complete, while identity safety prevents an unsafe display. The measured mock bootstrap showed zero additional wait for the household request after auth because the reads overlap. Home is also already using the narrow projection, reducing the representative payload from 36,467 bytes to 17,175 bytes.

A combined endpoint could reduce request count and duplicate household/auth lookups in some cases, but it would add coupling between authentication, onboarding/household correctness, and Home payload contracts. It would also convert currently parallel work into a larger coupled failure and maintenance surface. The expected UX reduction is therefore small and unproven relative to the new endpoint’s complexity.

Reconsider only if production-shaped p95 traces show that request overhead or duplicated D1 lookups dominate the current cold-start critical path after browser startup is excluded.

## 6. S3 decisions — remaining Shopping mutations

| Mutation | Decision | Reason |
| --- | --- | --- |
| Delete | **REJECT** for local-first | The response is only `{deleted:true}`. Delete may require image metadata/usage and R2 cleanup, so a correct rollback would need a complete item plus asset state and race-safe restoration. |
| Add | **DEFER** | The POST returns a full projection, but the form/navigation flow, image upload sequencing, duplicate submission, ordering, and rollback semantics are not defined strongly enough to justify optimistic behavior. |
| Edit | **DEFER** | The PATCH returns a projection and planned-date Calendar invalidation exists, but image replacement and failure/rollback sequencing still make server-first behavior the clearer contract. |
| Clear purchased | **REJECT** for local-first | This is a bulk, effectively irreversible operation; the response is only a count and per-item image/R2 cleanup makes a complete rollback snapshot expensive and fragile. |

Purchase and Unpurchase remain local-first because they have a reversible item projection, a bounded per-item lock, rollback behavior, and measured benefit under a 1,500 ms delayed response.

## 7. D1 index decisions

Plans were re-run against the current local D1 schema and representative data. All existing indexes below are already present; no migration was added.

| Candidate | Current query / plan | Decision | Reason |
| --- | --- | --- | --- |
| Task ordering | Active task list uses `idx_tasks_household_active`; all-task context used `idx_tasks_start_date`; both still show `USE TEMP B-TREE FOR ORDER BY` | **DEFER** | Task lists are hot, but the current indexes narrow by household/active or date and the remaining sort cost has not been benchmarked with production-shaped cardinality. |
| Shopping household/status/sort | Pending preview uses `idx_shopping_items_household_sort_order` and a temp B-tree for the last ORDER BY term; full list uses the same index plus a temp B-tree for ORDER BY | **DEFER** | Existing household/sort coverage is used. Shopping lists are bounded, and no end-to-end benefit is demonstrated for a more specialized index. |
| `task_records` period/order | Period/action queries use `idx_task_records_household_calendar_action_date` and show a temp B-tree for ORDER BY | **DEFER** | The current Calendar path is already split and selective. A new period/order index needs a production-shaped comparison, including write amplification and the flexible-projection frequency, before ADD. |

The temporary sort structures are optimization candidates, not proof of a user-visible bottleneck. Before any `ADD`, capture representative row counts and timings, compare a hypothetical/composite index, and measure write cost. Classification in this WP is intentionally conservative.

## 8. What is intentionally deferred

- A combined Home bootstrap endpoint.
- Local-first Shopping Add and Edit until form, image, navigation, and rollback contracts are explicit.
- Any local-first Shopping Delete or Clear purchased redesign; an archive/undo model is a better future direction than optimistic deletion under the current API.
- D1 index migrations until production-shaped query timing and write-cost evidence exists.
- A dedicated three-point Calendar delay benchmark; current cache/stale-response tests cover the user-facing failure modes, but a future measurement WP can add a standardized timing sweep if needed.
- Production and staging deployment, because this branch contains documentation and diagnostic-only test harness changes.

## 9. Recommended next project work

The next performance project should be observability-led: collect authenticated production-shaped cold-start traces for Home, Calendar, and Shopping, including browser navigation, request start/response, usable DOM, D1 duration, row counts, and cache-hit state. Use that data to decide whether any deferred D1 index or endpoint change has a measurable return.

If product wants faster Shopping writes after that, design an explicit mutation protocol first: projection-complete responses, asset lifecycle handling, idempotency, rollback/undo, and Calendar invalidation. Do not extend local-first behavior by analogy alone.

## Cross-screen cache correctness

**PASS**, with an intentional short stale window before authoritative revalidation:

- Home task mutations revalidate Calendar correctly; Calendar stale-response protection prevents an older response from overwriting newer state.
- Shopping planned-date mutations invalidate affected Calendar date/range snapshots, including the old and new dates.
- Home, Calendar, and Shopping caches are identity/date/schema scoped; logout and household changes do not display another identity’s cache.
- Date rollover is guarded by the current performance date and cache keys; the Home rollover test passed.
- PWA reload cache-first paths accept only valid persisted snapshots and then reconcile with the server.

## Verification

Passed:

- Vitest full: **49 test files, 296 tests**.
- Playwright regression set covering M2, M3, Home WP4/WP5, Calendar C5, Shopping S2, delayed status, and Auth: **72 passed**.
- Playwright cross-screen/integration set covering Calendar data paths, stale responses, Shopping planned-date propagation, and settings/logout: **9 passed**.
- Shopping performance/cache suites: **15 passed**.
- `npm run lint`.
- `npm run typecheck`.
- `npm run build` — 1,851 modules transformed; client bundle 346.48 kB (102.57 kB gzip).
- `npm run db:migrate:local` — no migrations to apply.
- `git diff --check`.

Runtime changes: **NO** (diagnostic script only).  
D1 migration: **NONE**.  
Staging deploy: **NO**.  
Production: **NOT TOUCHED**.  
Auto merge: **NOT RUN**.
