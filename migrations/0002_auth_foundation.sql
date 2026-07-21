ALTER TABLE sessions ADD COLUMN token_hash TEXT;

CREATE UNIQUE INDEX idx_sessions_token_hash
ON sessions(token_hash)
WHERE token_hash IS NOT NULL;

CREATE INDEX idx_sessions_user_id
ON sessions(user_id);

CREATE INDEX idx_sessions_expires_at
ON sessions(expires_at);
