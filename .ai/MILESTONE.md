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

Cron configuration, staging/production resources, remote migration, deployment, Push tests, secrets, and git push remain untouched.
