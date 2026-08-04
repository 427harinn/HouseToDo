CREATE TABLE orphan_r2_objects (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK (source_type IN ('shopping_item_image_replace', 'shopping_item_image_delete', 'shopping_item_delete', 'shopping_clear_purchased', 'manual_reconciliation')),
  source_id TEXT,
  household_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'retry', 'abandoned')),
  attempt_count INTEGER NOT NULL DEFAULT 0,
  first_failed_at TEXT NOT NULL,
  last_attempted_at TEXT,
  next_attempt_at TEXT NOT NULL,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_orphan_r2_objects_due ON orphan_r2_objects(status, next_attempt_at);
CREATE INDEX idx_orphan_r2_objects_household ON orphan_r2_objects(household_id);
CREATE INDEX idx_orphan_r2_objects_source ON orphan_r2_objects(source_id);
