## Summary

Production Calendar M3 migrated to Mockup latest-main parity on `feat/production-calendar-m3`.

## Scope

- Compact year/month header, Today control, Sunday-first 7×6 month grid, task summaries, deadline emphasis, Shopping markers.
- Date Sheet with direct/period/completed/Shopping sections, task complete/pass, completed restore/edit, date/month swipe transforms, reduced-motion handling.
- Calendar-to-task edit return context and Calendar-to-Shopping list target highlight.

## Backend/API changes

- Calendar response additively returns `dates[date].tasks` and selected-date snapshot-aware completed records.
- Month projection excludes completed/skipped and daily tasks; flexible tasks appear only on deadline dates.
- Shopping Calendar returns pending items with an exact planned purchase date only.
- Added `POST /api/tasks/:taskId/calendar-restore` with strict household/task/record/status/date validation.

## Migration

- Added local-only additive `0017_calendar_action_date.sql` for period action-date persistence. Existing period identity and unique-index semantics remain unchanged.

## Mockup reference SHA

`db8941dc3056f07862014242a349ae366da59e9c`

## Mockup Parity Audit

See `docs/evidence/m3/README.md` and the paired 390×844 captures under `docs/evidence/m3/production/` and `docs/evidence/m3/mockup/`. Normal, dense, Shopping, Date Sheet, completed, restore, month swipe, and day swipe states were compared.

## Screenshots

Production: `docs/evidence/m3/production/01-calendar-normal.png` through `12-calendar-task-edit-return-context.png`.

Mockup: `docs/evidence/m3/mockup/01-calendar-normal.png` through `11-calendar-next-month.png`.

## Motion Recordings

`calendar-task-complete.webm`, `calendar-month-swipe.webm`, `calendar-day-swipe.webm`, `calendar-completed-undo.webm` under `docs/evidence/m3/motion/`.

## Tests

- `npm run lint`
- `npm run typecheck`
- `npm test` — 36 files / 222 tests
- `npm run build`
- `npm run db:migrate:local`
- `npm run test:e2e -- e2e/calendar-m3.spec.ts` — 2 passed

## Shopping Calendar contract

Pending + planned date equality only. Purchased and unplanned items are excluded from markers and Date Sheet. The existing Shopping UI is not restyled.

## Task edit return context

Calendar edit links retain `origin=calendar&calendarDate=YYYY-MM-DD`; save/back/delete return to the selected Calendar Date Sheet.

## Legacy compatibility

Legacy Calendar fields remain in the API; Home today-only restore remains unchanged; legacy task projection and existing Shopping routes remain available.

## Deviations

Only Production data/loading/error/accessibility fallbacks differ from the fixture Mockup. No unexplained visual or motion deviation remains.

## Deploy status

No Cloudflare deploy, remote D1 migration, staging DB change, secret change, or production mutation was performed.
