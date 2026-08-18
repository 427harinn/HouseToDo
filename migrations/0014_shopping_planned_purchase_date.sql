ALTER TABLE shopping_items ADD COLUMN planned_purchase_date TEXT;

CREATE INDEX idx_shopping_items_household_planned_purchase_date
ON shopping_items(household_id, planned_purchase_date);
