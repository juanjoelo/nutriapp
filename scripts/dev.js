import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
const environment = existsSync('.env') ? ['--env-file=.env'] : [];
const commands = [
  [process.execPath, ['--watch', ...environment, 'server/index.js']],
  [process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1']],
];
const children = commands.map(([command, args]) => spawn(command, args, { stdio: 'inherit' }));
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill();
  process.exitCode = code;
}
for (const child of children) child.on('exit', (code) => stop(code || 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => stop());
