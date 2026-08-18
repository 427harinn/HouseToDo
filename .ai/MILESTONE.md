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

## Calendar staging verification (2026-08-14)

- Commit `45b6e1f2212b221c338b406fd8b65cbce854f431` was deployed to `house-to-do-staging` as version `5cb54728-1dac-441b-aaa6-d803ad350351` after local gates, read-only migration verification through `0012`, and dry-run success.
- Health, authenticated navigation, month navigation, fixed markers, flexible selected-date sections, one flexible completion display, task detail/back navigation, aria-labels, and empty browser error logs passed. Temporary Calendar fixtures were marked inactive by exact title.
- Production, secrets, remote migration apply, Cron configuration, and git push remain untouched.

## Next objective

Shopping planned purchase dates and their Calendar projection are verified on staging. Notification deep-link, Shopping notifications, and production rollout remain future work.

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

## Phase 6 local implementation (2026-08-14)

- Recent task definitions use existing active canonical tasks, sorted by `created_at DESC` with an API limit of 8. Execution history (`task_records`) is not used as the reuse source; legacy weekly target count > 1 tasks are excluded.
- Task templates use the additive `0013_task_templates.sql` table and household-scoped CRUD. Templates store only canonical reusable settings, never `startDate`, once `targetDate`, task records, or execution status.
- Task create, task detail, and `/tasks/templates` use the shared canonical form/mapping. Recent/template selection prefills the form and never creates a task immediately.
- Local unit/API tests, typecheck, lint, build, local migration, staging config validation, and targeted host Playwright passed. Docker was unavailable, so the Worker was verified with the host dev server. Staging, production, deployment, remote D1 mutation, and git push remained untouched.

## Phase 6 authenticated staging verification (2026-08-14)

- Migration `0013_task_templates.sql` was applied to staging and Worker version `6d104f8e-2705-44d4-93b6-1776801c6628` was deployed to `house-to-do-staging`.
- Authenticated E2E passed for recent API/UI prefill, new-task creation, template save/list/edit/reuse/deactivate, startDate exclusion, Home/Calendar/Dashboard exclusion, navigation regression, 390px mobile smoke, and browser error checks.
- Temporary tasks/templates were logically deactivated. Staging D1 cleanup aggregate confirmed zero active verification fixtures and zero template-ID notification deliveries. Production, secrets, Cron, and git push remained untouched.

## Shopping UX Phase 1 local implementation (2026-08-14)

- Shopping recent reuse reads existing household-scoped `shopping_items`, includes pending and purchased items, sorts by `created_at DESC`, deduplicates normalized names, and caps results at 8 without adding a table or migration.
- Recent and new-form template selection prefills reusable name, quantity, and note fields; purchase state, purchaser, timestamps, item identity, history, and old images are excluded.
- Shopping image selection now exposes separate camera and photo-library controls that share the existing validation, preview, compression, and R2 upload pipeline. Upload limits and attachment architecture are unchanged.
- Shopping planned purchase date, Calendar integration, scheduler changes, production, and git push remain out of scope.

## Shopping UX Phase 1 staging verification (2026-08-14)

- Commit `7d150a72e19a3ac0c1f368eccda54269a549eac7` was deployed to `house-to-do-staging` as version `e409489e-26a3-4955-bc97-da5301da4fcf` after local gates, remote migration read-only checks, and dry-run success.
- Health returned D1/R2 true. Authenticated Shopping Recent, purchased-item reuse, Recent/Template prefill, pending-state exclusion, old-image exclusion, camera/library preview/remove, library image save through R2, existing Shopping behavior, Calendar smoke, mobile 390px layout, and browser error checks passed.
- Temporary Shopping items were deleted and the temporary template was deactivated by the existing template semantics. No migration was applied. Production, secrets, Cron, production resources, and git push remained untouched.

## Shopping image picker simplification staging verification (2026-08-14)

- Commit `cfbe70465313279137915c38de15281a980a8443` was deployed to `house-to-do-staging` as version `c3ee3b68-6978-4857-8045-ca6551d9c59d` after local gates, read-only migration verification through `0013`, and dry-run success.
- Shopping new showed only `写真を選ぶ`; the camera-specific button/input was absent, and the remaining input used `accept="image/*"` with no `capture` attribute. Staging fixture selection passed preview, remove, and re-selection with no browser errors.
- No staging item or attachment was created in this smoke. Real iPhone OS picker behavior was not exercised; manual confirmation of Library/Take Photo options remains pending. Production, secrets, Cron, remote migration apply, and git push remain untouched.

## Shopping planned purchase date local implementation (2026-08-18)

- Additive migration `0014_shopping_planned_purchase_date.sql` adds nullable `planned_purchase_date` and a household/date range index; fresh and existing local migration paths are verified.
- Shopping create/edit/detail support an optional household-local date. Purchase/unpurchase preserve it, PATCH `null` clears it, and invalid dates are rejected.
- Recent and Template prefill always leave the date empty; Shopping templates do not store it.
- Existing `GET /api/tasks/calendar` additively returns bounded household-scoped Shopping markers and selected-date summaries. The Calendar renders a separate `買うもの` section, purchased text/icon state, and Shopping detail navigation.
- Shopping notifications, Cron, scheduler behavior, staging/production resources, remote D1, deployment, and git push remain untouched.

## Shopping planned purchase date staging verification (2026-08-18)

- Migration `0014_shopping_planned_purchase_date.sql` was the only pending staging migration, applied successfully, and verified with the nullable column and household/date index. Worker version `88403adb-b678-4528-916e-a67829cc5812` was deployed to `house-to-do-staging` after dry-run and all local gates passed.
- Health, authenticated Shopping create/detail/edit/clear, purchase/unpurchase persistence, Recent/Template date exclusion, Calendar Shopping marker/aria-label/separate section, purchased state, detail navigation, date movement, existing Task marker/sections, and 390px no-overflow smoke passed with empty browser warning/error logs.
- Temporary Shopping items were cleared and deleted; the temporary template was deactivated by existing semantics. Read-only cleanup found zero temporary Shopping items, zero active temporary templates, and zero Shopping notification deliveries. Cron, secrets, R2 images, production resources, production migration/deploy, and git push remained untouched.
