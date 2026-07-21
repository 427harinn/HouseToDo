ALTER TABLE household_invites ADD COLUMN used_by TEXT;

CREATE UNIQUE INDEX idx_household_invites_code_hash
ON household_invites(code_hash);

CREATE INDEX idx_household_invites_household_id
ON household_invites(household_id);

CREATE INDEX idx_household_invites_expires_at
ON household_invites(expires_at);

CREATE INDEX idx_household_members_user_id
ON household_members(user_id);
