import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { postgresConnection } from '../server/connection.js';
export async function postgresFixture() {
  if (!process.env.TEST_POSTGRES_URL) return null;
  const url = new URL(process.env.TEST_POSTGRES_URL);
  if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '55439')
    throw new Error('Postgres tests require the isolated local port 55439');
  const admin = new Pool({ connectionString: url.toString(), max: 1 });
  const schema = 'test_' + randomUUID().replaceAll('-', '');
  const migration = readFileSync(
    new URL('../supabase/migrations/001_store.sql', import.meta.url),
    'utf8',
  ).replaceAll('nutriapp', schema);
  await admin.query(migration);
  await admin.query(
    readFileSync(
      new URL('../supabase/migrations/002_bookings_payments.sql', import.meta.url),
      'utf8',
    ).replaceAll('nutriapp', schema),
  );
  function open() {
    return postgresConnection(
      new Pool({
        connectionString: url.toString(),
        options: '-c search_path=' + schema + ',pg_catalog',
        max: 3,
      }),
    );
  }
  await admin.query(
    readFileSync(
      new URL('../supabase/migrations/003_consultation_payments.sql', import.meta.url),
      'utf8',
    ).replaceAll('nutriapp', schema),
  );
  return {
    db: open(),
    reopen: open,
    async cleanup() {
      await admin.query('DROP SCHEMA ' + schema + ' CASCADE');
      await admin.end();
    },
  };
}
