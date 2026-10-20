import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHash, createHmac } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { tokenHash } from '../server/auth.js';
import { createPaymentConnection } from '../server/payment-connection.js';
import { createMercadoPago } from '../server/integrations/mercadopago.js';
import { bookingDate } from '../server/bookings.js';
import { bookingHoldMs } from '../server/booking-payment-state.js';
import { postgresFixture } from './postgres-fixture.js';

async function fixture(t, overrides = {}) {
  const pg = await postgresFixture(),
    dir = mkdtempSync(path.join(tmpdir(), 'vanina-bookings-'));
  const config = readConfig({
    DATA_DIR: dir,
    APP_URL: 'https://shop.example.test',
    OWNER_EMAIL: 'owner@example.test',
    MP_CLIENT_ID: 'test-client',
    MP_CLIENT_SECRET: 'test-secret',
    PAYMENT_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    MP_LIVE_MODE: 'false',
    MP_WEBHOOK_SECRET: 'test-webhook',
    COUNTRY_EDGE_KEY: 'test-edge-key-only-not-a-secret-123456',
  });
  const sent = [],
    calls = [];
  const provider = { id: 123, live: false, fail: false };
  const paymentFetch = async (url, options) => {
    calls.push({ url, options });
    if (provider.fail) return { ok: false, status: 401 };
    return {
      ok: true,
      json: async () =>
        url.endsWith('/oauth/token')
          ? {
              access_token: 'provider-private-access',
              refresh_token: 'provider-private-refresh',
              expires_in: 3600,
              user_id: provider.id,
              live_mode: provider.live,
            }
          : { id: provider.id, nickname: 'Vanina test', site_id: 'MLA' },
    };
  };
  const store = await createApp(config, {
    ...(pg ? { db: pg.db } : {}),
    disableAutoMail: true,
    mail: {
      async send(message) {
        sent.push(message);
      },
    },
    paymentFetch,
    ...overrides,
  });
  t.after(async () => {
    await store.db.close();
    if (pg) await pg.cleanup();
    rmSync(dir, { recursive: true, force: true });
  });
  const session = randomBytes(32).toString('hex');
  await store.db
    .prepare('INSERT INTO sessions(hash,expires) VALUES(?,?)')
    .run(tokenHash(session), Date.now() + 3600000);
  const client = request(store.app);
  const call = (method, url, body, owner = false) => {
    const req = client[method]('/api' + url)
      .set('Origin', config.appUrl)
      .set('x-store-request', '1');
    if (owner) req.set('Cookie', 'vanina_session=' + session);
    if (body?.country)
      req.set('cf-ipcountry', body.country).set('x-nutriapp-edge-key', config.geo.edgeKey);
    return body ? req.send(body) : req;
  };
  async function enable(sessions = 3) {
    const initial = (await call('get', '/admin/bookings/config', null, true).expect(200)).body;
    const cfg = {
      ...initial.settings,
      enabled: true,
      weekly: initial.settings.weekly.map((d) => ({
        ...d,
        intervals: [{ start: '09:00', end: '17:00' }],
      })),
    };
    await call('put', '/admin/bookings/config', cfg, true).expect(200);
    const service = {
      ...initial.services[0],
      name: 'Pack de prueba',
      sessions,
      duration: 30,
      priceCents: 100000,
      active: true,
    };
    const { id, ...body } = service;
    await call('put', '/admin/bookings/services/' + id, body, true).expect(200);
    const date = bookingDate(Date.now() + 3 * 86400000);
    const slots = (
      await call('get', '/bookings/slots?' + new URLSearchParams({ serviceId: id, date })).expect(
        200,
      )
    ).body.slots;
    return { cfg, service, date, slots };
  }
  const book = (service, starts, extra = {}) =>
    call('post', '/bookings', {
      serviceId: service.id,
      starts,
      customer: { name: 'Paciente de prueba', email: 'patient@example.test', phone: '1122334455' },
      consent: true,
      requestKey: randomUUID(),
      ...extra,
    });
  async function begin() {
    const response = await call('post', '/admin/payments/connect', {}, true).expect(200);
    const url = new URL(response.body.url);
    const cookie = response.headers['set-cookie'][0].split(';')[0];
    return { url, cookie, state: url.searchParams.get('state') };
  }
  const callback = (start, extras = '&code=provider-code') =>
    client
      .get('/api/payments/mercadopago/callback?state=' + start.state + extras)
      .set('Cookie', start.cookie);
  return {
    ...store,
    config,
    sent,
    calls,
    provider,
    paymentFetch,
    call,
    client,
    session,
    enable,
    book,
    begin,
    callback,
  };
}

test('booking configuration is owner-only, starts paused and survives reinitialization', async (t) => {
  const f = await fixture(t);
  await f.call('get', '/admin/bookings/config').expect(401);
  const initial = (await f.call('get', '/bookings/options')).body;
  assert.equal(initial.settings.enabled, false);
  assert.deepEqual(initial.services, []);
  const { service, cfg } = await f.enable();
  await f.call('put', '/admin/bookings/config', cfg).expect(401);
  await f
    .call(
      'put',
      '/admin/bookings/config',
      {
        ...cfg,
        weekly: cfg.weekly.map((d) => ({
          ...d,
          intervals: [
            { start: '09:00', end: '12:00' },
            { start: '11:00', end: '13:00' },
          ],
        })),
      },
      true,
    )
    .expect(400);
  const { initializeBookings } = await import('../server/bookings.js');
  await initializeBookings(f.db);
  const ready = (await f.call('get', '/bookings/options')).body;
  assert.equal(ready.services[0].id, service.id);
  assert.equal(ready.services[0].sessions, 3);
});

test('guest booking is atomic across concurrent attempts and private access requires its token', async (t) => {
  const f = await fixture(t),
    { service, slots, date } = await f.enable();
  const results = await Promise.all([f.book(service, slots[0]), f.book(service, slots[0])]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  const booking = results.find((r) => r.status === 201).body;
  assert.equal(booking.remaining, 2);
  assert.equal(booking.paymentStatus, 'pending');
  assert.equal(booking.appointments[0].status, 'pending_payment');
  const stored = await f.db.prepare('SELECT * FROM booking_packages WHERE id=?').get(booking.id);
  assert.notEqual(stored.token_hash, booking.token);
  assert.equal(stored.token_hash, tokenHash(booking.token));
  await f.call('post', '/bookings/manage', { token: randomBytes(32).toString('hex') }).expect(404);
  assert.equal(
    (await f.call('post', '/bookings/manage', { token: booking.token }).expect(200)).body.id,
    booking.id,
  );
  const available = (
    await f.call('get', '/bookings/slots?' + new URLSearchParams({ serviceId: service.id, date }))
  ).body.slots;
  assert.ok(!available.includes(slots[0]));
  await f.notifications.drain();
  assert.equal(f.sent.length, 0);
  await f.notifications.drain();
  assert.equal(f.sent.length, 0);
});

test('unpaid holds expire, prevent pack access, preserve price and never confirm over another reservation', async (t) => {
  const f = await fixture(t),
    { service, slots, date } = await f.enable();
  const booking = (await f.book(service, slots[0]).expect(201)).body;
  await f
    .call('post', '/bookings/manage/change', {
      token: booking.token,
      action: 'next',
      starts: slots[1],
    })
    .expect(409);
  const { id, ...draft } = service;
  await f
    .call('put', '/admin/bookings/services/' + id, { ...draft, priceCents: 3500000 }, true)
    .expect(200);
  assert.equal(
    (await f.call('post', '/bookings/manage', { token: booking.token })).body.service.priceCents,
    100000,
  );
  await f.db
    .prepare('UPDATE appointments SET created=? WHERE package_id=?')
    .run(Date.now() - bookingHoldMs - 1, booking.id);
  const expired = (await f.call('post', '/bookings/manage', { token: booking.token })).body;
  assert.equal(expired.appointments[0].status, 'expired');
  const available = (
    await f.call('get', '/bookings/slots?' + new URLSearchParams({ serviceId: id, date }))
  ).body.slots;
  assert.ok(available.includes(slots[0]));
  const replacement = (await f.book(service, slots[0]).expect(201)).body;
  assert.equal(replacement.service.priceCents, 3500000);
  await f
    .call('patch', '/admin/bookings/packages/' + booking.id + '/payment', { status: 'paid' }, true)
    .expect(200);
  const late = (await f.call('post', '/bookings/manage', { token: booking.token })).body;
  assert.equal(late.appointments[0].status, 'payment_review');
  assert.equal(late.remaining, service.sessions);
  await f
    .call('post', '/bookings/manage/change', {
      token: booking.token,
      action: 'next',
      starts: slots[1],
    })
    .expect(200);
  await f
    .call('put', '/admin/bookings/services/' + id, { ...draft, priceCents: null }, true)
    .expect(200);
  await f.book(service, slots[3]).expect(409);
});

test('Mercado Pago confirms only a verified matching payment, handles signed webhooks and cannot simulate production payments', async (t) => {
  let charge, capturedPack, payment;
  const mp = {
    async account() {
      return { token: 'fake-mp', collector: '123' };
    },
    async createConsultationCheckout(row, pack) {
      charge = row;
      capturedPack = pack;
      return 'https://www.mercadopago.com.ar/checkout/test';
    },
    async consultationPayments() {
      return payment ? [payment] : [];
    },
    async getPayment() {
      return payment;
    },
  };
  const f = await fixture(t, { mp }),
    { service, slots } = await f.enable();
  const booking = (await f.book(service, slots[0]).expect(201)).body;
  const input = { token: booking.token, country: 'AR', provider: 'mercadopago' };
  await f
    .call('post', '/bookings/payments/start', { ...input, provider: 'inspection' })
    .expect(403);
  const started = (await f.call('post', '/bookings/payments/start', input).expect(200)).body;
  assert.equal(started.status, 'pending');
  assert.equal(capturedPack.id, booking.id);
  assert.equal(
    (await f.call('post', '/bookings/payments/verify', { token: booking.token })).body.status,
    'pending',
  );
  payment = {
    id: 1234567,
    external_reference: charge.id,
    currency_id: 'ARS',
    transaction_amount: charge.amount / 100,
    collector_id: 123,
    live_mode: false,
    status: 'approved',
    date_last_updated: new Date().toISOString(),
  };
  for (const invalid of [
    { transaction_amount: 1 },
    { collector_id: 456 },
    { currency_id: 'USD' },
    { live_mode: true },
    { external_reference: randomUUID() },
  ]) {
    const valid = { ...payment };
    Object.assign(payment, invalid);
    await f.call('post', '/bookings/payments/verify', { token: booking.token }).expect(400);
    payment = valid;
  }
  assert.equal(
    (await f.call('post', '/bookings/manage', { token: booking.token })).body.appointments[0]
      .status,
    'pending_payment',
  );
  await f.client
    .post('/api/webhooks/mercadopago/consultations?type=payment&data.id=1234567')
    .send({})
    .expect(401);
  const ts = String(Date.now()),
    requestId = randomUUID();
  const signature = createHmac('sha256', f.config.mp.secret)
    .update(`id:1234567;request-id:${requestId};ts:${ts};`)
    .digest('hex');
  for (let i = 0; i < 2; i++)
    await f.client
      .post('/api/webhooks/mercadopago/consultations?type=payment&data.id=1234567')
      .set('x-request-id', requestId)
      .set('x-signature', `ts=${ts},v1=${signature}`)
      .send({})
      .expect(200);
  const paid = (await f.call('post', '/bookings/manage', { token: booking.token })).body;
  assert.equal(paid.paymentStatus, 'paid');
  assert.equal(paid.appointments[0].status, 'confirmed');
  assert.equal((await f.db.prepare('SELECT count(*) AS n FROM consultation_payments').get()).n, 1);
  await f.notifications.drain();
  assert.equal(f.sent.length, 2);
  payment.transaction_amount_refunded = payment.transaction_amount;
  payment.date_last_updated = new Date(Date.now() + 1000).toISOString();
  await f.call('post', '/bookings/payments/verify', { token: booking.token }).expect(200);
  assert.equal(
    (await f.call('post', '/bookings/manage', { token: booking.token })).body.paymentStatus,
    'refunded',
  );
});

test('local payment simulation confirms once without email and is unavailable in production', async (t) => {
  const f = await fixture(t, { inspectionPayments: true }),
    { service, slots } = await f.enable();
  const booking = (await f.book(service, slots[0]).expect(201)).body;
  const input = { token: booking.token, country: 'AR', provider: 'inspection' };
  const started = await f.call('post', '/bookings/payments/start', input).expect(200);
  assert.equal(started.body.status, 'pending');
  const paid = (
    await f
      .call('post', '/bookings/payment-return/simulate', { booking: booking.id })
      .set('Cookie', started.headers['set-cookie'][0].split(';')[0])
      .expect(200)
  ).body.payment;
  assert.equal(paid.status, 'paid');
  assert.equal(paid.reference, 'LOCAL-SIMULATED');
  await f.call('post', '/bookings/payments/start', input).expect(409);
  assert.equal(
    (await f.call('post', '/bookings/manage', { token: booking.token })).body.appointments[0]
      .status,
    'confirmed',
  );
  await f.notifications.drain();
  assert.equal(f.sent.length, 0);
  const another = (await f.book(service, slots[1]).expect(201)).body;
  f.config.production = true;
  await f.call('post', '/bookings/payments/start', { ...input, token: another.token }).expect(403);
  assert.equal(
    (await f.call('post', '/bookings/manage', { token: another.token })).body.paymentStatus,
    'pending',
  );
});

test('consultation checkout uses the saved pack amount, no shipping, private-token-free return and signed notification endpoint', async () => {
  const config = readConfig({
    APP_URL: 'https://shop.example.test',
    MP_ACCESS_TOKEN: 'fake-token',
    MP_LIVE_MODE: 'false',
  });
  let payload;
  const provider = createMercadoPago(config, async (_url, options) => {
    payload = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => ({ sandbox_init_point: 'https://www.mercadopago.com.ar/checkout/test' }),
    };
  });
  const created = Date.now();
  await provider.createConsultationCheckout(
    { id: 'charge-reference', amount: 3500000 },
    {
      id: 'private-booking-id',
      created,
      service_id: 'pack',
      service: JSON.stringify({ name: 'Pack 3 consultas' }),
      customer: JSON.stringify({ name: 'Paciente', email: 'patient@example.test' }),
    },
  );
  assert.equal(payload.items[0].unit_price, 35000);
  assert.equal(payload.items[0].quantity, 1);
  assert.equal(payload.shipments, undefined);
  assert.equal(payload.external_reference, 'charge-reference');
  assert.equal(payload.notification_url, config.appUrl + '/api/webhooks/mercadopago/consultations');
  assert.equal(
    payload.back_urls.success,
    config.appUrl + '/turnos/pago?booking=private-booking-id',
  );
  assert.equal(Date.parse(payload.expiration_date_to), created + bookingHoldMs);
});

test('direct checkout creates a pending hold, uses trusted country, and confirms only after authenticated provider return', async (t) => {
  let row, payment;
  const f = await fixture(t, {
    mp: {
      async account() {
        return { token: 'fake', collector: '123' };
      },
      async createConsultationCheckout(charge) {
        row = charge;
        return 'https://www.mercadopago.com.ar/checkout/test';
      },
      async consultationPayments() {
        return payment ? [payment] : [];
      },
      async getPayment() {
        return payment;
      },
    },
  });
  const { service, slots } = await f.enable();
  await f.book(service, slots[0], { checkout: true }).expect(409);
  assert.equal((await f.db.prepare('SELECT count(*) AS n FROM appointments').get()).n, 0);
  const response = await f
    .book(service, slots[0], { checkout: true })
    .set('cf-ipcountry', 'AR')
    .set('x-nutriapp-edge-key', f.config.geo.edgeKey)
    .expect(201);
  const booking = response.body,
    cookie = response.headers['set-cookie'][0].split(';')[0];
  assert.equal(booking.checkoutError, null);
  assert.equal(booking.payment.url, 'https://www.mercadopago.com.ar/checkout/test');
  assert.equal(booking.payment.status, 'pending');
  assert.equal(booking.service.paymentMarket.country, 'AR');
  assert.equal(booking.appointments[0].status, 'pending_payment');
  assert.match(response.headers['set-cookie'][0], /HttpOnly/);
  assert.match(response.headers['set-cookie'][0], /Secure/);
  // Neither forged success parameters nor a booking ID alone are payment proof.
  await f
    .call('post', '/bookings/payment-return', { booking: booking.id, status: 'approved' })
    .expect(401);
  const pending = await f
    .call('post', '/bookings/payment-return', { booking: booking.id, status: 'approved' })
    .set('Cookie', cookie)
    .expect(200);
  assert.equal(pending.body.payment.status, 'pending');
  const options = await f
    .call('post', '/bookings/payments/options', { token: booking.token, country: 'US' })
    .expect(200);
  assert.equal(options.body.market.country, 'AR');
  payment = {
    id: 1234567,
    external_reference: row.id,
    currency_id: 'ARS',
    transaction_amount: row.amount / 100,
    collector_id: 123,
    live_mode: false,
    status: 'approved',
    date_last_updated: new Date().toISOString(),
  };
  const paid = await f
    .call('post', '/bookings/payment-return', { booking: booking.id })
    .set('Cookie', cookie)
    .expect(200);
  assert.equal(paid.body.payment.status, 'paid');
  assert.equal(paid.body.token, booking.token);
  assert.equal(
    (await f.call('post', '/bookings/manage', { token: booking.token })).body.appointments[0]
      .status,
    'confirmed',
  );
  await f
    .call('post', '/bookings/payment-return', { booking: randomUUID() })
    .set('Cookie', cookie)
    .expect(401);
  await f
    .call('post', '/bookings/payment-return/simulate', { booking: booking.id })
    .set('Cookie', cookie)
    .expect(404);
});

test('regional checkout uses independent USD/UYU prices, preserves snapshots, and rejects client country spoofing', async (t) => {
  const stub = paypalStub(),
    f = await fixture(t, { paypalFetch: stub.fetcher });
  const { service, slots } = await f.enable();
  const { id, ...draft } = service;
  await f
    .call(
      'put',
      '/admin/bookings/services/' + id,
      { ...draft, online: true, priceCents: 5000000, usdPriceCents: 3215, uyuPriceCents: 132476 },
      true,
    )
    .expect(200);
  await f
    .call(
      'put',
      '/admin/payments/prex',
      { enabled: true, holder: 'Vanina de prueba', account: '12345678', instructions: '' },
      true,
    )
    .expect(200);
  await f
    .call(
      'post',
      '/admin/payments/paypal/connect',
      {
        clientId: 'fake-client-id-123',
        secret: 'fake-secret-456789',
        merchant: 'TESTMERCHANT123',
        live: false,
      },
      true,
    )
    .expect(200);
  const region = (req, country) =>
    req.set('cf-ipcountry', country).set('x-nutriapp-edge-key', f.config.geo.edgeKey);
  const quote = (await region(f.call('get', '/bookings/options'), 'UY')).body.services[0].checkout;
  assert.equal(quote.amount, 132476);
  assert.equal(quote.currency, 'UYU');
  assert.equal(quote.indicative, true);
  const uy = (await region(f.book(service, slots[0], { checkout: true }), 'UY').expect(201)).body;
  assert.equal(uy.payment.provider, 'prex');
  assert.equal(uy.payment.currency, 'ARS');
  assert.equal(uy.payment.amount, 5000000);
  const us = (await region(f.book(service, slots[1], { checkout: true }), 'US').expect(201)).body;
  assert.equal(us.payment.provider, 'paypal');
  assert.equal(us.payment.currency, 'USD');
  assert.equal(us.payment.amount, 3215);
  assert.match(us.payment.url, /sandbox.paypal.com/);
  await f
    .call(
      'put',
      '/admin/bookings/services/' + id,
      { ...draft, online: true, usdPriceCents: 6000, uyuPriceCents: 250000 },
      true,
    )
    .expect(200);
  const frozen = (
    await f.call('post', '/bookings/payments/options', { token: uy.token, country: 'AR' })
  ).body;
  assert.equal(frozen.quote.amount, 132476);
  assert.equal(frozen.payment.amount, 5000000);
  // Body-selected countries and unauthenticated edge headers cannot choose a currency.
  const legacy = (await f.book(service, slots[2]).expect(201)).body;
  const spoof = await f.client
    .post('/api/bookings/payments/options')
    .set('Origin', f.config.appUrl)
    .set('x-store-request', '1')
    .set('cf-ipcountry', 'UY')
    .send({ token: legacy.token, country: 'UY' })
    .expect(200);
  assert.equal(spoof.body.market.country, null);
  assert.deepEqual(spoof.body.methods, []);
});

test('packs retain their purchased configuration, enforce balance and restore cancelled sessions', async (t) => {
  const f = await fixture(t),
    { service, slots } = await f.enable(2);
  const booking = (await f.book(service, slots[0]).expect(201)).body;
  await f
    .call('patch', '/admin/bookings/packages/' + booking.id + '/payment', { status: 'paid' }, true)
    .expect(200);
  const { id, ...body } = service;
  await f
    .call('put', '/admin/bookings/services/' + id, { ...body, sessions: 10, duration: 60 }, true)
    .expect(200);
  await f
    .call('post', '/bookings/manage/change', {
      token: booking.token,
      action: 'next',
      appointmentId: booking.appointments[0].id,
      starts: slots[0],
    })
    .expect(400);
  const next = (
    await f
      .call('post', '/bookings/manage/change', {
        token: booking.token,
        action: 'next',
        starts: slots[1],
      })
      .expect(200)
  ).body;
  assert.equal(next.service.sessions, 2);
  assert.equal(next.service.duration, 30);
  assert.equal(next.remaining, 0);
  await f
    .call('post', '/bookings/manage/change', {
      token: booking.token,
      action: 'next',
      starts: slots[2],
    })
    .expect(409);
  const cancel = (
    await f
      .call('post', '/bookings/manage/change', {
        token: booking.token,
        action: 'cancel',
        appointmentId: booking.appointments[0].id,
      })
      .expect(200)
  ).body;
  assert.equal(cancel.remaining, 1);
  await f
    .call('post', '/bookings/manage/change', {
      token: booking.token,
      action: 'next',
      starts: slots[2],
    })
    .expect(200);
  await f
    .call('patch', '/admin/bookings/packages/' + booking.id + '/payment', { status: 'paid' })
    .expect(401);
  await f
    .call('patch', '/admin/bookings/packages/' + booking.id + '/payment', { status: 'paid' }, true)
    .expect(200);
  assert.equal(
    (await f.call('post', '/bookings/manage', { token: booking.token })).body.paymentStatus,
    'paid',
  );
});

test('blocks, deadline, rescheduling, request deduplication and invalid dates are enforced', async (t) => {
  const f = await fixture(t),
    { service, slots, cfg } = await f.enable();
  const key = randomUUID(),
    booking = (await f.book(service, slots[0], { requestKey: key }).expect(201)).body;
  await f
    .call('patch', '/admin/bookings/packages/' + booking.id + '/payment', { status: 'paid' }, true)
    .expect(200);
  await f.book(service, slots[1], { requestKey: key }).expect(409);
  await f.book(service, 9e15).expect(400);
  const block = { starts: slots[1], ends: slots[2], reason: 'Prueba' };
  await f.call('post', '/admin/bookings/blocks', block).expect(401);
  await f.call('post', '/admin/bookings/blocks', { ...block, starts: slots[0] }, true).expect(409);
  await f.call('post', '/admin/bookings/blocks', block, true).expect(201);
  const change = (starts) =>
    f.call('post', '/bookings/manage/change', {
      token: booking.token,
      action: 'reschedule',
      appointmentId: booking.appointments[0].id,
      starts,
    });
  await change(slots[1]).expect(409);
  await change(slots[2]).expect(200);
  await f
    .call('put', '/admin/bookings/config', { ...cfg, cancellationHours: 168 }, true)
    .expect(200);
  await change(slots[3]).expect(409);
  await f
    .call('patch', '/admin/bookings/' + booking.appointments[0].id, { status: 'completed' }, true)
    .expect(409);
  await f
    .call('patch', '/admin/bookings/' + booking.appointments[0].id, { status: 'cancelled' }, true)
    .expect(200);
});

test('OAuth is owner-only, binds state to session and cookie, uses PKCE, encrypts credentials and rejects replays', async (t) => {
  const f = await fixture(t);
  await f.call('get', '/admin/payments').expect(401);
  await f.call('post', '/admin/payments/connect', {}).expect(401);
  assert.equal((await f.call('get', '/admin/payments', null, true)).body.connected, false);
  const start = await f.begin();
  assert.equal(start.url.origin, 'https://auth.mercadopago.com');
  assert.equal(start.url.searchParams.get('code_challenge_method'), 'S256');
  const invalid = await f.client
    .get('/api/payments/mercadopago/callback?state=' + start.state + '&code=x')
    .expect(303);
  assert.match(invalid.headers.location, /mp=invalid/);
  assert.equal(f.calls.length, 0);
  const result = await f.callback(start).expect(303);
  assert.match(result.headers.location, /mp=connected/);
  const requestBody = JSON.parse(f.calls[0].options.body);
  assert.equal(
    createHash('sha256').update(requestBody.code_verifier).digest('base64url'),
    start.url.searchParams.get('code_challenge'),
  );
  const stored = await f.db.prepare('SELECT * FROM payment_accounts WHERE id=1').get();
  assert.ok(!stored.encrypted.includes('provider-private'));
  assert.equal(stored.collector, '123');
  const state = (await f.call('get', '/admin/payments', null, true)).body;
  assert.equal(state.connected, true);
  assert.equal(state.checkoutReady, true);
  assert.ok(!JSON.stringify(state).includes('provider-private'));
  const replay = await f.callback(start).expect(303);
  assert.match(replay.headers.location, /mp=invalid/);
  assert.equal(f.calls.length, 2);
  const loggedOut = await f.begin();
  await f.db.exec('DELETE FROM sessions');
  assert.match((await f.callback(loggedOut).expect(303)).headers.location, /mp=invalid/);
});

test('OAuth refresh updates encrypted tokens and checkout uses the authorized account; mode mismatch fails closed', async (t) => {
  const f = await fixture(t);
  await f.callback(await f.begin()).expect(303);
  const connection = createPaymentConnection(f.db, f.config, f.paymentFetch);
  await f.db.prepare('UPDATE payment_accounts SET expires=? WHERE id=1').run(Date.now() + 1000);
  const accounts = await Promise.all([connection.credentials(), connection.credentials()]);
  assert.equal(accounts[0].token, 'provider-private-access');
  assert.equal(accounts[0].collector, '123');
  assert.equal(f.calls.filter((c) => c.url.endsWith('/oauth/token')).length, 2);
  const refresh = JSON.parse(f.calls.at(-1).options.body);
  assert.equal(refresh.grant_type, 'refresh_token');
  let bearer;
  const mp = createMercadoPago(
    f.config,
    async (_url, options) => {
      bearer = options.headers.Authorization;
      return { ok: true, json: async () => ({ id: 'payment', status: 'approved' }) };
    },
    connection,
  );
  await mp.getPayment('123456');
  assert.equal(bearer, 'Bearer provider-private-access');
  f.config.mp.live = true;
  assert.equal((await connection.status()).connected, false);
  await assert.rejects(connection.credentials());
  f.config.mp.token = 'legacy-test-token';
  f.config.mp.collector = '123';
  assert.equal((await f.call('get', '/admin/readiness', null, true)).body.payment, false);
});

test('failed OAuth does not show connected and revocation prevents further payments', async (t) => {
  const f = await fixture(t);
  f.provider.live = true;
  assert.match((await f.callback(await f.begin()).expect(303)).headers.location, /mp=failed/);
  assert.equal((await f.call('get', '/admin/payments', null, true)).body.connected, false);
  f.provider.live = false;
  await f.callback(await f.begin()).expect(303);
  f.provider.fail = true;
  await f.call('post', '/admin/payments/verify', {}, true).expect(409);
  assert.equal((await f.call('get', '/admin/payments', null, true)).body.connected, false);
  await assert.rejects(createPaymentConnection(f.db, f.config, f.paymentFetch).credentials());
  await f.call('delete', '/admin/payments/connection', null, true).expect(204);
  assert.equal((await f.db.prepare('SELECT count(*) AS n FROM payment_accounts').get()).n, 0);
});

test('Mercado Pago history is private, filtered, scoped to the seller and never mutates sales', async (t) => {
  const requests = [];
  const payment = {
    id: 9876,
    collector_id: 123,
    live_mode: false,
    transaction_amount: 1250,
    currency_id: 'ARS',
    date_created: '2026-10-01T10:00:00-03:00',
    date_approved: null,
    status: 'pending',
    payer: { email: 'never-return@example.test' },
  };
  let response = { results: [payment], paging: { total: 25 } };
  const f = await fixture(t, {
    paymentHistoryFetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => response };
    },
  });
  const route = '/admin/payments/history?from=2026-10-01&to=2026-10-07&status=pending&page=2';
  await f.call('get', route).expect(401);
  await f.call('get', route, null, true).expect(409);
  await f.callback(await f.begin()).expect(303);
  const result = (await f.call('get', route, null, true).expect(200)).body;
  assert.equal(result.pages, 2);
  assert.equal(result.payments[0].id, '9876');
  assert.equal(result.payments[0].payer, undefined);
  const query = new URL(requests[0].url).searchParams;
  assert.equal(query.get('collector_id'), '123');
  assert.equal(query.get('offset'), '20');
  assert.equal(query.get('status'), 'pending');
  assert.equal(query.get('begin_date'), '2026-10-01T03:00:00.000Z');
  await f
    .call('get', '/admin/payments/history?from=2026-02-30&to=2026-10-07', null, true)
    .expect(400);
  response = { results: [{ ...payment, collector_id: 999 }], paging: { total: 1 } };
  await f.call('get', route, null, true).expect(502);
  assert.equal((await f.db.prepare('SELECT count(*) AS n FROM orders').get()).n, 0);
});

async function onlineBooking(f) {
  const enabled = await f.enable(),
    { id, ...draft } = enabled.service;
  await f
    .call(
      'put',
      '/admin/bookings/services/' + id,
      { ...draft, online: true, usdPriceCents: 5000, uyuPriceCents: 200000 },
      true,
    )
    .expect(200);
  return (await f.book(enabled.service, enabled.slots[0]).expect(201)).body;
}

test('country detection requires an authenticated edge; payment methods follow the detected market', async (t) => {
  const f = await fixture(t),
    booking = await onlineBooking(f);
  f.config.geo.edgeKey = 'test-edge-key-only-not-a-secret-123456';
  assert.equal(
    (await f.client.get('/api/payments/country').set('cf-ipcountry', 'UY')).body.country,
    null,
  );
  assert.equal(
    (
      await f.client
        .get('/api/payments/country')
        .set('cf-ipcountry', 'UY')
        .set('x-nutriapp-edge-key', f.config.geo.edgeKey)
    ).body.country,
    'UY',
  );
  assert.equal(
    (
      await f.client
        .get('/api/payments/country')
        .set('cf-ipcountry', 'XX')
        .set('x-nutriapp-edge-key', f.config.geo.edgeKey)
    ).body.country,
    null,
  );
  const prex = {
    enabled: true,
    holder: 'Vanina de prueba',
    account: '12345678',
    instructions: 'Prueba aislada',
  };
  await f.call('put', '/admin/payments/prex', prex).expect(401);
  await f.call('put', '/admin/payments/prex', prex, true).expect(200);
  const opts = async (country) =>
    (
      await f
        .call('post', '/bookings/payments/options', { token: booking.token, country })
        .expect(200)
    ).body;
  assert.equal((await opts('UY')).methods[0].id, 'prex');
  assert.deepEqual((await opts('AR')).methods, []);
  assert.deepEqual((await opts(null)).methods, []);
  await f
    .call('post', '/bookings/payments/start', {
      token: booking.token,
      country: 'AR',
      provider: 'prex',
    })
    .expect(409);
  await f
    .call('post', '/bookings/payments/start', {
      token: booking.token,
      country: 'UY',
      provider: 'prex',
      amount: 1,
    })
    .expect(400);
});

test('Prex uses the saved Argentine price and recipient, and only owner receipt confirmation pays the pack once', async (t) => {
  const f = await fixture(t),
    booking = await onlineBooking(f);
  await f
    .call(
      'put',
      '/admin/payments/prex',
      { enabled: true, holder: 'Vanina de prueba', account: '12345678', instructions: '' },
      true,
    )
    .expect(200);
  const input = { token: booking.token, country: 'UY', provider: 'prex' };
  const charge = (await f.call('post', '/bookings/payments/start', input).expect(200)).body;
  assert.equal(charge.amount, 100000);
  assert.equal(charge.currency, 'ARS');
  assert.equal(charge.status, 'pending');
  assert.equal((await f.call('post', '/bookings/payments/start', input)).body.id, charge.id);
  await f
    .call('patch', '/admin/bookings/packages/' + booking.id + '/payment', { status: 'paid' }, true)
    .expect(409);
  const path = '/admin/payments/consultations/' + charge.id + '/confirm-prex';
  await f.call('post', path, { reference: 'test-transfer', received: true }).expect(401);
  await f.call('post', path, { reference: 'test-transfer', received: false }, true).expect(400);
  await f.call('post', path, { reference: 'test-transfer', received: true }, true).expect(200);
  await f.call('post', path, { reference: 'test-transfer', received: true }, true).expect(409);
  assert.equal(
    (await f.call('post', '/bookings/manage', { token: booking.token })).body.paymentStatus,
    'paid',
  );
  await f.notifications.drain();
  assert.equal(f.sent.length, 2);
  await f.notifications.drain();
  assert.equal(f.sent.length, 2);
  const state = (await f.call('get', '/admin/payments/consultations', null, true)).body;
  assert.equal(state.total, 1);
  assert.equal(state.payments[0].reference, 'test-transfer');
});

function paypalStub() {
  const state = { calls: [], order: null, invalid: false, refund: false, fail: false };
  const fetcher = async (url, options = {}) => {
    state.calls.push({ url, options });
    const ok = (value) => ({ ok: true, json: async () => structuredClone(value) });
    if (state.fail) return { ok: false, status: 401 };
    if (url.endsWith('/oauth2/token')) return ok({ access_token: 'test-paypal-access' });
    if (url.endsWith('/v2/checkout/orders')) {
      const body = JSON.parse(options.body);
      state.order = {
        id: 'TESTORDER1234567',
        intent: 'CAPTURE',
        status: 'APPROVED',
        purchase_units: body.purchase_units,
      };
      return ok({
        ...state.order,
        links: [
          {
            rel: 'payer-action',
            href: 'https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER1234567',
          },
        ],
      });
    }
    if (url.endsWith('/capture')) {
      state.order.status = 'COMPLETED';
      state.order.purchase_units[0].payments = { captures: [{ id: 'TESTCAPTURE12345' }] };
      return ok(state.order);
    }
    if (url.includes('/v2/payments/captures/'))
      return ok({
        id: 'TESTCAPTURE12345',
        amount: state.order.purchase_units[0].amount,
        status: state.refund ? 'REFUNDED' : 'COMPLETED',
      });
    const value = structuredClone(state.order);
    if (state.invalid) value.purchase_units[0].amount.value = '0.01';
    return ok(value);
  };
  return { state, fetcher };
}
test('PayPal credentials are encrypted; server validates receiver and amount before capture, retries are idempotent and refunds reconciled', async (t) => {
  const stub = paypalStub(),
    f = await fixture(t, { paypalFetch: stub.fetcher }),
    booking = await onlineBooking(f);
  const credentials = {
    clientId: 'fake-client-id-123',
    secret: 'fake-secret-456789',
    merchant: 'TESTMERCHANT123',
    live: false,
  };
  await f.call('post', '/admin/payments/paypal/connect', credentials).expect(401);
  const connected = (
    await f.call('post', '/admin/payments/paypal/connect', credentials, true).expect(200)
  ).body;
  assert.equal(connected.connected, true);
  assert.equal(connected.secret, undefined);
  f.config.production = true;
  assert.deepEqual(
    (await f.call('post', '/bookings/payments/options', { token: booking.token, country: 'US' }))
      .body.methods,
    [],
  );
  f.config.production = false;
  assert.ok(
    !(
      await f.db.prepare('SELECT encrypted FROM paypal_accounts WHERE id=1').get()
    ).encrypted.includes(credentials.secret),
  );
  const charge = (
    await f
      .call('post', '/bookings/payments/start', {
        token: booking.token,
        country: 'US',
        provider: 'paypal',
      })
      .expect(200)
  ).body;
  assert.equal(charge.amount, 5000);
  assert.equal(charge.currency, 'USD');
  assert.equal(stub.state.order.purchase_units[0].payee.merchant_id, credentials.merchant);
  assert.equal(stub.state.order.purchase_units[0].custom_id, charge.id);
  assert.ok(!JSON.stringify(stub.state.calls).includes(booking.token));
  stub.state.invalid = true;
  await f.call('post', '/bookings/payments/verify', { token: booking.token }).expect(502);
  assert.equal(stub.state.calls.filter((c) => c.url.endsWith('/capture')).length, 0);
  stub.state.invalid = false;
  stub.state.order.purchase_units[0].payee.merchant_id = 'ANOTHERSELLER12';
  await f.call('post', '/bookings/payments/verify', { token: booking.token }).expect(502);
  assert.equal(stub.state.calls.filter((c) => c.url.endsWith('/capture')).length, 0);
  stub.state.order.purchase_units[0].payee.merchant_id = credentials.merchant;
  assert.equal(
    (await f.call('post', '/bookings/payments/verify', { token: booking.token }).expect(200)).body
      .status,
    'paid',
  );
  await f.call('post', '/bookings/payments/verify', { token: booking.token }).expect(200);
  assert.equal(stub.state.calls.filter((c) => c.url.endsWith('/capture')).length, 1);
  await f.call('delete', '/admin/payments/paypal', null, true).expect(409);
  await f.notifications.drain();
  assert.equal(f.sent.length, 2);
  stub.state.refund = true;
  assert.equal(
    (
      await f
        .call('post', '/admin/payments/consultations/' + charge.id + '/verify', {}, true)
        .expect(200)
    ).body.status,
    'refunded',
  );
  assert.equal(
    (await f.call('post', '/bookings/manage', { token: booking.token })).body.paymentStatus,
    'refunded',
  );
  await f
    .call(
      'post',
      '/admin/payments/paypal/connect',
      { ...credentials, merchant: 'LIVEMERCHANT12', live: true },
      true,
    )
    .expect(200);
  await f
    .call('post', '/admin/payments/consultations/' + charge.id + '/verify', {}, true)
    .expect(409);
});
