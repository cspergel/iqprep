-- One-time password-reset links. Only a SHA-256 of the token is stored; the token travels in the email.
CREATE TABLE resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);
CREATE INDEX resets_user ON resets(user_id);
