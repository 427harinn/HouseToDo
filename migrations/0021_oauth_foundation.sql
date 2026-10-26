CREATE TABLE oauth_clients (
  client_id TEXT PRIMARY KEY,
  client_name TEXT NOT NULL,
  client_secret_hash TEXT,
  allowed_scopes TEXT NOT NULL,
  token_endpoint_auth_method TEXT NOT NULL DEFAULT 'client_secret_basic',
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE oauth_client_redirect_uris (
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (client_id, redirect_uri)
);

CREATE TABLE oauth_authorization_transactions (
  transaction_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  requested_scope TEXT NOT NULL,
  state TEXT NOT NULL,
  code_challenge TEXT,
  code_challenge_method TEXT,
  resource TEXT,
  csrf_token TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE oauth_authorization_codes (
  code_hash TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT NOT NULL,
  code_challenge TEXT,
  code_challenge_method TEXT,
  resource TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE oauth_grants (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE oauth_access_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE oauth_refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  resource TEXT,
  family_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  revoked_at TEXT,
  replaced_by_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_oauth_transactions_expiry ON oauth_authorization_transactions(expires_at);
CREATE INDEX idx_oauth_codes_expiry ON oauth_authorization_codes(expires_at);
CREATE INDEX idx_oauth_grants_user_client ON oauth_grants(user_id, client_id, revoked_at);
CREATE INDEX idx_oauth_access_grant ON oauth_access_tokens(grant_id, expires_at);
CREATE INDEX idx_oauth_access_user ON oauth_access_tokens(user_id);
CREATE INDEX idx_oauth_refresh_grant ON oauth_refresh_tokens(grant_id, expires_at);
CREATE INDEX idx_oauth_refresh_family ON oauth_refresh_tokens(family_id);
