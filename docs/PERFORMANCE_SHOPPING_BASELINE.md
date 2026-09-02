# Shopping Performance Baseline (S1)

## Scope and evidence

This is a diagnostic baseline for Work Package 8 / S1. No Shopping cache, optimistic mutation queue, Service Worker data cache, edge cache, schema change, or production deployment was added.

The browser evidence is in `e2e/shopping-performance-baseline.spec.ts`. It runs against the local Vite client with a deterministic API harness, a fixed clock (`2026-08-28T12:00:00+09:00`), and controlled mutation delays of 100ms, 500ms, and 1500ms. Timings and response bytes below are controlled/local measurements, not production latency. The API response byte values are exact UTF-8 bytes of the fulfilled JSON response bodies, including the normal `{ ok, data, requestId }` envelope used by the client.

The local Vite run is a development build. React StrictMode replays mount effects, so the observed request count can be two for a logical one-request operation. The logical request graph and the observed development count are both recorded where relevant.

## Current architecture

The shared `App` bootstrap starts `GET /api/auth/me` and `GET /api/households/current` in parallel. Once authentication and the current household are ready, Shopping mounts.

The Shopping list screen (`ShoppingM4ListScreen`) owns session state for pending items, purchased items, templates, members, loading, and status. `useShoppingData.refresh()` starts these three requests in parallel:

```text
Shopping mount or refresh
  ├─ GET /api/shopping/items
  ├─ GET /api/shopping/templates
  └─ GET /api/households/current/members
```

The list keeps the previous rows while a refresh is pending. On the first load, it shows `買い物リストを読み込んでいます。` only while there are no pending rows. Purchased rows are filtered client-side to the last seven days.

The create form starts image-usage, recent-item, and template requests in parallel. Selecting a recent item or template only prefills the local form; it does not call a template-add endpoint. Saving then navigates back to `/shopping?item=...`, which mounts the list and fetches the three list datasets again. The edit form fetches the item and image usage, then navigates back to the list after PATCH. Delete navigates back to the list after DELETE.

## Request graph

| User action | Requests in the logical current flow | Result |
| --- | --- | --- |
| Cold direct `/shopping` | auth/me + current household, then items + templates + members | Full list data becomes usable after all three list responses |
| Home → Shopping | No new auth or household request; items + templates + members | One Shopping mount fetch |
| Shopping → Home → Shopping | Home remount plus a new Shopping mount; no new shared auth/household bootstrap | Shopping fetches all three datasets again |
| Purchase | POST `/api/shopping/items/:id/purchase`, then items + templates + members | Mutation response is ignored; full list refresh is required by current UI |
| Unpurchase | POST `/api/shopping/items/:id/unpurchase`, then items + templates + members | Same full list refresh |
| Delete | DELETE `/api/shopping/items/:id`, then list navigation and items + templates + members | No local projection; full list mount follows |
| Add item | recent + templates + image usage on form; POST `/api/shopping/items`; then list mount | New item is returned by POST but list is fetched again |
| Edit item | item GET + image usage on form; PATCH `/api/shopping/items/:id`; then list mount | Updated item is returned by PATCH but list is fetched again |
| Template/recent use | recent + templates; local form prefill; POST item on save | No separate template-add request from M4 UI |
| Bulk purchased cleanup | POST `/api/shopping/items/clear-purchased` | Response is only a count; list refresh is needed to display the result |

In the final controlled Vite-dev run, the cold case observed 2 auth requests, 2 household requests, and 2 initial requests for each Shopping list dataset because of StrictMode replay. After the purchase refresh, totals were 3 for each list dataset. The logical production-shaped graph is one of each on mount and one of each on refresh.

## Backend and D1 graph

`requireAuth` resolves one session row and one user row: 2 D1 statements. `HouseholdService.requireCurrentHousehold` resolves the household and then rechecks membership: 2 more statements. Shopping does not weaken this authorization check.

The following are exact static statement counts from the current repository path, excluding R2 operations and excluding statements in unrelated route middleware:

| Endpoint/service operation | D1 statements | Notes |
| --- | ---: | --- |
| Authenticated request overhead | 2 | session lookup + user lookup |
| Current household resolution | 2 | household lookup + membership lookup |
| `GET /api/shopping/items` | 6 total | auth 2 + household 2 + item list 1 + image metadata list 1 |
| `GET /api/shopping/templates` | 5 total | auth 2 + household 2 + template list 1 |
| `GET /api/households/current/members` | 5 total | auth 2 + household 2 + member profile list 1 |
| `GET /api/shopping/recent` | 5 total | auth 2 + household 2 + recent item query 1 |
| `GET /api/shopping/items/:id` | 6 total | auth 2 + household 2 + item lookup 1 + image lookup 1 |
| Create item | 7 total | auth 2 + household 2 + next sort order 1 + INSERT 1 + read-back 1 |
| Update item | 8 total | auth 2 + household 2 + repository current 1 + UPDATE 1 + read-back 1 + image lookup 1 |
| Purchase | 8 total | auth 2 + household 2 + current item 1 + UPDATE 1 + read-back 1 + image lookup 1 |
| Unpurchase | 8 total | same shape as purchase |
| Delete without image | 6 total | auth 2 + household 2 + image lookup 1 + DELETE 1 |
| Clear purchased without images | 6 total | auth 2 + household 2 + purchased-image list 1 + DELETE 1 |
| Add from template route | 10 total | auth 2 + household 2 + template lookup 1 + nested create flow 5 |

Therefore, one logical initial Shopping list mount costs 16 D1 statements across three parallel HTTP requests: 6 + 5 + 5. A purchase or unpurchase costs 8 mutation statements plus 16 statements for the client refresh, or 24 statements total. The observed development replay can double the mount-side counts, but it does not change the server operation count per HTTP request.

The Calendar range/day routes resolve the household once at the outer route and pass the resolved household into Shopping's planned-item repository path. The Shopping contribution is one planned-item query; it does not repeat `requireCurrentHousehold` inside that branch.

### Repeated household/member resolution

There is repeated request-scoped household resolution across the three list endpoints: each separately performs the same two-statement household + membership resolution. Members are loaded once per members request, not once per Shopping row. A mutation endpoint performs one household resolution per request. `addFromTemplate` resolves the household and then calls `createItem`, which resolves it again; this is an isolated repeated lookup in the template-add route.

### N+1 assessment

No row-level N+1 pattern was found in the main Shopping list. Purchaser display name is obtained by one SQL `LEFT JOIN users`, and all item image metadata is obtained by one household-wide image query and mapped in memory. Templates and recent items are each one query. The recent query contains a correlated `NOT EXISTS` subquery for name deduplication, but it is one D1 statement, not one statement per result row.

Item detail and mutation read-back perform one item query plus one image query. That is two fixed statements per operation, not an item-row N+1 loop. Calendar planned Shopping is one range query.

## Response sizes

These are exact response-body bytes from the controlled harness with the representative seed of two pending items and no initially visible purchased items. Counts are shown to make the byte values reproducible.

| Response | Bytes | Items/rows |
| --- | ---: | ---: |
| Main list, initial | 702 | pending 2, purchased 0 |
| Main list, after purchase | 787 | pending 1, purchased 1 |
| Template list | 320 | templates 1 |
| Recent list (`limit=8`) | 298 | recent items 2 |
| Household members | 188 | members 1 |
| Image usage | 381 | metadata response |
| Item detail | 422 | one item |
| Purchase mutation response | 462 | one full item |
| Delete mutation response | 79 | `{ deleted: true }` |
| Calendar range, 42-day markers | 5,823 | 42 marker dates |
| Calendar day, selected planned date | 6,037 | selected shopping item included |

The main list response is the dominant Shopping payload in this seed, but its size grows linearly with item and image metadata rows. Templates and recent items are separate payloads and are only needed by the add form, not by the list screen.

## Controlled client timings

All values are one-sample measurements from the final local Vite-dev Playwright run, with no artificial delay except the delay sweep. They are useful for comparing this code path, not for claiming production performance.

| Phase | Measured result |
| --- | ---: |
| Cold direct Shopping → first useful item DOM | 425ms |
| Home → Shopping → first useful item DOM | 100ms |
| Shopping → Home → Shopping revisit | 159ms |
| Purchase click → purchased section visible | 278ms |
| Unpurchase click → purchased count 0 visible | 78ms |
| Add submit → new row visible | 128ms |
| Edit submit → updated row visible | 112ms |
| Delete confirm → list without deleted row | 315ms |

The response-to-DOM portion is small after the final list response. The perceived mutation time is dominated by the mutation request plus the follow-up list refresh, and the current UI does not use the full item returned by the mutation response for local projection.

## Network-delay sensitivity

The purchase response was delayed in the harness by 100ms, 500ms, and 1500ms. The observed server-response durations were 109ms, 505ms, and 1509ms respectively. In all three cases the pending row remained visible while the request was unresolved, and the purchased count changed only after the POST and subsequent list refresh completed.

At 1500ms the list remained usable: the expanded row and its note stayed on screen and the primary button changed to `購入中…`. There was no blank-list flash or purchased-section disappearance. The final state still waits for the broad GET refresh. The existing code explicitly clears `expandedId` when purchase/unpurchase starts, so an expanded row collapses when the mutation completes and refreshed data is applied. A single mutation therefore causes a full list refresh and can reset the user's expansion context.

Loading/status audit:

- Initial no-data loading uses `買い物リストを読み込んでいます。`; it is not rendered as the empty-list state.
- During a non-empty refresh, existing rows remain in place and the purchased section remains mounted; there is no full-page blanking.
- Purchase/unpurchase exposes a busy button but no separate delayed refresh status text.
- Purchase/unpurchase does not locally move the item before the server result; perceived completion waits for POST plus the three refresh GETs.
- Add/edit/delete navigate through a fresh list mount, so the entire list is refetched after a single-item change.
- Scroll is not explicitly restored by Shopping, and purchase/unpurchase explicitly clear the expanded row. This is the main observable context-loss risk.

## Purchase and unpurchase data flow

```text
tap Purchase / Restore
  → POST /api/shopping/items/:id/{purchase|unpurchase}
  → full ShoppingService item returned by Worker
  → client ignores returned item
  → refresh()
      → GET items
      → GET templates
      → GET members
  → replace pending/purchased/templates/members state
```

The mutation response contains enough data for a local projection: the complete item, status, purchaser, timestamp, and image metadata are returned. Rollback can be safe if the pre-mutation item is retained in a transient journal. Server conflict risk remains because another household member may change the same item between the list read and the mutation. A persistent cache must only be updated after the server mutation succeeds; an offline queue should not be inferred from this baseline.

## Add, edit, delete, templates, and recent items

Create and update responses also contain full item projections, but the current screen navigates to the list and refetches all three list datasets. Delete returns only `{ deleted: true }`; the edit screen has a full item from its initial GET, but the delete response alone cannot reconstruct a deleted item for rollback. Delete may also perform image metadata/usage cleanup and R2 cleanup, which increases the cost of treating it as a simple local toggle.

Template and recent items are form-only data. They are fetched separately and selected locally into the form. The M4 UI does not invoke `POST /api/shopping/templates/:id/add`; that route exists in the backend, and its service path performs an additional household resolution before nested create.

## Calendar interaction

The backend is correct for planned Shopping propagation. `plannedPurchaseDate` is stored on the item, returned by Shopping mutations, filtered from Calendar's planned-item query, and preserved across purchase/unpurchase. Existing Worker coverage verifies add, edit, purchase, unpurchase, delete, and range isolation behavior.

The Calendar client has memory and IndexedDB snapshots, but Shopping mutations do not explicitly invalidate Calendar snapshots. Navigating from Shopping to Calendar triggers Calendar range/day revalidation and eventually shows the correct result, but a prior cached marker/day response can be visible briefly until that GET completes. This is an eventual-refresh/stale-window issue, not a server correctness failure, and was left unchanged in this diagnostic WP.

## Cache-first candidate

Recommendation: **YES**, as a later S2 change.

Proposed shape:

- Cache one combined list snapshot containing `pending` and `purchased`, preserving server order and full item projections.
- Use an identity key such as `shopping:{userId}:{householdId}:{timezone}`. `userId` and `householdId` prevent cross-user/household leakage; timezone should be part of the identity or an explicit invalidation field because purchased timestamps are formatted and seven-day visibility is evaluated in the client timezone context.
- Keep templates and recent items as separate bounded records because they are form-only and have different freshness needs.
- Use memory first, then IndexedDB, followed by background revalidation. Never display a snapshot before auth and household identity are confirmed.
- Retain at most one current list snapshot, one active-template snapshot, and one recent-items snapshot per identity, with schema versioning and bounded age. A successful server response remains the only authoritative cache write.
- Invalidate or revalidate Calendar range/day snapshots after Shopping writes in the eventual S2 design, or accept and document the existing stale window explicitly.

## Local-first candidate

| Action | Full projection available for local use? | Rollback safe? | Recommendation |
| --- | --- | --- | --- |
| Purchase | Yes: list item and mutation response are complete | Yes, with a transient pre-mutation journal | **YES** |
| Unpurchase | Yes: list item and mutation response are complete | Yes, with a transient pre-mutation journal | **YES** |
| Delete | The edit screen has a full item, but DELETE returns no item | Conditional; image/R2 cleanup and irreversible deletion raise risk | **NO for the first S2 pass** |

Purchase/unpurchase have server conflict risk from concurrent household members, so local-first should reconcile with the POST result and then perform a narrow authoritative refresh or background list revalidation. It must not become a persistent offline mutation queue. Delete should remain server-first until a deliberate rollback contract exists for deleted item metadata and image cleanup.

## Exact next WP recommendation

Proceed with **S2: Shopping cache-first list snapshot plus local-first purchase/unpurchase**, in this order:

1. Add identity-safe memory/IndexedDB snapshots for the combined pending/purchased list, with delayed refresh status and stale-response guards patterned after Home/Calendar.
2. Project purchase/unpurchase locally only after the first authoritative sync, retain transient rollback data, and reconcile with the full mutation response.
3. Keep templates/recent snapshots separate and bounded.
4. Add explicit Calendar snapshot invalidation or a tested stale-window contract.
5. Defer local-first delete until its rollback and image-cleanup semantics are designed.

## Verification and artifacts

Dedicated suite: `e2e/shopping-performance-baseline.spec.ts` — **5 passed**.

Screenshots were captured and visually reviewed once at both requested viewport sizes:

- `artifacts/playwright/shopping-performance-baseline/01-pending-list-390x844.png`
- `artifacts/playwright/shopping-performance-baseline/02-expanded-item-390x844.png`
- `artifacts/playwright/shopping-performance-baseline/03-purchased-state-390x844.png`
- `artifacts/playwright/shopping-performance-baseline/04-slow-network-1500ms-390x844.png`
- `artifacts/playwright/shopping-performance-baseline/05-add-result-375x812.png`
- `artifacts/playwright/shopping-performance-baseline/06-edit-result-375x812.png`

No runtime/product code or D1 migration was added. Production was not touched.

Regression evidence from this branch:

- Dedicated Shopping baseline: 5 Playwright tests passed.
- Shopping M4 and Shopping–Calendar integration: 2 Playwright tests passed.
- Shopping image and purchased-swipe suites: 3 Playwright tests passed.
- M2, M3, WP4 Home, WP5 Home, Calendar C5, delayed-status, and M6 Auth: 61 Playwright tests passed.
- Vitest: 47 files / 286 tests passed.
- Lint, typecheck, build, local migration check, and `git diff --check`: passed; no migration was generated.

## Final next-WP decision

The exact next WP is **S2: Shopping cache-first list snapshot plus local-first purchase/unpurchase**. Keep delete server-first until a reversible deletion contract covers the item projection and image cleanup. Production remains untouched for S1.
