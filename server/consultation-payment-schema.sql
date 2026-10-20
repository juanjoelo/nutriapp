CREATE TABLE IF NOT EXISTS international_payment_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS paypal_accounts (
 id INTEGER PRIMARY KEY CHECK(id=1), owner_email TEXT NOT NULL, merchant TEXT NOT NULL,
 encrypted TEXT NOT NULL, live INTEGER NOT NULL, verified INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS consultation_payments (
 id TEXT PRIMARY KEY, package_id TEXT NOT NULL UNIQUE REFERENCES booking_packages(id),
 provider TEXT NOT NULL, country TEXT NOT NULL, currency TEXT NOT NULL, amount INTEGER NOT NULL,
 receiver TEXT NOT NULL, provider_id TEXT UNIQUE, checkout_url TEXT, status TEXT NOT NULL,
 created INTEGER NOT NULL, updated INTEGER NOT NULL, reference TEXT NOT NULL DEFAULT '',
 live INTEGER NOT NULL DEFAULT 0
);
