# Milestone: Production UI Migration M7 — Integration / Legacy UI Cleanup

## Current boundary

- M1 Shared UI Foundation is complete.
- M2 Home + Task is complete on the dedicated production branch. Mockup is used only for design, interaction, and motion reference; production API, auth, permissions, persisted data, and Cloudflare architecture remain authoritative.
- M3 Calendar and M4 Shopping are complete on `origin/main`.
- M5 Other / Settings is complete and merged in PR #6 at base `ed749b7`.
- M6 Auth / Household Entry is merged to `main` in PR #7 at base `d89a9d7`.
- M7 Integration / Legacy UI Cleanup is implemented on `feat/production-integration-legacy-m7`; PR #8 remains open as Draft for review.
- M8 Legacy backend cleanup has not started and remains out of scope.
- 詳細なM1〜M8計画は[docs/PRODUCTION_UI_MIGRATION.md](../docs/PRODUCTION_UI_MIGRATION.md)を参照。

## M7 start record

- Production base SHA: `d89a9d7ad52f5580b65a2a44b0e350295ef542c7`
- Mockup reference SHA: `db8941dc3056f07862014242a349ae366da59e9c`
- Branch: `feat/production-integration-legacy-m7`
- M6 is merged to `main`; M7 is the current boundary; M8 is not started.

## M7 delivery boundary

- Keep only the M1–M6 canonical user-facing flow and replace legacy Task, Shopping, and Settings route renders with history-replacing redirects.
- Audit internal navigation, remove unreachable legacy frontend screens and their dead references where safe, and retain all backend compatibility routes, services, repositories, D1 schema, migrations, and response fields for M8.
- Verify two separate authenticated local sessions against the local Worker and local D1 for Task, Shopping, Other/permission, household sync, and session isolation.
- Re-run canonical Vitest/Playwright coverage and production-like PWA/direct-route/service-worker checks. No deploy, remote migration, or visual redesign is in scope.

## M7 completion record

- Implementation/render target SHA: `fbe0855` (`test: align canonical m7 e2e contracts`).
- Local Worker + D1 two-user coverage includes Task complete/pass/restore/edit, Shopping reorder/purchase/restore/planned-date Calendar deep-link, Other member/displayName/permission/household sync, and logout isolation.
- Production-like PWA diagnostics passed manifest, icons, service worker, start URL states, direct routes, legacy redirect, and notification URL safety. WebKit is unavailable locally; real iPhone remains manual follow-up.
- Evidence review package contains exactly four boards and four final WebM files; M8 backend cleanup has not started.

## M6 delivery boundary

- Migrate Login, Register, Household Create, and Household Join to the Mockup Entry foundation.
- Preserve Cookie session, PBKDF2 authentication, auth/household APIs, D1 persistence, permissions, and invite single-use/expiry semantics.
- Add only the minimal unauthenticated read-only invite validation contract needed to avoid register-then-join partial success for invalid invite codes.
- Remove Guest and Onboarding from the new runtime flow by redirecting `/guest` and `/onboarding` through the auth/household state machine.
- Add M6 unit/API/E2E coverage and fresh 390x844 Production/Mockup parity and motion Evidence.

## M6 completion record

- Review correction implementation commit: `0fabce3`; Evidence refresh commit: `b54297c`; Draft PR: `https://github.com/427harinn/HouseToDo/pull/7`.
- Review package contains exactly four labeled boards and four canonical WebM files. GIFs remain under `motion/previews/` only.
- Entry primary/label parity, field-error clear, focus-neutral capture, semantic fixture alignment, and vertical Production/Mockup boards were rechecked for PR #7 review.
- No merge, deploy, remote D1 migration, secrets/Cron change, or M7 work was performed.

## M2 delivery

- Home uses one canonical urgency-sorted active list with complete-on-tap, pass swipe actions, collapsed completed/passed today records, restore-only inactive records, member avatar resolution, empty state, and pending Shopping summary.
- Task add/edit uses the six existing canonical recurrence values, household-local dates, all-day/time semantics, notification presets, assignee/reuse/delete sheets, last completion, and legacy weekly preservation.
- Backend adds additive task-record snapshots and a household-scoped restore endpoint. Migration `0016_task_record_snapshots.sql` is local-only.

## M3 delivery

- Calendar uses the Mockup latest-main compact month header, fixed 42-cell Sunday-first grid, task summaries, deadline-only flexible projection, Date Sheet sections, month/day swipe transforms, completion/pass/restore motion, and selected-date task-edit return context.
- Calendar API returns task summaries and snapshot-aware completed records in one bounded request. Calendar Shopping is pending planned-date-only and deep-links to the existing Shopping list.
- Calendar historical restore is isolated to `POST /api/tasks/:taskId/calendar-restore`; period actions persist additive nullable `calendar_action_date` in migration `0017_calendar_action_date.sql`. Home's today-only restore is unchanged.

## M4 start record

- Production base SHA: `485dbfefd93d16d1ae1abd60f849918703d4657c`
- Mockup reference SHA: `db8941dc3056f07862014242a349ae366da59e9c`
- Branch: `feat/production-shopping-m4`
- The Mockup is canonical for Shopping layout, copy, visible states, interaction, gesture, and motion. Production remains canonical for API, auth, permissions, D1, R2, and data semantics.
- Initial scope includes Shopping list/add/edit, reuse picker, expand/purchase/restore, seven-day purchased visibility, swipe edit, shared reorder persistence, Calendar deep-link, and Home/Calendar regression.

## M4 delivery

- Shopping list now follows Mockup latest-main flat-row density and interaction model, with one expanded item, seven-day purchased filtering without deletion, purchase/restore, purchaser metadata, photo/memo detail, and pointer gesture separation.
- Add/Edit now use the canonical form and unified reuse picker; templates remain available through legacy routes/backend for M7 cleanup, while reuse selection only prefills the form.
- `POST /api/shopping/items/reorder` is a new household-scoped additive contract that validates the exact pending-item set and persists `sort_order`; no migration was needed because the existing column was sufficient.
- Local tests, build, targeted browser capture, parity screenshots, four WebM recordings, GIF previews, four boards, and exactly eight reviewer-upload files are complete. No deployment or remote migration was performed.

## M5 delivery record

- `/other` is the primary Other route with canonical landing rows; detail routes keep the centered back header and omit Bottom Navigation. Legacy `/settings/members` remains intact.
- Members/invite, Push/browser notification settings, stored-byte storage usage, owner-only household name/timezone updates, avatar/R2 actions, persistent display-name update, read-only email, and real logout are implemented against Production contracts.
- No migration was needed. Local gates passed: lint, typecheck, build, full Vitest (37 files / 228 tests), and M5 Playwright (5 tests). Evidence contains 16 semantic state captures, four WebM recordings, four GIF previews, four boards, and exactly eight reviewer-upload files.
- No staging/production deploy, remote D1 migration, secrets/Cron change, PR merge, or M6 work was performed.

# M5 start record (2026-08-25)

- Production base SHA: `585e65f3d976710a19ef5bbc8317d4ebef2c3ddb`
- Mockup reference SHA: `db8941dc3056f07862014242a349ae366da59e9c`
- Branch: `feat/production-other-settings-m5`
- M4 is merged to `main`; M6 is not started.

# Historical milestone: Task model UI and reminder scheduler

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

## Playwright suite maintenance (2026-08-18)

- Local full suite uses semantic Task/Notification locators and no longer relies on the obsolete Task action button count.
- Local `npm run test:e2e` and staging `npm run test:e2e:staging` are separated. Missing staging URL/credentials produce an explicit skip and never redirect the staging spec to local.
- Existing single-worker execution and failure screenshot/trace/video artifact settings remain in force. No application behavior or migration changed.

## Shopping / Calendar UX follow-up (2026-08-18)

- Shopping items with `plannedPurchaseDate = null` are returned by a separate household-scoped Calendar selected-date query and appear on every selected date; planned items remain first, followed by `予定日未定` items.
- Unplanned items do not contribute to Calendar grid Shopping markers or cell `aria-label` counts. Pending and purchased unplanned rows are both included because purchased-item cleanup physically deletes them and no durable history is retained.
- Existing ISO `purchased_at` / `purchasedAt` values now render as date plus time using the household timezone in Shopping list, detail, and Calendar selected-date cards. No migration or remote mutation was made.

## M4 Shopping review correction (2026-08-25)

- PR #5 remains open on `feat/production-shopping-m4`; no merge, deploy, remote migration, or M5 work was performed.
- Corrected Mockup Evidence routing to pass each canonical state through `uilabState`, and added DOM semantic assertions for all 20 Mockup captures.
- Re-captured Production/Mockup state fixtures with aligned item-count, expansion, planned-date, photo, quantity, purchased-section, deleted, and delete-confirmation semantics. Production Edit normal intentionally uses an equivalent no-photo item state.
- Fixed long-press reorder completion with pointer capture plus a window-level pointerup fallback. Evidence now asserts oldest-first initial order, actual pointer drag, DOM order change, reorder API response, and reload persistence.
- Rebuilt 390x844 screenshots, four canonical WebM files from settled state, GIF previews, four boards, and the exact eight-file reviewer package. The existing Recent API intentionally omits source item identity/image; reuse-selected therefore remains no-photo in Production to preserve R2 ownership and the existing safe reuse contract, while the Mockup canonical state is captured with its photo.
