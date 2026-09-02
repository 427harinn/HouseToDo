# Calendar Cache-First (C5)

Date: 2026-09-02
Scope: Work Package 7 / C5 only
Base: `997b6700209a69fee7f6ebbe75b04b585858967b` (PR #24 merged)

## Why this exists

Calendar is shared household data and can change while the app is away from the screen. C5 therefore treats cache as an instant-display optimization, not as a freshness authority: every Calendar range entry and selected-day activation still starts a background GET, and the successful server response wins.

This follows the safety principles of [`PERFORMANCE_HOME_CACHE.md`](./PERFORMANCE_HOME_CACHE.md) without copying Home’s single-date model. Calendar has two independent cache domains:

- range/markers: the exact 42-cell `from`/`to` window;
- selected day: the Date Sheet response for one exact date.

## Architecture

`src/cache/calendar-snapshot.ts` owns identity keys, runtime validation, module-level memory caches, bounded retention, lifecycle epochs, and server-confirmed writes. `src/cache/calendar-snapshot-idb.ts` owns the versioned IndexedDB database and stores.

The database is `house-to-do-calendar-snapshots`, version 1, with separate `calendar-ranges` and `calendar-days` stores. IndexedDB failure is nonfatal; the network path remains fully usable.

Keys include all values that affect the response:

```text
calendar-range:{userId}:{householdId}:{timezone}:{from}:{to}
calendar-day:{userId}:{householdId}:{timezone}:{selectedDate}
```

The exact range matters because leading/trailing dates in a rendered grid are part of the response. A month label alone is not a safe key.

## Request lifecycle

On a range or day activation, Calendar first reads the matching memory entry synchronously. If memory has no entry, an IndexedDB read starts alongside the network request. A persistent cache can render before the GET, but never delays it. Every successful response immediately updates the matching UI state and memory; IndexedDB persistence is scheduled in the background.

Range and day state are keyed independently, so a cached Date Sheet can render even while its range request is still pending. A selected response is applied only when its date is still active. A late response may populate its own cache key, but cannot replace the current date or range UI.

## Server-confirmed-only rule

Only a successfully returned and minimally validated `/api/tasks/calendar/range` or `/api/tasks/calendar/day` response is written. No loading state, error state, animation, pending Complete/Pass/Restore projection, or mutation queue is persisted. Failed POSTs do not modify either cache.

Stored records carry `schemaVersion: 1`; malformed records, mismatched identity, mismatched timezone, mismatched date, and mismatched exact range are ignored safely.

## Authoritative mutation gate

Cached selected-day data is displayable immediately, including a valid server-confirmed empty response (`なし`). It is not authoritative for a new active Date Sheet, so Complete, Pass, and Restore remain disabled until that date’s first successful authoritative GET completes. Calendar navigation remains enabled. Later background revalidation does not globally disable actions after the first sync.

## Identity and lifecycle safety

User, household, timezone, and date/range values are embedded in every key. Logout clears Calendar memory and IndexedDB, and household updates clear Calendar memory and advance the lifecycle epoch. Responses started before that reset cannot repopulate the cleared cache or current UI. A new identity cannot read another identity’s keyed records.

Memory and persistent retention are bounded to the newest three range records and newest 31 selected-day records per user/household/timezone identity. Entries are ordered by server-confirmed save time, with a sequence tie-breaker; oldest records are evicted first.

## Controlled timing evidence

The dedicated `e2e/calendar-cache-first.spec.ts` suite uses a frozen clock and held route responses. These are local controlled measurements, not production latency telemetry. The important assertion is ordering: cache DOM becomes visible while the corresponding network response is deliberately held, and the authoritative DOM replaces it after release.

The suite records cold, memory-range, memory-day, IndexedDB, and authoritative replacement checkpoints in the Playwright run output. Screenshot evidence is saved under `artifacts/playwright/calendar-cache-first/` for the 390×844 and 375×812 mobile viewports.

## Verification boundaries

This change is client-side only. No D1 migration, Service Worker data cache, offline mutation queue, Shopping cache, Home behavior change, or production release is included. PR #24’s split Calendar endpoints remain the request boundary.
