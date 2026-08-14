# Milestone: Task model UI and reminder scheduler

## Completed boundary

- Six canonical recurrence types are available in Task create/edit/detail UI.
- Conditional start date, recurrence configuration, deadline, and notification presets are implemented.
- Canonical occurrence/period projection and all state actions are implemented.
- Reminder scheduler uses canonical deadlines, offsets, household timezone, and stable scope keys.
- Legacy tasks, including weekly target counts greater than one, retain compatibility behavior.

## Next objective

Notification deep-link, calendar UI, and history/template task creation remain future phases.

## Guardrails

Cron configuration and production resources remain untouched. Staging migration, deployment, and Push verification are allowed only under the Phase 5 runbook; secrets are unchanged and git push remains prohibited.

## Phase 5 staging verification (2026-08-14)

- `0012_task_model_foundation.sql` was applied to staging only and the latest Worker was deployed to `house-to-do-staging`.
- Health, schema, canonical task creation/grouping, and one canonical offset reminder delivery passed.
- Verification is blocked by weekly-flexible repeated completion: the second completion did not increase `completedCount`. No code fix, follow-up deploy, production operation, or git push was performed.
