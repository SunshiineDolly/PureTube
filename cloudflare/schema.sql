PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL CHECK(length(display_name) <= 100)
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_owner ON sessions(user_id);
CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash TEXT PRIMARY KEY,
  challenge TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS oauth_expiry ON oauth_states(expires_at);
CREATE TABLE IF NOT EXISTS login_codes (
  code_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  challenge TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS login_expiry ON login_codes(expires_at);
CREATE TABLE IF NOT EXISTS auth_limits (
  client_hash TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS auth_limit_expiry ON auth_limits(started_at);
CREATE TABLE IF NOT EXISTS storage_usage (
  slot INTEGER PRIMARY KEY CHECK(slot = 1),
  bytes INTEGER NOT NULL CHECK(bytes BETWEEN 0 AND 200000000)
);
INSERT OR IGNORE INTO storage_usage VALUES (1, 0);
CREATE TABLE IF NOT EXISTS libraries (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  revision INTEGER NOT NULL CHECK(revision > 0),
  data TEXT NOT NULL CHECK(json_valid(data) AND length(CAST(data AS BLOB)) <= 1000000)
);
CREATE TRIGGER IF NOT EXISTS library_insert_usage AFTER INSERT ON libraries BEGIN
  UPDATE storage_usage SET bytes = bytes + length(CAST(NEW.data AS BLOB)) WHERE slot = 1;
END;
CREATE TRIGGER IF NOT EXISTS library_update_usage AFTER UPDATE OF data ON libraries BEGIN
  UPDATE storage_usage SET bytes = bytes + length(CAST(NEW.data AS BLOB)) - length(CAST(OLD.data AS BLOB)) WHERE slot = 1;
END;
CREATE TRIGGER IF NOT EXISTS library_delete_usage AFTER DELETE ON libraries BEGIN
  UPDATE storage_usage SET bytes = bytes - length(CAST(OLD.data AS BLOB)) WHERE slot = 1;
END;
CREATE TRIGGER IF NOT EXISTS user_capacity BEFORE INSERT ON users
WHEN NOT EXISTS(SELECT 1 FROM users WHERE id = NEW.id) AND (SELECT count(*) FROM users) >= 2000
BEGIN SELECT RAISE(ABORT, 'free_capacity'); END;
CREATE TRIGGER IF NOT EXISTS session_capacity BEFORE INSERT ON sessions
WHEN (SELECT count(*) FROM sessions) >= 20000
BEGIN SELECT RAISE(ABORT, 'free_capacity'); END;
