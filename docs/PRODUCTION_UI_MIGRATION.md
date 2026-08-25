# Production UI Migration

HouseToDo-Mockupをdesign / interaction / motionのsource of truthとし、ProductionのAPI・認証・router・データ・権限・Cloudflare構成はProduction側をsource of truthとする。

## Milestone overview

| Milestone | Scope | Status |
| --- | --- | --- |
| M1 | Shared UI Foundation: tokens, global foundation, motion constants, App Shell, Bottom Navigation, Add Bottom Sheet | Done |
| M2 | Home + Task: new Home, complete/pass/undo, task add/edit/delete, previous completion, and related Motion | Done |
| M3 | Calendar screen visual migration and Calendar interactions | Planned |
| M4 | Shopping screen visual migration and Shopping interactions | Planned |
| M5 | Other / Settings and formal `/other` route | Planned |
| M6 | Auth / Household Entry. Guest and onboarding are removed from the new UI direction, not visually migrated. | Planned |
| M7 | Integration / Legacy UI cleanup: retire user-facing old Task list/detail/respond/templates and Shopping detail/templates routes, then verify 2-user flows, E2E, and PWA behavior | Planned |
| M8 | Legacy backend cleanup: after the new UI is stable, safely remove unused API/DB/compatibility code in separate PRs | Planned |

M2まで完了。M3以降のscreen redesignはこのbranchの対象外とする。

## M2 backend contract decision

- `GET /api/dashboard/today` retains the legacy `todayTasks`, `summary`, and `weeklyTasks` fields and adds `homeTasks`, `completedRecords`, `passedRecords`, household timezone, member avatar URLs, and the pending Shopping count. Home reads the single active `homeTasks` projection plus the two today-only record collections, so reload reconstructs the same state without fixture data.
- Home projection queries are scope-bounded: active-task projection reads only the relevant household-local day, week, and period records, while today history uses a UTC range derived from the household timezone. It does not load the household's complete `task_records` history on every Home request.
- `task_records` uses additive nullable action-time snapshots for title and assigned member identity/display/color/avatar URL. Existing NULL snapshots fall back to the current task/member projection.
- `POST /api/tasks/:taskId/restore` removes only the requested today record and reactivates an inactive task. It does not delete any other history.
- Migration `0016_task_record_snapshots.sql` is local-only in M2; no remote D1 or Cloudflare operation was performed.

## M1 transitional mapping

最終Bottom Navigationは`Home / Calendar / Add / Shopping / Other`の5枠とする。M1では正式なOther screenをまだ作らないため、Otherは既存の`/settings/members`へ遷移し、`/settings/members`表示時はOtherをcurrent扱いにする。この暫定mappingはM5で正式な`/other`へ置き換える。

中央Addは既存の`/tasks/new`（家事）と`/shopping/new`（買い物）へ遷移する。form自体のデザイン移植はM2/M4で行う。

## Reference commits

- Production base: `2a7ab29ef7d353b32044daa285972e800270867d`（作業開始時に確認した`origin/main`）
- HouseToDo-Mockup reference: `db8941dc3056f07862014242a349ae366da59e9c`（PR #18 merge後の`origin/main`）
