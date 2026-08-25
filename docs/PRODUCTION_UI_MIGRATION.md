# Production UI Migration

HouseToDo-Mockup latest mainをdesign / interaction / motionのcanonical source of truthとし、ProductionのAPI・認証・router・データ・権限・Cloudflare構成はProduction側をsource of truthとする。UI parity auditではMockupの色、spacing、size、copy、layout、interaction、Motionを優先し、Production固有の差は理由をDeviationsへ記録する。

## Milestone overview

| Milestone | Scope | Status |
| --- | --- | --- |
| M1 | Shared UI Foundation: tokens, global foundation, motion constants, App Shell, Bottom Navigation, Add Bottom Sheet | Done |
| M2 | Home + Task: new Home, complete/pass/undo, task add/edit/delete, previous completion, and related Motion | Done |
| M3 | Calendar screen visual migration and Calendar interactions | Done |
| M4 | Shopping screen visual migration and Shopping interactions | Planned |
| M5 | Other / Settings and formal `/other` route | Planned |
| M6 | Auth / Household Entry. Guest and onboarding are removed from the new UI direction, not visually migrated. | Planned |
| M7 | Integration / Legacy UI cleanup: retire user-facing old Task list/detail/respond/templates and Shopping detail/templates routes, then verify 2-user flows, E2E, and PWA behavior | Planned |
| M8 | Legacy backend cleanup: after the new UI is stable, safely remove unused API/DB/compatibility code in separate PRs | Planned |

M3まで完了。M4 Shopping本体の全面移植は次 milestone の対象とし、このbranchでは実施しない。

## M2 backend contract decision

- `GET /api/dashboard/today` retains the legacy `todayTasks`, `summary`, and `weeklyTasks` fields and adds `homeTasks`, `completedRecords`, `passedRecords`, household timezone, member avatar URLs, and the pending Shopping count. Home reads the single active `homeTasks` projection plus the two today-only record collections, so reload reconstructs the same state without fixture data.
- Home projection queries are scope-bounded: active-task projection reads only the relevant household-local day, week, and period records, while today history uses a UTC range derived from the household timezone. It does not load the household's complete `task_records` history on every Home request.
- `task_records` uses additive nullable action-time snapshots for title and assigned member identity/display/color/avatar URL. Existing NULL snapshots fall back to the current task/member projection.
- `POST /api/tasks/:taskId/restore` removes only the requested today record and reactivates an inactive task. It does not delete any other history.
- Migration `0016_task_record_snapshots.sql` is local-only in M2; no remote D1 or Cloudflare operation was performed.

## M3 Calendar contract decision

- `GET /api/tasks/calendar` keeps its legacy marker/count fields and additively returns month-cell task summaries plus snapshot-aware selected-date completed records. Month cells contain only unfinished date-specific/fixed occurrences and flexible deadline dates; daily tasks remain Date Sheet-only.
- Calendar Shopping is pending and `planned_purchase_date = selectedDate` only. Purchased and unplanned items are excluded from both markers and the Date Sheet section. Shopping rows deep-link to `/shopping?item=<itemId>` without migrating the Shopping UI.
- Calendar completion accepts `calendarDate` and stores it in additive nullable `task_records.calendar_action_date`; period identity and existing uniqueness remain unchanged. NULL records use target date, then household-local completion date as fallback.
- `POST /api/tasks/:taskId/calendar-restore` is a Calendar-only historical restore. It validates household, task, record, completed status, and selected date, removes only that record, and reactivates inactive tasks. The existing Home today-only restore contract is unchanged.
- Migration `0017_calendar_action_date.sql` is additive and local-only. No remote D1, deployment, secrets, or Cloudflare operation was performed.

## M3 Mockup parity audit

Before creating the Draft PR, Codex rendered the latest Mockup main and Production Calendar at 390×844 and compared normal, dense, Shopping, Date Sheet, completed, restore, month-swipe, and day-swipe states. The audit evidence is kept under `docs/evidence/m3/`; any Production-only behavior is listed under `Deviations` in the PR body.

## Visual Evidence operation

Production UI migration PRs must include a Mockup comparison gallery and Motion preview in the PR body itself. Pinned GitHub image URLs are used for the main screenshots; animated GIFs are review previews and the original WebM files remain the canonical Motion evidence.

## M1 transitional mapping

最終Bottom Navigationは`Home / Calendar / Add / Shopping / Other`の5枠とする。M1では正式なOther screenをまだ作らないため、Otherは既存の`/settings/members`へ遷移し、`/settings/members`表示時はOtherをcurrent扱いにする。この暫定mappingはM5で正式な`/other`へ置き換える。

中央Addは既存の`/tasks/new`（家事）と`/shopping/new`（買い物）へ遷移する。form自体のデザイン移植はM2/M4で行う。

## Reference commits

- Production base: `f12b5eb5c948a7c3676b651909cc9edc2e9fc326`（作業開始時に確認した`origin/main`）
- HouseToDo-Mockup reference: `db8941dc3056f07862014242a349ae366da59e9c`（PR #18 merge後の`origin/main`）
