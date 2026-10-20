import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID, createHmac } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { hashPassword } from '../server/auth.js';
import { createCorreo, parcelDimensions } from '../server/integrations/correo.js';
import { createMercadoPago, verifyWebhook } from '../server/integrations/mercadopago.js';
import { openDatabase } from '../server/database.js';
import { createNotificationService } from '../server/integrations/mail.js';
import { catalog, activeCampaigns } from '../server/merchandising.js';
import { postgresFixture } from './postgres-fixture.js';
const campaign = (extra = {}) => ({
  name: 'Oferta de prueba',
  enabled: true,
  scheduled: false,
  start: null,
  end: null,
  discount: 20,
  productIds: [],
  appearance: true,
  priority: 0,
  title: 'Bienestar',
  subtitle: 'Elegí tus favoritos',
  announcement: 'Ofertas',
  button: 'Ver tienda',
  color: '#304c3d',
  background: '#faf9f5',
  ink: '#2f4437',
  image: '',
  ...extra,
});
const put = (f, url, body, client = f.owner) =>
  client
    .put('/api/admin/' + url)
    .set('Origin', f.config.appUrl)
    .set('x-store-request', '1')
    .send(body);
const remove = (f, url, client = f.owner) =>
  client
    .delete('/api/admin/' + url)
    .set('Origin', f.config.appUrl)
    .set('x-store-request', '1');

test('history preserves versions, supports search and pagination, deletes only the chosen snapshot', async (t) => {
  const f = await fixture(t),
    id = randomUUID(),
    original = campaign({ name: 'Ocasión original', color: '#006b49', discount: 12 });
  await f.guest.get('/api/admin/merchandising/history').expect(401);
  await put(f, 'campaigns/' + id, original).expect(200);
  await put(f, 'campaigns/' + id, { ...original, discount: 25, title: 'Nueva versión' }).expect(
    200,
  );
  const before = (
    await f.owner.get('/api/admin/merchandising/history?kind=campaign&search=Ocasión')
  ).body;
  assert.equal(before.total, 2);
  const created = before.entries.find((e) => e.event === 'created');
  assert.deepEqual(created.data, original);
  const copyId = randomUUID();
  await put(f, 'campaigns/' + copyId, {
    ...created.data,
    name: 'Copia guardada',
    enabled: false,
  }).expect(200);
  await remove(f, 'campaigns/' + id, f.guest).expect(401);
  await remove(f, 'campaigns/' + id).expect(204);
  assert.equal((await f.guest.get('/api/storefront')).body.campaign, null);
  assert.equal(
    (await f.owner.get('/api/admin/merchandising')).body.campaigns.some((c) => c.id === id),
    false,
  );
  const deleted = (
    await f.owner.get('/api/admin/merchandising/history?search=Ocasión')
  ).body.entries.find((e) => e.event === 'deleted');
  assert.equal(deleted.data.discount, 25);
  await put(f, 'campaigns/' + id, original).expect(409);
  await remove(f, 'merchandising/history/' + created.id, f.guest).expect(401);
  await f.owner.delete('/api/admin/merchandising/history/' + created.id).expect(403);
  await remove(f, 'merchandising/history/' + created.id).expect(204);
  await remove(f, 'merchandising/history/' + created.id).expect(404);
  assert.equal((await f.owner.get('/api/admin/merchandising')).body.campaigns[0].id, copyId);
  for (let i = 0; i < 12; i++)
    await put(f, 'campaigns/' + copyId, {
      ...original,
      name: 'Copia guardada',
      enabled: false,
      discount: i,
    }).expect(200);
  const first = (await f.owner.get('/api/admin/merchandising/history?search=Copia')).body;
  const second = (await f.owner.get('/api/admin/merchandising/history?search=Copia&page=2')).body;
  assert.equal(first.total, 13);
  assert.equal(first.entries.length, 12);
  assert.equal(second.entries.length, 1);
  assert.equal(
    first.entries.some((a) => second.entries.some((b) => a.id === b.id)),
    false,
  );
  const reopened = f.reopen();
  try {
    assert.equal(
      (await reopened.prepare('SELECT count(*) AS n FROM merchandising_history').get()).n,
      15,
    );
  } finally {
    await reopened.close();
  }
});

test('combo removal preserves paid orders, components and reusable configuration', async (t) => {
  const f = await fixture(t),
    a = await f.product(),
    b = await f.product({ name: 'Otro producto' }),
    id = randomUUID();
  const config = {
    name: 'Combo histórico',
    description: 'Configuración de un combo para volver a usar.',
    image: a.image,
    active: true,
    discount: 18,
    components: [
      { id: a.id, quantity: 1 },
      { id: b.id, quantity: 2 },
    ],
  };
  await put(f, 'combos/' + id, config).expect(200);
  const order = await f.order({ id });
  f.pay(order);
  await f.webhook().expect(200);
  await remove(f, 'combos/' + id, f.guest).expect(401);
  await remove(f, 'combos/' + id).expect(204);
  await remove(f, 'combos/' + id).expect(404);
  const list = (await f.guest.get('/api/products')).body;
  assert.equal(
    list.some((p) => p.id === id),
    false,
  );
  assert.equal(
    list.some((p) => p.id === a.id),
    true,
  );
  const current = await f.db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
  assert.equal(current.items, order.items);
  assert.equal(current.total_cents, order.total_cents);
  const history = (await f.owner.get('/api/admin/merchandising/history?kind=combo')).body;
  assert.equal(history.total, 2);
  assert.deepEqual(history.entries.find((e) => e.event === 'deleted').data, config);
  const copy = randomUUID();
  await put(f, 'combos/' + copy, { ...config, active: false }).expect(200);
  assert.equal(
    (await catalog(f.db)).some((p) => p.id === copy),
    false,
  );
  await put(f, 'combos/' + copy, config).expect(200);
  assert.equal(
    (await catalog(f.db)).some((p) => p.id === copy),
    true,
  );
});
test('campaign permissions, schedules, scope, non-stacking and stale checkout prices', async (t) => {
  const f = await fixture(t),
    p = await f.product(),
    q = await f.product({
      name: 'Segundo producto',
    }),
    id = randomUUID();
  await f.guest.get('/api/admin/merchandising').expect(401);
  await put(f, 'campaigns/' + id, campaign(), f.guest).expect(401);
  await f.owner
    .put('/api/admin/campaigns/' + id)
    .send(campaign())
    .expect(403);
  await put(
    f,
    'campaigns/' + id,
    campaign({
      discount: 101,
    }),
  ).expect(400);
  await put(
    f,
    'campaigns/' + id,
    campaign({
      scheduled: true,
      start: 100,
      end: 99,
    }),
  ).expect(400);
  await put(
    f,
    'campaigns/' + id,
    campaign({
      image: '/uploads/missing.webp',
    }),
  ).expect(400);
  await put(
    f,
    'campaigns/' + id,
    campaign({
      productIds: [p.id],
    }),
  ).expect(200);
  let products = (await f.guest.get('/api/products').expect(200)).body;
  assert.equal(products.find((x) => x.id === p.id).priceCents, 144000);
  assert.equal(products.find((x) => x.id === q.id).priceCents, 180000);
  await put(
    f,
    'campaigns/' + randomUUID(),
    campaign({
      discount: 10,
      appearance: false,
    }),
  ).expect(200);
  assert.equal((await catalog(f.db)).find((x) => x.id === p.id).priceCents, 144000);
  const quote = await f.quote(p);
  assert.equal(quote.subtotalCents, 288000);
  await put(
    f,
    'campaigns/' + id,
    campaign({
      enabled: false,
    }),
  ).expect(200);
  await f
    .post(f.guest, '/api/checkout', {
      quoteId: quote.id,
      customer: f.customer,
    })
    .set('Idempotency-Key', randomUUID())
    .expect(409);
  const time = Date.now() + 100000;
  await put(
    f,
    'campaigns/' + id,
    campaign({
      scheduled: true,
      start: time,
      end: time + 1000,
      priority: 10,
    }),
  ).expect(200);
  assert.equal(
    (await activeCampaigns(f.db, time - 1)).some((c) => c.id === id),
    false,
  );
  assert.equal((await activeCampaigns(f.db, time))[0].id, id);
  assert.equal(
    (await activeCampaigns(f.db, time + 1000)).some((c) => c.id === id),
    false,
  );
});
test('combos use current component prices and parcel dimensions, hide with missing components and preserve paid snapshots', async (t) => {
  const f = await fixture(t),
    p = await f.product(),
    q = await f.product({
      priceCents: 100000,
      name: 'Semillas',
    }),
    id = randomUUID();
  const combo = {
    name: 'Combo saludable',
    description: 'Dos alimentos para el desayuno.',
    image: '',
    discount: 25,
    active: true,
    components: [
      {
        id: p.id,
        quantity: 2,
      },
      {
        id: q.id,
        quantity: 1,
      },
    ],
  };
  await put(f, 'combos/' + id, combo, f.guest).expect(401);
  await put(f, 'combos/' + id, {
    ...combo,
    components: [
      {
        id: p.id,
        quantity: 1,
      },
      {
        id: p.id,
        quantity: 1,
      },
    ],
  }).expect(400);
  await put(f, 'combos/' + id, combo).expect(200);
  let item = (await catalog(f.db)).find((x) => x.id === id);
  assert.equal(item.basePriceCents, 460000);
  assert.equal(item.priceCents, 345000);
  assert.equal(item.weight, 1500);
  assert.equal(item.height, 24);
  const quote = await f.quote(item);
  assert.equal(quote.subtotalCents, 690000);
  const dims = JSON.parse(
    (await f.db.prepare('SELECT dimensions FROM quotes WHERE id=?').get(quote.id)).dimensions,
  );
  assert.equal(dims.weight, 3100);
  assert.equal(dims.height, 50);
  const order = await f.order(item);
  f.pay(order);
  await f.webhook().expect(200);
  await put(
    f,
    'campaigns/' + randomUUID(),
    campaign({
      discount: 30,
    }),
  ).expect(200);
  assert.equal((await catalog(f.db)).find((x) => x.id === id).priceCents, 322000);
  assert.equal(
    JSON.parse((await f.db.prepare('SELECT items FROM orders WHERE id=?').get(order.id)).items)[0]
      .priceCents,
    345000,
  );
  await put(f, 'combos/' + randomUUID(), {
    ...combo,
    components: [
      {
        id,
        p: 1,
        quantity: 1,
      },
      {
        id: p.id,
        quantity: 1,
      },
    ],
  }).expect(400);
  await put(f, 'combos/' + randomUUID(), {
    ...combo,
    components: [
      {
        id,
        quantity: 1,
      },
      {
        id: p.id,
        quantity: 1,
      },
    ],
  }).expect(400);
  await put(f, 'campaigns/' + id, campaign()).expect(409);
  await f.db.prepare('UPDATE products SET price_cents=200000,weight=700 WHERE id=?').run(q.id);
  item = (await catalog(f.db)).find((x) => x.id === id);
  assert.equal(item.basePriceCents, 560000);
  assert.equal(item.weight, 1700);
  await f.db.prepare('UPDATE products SET active=0 WHERE id=?').run(q.id);
  assert.equal(
    (await catalog(f.db)).some((x) => x.id === id),
    false,
  );
  await f
    .post(f.guest, '/api/shipping/quote', {
      items: [
        {
          id,
          quantity: 1,
        },
      ],
      postalCode: '5000',
    })
    .expect(409);
});
test('monthly favorites exclude old, unpaid, refunded and hidden products; private drilldown reconciles with totals', async (t) => {
  const f = await fixture(t),
    p = await f.product();
  let publicData = (await f.guest.get('/api/storefront')).body;
  assert.deepEqual(publicData.bestsellers, []);
  const order = await f.order(p);
  assert.deepEqual((await f.guest.get('/api/storefront')).body.bestsellers, []);
  f.pay(order);
  await f.webhook().expect(200);
  publicData = (await f.guest.get('/api/storefront')).body;
  assert.equal(publicData.bestsellers[0].units, 2);
  assert.equal(publicData.bestsellers[0].sales, undefined);
  assert.equal(JSON.stringify(publicData).includes(f.customer.email), false);
  const stats = (await f.owner.get('/api/admin/analytics')).body;
  assert.equal(stats.products[0].sales[0].orderId, order.id);
  assert.equal(stats.products[0].sales[0].revenueCents, stats.revenueCents);
  await f.db
    .prepare('UPDATE orders SET created=? WHERE id=?')
    .run(Date.now() - 31 * 86400000, order.id);
  assert.deepEqual((await f.guest.get('/api/storefront')).body.bestsellers, []);
  await f.db
    .prepare("UPDATE orders SET created=?,status='refunded' WHERE id=?")
    .run(Date.now(), order.id);
  assert.deepEqual((await f.guest.get('/api/storefront')).body.bestsellers, []);
  await f.db.prepare("UPDATE orders SET status='paid' WHERE id=?").run(order.id);
  await f.db.prepare('UPDATE products SET active=0 WHERE id=?').run(p.id);
  assert.deepEqual((await f.guest.get('/api/storefront')).body.bestsellers, []);
});
test('dispatch emails the checkout buyer once with tracking; denied dispatches never queue mail', async (t) => {
  const f = await fixture(t),
    p = await f.product(),
    o = await f.order(p);
  await f
    .post(f.guest, '/api/admin/orders/' + o.id + '/ship', {
      tracking: 'TEST12345',
    })
    .expect(401);
  await f
    .post(f.owner, '/api/admin/orders/' + o.id + '/ship', {
      tracking: 'TEST12345',
    })
    .expect(409);
  assert.equal((await f.db.prepare('SELECT count(*) AS n FROM shipment_notifications').get()).n, 0);
  f.pay(o);
  await f.webhook().expect(200);
  await f.notifications.drain();
  assert.equal(f.sent[0].to, f.config.ownerEmail);
  await f
    .post(f.owner, '/api/admin/orders/' + o.id + '/ship', {
      tracking: 'TEST12345',
      email: 'not-the-buyer@example.test',
    })
    .expect(200);
  await f
    .post(f.owner, '/api/admin/orders/' + o.id + '/ship', {
      tracking: 'OTHER12345',
    })
    .expect(409);
  const queued = (await f.owner.get('/api/admin/orders?filter=shipped').expect(200)).body.orders[0];
  assert.equal(queued.shipmentEmailQueued, true);
  assert.equal(queued.shipmentEmailSentAt, null);
  await f.notifications.drain();
  await f.notifications.drain();
  assert.equal(f.sent.length, 2);
  assert.equal(f.sent[1].to, f.customer.email);
  assert.match(f.sent[1].text, /TEST12345/);
  assert.ok(f.sent[1].text.includes(o.id));
  assert.ok(f.sent[1].text.includes('/compra/' + o.id));
  assert.doesNotMatch(f.sent[1].text, /\/admin/);
  assert.ok(
    (await f.owner.get('/api/admin/orders?filter=shipped')).body.orders[0].shipmentEmailSentAt,
  );
});
test('failed shipment email survives reopening the database without rolling back dispatch', async (t) => {
  const f = await fixture(t),
    p = await f.product(),
    o = await f.order(p);
  f.pay(o);
  await f.webhook().expect(200);
  await f.notifications.drain();
  await f
    .post(f.owner, '/api/admin/orders/' + o.id + '/ship', {
      tracking: 'TEST56789',
    })
    .expect(200);
  f.failMail();
  await f.notifications.drain();
  const failed = await f.db.prepare('SELECT * FROM shipment_notifications').get();
  assert.equal(failed.sent_at, null);
  assert.equal(failed.attempts, 1);
  assert.ok(failed.next_attempt > Date.now());
  assert.ok((await f.db.prepare('SELECT shipped_at FROM orders WHERE id=?').get(o.id)).shipped_at);
  const reopened = f.reopen();
  const delivered = [];
  try {
    const service = createNotificationService(reopened, f.config, {
      async send(message) {
        delivered.push(message);
      },
    });
    await service.drain();
    assert.equal(delivered.length, 0);
    await reopened.prepare('UPDATE shipment_notifications SET next_attempt=0').run();
    await service.drain();
    await service.drain();
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].to, f.customer.email);
    assert.match(delivered[0].text, /TEST56789/);
  } finally {
    await reopened.close();
  }
  await f.post(f.owner, '/api/admin/notifications/retry', {}).expect(200);
  assert.equal(f.sent.length, 1); // Owner sale only; dispatch was already sent by the reopened worker.
});
test('dispatch rolls back if its durable email cannot be recorded', async (t) => {
  const f = await fixture(t),
    p = await f.product(),
    o = await f.order(p);
  f.pay(o);
  await f.webhook().expect(200);
  await f.db.exec(
    f.db.dialect === 'postgres'
      ? `CREATE FUNCTION reject_dispatch_fn() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test storage failure'; END $$;
    CREATE TRIGGER reject_dispatch BEFORE INSERT ON shipment_notifications FOR EACH ROW EXECUTE FUNCTION reject_dispatch_fn();`
      : `CREATE TRIGGER reject_dispatch BEFORE INSERT ON shipment_notifications
    BEGIN SELECT RAISE(ABORT, 'test storage failure'); END;`,
  );
  await f
    .post(f.owner, '/api/admin/orders/' + o.id + '/ship', {
      tracking: 'TEST12345',
    })
    .expect(500);
  const stored = await f.db.prepare('SELECT * FROM orders WHERE id=?').get(o.id);
  assert.equal(stored.shipped_at, null);
  assert.equal(stored.tracking, null);
  assert.equal((await f.db.prepare('SELECT count(*) AS n FROM shipment_notifications').get()).n, 0);
});
async function fixture(t) {
  const postgres = await postgresFixture();
  const dir = mkdtempSync(path.join(tmpdir(), 'vanina-test-'));
  const config = readConfig({
    DATA_DIR: dir,
    APP_URL: 'https://shop.example.test',
    OWNER_EMAIL: 'owner@example.test',
    SMTP_HOST: 'smtp.example.test',
    SMTP_USER: 'test',
    SMTP_PASS: 'test',
    MAIL_FROM: 'shop@example.test',
    MP_ACCESS_TOKEN: 'test',
    MP_WEBHOOK_SECRET: 'test-secret',
    MP_COLLECTOR_ID: '123',
    MP_LIVE_MODE: 'false',
    CORREO_API_USER: 'test',
    CORREO_API_PASSWORD: 'test',
    CORREO_CUSTOMER_ID: 'test',
  });
  const sent = [];
  let payment;
  let creates = 0;
  let mailFails = false;
  const store = await createApp(config, {
    ...(postgres ? { db: postgres.db } : {}),
    disableAutoMail: true,
    mail: {
      async send(message) {
        if (mailFails) throw new Error('offline');
        sent.push(message);
      },
    },
    correo: {
      async quote() {
        return {
          cents: 420000,
          service: 'Paq.ar Clásico',
          expires: Date.now() + 600000,
        };
      },
    },
    mp: {
      async createCheckout() {
        creates++;
        return 'https://sandbox.mercadopago.com.ar/checkout/test';
      },
      async getPayment() {
        return payment;
      },
    },
  });
  await store.db
    .prepare('UPDATE owner SET password_hash=? WHERE id=1')
    .run(await hashPassword('test-password-1234'));
  t.after(async () => {
    await store.db.close();
    if (postgres) await postgres.cleanup();
    rmSync(dir, {
      recursive: true,
      force: true,
    });
  });
  const guest = request(store.app),
    owner = request.agent(store.app);
  function post(agent, url, body) {
    return agent.post(url).set('Origin', config.appUrl).set('x-store-request', '1').send(body);
  }
  await post(owner, '/api/auth/login', {
    email: config.ownerEmail,
    password: 'test-password-1234',
  }).expect(200);
  async function product(extra = {}) {
    const image = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: '#64754c',
      },
    })
      .png()
      .toBuffer();
    const upload = await owner
      .post('/api/admin/uploads')
      .set('Origin', config.appUrl)
      .set('x-store-request', '1')
      .attach('image', image, 'product.png')
      .expect(201);
    return (
      await post(owner, '/api/admin/products', {
        name: 'Producto de prueba',
        description: 'Descripción del producto de prueba',
        category: 'Prueba',
        priceCents: 180000,
        image: upload.body.image,
        weight: 500,
        height: 8,
        width: 12,
        length: 15,
        active: true,
        ...extra,
      }).expect(201)
    ).body;
  }
  const customer = {
    name: 'Comprador Prueba',
    email: 'buyer@example.test',
    phone: '1122334455',
    street: 'Calle de prueba',
    number: '123',
    apartment: '',
    city: 'Córdoba',
    province: 'Córdoba',
    postalCode: '5000',
  };
  async function quote(p) {
    return (
      await post(guest, '/api/shipping/quote', {
        items: [
          {
            id: p.id,
            quantity: 2,
          },
        ],
        postalCode: '5000',
      }).expect(200)
    ).body;
  }
  async function order(p) {
    const q = await quote(p);
    const result = await post(guest, '/api/checkout', {
      quoteId: q.id,
      customer,
    })
      .set('Idempotency-Key', randomUUID())
      .expect(200);
    return await store.db.prepare('SELECT * FROM orders WHERE id=?').get(result.body.orderId);
  }
  function pay(o, changes = {}) {
    payment = {
      id: 456,
      external_reference: o.id,
      transaction_amount: o.total_cents / 100,
      currency_id: 'ARS',
      collector_id: 123,
      live_mode: false,
      status: 'approved',
      date_last_updated: new Date().toISOString(),
      ...changes,
    };
  }
  function webhook(extra = {}) {
    const id = String(payment.id),
      ts = String(Date.now()),
      requestId = randomUUID();
    const digest = createHmac('sha256', config.mp.secret)
      .update('id:' + id + ';request-id:' + requestId + ';ts:' + ts + ';')
      .digest('hex');
    return guest
      .post('/api/webhooks/mercadopago?type=payment&data.id=' + id)
      .set('x-request-id', requestId)
      .set('x-signature', 'ts=' + ts + ',v1=' + digest)
      .send({
        type: 'payment',
        ...extra,
      });
  }
  return {
    ...store,
    reopen: postgres ? postgres.reopen : () => openDatabase(config.dataDir),
    config,
    sent,
    guest,
    owner,
    post,
    product,
    quote,
    order,
    pay,
    webhook,
    customer,
    get creates() {
      return creates;
    },
    failMail: () => {
      mailFails = true;
    },
    restoreMail: () => {
      mailFails = false;
    },
  };
}
test('private owner routes, origin protection and no public registration', async (t) => {
  const f = await fixture(t);
  await f.guest.get('/api/admin/orders').expect(401);
  await f.guest.get('/api/admin/analytics').expect(401);
  await f.post(f.guest, '/api/admin/products', {}).expect(401);
  await f.owner.post('/api/admin/products').send({}).expect(403);
  await f.owner
    .post('/api/admin/uploads')
    .set('Origin', 'https://evil.test')
    .set('x-store-request', '1')
    .expect(403);
  await f
    .post(f.guest, '/api/auth/login', {
      email: 'stranger@example.test',
      password: 'test-password-1234',
    })
    .expect(401);
  await f.post(f.guest, '/api/auth/register', {}).expect(404);
  await f.post(f.owner, '/api/auth/logout', {}).expect(204);
  await f.owner.get('/api/admin/products').expect(401);
});
test('owner uploads, publishes, edits and hides products; invalid files never become public', async (t) => {
  const f = await fixture(t),
    p = await f.product();
  const publicList = await f.guest.get('/api/products').expect(200);
  assert.equal(publicList.body[0].id, p.id);
  await f.owner
    .post('/api/admin/uploads')
    .set('Origin', f.config.appUrl)
    .set('x-store-request', '1')
    .attach('image', Buffer.from('<svg onload="alert(1)"></svg>'), 'bad.png')
    .expect(400);
  const { id, ...body } = p;
  await f.owner
    .put('/api/admin/products/' + id)
    .set('Origin', f.config.appUrl)
    .set('x-store-request', '1')
    .send({
      ...body,
      priceCents: 200000,
    })
    .expect(200);
  await f.owner
    .delete('/api/admin/products/' + id)
    .set('Origin', f.config.appUrl)
    .set('x-store-request', '1')
    .expect(204);
  assert.equal((await f.guest.get('/api/products')).body.length, 0);
  assert.equal((await f.owner.get('/api/admin/products')).body.length, 1);
});
test('server prices quote and checkout; idempotency; no price or postal tampering', async (t) => {
  const f = await fixture(t),
    p = await f.product(),
    q = await f.quote(p),
    key = randomUUID();
  assert.equal(q.subtotalCents, 360000);
  assert.equal(q.shippingCents, 420000);
  assert.equal(q.totalCents, 780000);
  await f
    .post(f.guest, '/api/shipping/quote', {
      items: [
        {
          id: p.id,
          quantity: 1,
          priceCents: 1,
        },
      ],
      postalCode: '5000',
    })
    .expect(400);
  await f
    .post(f.guest, '/api/shipping/quote', {
      items: [
        {
          id: p.id,
          quantity: 1,
        },
        {
          id: p.id,
          quantity: 2,
        },
      ],
      postalCode: '5000',
    })
    .expect(400);
  await f
    .post(f.guest, '/api/checkout', {
      quoteId: q.id,
      customer: {
        ...f.customer,
        postalCode: '1000',
      },
    })
    .set('Idempotency-Key', key)
    .expect(409);
  const one = await f
    .post(f.guest, '/api/checkout', {
      quoteId: q.id,
      customer: f.customer,
    })
    .set('Idempotency-Key', key)
    .expect(200);
  const two = await f
    .post(f.guest, '/api/checkout', {
      quoteId: q.id,
      customer: f.customer,
    })
    .set('Idempotency-Key', key)
    .expect(200);
  assert.equal(one.body.orderId, two.body.orderId);
  assert.equal(f.creates, 1);
  const status = await f.guest.get('/api/orders/' + one.body.orderId + '/status').expect(200);
  assert.equal(status.body.status, 'pending');
  assert.equal(status.body.customer, undefined);
});
test('expired quotes and changed catalog cannot be paid', async (t) => {
  const f = await fixture(t),
    p = await f.product(),
    q = await f.quote(p);
  await f.db.prepare('UPDATE quotes SET expires=0 WHERE id=?').run(q.id);
  await f
    .post(f.guest, '/api/checkout', {
      quoteId: q.id,
      customer: f.customer,
    })
    .set('Idempotency-Key', randomUUID())
    .expect(409);
  const next = await f.quote(p);
  await f.db.prepare('UPDATE products SET price_cents=price_cents+100 WHERE id=?').run(p.id);
  await f
    .post(f.guest, '/api/checkout', {
      quoteId: next.id,
      customer: f.customer,
    })
    .set('Idempotency-Key', randomUUID())
    .expect(409);
});
test('verified payment creates one sale, one email and pending shipment; owner can dispatch once', async (t) => {
  const f = await fixture(t),
    p = await f.product(),
    o = await f.order(p);
  await f
    .post(f.owner, '/api/admin/orders/' + o.id + '/ship', {
      tracking: 'TEST12345',
    })
    .expect(409);
  f.pay(o);
  await f.webhook().expect(200);
  await f.webhook().expect(200);
  await f.notifications.drain();
  await f.notifications.drain();
  assert.equal(f.sent.length, 1);
  assert.match(f.sent[0].text, /Calle de prueba/);
  const summary = await f.owner.get('/api/admin/analytics?days=30').expect(200);
  assert.equal(summary.body.orders, 1);
  assert.equal(summary.body.revenueCents, 360000);
  assert.equal(summary.body.pendingShipment, 1);
  assert.equal(summary.body.products[0].units, 2);
  await f
    .post(f.owner, '/api/admin/orders/' + o.id + '/ship', {
      tracking: 'TEST12345',
    })
    .expect(200);
  await f
    .post(f.owner, '/api/admin/orders/' + o.id + '/ship', {
      tracking: 'TEST12345',
    })
    .expect(409);
  assert.equal((await f.owner.get('/api/admin/orders?filter=pending')).body.total, 0);
  assert.equal((await f.owner.get('/api/admin/orders?filter=shipped')).body.total, 1);
});
test('webhooks reject signatures, wrong amounts, seller, currency, environment and signed-resource mismatch', async (t) => {
  const f = await fixture(t),
    p = await f.product(),
    o = await f.order(p);
  await f.guest
    .post('/api/webhooks/mercadopago?type=payment&data.id=456')
    .send({
      type: 'payment',
    })
    .expect(401);
  for (const bad of [
    {
      transaction_amount: 1,
    },
    {
      collector_id: 789,
    },
    {
      currency_id: 'USD',
    },
    {
      live_mode: true,
    },
  ]) {
    f.pay(o, bad);
    await f.webhook().expect(400);
  }
  assert.equal(
    (await f.db.prepare('SELECT status FROM orders WHERE id=?').get(o.id)).status,
    'pending',
  );
  assert.equal((await f.db.prepare('SELECT count(*) AS n FROM notifications').get()).n, 0);
});
test('refunds disappear from analytics and shipping queue; old notifications do not restore paid status', async (t) => {
  const f = await fixture(t),
    p = await f.product(),
    o = await f.order(p);
  const earlier = new Date(Date.now() - 1000).toISOString();
  f.pay(o, {
    date_last_updated: earlier,
  });
  await f.webhook().expect(200);
  f.pay(o, {
    transaction_amount_refunded: 10,
  });
  await f.webhook().expect(200);
  f.pay(o, {
    date_last_updated: earlier,
  });
  await f.webhook().expect(200);
  const result = await f.owner.get('/api/admin/analytics').expect(200);
  assert.equal(result.body.orders, 0);
  assert.equal(result.body.pendingShipment, 0);
  assert.equal(result.body.products[0].units, 0);
  await f.notifications.drain();
  assert.equal(f.sent.length, 0);
});
test('failed mail remains in a durable outbox and succeeds on retry without a second sale', async (t) => {
  const f = await fixture(t),
    p = await f.product(),
    o = await f.order(p);
  f.pay(o);
  await f.webhook().expect(200);
  f.failMail();
  await f.notifications.drain();
  const failed = await f.db.prepare('SELECT * FROM notifications').get();
  assert.equal(failed.sent_at, null);
  assert.equal(failed.attempts, 1);
  f.restoreMail();
  await f.post(f.owner, '/api/admin/notifications/retry', {}).expect(200);
  assert.equal(f.sent.length, 1);
  assert.ok((await f.db.prepare('SELECT * FROM notifications').get()).sent_at);
});
test('recovery is owner-only, single use and revokes existing sessions', async (t) => {
  const f = await fixture(t);
  await f
    .post(f.guest, '/api/auth/forgot', {
      email: 'other@example.test',
    })
    .expect(200);
  assert.equal(f.sent.length, 0);
  await f
    .post(f.guest, '/api/auth/forgot', {
      email: f.config.ownerEmail,
    })
    .expect(200);
  assert.equal(f.sent.length, 1);
  const token = f.sent[0].text.match(/#([a-f0-9]{64})/)[1];
  const body = {
    token,
    password: 'new-test-password-4567',
  };
  await f.post(f.guest, '/api/auth/reset', body).expect(200);
  await f.post(f.guest, '/api/auth/reset', body).expect(400);
  await f.owner.get('/api/admin/analytics').expect(401);
  await f
    .post(f.guest, '/api/auth/login', {
      email: f.config.ownerEmail,
      password: body.password,
    })
    .expect(200);
});
test('Correo uses origin 5881, real parcel dimensions and refuses missing/invalid rates', async () => {
  const config = readConfig({
    CORREO_API_USER: 'u',
    CORREO_API_PASSWORD: 'p',
    CORREO_CUSTOMER_ID: 'c',
  });
  const calls = [];
  const correo = createCorreo(config, async (url, options) => {
    calls.push({
      url,
      options,
    });
    return {
      ok: true,
      json: async () =>
        url.endsWith('/token')
          ? {
              token: 't',
            }
          : {
              validTo: new Date(Date.now() + 600000).toISOString(),
              rates: [
                {
                  deliveredType: 'D',
                  price: 4500.25,
                  productName: 'Paq.ar',
                },
              ],
            },
    };
  });
  const dimensions = parcelDimensions(
    [
      {
        weight: 500,
        height: 8,
        width: 10,
        length: 12,
        quantity: 2,
      },
    ],
    100,
  );
  assert.deepEqual(dimensions, {
    weight: 1100,
    height: 18,
    width: 12,
    length: 14,
  });
  const rate = await correo.quote('5000', dimensions);
  assert.equal(rate.cents, 450025);
  assert.equal(JSON.parse(calls[1].options.body).postalCodeOrigin, '5881');
  await assert.rejects(() => createCorreo(readConfig({})).quote('5000', dimensions), /habilitados/);
  assert.throws(
    () =>
      parcelDimensions(
        [
          {
            weight: 25000,
            height: 8,
            width: 10,
            length: 12,
            quantity: 2,
          },
        ],
        100,
      ),
    /supera/,
  );
});
test('Mercado Pago receives shipping in addition to items and seller-owned credentials stay server-side', async () => {
  const config = readConfig({
    APP_URL: 'https://shop.example.test',
    MP_ACCESS_TOKEN: 'test-token',
  });
  let received;
  const mp = createMercadoPago(config, async (url, options) => {
    received = {
      url,
      options,
    };
    return {
      ok: true,
      json: async () => ({
        sandbox_init_point: 'https://sandbox.mercadopago.com.ar/checkout/test',
      }),
    };
  });
  await mp.createCheckout({
    id: randomUUID(),
    customer: JSON.stringify({
      name: 'Test',
      email: 'test@example.test',
    }),
    items: JSON.stringify([
      {
        id: randomUUID(),
        name: 'Product',
        quantity: 2,
        priceCents: 150000,
      },
    ]),
    shipping_cents: 420000,
    created: Date.now(),
  });
  const body = JSON.parse(received.options.body);
  assert.equal(body.items[0].unit_price, 1500);
  assert.equal(body.shipments.cost, 4200);
  assert.equal(body.items[0].quantity, 2);
  assert.equal(received.options.headers.Authorization, 'Bearer test-token');
  assert.equal(
    verifyWebhook({
      signature: 'bad',
      requestId: 'test',
      dataId: '123',
      secret: 'test',
    }),
    false,
  );
});
