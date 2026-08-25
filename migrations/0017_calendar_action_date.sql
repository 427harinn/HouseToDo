-- Preserve the household-local date from which a Calendar action was performed.
-- This is additive and does not change period identity or existing uniqueness.
ALTER TABLE task_records ADD COLUMN calendar_action_date TEXT;

CREATE INDEX idx_task_records_household_calendar_action_date
ON task_records(household_id, calendar_action_date);
