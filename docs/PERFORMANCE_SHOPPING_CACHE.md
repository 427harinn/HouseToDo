# Shopping Cache-First and Local-First Performance (S2)

## Scope and base

This document records Work Package 9 / S2 on top of main SHA `8bf9c70f7102819d32d35c4fb372b069a0d10e6b`, following the merged S1 baseline in `docs/PERFORMANCE_SHOPPING_BASELINE.md`.

S2 changes only the Shopping client data path. There is no D1 schema change, Service Worker data cache, Cloudflare edge cache, offline mutation queue, production release, or local-first delete/add/edit flow.

## Cache architecture

The primary snapshot is one combined server-confirmed `pending` + `purchased` Shopping item list. It is keyed by:

```text
shopping-list:{userId}:{householdId}
```

Timezone is intentionally omitted. `plannedPurchaseDate` is already an item field and does not change the Shopping list projection. Calendar owns timezone-sensitive range/day projections and receives explicit invalidation after Shopping changes.

There are two cache layers:

- A module-level memory map gives immediate Shopping → Home → Shopping reuse.
- IndexedDB database `house-to-do-shopping-snapshots`, store `shopping-lists`, schema version 1, persists one record per user/household identity.

The IndexedDB record is shape-validated, identity-validated, schema-versioned, and retained at one record per identity. IndexedDB errors are nonfatal. Logout clears Shopping memory and persistent records; all reads and writes remain identity-scoped.

Only the main item list is persisted. Templates and members use identity-keyed session memory reuse and are loaded independently. Recent items remain form-only and are not part of the main-list cache.

## Cache-first flow

After auth and current-household identity are known, memory is read synchronously. A memory snapshot renders immediately. Otherwise the IndexedDB read and authoritative `GET /api/shopping/items` start in parallel. A valid IndexedDB snapshot may render before the GET; the GET always replaces it when current, writes memory, and best-effort writes IndexedDB.

The first authoritative item GET is a mutation gate. Cached rows can be expanded and navigated, but Purchase, Unpurchase, and other mutation actions remain disabled until that GET succeeds. Sequence, mutation-revision, generation, and cache-epoch checks prevent an old GET or pre-logout request from replacing newer server-confirmed or current-identity state.

## Purchase and Unpurchase overlay

Purchase and Unpurchase use a transient in-memory mutation journal over the server-confirmed baseline:

```text
tap → retain full original item → project item into the other section
    → POST in background → merge returned full item → background items GET
```

The normal existing row transition boundary is preserved: the item does not disappear at pointer-down, then moves immediately after the action. The expanded row and action tray close when the item changes section, avoiding an empty expanded gap. A per-item lock blocks duplicate/conflicting actions while different items may mutate concurrently.

The full item returned by the POST is authoritative and is merged into the baseline and persistent cache immediately. On failure, only that mutation is rolled back; unrelated rows and concurrent item mutations remain intact. No pending projection, fake timestamp, purchaser, animation state, or rollback metadata is persisted.

Delete remains server-first because its response is only `{ deleted: true }` and image/R2 cleanup makes rollback unsafe. Clear purchased remains server-first. Add and edit remain server-first, but their returned item is merged into the server-confirmed Shopping cache.

## Targeted reconciliation and request reduction

Purchase and Unpurchase no longer refetch templates or members. The returned item is applied immediately, followed by an optional items-only background revalidation for cross-user reconciliation. Delete and clear purchased likewise use items-only refreshes where a refresh is needed. Templates and members are not refetched after simple item mutations.

| Flow | S1 logical requests | S2 logical requests |
| --- | --- | --- |
| Cold Shopping mount | items + templates + members | same three, but item list is independently usable |
| Memory revisit | items + templates + members | items; templates/members reused for the session |
| IndexedDB restart | items + templates + members | same supporting requests in parallel; cached items render first |
| Purchase | POST + items + templates + members | POST + items-only background revalidation |
| Unpurchase | POST + items + templates + members | POST + items-only background revalidation |
| Delete | DELETE + fresh three-request mount | DELETE + items-only refresh |
| Clear purchased | POST, then list refresh | POST, then items-only refresh |

Using the S1 static D1 counts, Purchase and Unpurchase go from 8 mutation + 16 refresh = 24 logical statements to 8 mutation + 6 items refresh = 14 when the optional items reconciliation runs. A memory revisit uses one 6-statement items GET instead of the previous 16-statement three-request mount. Cold item-list cost remains 16 statements because no server endpoint or schema was changed.

## Calendar invalidation

Shopping changes invalidate Calendar snapshots for the exact affected `plannedPurchaseDate`. The helper removes matching memory range snapshots whose range contains the date and matching memory/day snapshots for the date, then best-effort removes the same identity/timezone records from Calendar IndexedDB. An epoch prevents in-flight old Calendar writes from restoring invalidated data.

Purchase, Unpurchase, Delete, Add, and Edit call the helper. Edit invalidates both the original and returned planned dates when they differ. If a mutation response supplies a changed date, both dates are covered. This is targeted by user, household, and timezone; no cross-module circular dependency was introduced.

## Status and visual behavior

Existing delayed busy status behavior is reused: fast revalidation has no visible text, while a refresh that crosses the existing threshold displays `買い物リストを更新しています。`. Purchase and Unpurchase do not flash that status for their normal local-first transition. Existing rows remain mounted during revalidation, so there is no full-list blank state.

## Measurements

The S1 controlled baseline measured Purchase local usability at 278ms and Unpurchase at 78ms, but those values included the old POST/full-refresh path. The S2 dedicated Playwright harness uses held requests and a controlled 1500ms Purchase response delay. In the final run:

| Phase | Controlled result |
| --- | ---: |
| Cold / no cache | covered by S1 baseline harness; S2 keeps the same request graph |
| Memory revisit | cached rows visible before held items GET |
| IndexedDB restart | cached rows visible before held items GET |
| Purchase local move | 363ms in the dedicated run; independent of held POST |
| Purchase POST response | 1500ms controlled delay |
| Unpurchase local move | 75ms in the dedicated run; independent of held POST |

These are local Playwright measurements for regression comparison, not production latency claims. The important property is that the local move occurs while the 1500ms POST is unresolved.

## Verification artifacts

Dedicated suite: `e2e/shopping-cache-local-first.spec.ts` — 10 tests passed in the final run. It covers cache-first IDB display, memory revisit, authoritative mutation gating, Purchase and Unpurchase local-first behavior, failure rollback, per-item locking, different-item concurrency, stale GET protection, and a controlled 1500ms Purchase delay.

Screenshots are saved under `artifacts/playwright/shopping-cache-local-first/` at 390×844 and 375×812, including held GET, held POST, confirmed purchased, rollback/error, Unpurchase, expanded purchased row, and narrow-width views.

The S1 baseline remains the historical measurement reference. Its old mutation assertions describe the pre-S2 full-refresh contract and should not be used as S2 behavior assertions. Production was not touched.
