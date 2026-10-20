import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { openDatabase, transaction } from '../server/database.js';
import { sqliteConnection, postgresSql } from '../server/connection.js';
import { createStorage } from '../server/storage.js';
import { readConfig } from '../server/config.js';
test('existing configurations get one initial snapshot and deleted versions stay deleted after restart', (t) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'vanina-history-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const raw = new DatabaseSync(path.join(dir, 'store.sqlite')),
    id = randomUUID();
  raw.exec('CREATE TABLE merchandising(id TEXT PRIMARY KEY,kind TEXT NOT NULL,data TEXT NOT NULL)');
  raw
    .prepare('INSERT INTO merchandising VALUES(?,?,?)')
    .run(id, 'campaign', JSON.stringify({ name: 'Antes del historial', discount: 12 }));
  raw.close();
  let db = openDatabase(dir);
  const history = db.prepare('SELECT * FROM merchandising_history').all();
  assert.equal(history.length, 1);
  assert.equal(history[0].event, 'existing');
  assert.equal(JSON.parse(history[0].data).discount, 12);
  db.prepare('DELETE FROM merchandising_history').run();
  db.close();
  db = openDatabase(dir);
  assert.equal(db.prepare('SELECT count(*) AS n FROM merchandising_history').get().n, 0);
  assert.equal(db.prepare('SELECT count(*) AS n FROM merchandising').get().n, 1);
  db.close();
});
test('SQLite async transaction isolates unrelated writes and rolls back without losing them', async (t) => {
  const raw = new DatabaseSync(':memory:'),
    db = sqliteConnection(raw);
  t.after(() => db.close());
  await db.exec('CREATE TABLE items(id INTEGER PRIMARY KEY)');
  let release, entered;
  const gate = new Promise((resolve) => (release = resolve)),
    inside = new Promise((resolve) => (entered = resolve));
  const failed = transaction(db, async () => {
    await db.prepare('INSERT INTO items VALUES(?)').run(1);
    entered();
    await gate;
    throw new Error('rollback');
  });
  const rejected = assert.rejects(failed, /rollback/);
  await inside;
  const separate = db.prepare('INSERT INTO items VALUES(?)').run(2);
  release();
  await Promise.all([rejected, separate]);
  assert.deepEqual(
    (await db.prepare('SELECT id FROM items').all()).map((x) => x.id),
    [2],
  );
});
test('PostgreSQL binder preserves literal question marks and handles idempotent inserts', () => {
  assert.equal(
    postgresSql("SELECT '?' AS literal, name FROM products WHERE id=?"),
    "SELECT '?' AS literal, name FROM products WHERE id=$1",
  );
  assert.equal(
    postgresSql('INSERT OR IGNORE INTO notifications(order_id) VALUES(?)'),
    'INSERT INTO notifications(order_id) VALUES($1) ON CONFLICT DO NOTHING',
  );
});
test('Supabase storage uses server credentials for upload and existence, and public URLs contain no secrets', async (t) => {
  const previous = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (options.method === 'HEAD') return new Response(null, { status: 200 });
    return new Response(JSON.stringify({ Key: 'nutriapp-products/demo.webp', Id: randomUUID() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  t.after(() => (globalThis.fetch = previous));
  const config = readConfig({
    STORAGE_PROVIDER: 'supabase',
    SUPABASE_URL: 'https://storage.example.test',
    SUPABASE_SECRET_KEY: 'sb_secret_local_fixture_only',
  });
  const storage = createStorage(config),
    file = randomUUID() + '.webp';
  await storage.put(file, Buffer.from('fixture'));
  assert.equal(await storage.has('/uploads/' + file), true);
  assert.equal(storage.publicUrl('../private'), null);
  const url = storage.publicUrl(file);
  assert.ok(url.endsWith('/storage/v1/object/public/nutriapp-products/' + file));
  assert.equal(url.includes(config.storage.key), false);
  assert.equal(calls.length, 2);
  const headers = new Headers(calls[0].options.headers);
  assert.equal(headers.get('apikey'), config.storage.key);
  assert.equal(headers.get('x-upsert'), 'false');
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: 'Unavailable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  await assert.rejects(
    storage.put(randomUUID() + '.webp', Buffer.from('fixture')),
    /Storage upload unavailable/,
  );
});
