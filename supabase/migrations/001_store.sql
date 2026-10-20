BEGIN;
CREATE SCHEMA IF NOT EXISTS nutriapp;
REVOKE ALL ON SCHEMA nutriapp FROM PUBLIC, anon, authenticated;
SET LOCAL search_path=nutriapp,pg_catalog;

    CREATE TABLE IF NOT EXISTS owner (id BIGINT PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, password_hash TEXT);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS resets (hash TEXT PRIMARY KEY, expires BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT NOT NULL, price_cents BIGINT NOT NULL CHECK(price_cents > 0), image TEXT NOT NULL,
      weight BIGINT NOT NULL, height BIGINT NOT NULL, width BIGINT NOT NULL, length BIGINT NOT NULL,
      active BIGINT NOT NULL DEFAULT 1, updated BIGINT NOT NULL, gallery TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, cart TEXT NOT NULL, postal_code TEXT NOT NULL,
      shipping_cents BIGINT NOT NULL, subtotal_cents BIGINT NOT NULL, service TEXT NOT NULL,
      dimensions TEXT NOT NULL, expires BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, quote_id TEXT NOT NULL,
      customer TEXT NOT NULL, items TEXT NOT NULL, subtotal_cents BIGINT NOT NULL, shipping_cents BIGINT NOT NULL,
      total_cents BIGINT NOT NULL, shipping TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      payment_id TEXT UNIQUE, checkout_url TEXT, created BIGINT NOT NULL, tracking TEXT, shipped_at BIGINT,
      payment_updated BIGINT NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS notifications (order_id TEXT PRIMARY KEY REFERENCES orders(id), sent_at BIGINT,
      attempts BIGINT NOT NULL DEFAULT 0, next_attempt BIGINT NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS shipment_notifications (order_id TEXT PRIMARY KEY REFERENCES orders(id),
      message TEXT NOT NULL, sent_at BIGINT, attempts BIGINT NOT NULL DEFAULT 0,
      next_attempt BIGINT NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS merchandising (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS merchandising_archived (id TEXT PRIMARY KEY REFERENCES merchandising(id));
    CREATE TABLE IF NOT EXISTS merchandising_history (id TEXT PRIMARY KEY, source_id TEXT NOT NULL,
      kind TEXT NOT NULL, event TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, created BIGINT NOT NULL);
    CREATE INDEX IF NOT EXISTS merchandising_history_date ON merchandising_history(created DESC,id);
    CREATE TABLE IF NOT EXISTS store_migrations (id TEXT PRIMARY KEY);
  ALTER TABLE owner ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE resets ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchandising ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchandising_archived ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchandising_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_migrations ENABLE ROW LEVEL SECURITY;
INSERT INTO merchandising_history SELECT gen_random_uuid()::text,id,kind,'existing',(data::jsonb)->>'name',data,(extract(epoch from now())*1000)::bigint FROM merchandising WHERE NOT EXISTS (SELECT id FROM store_migrations WHERE id='merchandising-history-v1');
INSERT INTO store_migrations VALUES ('merchandising-history-v1'),('supabase-v1') ON CONFLICT DO NOTHING;
COMMIT;
