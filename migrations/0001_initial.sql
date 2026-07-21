CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  avatar_type TEXT,
  avatar_value TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE households (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  week_starts_on INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE household_members (
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  color TEXT,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (household_id, user_id)
);

CREATE TABLE household_invites (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  recurrence_type TEXT NOT NULL,
  assigned_user_id TEXT,
  assignment_type TEXT NOT NULL DEFAULT 'anyone',
  scheduled_time TEXT,
  notification_slot TEXT NOT NULL DEFAULT 'none',
  weekly_target_count INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE task_weekdays (
  task_id TEXT NOT NULL,
  weekday INTEGER NOT NULL,
  PRIMARY KEY (task_id, weekday)
);

CREATE TABLE task_records (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  target_date TEXT,
  target_week TEXT,
  status TEXT NOT NULL,
  acted_by TEXT,
  started_at TEXT,
  completed_at TEXT,
  skipped_at TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_task_records_daily_unique
ON task_records(task_id, target_date)
WHERE target_date IS NOT NULL;

CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT,
  category TEXT,
  note TEXT,
  purchased INTEGER NOT NULL DEFAULT 0,
  added_by TEXT NOT NULL,
  purchased_by TEXT,
  purchased_at TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE shopping_templates (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  default_quantity TEXT,
  category TEXT,
  default_note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE attachments (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  related_type TEXT NOT NULL,
  related_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_name TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  last_success_at TEXT,
  last_failure_at TEXT
);

CREATE TABLE notification_logs (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  target_date TEXT NOT NULL,
  notification_slot TEXT NOT NULL,
  status TEXT NOT NULL,
  sent_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (household_id, target_date, notification_slot)
);
