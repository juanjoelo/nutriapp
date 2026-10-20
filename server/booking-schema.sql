CREATE TABLE IF NOT EXISTS payment_accounts (
  id INTEGER PRIMARY KEY CHECK(id=1), owner_email TEXT NOT NULL, collector TEXT NOT NULL,
  nickname TEXT NOT NULL, encrypted TEXT NOT NULL, expires INTEGER NOT NULL, verified INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_oauth_states (
  hash TEXT PRIMARY KEY, session_hash TEXT NOT NULL, cookie_hash TEXT NOT NULL,
  owner_email TEXT NOT NULL, verifier TEXT NOT NULL, expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS booking_settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS booking_services (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS booking_packages (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, request_key TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL, service TEXT NOT NULL, customer TEXT NOT NULL,
  created INTEGER NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY, package_id TEXT NOT NULL REFERENCES booking_packages(id),
  starts INTEGER NOT NULL, ends INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed',
  created INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS appointments_schedule ON appointments(starts,ends,status);
CREATE TABLE IF NOT EXISTS booking_blocks (
  id TEXT PRIMARY KEY, starts INTEGER NOT NULL, ends INTEGER NOT NULL, reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS booking_notifications (
  id TEXT PRIMARY KEY, message TEXT NOT NULL, sent_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0
);
