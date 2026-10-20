import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';
import { Pool, types } from 'pg';
import { openDatabase } from './database.js';

types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Database integer exceeds safe range');
  return number;
});
// Application SQL only: parameters never become SQL text. Quoted question marks stay literal.
export function postgresSql(sql) {
  let parameter = 0;
  const ignored = /^\s*INSERT OR IGNORE /i.test(sql);
  sql = sql.replace(/^\s*INSERT OR IGNORE /i, 'INSERT ');
  sql = sql.replace(/'(?:''|[^'])*'|\?/g, (token) => (token === '?' ? '$' + ++parameter : token));
  return ignored ? sql.replace(/;\s*$/, '') + ' ON CONFLICT DO NOTHING' : sql;
}
export function sqliteConnection(raw) {
  const context = new AsyncLocalStorage();
  let tail = Promise.resolve();
  function exclusive(work) {
    if (context.getStore()) return Promise.resolve().then(work);
    const job = tail.then(() => context.run(true, work));
    tail = job.catch(() => {});
    return job;
  }
  return {
    dialect: 'sqlite',
    prepare(sql) {
      return Object.fromEntries(
        ['get', 'all', 'run'].map((method) => [
          method,
          (...args) => exclusive(() => raw.prepare(sql)[method](...args)),
        ]),
      );
    },
    exec: (sql) => exclusive(() => raw.exec(sql)),
    close: () => exclusive(() => raw.close()),
    transaction: (work) =>
      exclusive(async () => {
        raw.exec('BEGIN IMMEDIATE');
        try {
          const result = await work();
          raw.exec('COMMIT');
          return result;
        } catch (error) {
          raw.exec('ROLLBACK');
          throw error;
        }
      }),
  };
}
export function postgresConnection(pool) {
  const context = new AsyncLocalStorage();
  const query = (sql, args) => (context.getStore() || pool).query(postgresSql(sql), args);
  return {
    dialect: 'postgres',
    prepare(sql) {
      return {
        async get(...args) {
          return (await query(sql, args)).rows[0];
        },
        async all(...args) {
          return (await query(sql, args)).rows;
        },
        async run(...args) {
          return { changes: (await query(sql, args)).rowCount };
        },
      };
    },
    exec: (sql) => query(sql),
    close: () => pool.end(),
    async transaction(work) {
      if (context.getStore()) throw new Error('Nested transactions are not supported');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        // Serialize this small store's writes across instances, including webhook retries.
        await client.query('SELECT pg_advisory_xact_lock(5881,4174)');
        const result = await context.run(client, work);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
export function createPostgresPool(config) {
  let connectionString;
  try {
    connectionString = new URL(config.database.url);
    if (!['postgres:', 'postgresql:'].includes(connectionString.protocol)) throw new Error();
  } catch {
    throw new Error('Invalid DATABASE_URL configuration');
  }
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey'])
    connectionString.searchParams.delete(key);
  const pool = new Pool({
    connectionString: connectionString.toString(),
    max: 4,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 15000,
    options: '-c search_path=nutriapp,pg_catalog',
    ssl: {
      rejectUnauthorized: true,
      ...(config.database.ca ? { ca: readFileSync(config.database.ca, 'utf8') } : {}),
    },
  });
  pool.on('error', () => console.error('Database connection interrupted'));
  return pool;
}
export async function connectDatabase(config) {
  if (config.database.provider === 'sqlite') return sqliteConnection(openDatabase(config.dataDir));
  const db = postgresConnection(createPostgresPool(config));
  try {
    const ready = await db
      .prepare(
        "SELECT id FROM store_migrations WHERE id IN ('supabase-v1','bookings-payments-v1','consultation-payments-v1')",
      )
      .all();
    if (ready.length !== 3) throw new Error('Missing database migration');
    return db;
  } catch {
    await db.close();
    throw new Error(
      'Supabase database unavailable or missing migration. Check server configuration.',
    );
  }
}
