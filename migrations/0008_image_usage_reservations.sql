CREATE TABLE household_image_usage (
  household_id TEXT PRIMARY KEY,
  active_count INTEGER NOT NULL DEFAULT 0 CHECK (active_count >= 0),
  active_bytes INTEGER NOT NULL DEFAULT 0 CHECK (active_bytes >= 0),
  reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
  reserved_bytes INTEGER NOT NULL DEFAULT 0 CHECK (reserved_bytes >= 0),
  pending_cleanup_bytes INTEGER NOT NULL DEFAULT 0 CHECK (pending_cleanup_bytes >= 0),
  daily_upload_date TEXT,
  daily_upload_count INTEGER NOT NULL DEFAULT 0 CHECK (daily_upload_count >= 0),
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE
);

CREATE TABLE image_upload_reservations (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  shopping_item_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'replace')),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'r2_written', 'finalized', 'released', 'cleanup_pending')),
  r2_key TEXT NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  old_image_id TEXT,
  old_r2_key TEXT,
  old_size_bytes INTEGER CHECK (old_size_bytes IS NULL OR old_size_bytes >= 0),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (household_id) REFERENCES households(id) ON DELETE CASCADE,
  FOREIGN KEY (shopping_item_id) REFERENCES shopping_items(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_image_upload_reservations_active_item
ON image_upload_reservations(shopping_item_id)
WHERE status IN ('reserved', 'r2_written', 'cleanup_pending');

CREATE INDEX idx_image_upload_reservations_expiry
ON image_upload_reservations(status, expires_at);

CREATE INDEX idx_image_upload_reservations_household
ON image_upload_reservations(household_id, status);

ALTER TABLE orphan_r2_objects ADD COLUMN byte_size INTEGER;

INSERT INTO household_image_usage (
  household_id, active_count, active_bytes, reserved_count, reserved_bytes,
  pending_cleanup_bytes, daily_upload_date, daily_upload_count, updated_at
)
SELECT
  h.id,
  COUNT(sii.id),
  COALESCE(SUM(sii.size_bytes), 0),
  0,
  0,
  COALESCE((
    SELECT SUM(oro.byte_size)
    FROM orphan_r2_objects oro
    WHERE oro.household_id = h.id
      AND oro.byte_size IS NOT NULL
      AND oro.status IN ('pending', 'retry', 'abandoned')
  ), 0),
  NULL,
  0,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM households h
LEFT JOIN shopping_item_images sii ON sii.household_id = h.id
GROUP BY h.id;
