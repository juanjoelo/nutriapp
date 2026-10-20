BEGIN;
SET LOCAL search_path=nutriapp,pg_catalog;
CREATE TABLE IF NOT EXISTS payment_accounts (
  id BIGINT PRIMARY KEY CHECK(id=1), owner_email TEXT NOT NULL, collector TEXT NOT NULL,
  nickname TEXT NOT NULL, encrypted TEXT NOT NULL, expires BIGINT NOT NULL, verified BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_oauth_states (
  hash TEXT PRIMARY KEY, session_hash TEXT NOT NULL, cookie_hash TEXT NOT NULL,
  owner_email TEXT NOT NULL, verifier TEXT NOT NULL, expires BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS booking_settings (id BIGINT PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS booking_services (id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS booking_packages (
  id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE, request_key TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL, service TEXT NOT NULL, customer TEXT NOT NULL,
  created BIGINT NOT NULL, payment_status TEXT NOT NULL DEFAULT 'pending'
);
CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY, package_id TEXT NOT NULL REFERENCES booking_packages(id),
  starts BIGINT NOT NULL, ends BIGINT NOT NULL, status TEXT NOT NULL DEFAULT 'confirmed',
  created BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS appointments_schedule ON appointments(starts,ends,status);
CREATE TABLE IF NOT EXISTS booking_blocks (
  id TEXT PRIMARY KEY, starts BIGINT NOT NULL, ends BIGINT NOT NULL, reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS booking_notifications (
  id TEXT PRIMARY KEY, message TEXT NOT NULL, sent_at BIGINT,
  attempts BIGINT NOT NULL DEFAULT 0, next_attempt BIGINT NOT NULL DEFAULT 0
);

ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_notifications ENABLE ROW LEVEL SECURITY;
INSERT INTO store_migrations(id) VALUES('bookings-payments-v1') ON CONFLICT DO NOTHING;
COMMIT;
