ALTER TABLE users ADD COLUMN avatar_size_bytes INTEGER;
ALTER TABLE users ADD COLUMN avatar_width INTEGER;
ALTER TABLE users ADD COLUMN avatar_height INTEGER;

ALTER TABLE user_notification_settings ADD COLUMN morning_summary_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_notification_settings ADD COLUMN morning_summary_time TEXT NOT NULL DEFAULT '09:00';
