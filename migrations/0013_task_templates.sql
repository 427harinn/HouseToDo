-- Store explicit reusable canonical task definitions separately from active tasks.
-- Dates and execution records are intentionally not stored here.
CREATE TABLE task_templates (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  model_recurrence_type TEXT NOT NULL CHECK (model_recurrence_type IN (
    'once', 'daily', 'weekly_fixed', 'monthly_fixed', 'weekly_flexible', 'monthly_flexible'
  )),
  assignment_type TEXT NOT NULL CHECK (assignment_type IN ('anyone', 'specific')),
  assigned_user_id TEXT,
  weekdays_json TEXT NOT NULL DEFAULT '[]',
  deadline_time TEXT,
  notification_offset_minutes INTEGER,
  weekly_deadline_weekday INTEGER,
  monthly_day_of_month INTEGER,
  monthly_deadline_type TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_task_templates_household_active
ON task_templates(household_id, active, sort_order);

CREATE INDEX idx_task_templates_household_created
ON task_templates(household_id, created_at DESC);
