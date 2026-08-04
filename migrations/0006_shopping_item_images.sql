CREATE TABLE shopping_item_images (
  id TEXT PRIMARY KEY,
  shopping_item_id TEXT NOT NULL UNIQUE,
  household_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type = 'image/webp'),
  size_bytes INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (shopping_item_id) REFERENCES shopping_items(id) ON DELETE CASCADE
);

CREATE INDEX idx_shopping_item_images_household ON shopping_item_images(household_id);
CREATE INDEX idx_shopping_item_images_item ON shopping_item_images(shopping_item_id);
