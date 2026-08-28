-- Extend shopping item image metadata to support the actual JPEG fallback
-- emitted by browsers whose canvas cannot encode WebP.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE shopping_item_images_new (
  id TEXT PRIMARY KEY,
  shopping_item_id TEXT NOT NULL UNIQUE,
  household_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/webp', 'image/jpeg')),
  size_bytes INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (shopping_item_id) REFERENCES shopping_items(id) ON DELETE CASCADE
);

INSERT INTO shopping_item_images_new (
  id,
  shopping_item_id,
  household_id,
  r2_key,
  content_type,
  size_bytes,
  width,
  height,
  created_by,
  created_at,
  updated_at
)
SELECT
  id,
  shopping_item_id,
  household_id,
  r2_key,
  content_type,
  size_bytes,
  width,
  height,
  created_by,
  created_at,
  updated_at
FROM shopping_item_images;

DROP TABLE shopping_item_images;
ALTER TABLE shopping_item_images_new RENAME TO shopping_item_images;

CREATE INDEX idx_shopping_item_images_household ON shopping_item_images(household_id);
CREATE INDEX idx_shopping_item_images_item ON shopping_item_images(shopping_item_id);

PRAGMA defer_foreign_keys = OFF;
