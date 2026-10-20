// Optional real-PostgreSQL validation. Starts only a disposable local cluster on port 55439.
import { mkdtempSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
mkdirSync('data', { recursive: true });
const directory = mkdtempSync(path.resolve('data/postgres-test-'));
const bin = process.env.PG_BIN || '/usr/lib/postgresql/18/bin';
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error || result.status !== 0) throw new Error('Local PostgreSQL validation failed');
}
run(path.join(bin, 'initdb'), ['-D', directory, '--no-locale', '--encoding=UTF8', '--auth=trust']);
run(path.join(bin, 'pg_ctl'), [
  '-D',
  directory,
  '-l',
  path.join(directory, 'server.log'),
  '-o',
  '-p 55439 -h 127.0.0.1 -k ' + directory,
  '-w',
  'start',
]);
try {
  run(path.join(bin, 'psql'), [
    '-h',
    '127.0.0.1',
    '-p',
    '55439',
    '-d',
    'postgres',
    '-c',
    'CREATE ROLE anon; CREATE ROLE authenticated;',
  ]);
  run(process.execPath, ['--test', 'tests/store.test.js', 'tests/bookings-payments.test.js'], {
    env: {
      ...process.env,
      TEST_POSTGRES_URL: 'postgresql://' + process.env.USER + '@127.0.0.1:55439/postgres',
    },
  });
} finally {
  run(path.join(bin, 'pg_ctl'), ['-D', directory, '-m', 'fast', '-w', 'stop']);
}
