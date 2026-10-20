import { createInspectionApp } from './inspection-app.js';
const inspection = await createInspectionApp({
  persistent: true,
});
const server = inspection.app.listen(4174, '127.0.0.1', () => {
  console.log('Panel de inspección: http://localhost:4174/admin');
  console.log('Datos de inspección conservados localmente. Sin cobros ni emails reales.');
});
server.on('error', async () => {
  await inspection.close();
  console.error('No se pudo abrir el puerto local 4174.');
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await inspection.close();
      process.exit(0);
    }),
  );
