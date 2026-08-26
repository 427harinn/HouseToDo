# M7 two-user integration diagnostics

- Environment: loopback-only Wrangler Worker with local D1 at `127.0.0.1:8788/8789` and Vite proxy; Docker Compose was attempted but the Docker daemon was unavailable.
- Core actions used real local API/D1 persistence, canonical UI actions, separate Playwright browser contexts, separate session cookies, and unique per-test identities. Cookie values were not logged.
- Production render target: `fbe0855` (`test: align canonical m7 e2e contracts`).

## Task

- A created a task and assigned B; B reload/refetch saw the same task and assignee avatar.
- B completed through canonical Home; A reload saw the task in Completed with B as completer.
- A restored through the canonical Home swipe action; B reload saw the task active again.
- A edited the title; B reload and the Production task/dashboard endpoints returned the updated title.
- A second test used B's real pointer swipe to Pass; A saw the same task in Passed and `/api/tasks/:id/history` returned `status: skipped` with B as `actedBy`.

## Shopping and Calendar

- A created a planned item; B reload saw it and the planned date.
- A performed canonical long-press reorder; B reload returned the same persisted order.
- B purchased; A reload saw purchaser B, a non-null actual `purchasedAt`, and UI timestamp text matching the API value formatted in the household timezone.
- A restored; B reload and the API showed `pending`, `purchasedAt: null`, and the original `plannedPurchaseDate` preserved.
- B opened Calendar, saw the planned-date marker, opened the Date Sheet Shopping section, navigated to `/shopping?item=<actual-id>`, and the target row was expanded with the Purchase action visible.

## Other / household / session

- A and B each read the same two-member list from Production API data.
- B changed displayName in Account; A refreshed Members and saw the new displayName.
- Owner A changed household name and timezone to `America/Los_Angeles`; member B saw the new household name after reload, and Home/Calendar remained usable.
- A's direct member-context `PATCH /api/households/current` was rejected with the Production permission response (`403` in the local run); B's Household form was read-only.
- A logged out and reached `/login`; B reload remained authenticated and used canonical Home. Avatar/R2 sync was not run because the local production-like setup has no safe user-supplied image/R2 fixture in this review; displayName sync is the required verified profile path.

## Automated sources

- `e2e/m7-real-integration.spec.ts`: 4 tests passed in the final targeted run; the combined M7 legacy + real integration run passed 6/6.
- `e2e/m7-legacy-route.spec.ts`: 2/2 passed and generated `legacy-route-results.json`.
- `scripts/run-m7-pwa-check.mjs`: generated `pwa-results.json` from production-like Wrangler asset hosting.
