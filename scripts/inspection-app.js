// Local-only review environment. Not imported by the production entrypoint.
import express from 'express';
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { tokenHash } from '../server/auth.js';
export async function createInspectionApp({ persistent = false } = {}) {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Inspection is local development only');
  const dir = persistent
    ? fileURLToPath(new URL('../data/inspection-review/', import.meta.url))
    : mkdtempSync(path.join(tmpdir(), 'vanina-inspection-'));
  // Explicit configuration: never read real .env values, account credentials or DATA_DIR.
  const config = readConfig({
    DATA_DIR: dir,
    APP_URL: 'http://localhost:4174',
    OWNER_EMAIL: 'inspeccion@example.test',
  });
  const blocked = async () => {
    throw new Error('External payments are disabled in inspection');
  };
  const { app, db } = await createApp(config, {
    inspectionPayments: true,
    paypalFetch: blocked,
    paymentHistoryFetch: blocked,
    paymentFetch: blocked,
    mail: {
      async send() {},
    },
    // Simulated delivery only; never create an SMTP transport.
    correo: {
      async quote() {
        return {
          cents: 420000,
          service: 'Envío de prueba',
          expires: Date.now() + 600000,
        };
      },
    },
    mp: {
      createCheckout: blocked,
      getPayment: blocked,
    },
  });
  const token = randomBytes(32).toString('hex');
  await db
    .prepare('INSERT INTO sessions(hash,expires) VALUES(?,?)')
    .run(tokenHash(token), Date.now() + 8 * 60 * 60 * 1000);
  const seed = (await db.prepare('SELECT count(*) AS n FROM products').get()).n === 0;
  if (seed) {
    const products = [];
    for (const [name, price, units] of [
      ['Prueba · Granola artesanal', 120000, 6],
      ['Prueba · Mix de semillas', 180000, 3],
      ['Prueba · Infusión natural', 80000, 0],
    ]) {
      const id = randomUUID(),
        image = randomUUID() + '.webp';
      copyFileSync('public/images/mesa-natural.webp', path.join(dir, 'uploads', image));
      await db
        .prepare(
          `INSERT INTO products(id,name,description,category,price_cents,image,weight,height,width,length,active,updated)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          id,
          name,
          'Producto de demostración para inspeccionar el diseño y los controles.',
          'Pruebas',
          price,
          '/uploads/' + image,
          500,
          8,
          12,
          15,
          1,
          Date.now(),
        );
      products.push({
        id,
        name,
        priceCents: price,
        quantity: units,
      });
    }
    for (let i = 0; i < 2; i++) {
      const p = products[i];
      await db
        .prepare(
          `INSERT INTO orders(id,request_key,quote_id,customer,items,subtotal_cents,shipping_cents,total_cents,shipping,status,created)
      VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          randomUUID(),
          randomUUID(),
          randomUUID(),
          JSON.stringify({
            name: 'Cliente de prueba ' + (i + 1),
            email: 'cliente' + (i + 1) + '@example.test',
            phone: '1122334455',
            street: 'Calle ficticia',
            number: '123',
            apartment: '',
            city: 'Córdoba',
            province: 'Córdoba',
            postalCode: '5000',
          }),
          JSON.stringify([p]),
          p.priceCents * p.quantity,
          420000,
          p.priceCents * p.quantity + 420000,
          JSON.stringify({
            service: 'Envío de prueba',
            origin: '5881',
            dimensions: {
              weight: 1000,
              height: 20,
              width: 20,
              length: 20,
            },
          }),
          'paid',
          Date.now(),
        );
    }
  }
  const inspection = express();
  inspection.disable('x-powered-by');
  inspection.use((req, res, next) => {
    const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const host = req.get('host') === 'localhost:4174';
    const origin = req.get('origin');
    if (
      !local ||
      !host ||
      (origin && origin !== config.appUrl) ||
      req.get('sec-fetch-site') === 'cross-site'
    )
      return res.sendStatus(403);
    res.set('Cache-Control', 'no-store');
    next();
  });
  inspection.get('/api/auth/session', (_req, res) => {
    res.json({
      email: config.ownerEmail,
      inspection: true,
    });
  });
  // Internal disposable session only. No browser cookie or production auth override.
  inspection.use('/api', (req, _res, next) => {
    req.headers.cookie =
      (req.headers.cookie ? req.headers.cookie + '; ' : '') + 'vanina_session=' + token;
    next();
  });
  inspection.post('/api/auth/logout', (_req, res) => res.sendStatus(204));
  inspection.use(app);
  return {
    app: inspection,
    db,
    async close() {
      await db.prepare('DELETE FROM sessions WHERE hash=?').run(tokenHash(token));
      await db.close();
      if (persistent) return;
      // dir is created by mkdtemp under the fixed system temporary directory.
      const resolved = path.resolve(dir);
      if (
        path.dirname(resolved) !== path.resolve(tmpdir()) ||
        !path.basename(resolved).startsWith('vanina-inspection-')
      )
        throw new Error('Unexpected inspection directory');
      rmSync(resolved, {
        recursive: true,
        force: true,
      });
    },
  };
}
