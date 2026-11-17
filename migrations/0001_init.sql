-- Adult-only parent accounts. No birth date is stored: only when the adult check and consent passed.
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  pw_hash TEXT NOT NULL,
  pw_salt TEXT NOT NULL,
  adult_confirmed_at INTEGER NOT NULL,
  consent_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,          -- SHA-256 of the session token; the token itself lives only in the cookie
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE TABLE backups (
  user_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,           -- minimised by the app: no names, birthday cut to its month, no PIN
  updated_at INTEGER NOT NULL
);
CREATE TABLE attempts (
  key TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
