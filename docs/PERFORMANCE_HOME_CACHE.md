# WP4 Home Cache-First Bootstrap

## Scope

WP4 improves the time-to-useful Home display with P1 (memory snapshot), P2 (same-day IndexedDB snapshot), P3 (cache-first display with background revalidation), P4 (small refresh status), P5 (initial cached-state mutation lock), and P7 (parallel initial bootstrap).

P6 optimistic/local-first mutations and P8 a bootstrap endpoint remain deferred. Calendar and Shopping data paths were not redesigned.

## Baseline and actual request lifecycle

Before WP4, the application performed this effectively serial sequence:

```text
me()
  -> getCurrentHousehold()
    -> route resolves/mounts Home
      -> getHomeToday()
```

There was no Home memory or persistent snapshot. A Home remount issued another Home GET, and an initial `null` Home data state could look like the empty-task state while the request was pending. Visibility refresh also issued a new Home GET.

The WP4 lifecycle is now:

```text
initial / or /home
  -> me(), getCurrentHousehold(), getHomeToday() start together
  -> auth + authorized household gate
  -> matching memory snapshot immediately, otherwise same-day IndexedDB snapshot
  -> Home server result wins and replaces both caches
```

The Home result may resolve first, but it is held until the authenticated user and current household are confirmed. A persistent snapshot is never read or displayed before that gate. A cache record is scoped by user, household, and household-local date:

```text
home:{userId}:{householdId}:{YYYY-MM-DD}
```

Only successful server-confirmed Home GET results are written. Logout clears Home memory and IndexedDB snapshots; identity, household, and date changes invalidate the previous display. Generation checks prevent old IDB reads, requests, and refreshes from overwriting newer state.

## Controlled timing evidence

Measured with the dedicated Playwright suite against the local production-like Vite preview (`127.0.0.1:4173`) using deliberately held route responses. These are controlled/mock timings, not staging measurements.

- Parallel bootstrap request-start overlap: `1ms` in the follow-up run; all three requests started before any response was released.
- Cold usable Home DOM: `92ms` from the earliest controlled request start.
- IndexedDB cache task DOM: `183ms` from navigation start while Home network was held.
- IndexedDB authoritative task DOM: `566ms` from navigation start after release.
- First Home task DOM: `164ms`; Home revisit task DOM from the same run: `322ms`.
- The cold test asserted exactly one initial `/api/home/today` request.

The result demonstrates overlap and cache behavior under controlled delays. It does not claim a production or staging latency improvement from these mock numbers. The remaining cold bottleneck is the first authoritative Home response and render; P8 would be a separate server-side optimization.

## Follow-up: stale pre-auth bootstrap invalidation

The first WP4 version left a rejected pre-auth `getHomeToday()` Promise in `homeBootstrapRef` with `consumed=false`. After an unauthenticated cold launch, login or registration could therefore consume that old 401 Promise instead of issuing a fresh authenticated Home GET.

The follow-up clears the bootstrap reference when authentication fails, when the household request reports `UNAUTHENTICATED`, on login success, on registration success, and on logout. The existing authenticated cold-launch path is unchanged: it still starts `me()`, current household, and Home together and consumes the single Home request. Login and registration now always mount Home with a fresh bootstrap request.

When an authenticated cold launch resolves to `household: null`, the pre-household bootstrap is also invalidated at the shared household setup boundary: `settleHouseholdAndUploadAvatar` for household creation and the join callback for invite joining. This preserves the one-request authenticated path for users who already have a household while forcing a fresh Home GET after a new household identity becomes available.

## UI and mutation behavior

- Authenticated/authorized Home renders its shell without waiting for Home data.
- No-cache pending state shows `最新情報を確認しています。` and does not show a false `やることはありません` state.
- Cached Home keeps its normal task layout and shows the same subtle status while the first authoritative sync is pending.
- Complete, Pass, and Restore are disabled only while cached data is displayed before the first successful authoritative Home result.
- After the first authoritative result, later background refreshes do not globally disable Home mutations.
- Refresh failure retains cached tasks and shows a non-blocking status instead of replacing the page.

## Verification

Dedicated coverage is in `e2e/home-cache-first.spec.ts` and covers parallel startup, duplicate prevention, memory revisit, IndexedDB hard reload, auth safety, household/date isolation, initial mutation lock, later revalidation, IndexedDB failure fallback, stale pre-auth bootstrap recovery through login and registration, and pre-household recovery through both create and join. Unit coverage is in `src/cache/home-snapshot.test.ts`.

No D1 migration was added or required. Production was not touched.
