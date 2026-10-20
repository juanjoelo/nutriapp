import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createInspectionApp } from '../scripts/inspection-app.js';
test('inspection cannot start in production', async () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    await assert.rejects(async () => await createInspectionApp(), /local development only/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});
test('inspection grants local access with demo data and rejects foreign hosts and origins', async (t) => {
  const preview = await createInspectionApp();
  t.after(async () => await preview.close());
  const client = request(preview.app);
  const session = await client.get('/api/auth/session').set('Host', 'localhost:4174').expect(200);
  assert.equal(session.body.inspection, true);
  assert.equal(session.headers['set-cookie'], undefined);
  const products = await client
    .get('/api/admin/products')
    .set('Host', 'localhost:4174')
    .expect(200);
  assert.equal(products.body.length, 3);
  const analytics = await client
    .get('/api/admin/analytics')
    .set('Host', 'localhost:4174')
    .expect(200);
  assert.equal(analytics.body.pendingShipment, 2);
  await client.get('/api/admin/products').set('Host', 'evil.example').expect(403);
  await client
    .get('/api/auth/session')
    .set('Host', 'localhost:4174')
    .set('Origin', 'https://evil.example')
    .expect(403);
  await client
    .get('/api/auth/session')
    .set('Host', 'localhost:4174')
    .set('Sec-Fetch-Site', 'cross-site')
    .expect(403);
  const config = await client.get('/api/admin/readiness').set('Host', 'localhost:4174').expect(200);
  assert.equal(config.body.payment, false);
  assert.equal(config.body.email, false);
  const orders = await client.get('/api/admin/orders').set('Host', 'localhost:4174').expect(200);
  await client
    .post('/api/admin/orders/' + orders.body.orders[0].id + '/ship')
    .set('Host', 'localhost:4174')
    .set('Origin', 'http://localhost:4174')
    .set('x-store-request', '1')
    .send({
      tracking: 'DEMO12345',
    })
    .expect(200);
  await client.get('/api/admin/analytics').set('Host', 'localhost:4174').expect(200);
});
