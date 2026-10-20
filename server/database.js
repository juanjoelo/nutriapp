import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export function openDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, 'store.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, password_hash TEXT);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS resets (hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL,
      category TEXT NOT NULL, price_cents INTEGER NOT NULL CHECK(price_cents > 0), image TEXT NOT NULL,
      weight INTEGER NOT NULL, height INTEGER NOT NULL, width INTEGER NOT NULL, length INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1, updated INTEGER NOT NULL, gallery TEXT NOT NULL DEFAULT '[]');
    CREATE TABLE IF NOT EXISTS quotes (id TEXT PRIMARY KEY, cart TEXT NOT NULL, postal_code TEXT NOT NULL,
      shipping_cents INTEGER NOT NULL, subtotal_cents INTEGER NOT NULL, service TEXT NOT NULL,
      dimensions TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, quote_id TEXT NOT NULL,
      customer TEXT NOT NULL, items TEXT NOT NULL, subtotal_cents INTEGER NOT NULL, shipping_cents INTEGER NOT NULL,
      total_cents INTEGER NOT NULL, shipping TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      payment_id TEXT UNIQUE, checkout_url TEXT, created INTEGER NOT NULL, tracking TEXT, shipped_at INTEGER,
      payment_updated INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS notifications (order_id TEXT PRIMARY KEY REFERENCES orders(id), sent_at INTEGER,
      attempts INTEGER NOT NULL DEFAULT 0, next_attempt INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS shipment_notifications (order_id TEXT PRIMARY KEY REFERENCES orders(id),
      message TEXT NOT NULL, sent_at INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS merchandising (id TEXT PRIMARY KEY, kind TEXT NOT NULL, data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS merchandising_archived (id TEXT PRIMARY KEY REFERENCES merchandising(id));
    CREATE TABLE IF NOT EXISTS merchandising_history (id TEXT PRIMARY KEY, source_id TEXT NOT NULL,
      kind TEXT NOT NULL, event TEXT NOT NULL, name TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS merchandising_history_date ON merchandising_history(created DESC,id);
    CREATE TABLE IF NOT EXISTS store_migrations (id TEXT PRIMARY KEY);
  `);
  db.exec(readFileSync(new URL('./booking-schema.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('./consultation-payment-schema.sql', import.meta.url), 'utf8'));
  transactionSync(db, () => {
    if (!db.prepare("SELECT id FROM store_migrations WHERE id='merchandising-history-v1'").get()) {
      for (const row of db.prepare('SELECT * FROM merchandising').all())
        db.prepare('INSERT INTO merchandising_history VALUES(?,?,?,?,?,?,?)').run(
          randomUUID(),
          row.id,
          row.kind,
          'existing',
          JSON.parse(row.data).name,
          row.data,
          Date.now(),
        );
      db.prepare("INSERT INTO store_migrations VALUES('merchandising-history-v1')").run();
    }
  });
  return db;
}
function transactionSync(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
export async function transaction(db, work) {
  return db.transaction(work);
}
