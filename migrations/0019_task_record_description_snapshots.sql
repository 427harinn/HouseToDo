-- Preserve the task description visible when a record is acted on.
-- Existing records remain NULL because their historical description cannot be reconstructed.
ALTER TABLE task_records ADD COLUMN task_description_snapshot TEXT;
