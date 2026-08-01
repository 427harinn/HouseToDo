ALTER TABLE shopping_items RENAME TO shopping_items_legacy_0005;

CREATE TABLE shopping_items (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT,
  note TEXT,
  status TEXT NOT NULL,
  added_by TEXT NOT NULL,
  purchased_by TEXT,
  purchased_at TEXT,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (status IN ('pending', 'purchased'))
);

INSERT INTO shopping_items (
  id, household_id, name, quantity, note, status, added_by, purchased_by,
  purchased_at, sort_order, created_at, updated_at
)
SELECT
  id,
  household_id,
  name,
  quantity,
  note,
  CASE WHEN purchased = 1 THEN 'purchased' ELSE 'pending' END,
  added_by,
  purchased_by,
  purchased_at,
  sort_order,
  created_at,
  updated_at
FROM shopping_items_legacy_0005;

DROP TABLE shopping_items_legacy_0005;

ALTER TABLE shopping_templates RENAME TO shopping_templates_legacy_0005;

CREATE TABLE shopping_templates (
  id TEXT PRIMARY KEY,
  household_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity TEXT,
  note TEXT,
  active INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO shopping_templates (
  id, household_id, name, quantity, note, active, sort_order, created_by, created_at, updated_at
)
SELECT
  id,
  household_id,
  name,
  default_quantity,
  default_note,
  1,
  sort_order,
  created_by,
  created_at,
  updated_at
FROM shopping_templates_legacy_0005;

DROP TABLE shopping_templates_legacy_0005;

CREATE INDEX idx_shopping_items_household_status
ON shopping_items(household_id, status);

CREATE INDEX idx_shopping_items_household_sort_order
ON shopping_items(household_id, sort_order);

CREATE INDEX idx_shopping_items_household_purchased_at
ON shopping_items(household_id, purchased_at);

CREATE INDEX idx_shopping_templates_household_active
ON shopping_templates(household_id, active);

CREATE INDEX idx_shopping_templates_household_sort_order
ON shopping_templates(household_id, sort_order);
