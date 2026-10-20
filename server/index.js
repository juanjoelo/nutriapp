import { readConfig } from './config.js';
import { createApp } from './app.js';
const config = readConfig();
const { app, db, notifications } = await createApp(config);
const server = app.listen(config.port, config.host, () =>
  console.log('Nutriapp disponible en el puerto ' + config.port),
);
// Operational email outbox, not UI polling: every 5 min = 8,640 passes / 30 days.
const timer = setInterval(
  () => notifications.drain().catch(() => console.error('Email outbox retry failed')),
  300000,
);
timer.unref();
notifications.drain().catch(() => console.error('Email outbox retry failed'));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  });
