-- The milestone-1 table predates the FK and lifecycle columns. Rebuild it so
-- existing rows are copied before the legacy table is removed. D1 does not
-- expose a SHA-256 SQL function, so legacy rows keep a NULL hash and retain
-- the pre-existing endpoint UNIQUE constraint until they next register.
CREATE TABLE push_subscriptions_v2 (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  endpoint_hash TEXT,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  device_name TEXT,
  user_agent_summary TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  disabled_at TEXT,
  last_success_at TEXT,
  last_failure_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

INSERT INTO push_subscriptions_v2 (
  id, household_id, user_id, endpoint, p256dh, auth, device_name,
  user_agent_summary, enabled, created_at, updated_at, last_seen_at,
  last_success_at, last_failure_at
)
SELECT
  id, household_id, user_id, endpoint, p256dh, auth, device_name,
  device_name, enabled, created_at, created_at, created_at,
  last_success_at, last_failure_at
FROM push_subscriptions;

DROP TABLE push_subscriptions;
ALTER TABLE push_subscriptions_v2 RENAME TO push_subscriptions;

CREATE UNIQUE INDEX idx_push_subscriptions_endpoint_hash
ON push_subscriptions(endpoint_hash)
WHERE endpoint_hash IS NOT NULL;

CREATE INDEX idx_push_subscriptions_user_household
ON push_subscriptions(user_id, household_id);
