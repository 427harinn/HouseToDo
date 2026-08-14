# Milestone: Task model UI and reminder scheduler

## Completed boundary

- Six canonical recurrence types are available in Task create/edit/detail UI.
- Conditional start date, recurrence configuration, deadline, and notification presets are implemented.
- Canonical occurrence/period projection and all state actions are implemented.
- Reminder scheduler uses canonical deadlines, offsets, household timezone, and stable scope keys.
- Legacy tasks, including weekly target counts greater than one, retain compatibility behavior.

## Calendar phase completed

- Monthly `/calendar` UI with household-local today, month navigation, selected-date detail, fixed markers, flexible period sections, loading/error states, and task detail navigation.
- `GET /api/tasks/calendar` uses the Phase 3 projector, derives status/overdue state, validates a maximum 62-day range, and does not pre-generate occurrence rows.
- Local API/unit and Playwright coverage includes six recurrence types, monthly clamp, responsive widths, screenshots, and traces.

## Next objective

Notification deep-link and history/template task creation remain future phases. Shopping planned purchase date remains future work.

## Guardrails

Cron configuration and production resources remain untouched. Staging migration, deployment, and Push verification are allowed only under the Phase 5 runbook; secrets are unchanged and git push remains prohibited.

## Phase 5 staging verification (2026-08-14)

- `0012_task_model_foundation.sql` was applied to staging only and the latest Worker was deployed to `house-to-do-staging`.
- Health, schema, canonical task creation/grouping, and one canonical offset reminder delivery passed.
- Verification was initially blocked by weekly-flexible repeated completion; the second completion did not increase `completedCount`.

## Phase 5.1 staging re-verification (2026-08-14)

- Fixed flexible period completion history in local commit `d49868a49ff074eac3897506c690129f7d154ef9` without adding a migration or changing scheduler logic.
- Staging weekly and monthly flexible tasks both passed `completedCount` 1 to 2 with two completed records in one `period_key`; completed reminder suppression and skip state passed.
- Existing offset-positive smartphone Push and notification tap verification remains accepted from Phase 5. Production and git push remain prohibited.
- Follow-up completed: the staging validator now expects the configured `*/5 * * * *` Cron.
