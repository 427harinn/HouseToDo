ALTER TABLE tasks ADD COLUMN notification_time TEXT;

CREATE TABLE user_notification_settings (
  user_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  evening_summary_enabled INTEGER NOT NULL DEFAULT 0,
  evening_summary_time TEXT NOT NULL DEFAULT '21:00',
  timezone TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, household_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  household_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  target_key TEXT NOT NULL,
  sent_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL,
  UNIQUE (user_id, household_id, notification_type, target_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE INDEX idx_notification_deliveries_household_date
ON notification_deliveries(household_id, sent_at);
