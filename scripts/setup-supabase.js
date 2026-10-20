import { readFileSync } from 'node:fs';
import { readConfig } from '../server/config.js';
import { createPostgresPool } from '../server/connection.js';
let pool;
try {
  const config = readConfig();
  if (config.database.provider !== 'supabase') throw new Error('Supabase provider required');
  pool = createPostgresPool(config);
  for (const name of [
    '001_store.sql',
    '002_bookings_payments.sql',
    '003_consultation_payments.sql',
  ])
    await pool.query(
      readFileSync(new URL('../supabase/migrations/' + name, import.meta.url), 'utf8'),
    );
  console.log(
    'Esquema privado de Nutriapp preparado en Supabase. Configurá el bucket de fotos según docs/SUPABASE.md.',
  );
} catch {
  console.error(
    'No se pudo preparar Supabase. Revisá DATABASE_PROVIDER, DATABASE_URL, certificado TLS y permisos del proyecto.',
  );
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
