import { Router } from 'express';
import { z } from 'zod';
import { assert } from './errors.js';
import { readiness } from './config.js';
import { transaction } from './database.js';
import { queueShipmentNotification } from './integrations/shipment-mail.js';
export async function salesSummary(db, days = 30) {
  const since = days ? Date.now() - days * 86400000 : 0;
  const orders = await db
    .prepare("SELECT * FROM orders WHERE status='paid' AND created>=?")
    .all(since);
  const map = new Map(
    (await db.prepare('SELECT id,name,active FROM products').all()).map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        active: Boolean(p.active),
        units: 0,
        revenueCents: 0,
        sales: [],
      },
    ]),
  );
  for (const o of orders)
    for (const p of JSON.parse(o.items)) {
      if (!map.has(p.id))
        map.set(p.id, {
          id: p.id,
          name: p.name,
          active: false,
          units: 0,
          revenueCents: 0,
          sales: [],
        });
      const row = map.get(p.id);
      row.units += p.quantity;
      row.revenueCents += p.priceCents * p.quantity;
      row.sales.push({
        orderId: o.id,
        created: o.created,
        units: p.quantity,
        revenueCents: p.priceCents * p.quantity,
      });
    }
  return {
    days,
    orders: orders.length,
    revenueCents: orders.reduce((n, o) => n + o.subtotal_cents, 0),
    shippingCents: orders.reduce((n, o) => n + o.shipping_cents, 0),
    pendingShipment: (
      await db
        .prepare("SELECT count(*) AS count FROM orders WHERE status='paid' AND shipped_at IS NULL")
        .get()
    ).count,
    products: [...map.values()].sort((a, b) => b.units - a.units || a.name.localeCompare(b.name)),
  };
}
export function adminRoutes(
  db,
  config,
  ownerOnly,
  notifications,
  autoMail = true,
  connection = null,
) {
  const router = Router();
  router.use(ownerOnly);
  router.get('/readiness', async (_req, res) => {
    const ready = readiness(config);
    const linked = connection ? await connection.status() : null;
    res.json({
      ...ready,
      payment: linked
        ? Boolean(linked.checkoutReady || (linked.legacyConfigured && ready.payment))
        : ready.payment,
      origin: config.correo.origin,
      livePayments: config.mp.live,
    });
  });
  router.get('/analytics', async (req, res) => {
    const days = z.enum(['30', '90', '0']).default('30').parse(req.query.days);
    res.json(await salesSummary(db, Number(days)));
  });
  router.get('/orders', async (req, res) => {
    const filter = z.enum(['pending', 'shipped', 'all']).default('pending').parse(req.query.filter);
    const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
    const where =
      filter === 'pending'
        ? "WHERE o.status='paid' AND o.shipped_at IS NULL"
        : filter === 'shipped'
          ? 'WHERE o.shipped_at IS NOT NULL'
          : '';
    const total = (await db.prepare('SELECT count(*) AS count FROM orders o ' + where).get()).count;
    const rows = await db
      .prepare(
        `SELECT o.*,n.sent_at,n.attempts,s.sent_at AS shipment_email_sent_at,
          s.attempts AS shipment_email_attempts,s.order_id AS shipment_email_queued
          FROM orders o LEFT JOIN notifications n ON n.order_id=o.id
          LEFT JOIN shipment_notifications s ON s.order_id=o.id ${where}
      ORDER BY o.created DESC LIMIT 20 OFFSET ?`,
      )
      .all((page - 1) * 20);
    res.json({
      total,
      page,
      pages: Math.ceil(total / 20),
      orders: rows.map((o) => ({
        id: o.id,
        customer: JSON.parse(o.customer),
        items: JSON.parse(o.items),
        subtotalCents: o.subtotal_cents,
        shippingCents: o.shipping_cents,
        totalCents: o.total_cents,
        shipping: JSON.parse(o.shipping),
        status: o.status,
        paymentId: o.payment_id,
        created: o.created,
        tracking: o.tracking,
        shippedAt: o.shipped_at,
        emailSentAt: o.sent_at,
        emailAttempts: o.attempts || 0,
        shipmentEmailSentAt: o.shipment_email_sent_at,
        shipmentEmailAttempts: o.shipment_email_attempts || 0,
        shipmentEmailQueued: Boolean(o.shipment_email_queued),
      })),
    });
  });
  router.post('/orders/:id/ship', async (req, res) => {
    const tracking = z
      .string()
      .trim()
      .min(5)
      .max(80)
      .regex(/^[a-zA-Z0-9 -]+$/)
      .parse(req.body.tracking);
    const order = await db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
    assert(order, 404, 'Pedido no encontrado.');
    assert(order.status === 'paid', 409, 'Solo se pueden despachar pedidos con pago confirmado.');
    assert(!order.shipped_at, 409, 'El pedido ya fue marcado como enviado.');
    await transaction(db, async () => {
      const updated = await db
        .prepare(
          "UPDATE orders SET tracking=?,shipped_at=? WHERE id=? AND status='paid' AND shipped_at IS NULL",
        )
        .run(tracking, Date.now(), order.id);
      assert(updated.changes, 409, 'El pedido cambió o ya fue despachado. Actualizá la lista.');
      await queueShipmentNotification(db, config, order, tracking);
    });
    res.json({
      message: 'Pedido marcado como enviado.',
    });
    if (autoMail)
      void notifications.drain().catch(() => console.error('Shipment email retry pending'));
  });
  router.post('/notifications/retry', async (_req, res) => {
    await db.prepare('UPDATE notifications SET next_attempt=0 WHERE sent_at IS NULL').run();
    await db
      .prepare('UPDATE shipment_notifications SET next_attempt=0 WHERE sent_at IS NULL')
      .run();
    await notifications.drain();
    res.json({
      message: 'Se procesaron los avisos pendientes. Revisá el estado de cada pedido.',
    });
  });
  return router;
}
