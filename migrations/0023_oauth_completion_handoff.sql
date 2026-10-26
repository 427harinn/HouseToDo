CREATE TABLE oauth_authorization_completions (
  completion_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  state TEXT NOT NULL,
  code_challenge TEXT,
  code_challenge_method TEXT,
  resource TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_oauth_completions_expiry
  ON oauth_authorization_completions(expires_at);
