ALTER TABLE notification_deliveries ADD COLUMN claimed_at TEXT;

UPDATE notification_deliveries
SET claimed_at = created_at
WHERE claimed_at IS NULL;
