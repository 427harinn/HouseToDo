-- Separate the recurrence concept from when a task may be performed.
-- Existing recurrence values are intentionally preserved; NULL is interpreted
-- by the compatibility layer for pre-migration tasks.
ALTER TABLE tasks ADD COLUMN execution_timing TEXT;
ALTER TABLE tasks ADD COLUMN deadline_date TEXT;

ALTER TABLE task_templates ADD COLUMN execution_timing TEXT;
ALTER TABLE task_templates ADD COLUMN deadline_date TEXT;

CREATE INDEX idx_tasks_deadline_date
ON tasks(household_id, deadline_date, active);
