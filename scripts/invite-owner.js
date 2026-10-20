import { readConfig } from '../server/config.js';
import { connectDatabase } from '../server/connection.js';
import { syncOwner, sendOwnerReset } from '../server/auth.js';
import { createMailer } from '../server/integrations/mail.js';
const config = readConfig();
const db = await connectDatabase(config);
try {
  await syncOwner(db, config);
  await sendOwnerReset(db, config, createMailer(config));
  console.log('Invitación enviada al email configurado. El enlace vence en 30 minutos.');
} catch {
  console.error('No se pudo enviar la invitación. Revisá OWNER_EMAIL y la configuración SMTP.');
  process.exitCode = 1;
} finally {
  await db.close();
}
