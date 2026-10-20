BEGIN;
SET LOCAL search_path=nutriapp,pg_catalog;
CREATE TABLE IF NOT EXISTS international_payment_settings (
 id BIGINT PRIMARY KEY CHECK(id=1), data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS paypal_accounts (
 id BIGINT PRIMARY KEY CHECK(id=1), owner_email TEXT NOT NULL, merchant TEXT NOT NULL,
 encrypted TEXT NOT NULL, live BIGINT NOT NULL, verified BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS consultation_payments (
 id TEXT PRIMARY KEY, package_id TEXT NOT NULL UNIQUE REFERENCES booking_packages(id),
 provider TEXT NOT NULL, country TEXT NOT NULL, currency TEXT NOT NULL, amount BIGINT NOT NULL,
 receiver TEXT NOT NULL, provider_id TEXT UNIQUE, checkout_url TEXT, status TEXT NOT NULL,
 created BIGINT NOT NULL, updated BIGINT NOT NULL, reference TEXT NOT NULL DEFAULT '',
 live BIGINT NOT NULL DEFAULT 0
);
ALTER TABLE international_payment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE paypal_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE consultation_payments ENABLE ROW LEVEL SECURITY;
INSERT INTO store_migrations(id) VALUES('consultation-payments-v1') ON CONFLICT DO NOTHING;
COMMIT;
