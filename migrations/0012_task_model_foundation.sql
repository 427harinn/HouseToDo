-- Phase 1 task model foundation.
-- Keep legacy columns/values intact so the current UI and notification scheduler
-- continue to read the pre-redesign model during the staged rollout.

ALTER TABLE tasks ADD COLUMN model_recurrence_type TEXT;
ALTER TABLE tasks ADD COLUMN start_date TEXT;
ALTER TABLE tasks ADD COLUMN target_date TEXT;
ALTER TABLE tasks ADD COLUMN deadline_time TEXT;
ALTER TABLE tasks ADD COLUMN notification_offset_minutes INTEGER;
ALTER TABLE tasks ADD COLUMN weekly_deadline_weekday INTEGER;
ALTER TABLE tasks ADD COLUMN monthly_day_of_month INTEGER;
ALTER TABLE tasks ADD COLUMN monthly_deadline_type TEXT;

ALTER TABLE task_records ADD COLUMN occurrence_key TEXT;
ALTER TABLE task_records ADD COLUMN period_key TEXT;

-- Backfill only the new canonical compatibility column. The legacy
-- recurrence_type remains unchanged because the current scheduler/UI still
-- depend on daily/scheduled/weekly values.
UPDATE tasks
SET model_recurrence_type = CASE
  WHEN recurrence_type = 'daily' THEN 'daily'
  WHEN recurrence_type = 'scheduled' THEN 'weekly_fixed'
  WHEN recurrence_type = 'weekly' AND COALESCE(weekly_target_count, 1) = 1 THEN 'weekly_flexible'
  WHEN recurrence_type IN ('once', 'daily', 'weekly_fixed', 'monthly_fixed', 'weekly_flexible', 'monthly_flexible')
    THEN recurrence_type
  ELSE NULL
END
WHERE model_recurrence_type IS NULL;

-- A legacy notification timestamp is treated as the compatibility deadline
-- and delivered at the deadline. Do not overwrite a value if this migration
-- is inspected or replayed in a test fixture with prefilled new columns.
UPDATE tasks
SET deadline_time = notification_time,
    notification_offset_minutes = 0
WHERE deadline_time IS NULL
  AND notification_time IS NOT NULL;

CREATE INDEX idx_tasks_model_recurrence_active
ON tasks(household_id, model_recurrence_type, active);

CREATE INDEX idx_tasks_start_date
ON tasks(household_id, start_date, active);

CREATE INDEX idx_task_records_occurrence_key
ON task_records(task_id, occurrence_key);

CREATE INDEX idx_task_records_period_key
ON task_records(task_id, period_key);
