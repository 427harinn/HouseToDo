ALTER TABLE task_records ADD COLUMN target_week_start TEXT;

CREATE INDEX idx_tasks_household_active
ON tasks(household_id, active);

CREATE INDEX idx_tasks_household_recurrence_active
ON tasks(household_id, recurrence_type, active);

CREATE INDEX idx_task_weekdays_task_weekday
ON task_weekdays(task_id, weekday);

CREATE INDEX idx_task_records_task_target_date
ON task_records(task_id, target_date);

CREATE INDEX idx_task_records_task_target_week_start
ON task_records(task_id, target_week_start);

CREATE INDEX idx_task_records_household_target_date
ON task_records(household_id, target_date);

CREATE INDEX idx_task_records_household_target_week_start
ON task_records(household_id, target_week_start);

CREATE UNIQUE INDEX idx_task_records_daily_scope_unique
ON task_records(task_id, target_date)
WHERE target_date IS NOT NULL;

CREATE UNIQUE INDEX idx_task_records_weekly_open_unique
ON task_records(task_id, target_week_start, status)
WHERE target_week_start IS NOT NULL AND status IN ('in_progress', 'skipped');
