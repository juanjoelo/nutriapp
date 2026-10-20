// Isolated local fixture. No production account, data or external services.
import { mkdtempSync, copyFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { hashPassword } from '../server/auth.js';
if (process.env.NODE_ENV !== 'test') throw new Error('Test server requires NODE_ENV=test');
const dir = mkdtempSync(path.join(tmpdir(), 'vanina-e2e-'));
const config = readConfig({
  DATA_DIR: dir,
  OWNER_EMAIL: 'owner@example.test',
  APP_URL: 'http://127.0.0.1:4173',
  COUNTRY_EDGE_KEY: 'isolated-browser-country-fixture-key-123456',
});
const { app, db } = await createApp(config, {
  // All browser scenarios share one loopback address and run much faster than a person.
  // Production entrypoints never provide these fixture overrides.
  apiRateLimit: 10000,
  authRateLimit: 100,
  mail: {
    async send() {},
  },
  correo: {
    async quote() {
      return {
        cents: 420000,
        service: 'Paq.ar prueba',
        expires: Date.now() + 600000,
      };
    },
  },
  mp: {
    async getPayment() {
      throw new Error('No real payments in browser tests');
    },
  },
});
await db
  .prepare('UPDATE owner SET password_hash=? WHERE id=1')
  .run(await hashPassword('browser-test-password'));
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
      'INSERT INTO products(id,name,description,category,price_cents,image,weight,height,width,length,active,updated) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      name,
      'Producto ficticio para verificar la interfaz, no disponible para venta real.',
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
  const p = products[i],
    id = randomUUID();
  await db
    .prepare(
      `INSERT INTO orders(id,request_key,quote_id,customer,items,subtotal_cents,shipping_cents,total_cents,shipping,status,created)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
    )
    .run(
      id,
      randomUUID(),
      randomUUID(),
      JSON.stringify({
        name: 'Cliente de prueba ' + (i + 1),
        email: 'test@example.test',
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
        service: 'Paq.ar prueba',
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
const server = app.listen(4173, '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(async () => {
      await db.close();
      rmSync(dir, {
        recursive: true,
        force: true,
      });
      process.exit(0);
    }),
  );
