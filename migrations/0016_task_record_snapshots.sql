-- Preserve the task definition and assignee visible at the time of an action.
-- Existing records remain valid and are rendered with a current-task fallback.
ALTER TABLE task_records ADD COLUMN task_title_snapshot TEXT;
ALTER TABLE task_records ADD COLUMN assigned_user_id_snapshot TEXT;
ALTER TABLE task_records ADD COLUMN assigned_user_display_name_snapshot TEXT;
ALTER TABLE task_records ADD COLUMN assigned_user_color_snapshot TEXT;
ALTER TABLE task_records ADD COLUMN assigned_user_avatar_url_snapshot TEXT;

CREATE INDEX idx_task_records_household_action_date
ON task_records(household_id, completed_at, skipped_at);
