import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { cartSchema, postalCode, checkoutSchema } from './validation.js';
import { catalog } from './merchandising.js';
import { parcelDimensions } from './integrations/correo.js';
import { verifyWebhook } from './integrations/mercadopago.js';
import { readiness } from './config.js';
import { assert } from './errors.js';
import { transaction } from './database.js';
export async function loadCart(db, input) {
  const available = new Map((await catalog(db)).map((p) => [p.id, p]));
  return cartSchema
    .parse(input)
    .map((item) => {
      const product = available.get(item.id);
      assert(product, 409, 'Un producto ya no está disponible. Revisá tu carrito.');
      return {
        ...product,
        quantity: item.quantity,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
export function commerceRoutes(db, config, { correo, mp, notifications }) {
  const router = Router();
  const inFlight = new Set();
  router.post('/shipping/quote', async (req, res) => {
    const input = z
      .object({
        items: cartSchema,
        postalCode,
      })
      .strict()
      .parse(req.body);
    const items = await loadCart(db, input.items);
    const dimensions = parcelDimensions(items, config.correo.packagingWeight);
    const rate = await correo.quote(input.postalCode, dimensions);
    const subtotal = items.reduce((n, p) => n + p.priceCents * p.quantity, 0);
    const id = randomUUID();
    await db
      .prepare('DELETE FROM quotes WHERE expires<? AND id NOT IN (SELECT quote_id FROM orders)')
      .run(Date.now());
    await db
      .prepare('INSERT INTO quotes VALUES(?,?,?,?,?,?,?,?)')
      .run(
        id,
        JSON.stringify(items),
        input.postalCode,
        rate.cents,
        subtotal,
        rate.service,
        JSON.stringify(dimensions),
        rate.expires,
      );
    res.json({
      id,
      items,
      shippingCents: rate.cents,
      subtotalCents: subtotal,
      totalCents: subtotal + rate.cents,
      service: rate.service,
      expires: rate.expires,
    });
  });
  router.post('/checkout', async (req, res) => {
    const input = checkoutSchema.parse(req.body);
    const key = z.string().uuid().parse(req.get('Idempotency-Key'));
    const ready = readiness(config, mp.account ? await mp.account() : config.mp);
    assert(
      ready.payment && ready.email && ready.shipping,
      503,
      'La tienda todavía está preparando sus pagos y envíos. Contactanos para consultar.',
    );
    assert(!inFlight.has(key), 409, 'Tu pedido se está procesando. Esperá unos segundos.');
    inFlight.add(key);
    try {
      let order = await db.prepare('SELECT * FROM orders WHERE request_key=?').get(key);
      if (order) {
        assert(
          order.quote_id === input.quoteId && order.customer === JSON.stringify(input.customer),
          409,
          'Este intento pertenece a otro pedido. Volvé al carrito.',
        );
        assert(
          order.status === 'pending' && order.created + 30 * 60 * 1000 > Date.now(),
          409,
          'Este pedido ya se procesó o venció. Volvé a cotizar el envío.',
        );
        if (order.checkout_url)
          return res.json({
            url: order.checkout_url,
            orderId: order.id,
          });
      } else {
        const quote = await db.prepare('SELECT * FROM quotes WHERE id=?').get(input.quoteId);
        assert(
          quote && quote.expires > Date.now(),
          409,
          'La cotización venció. Volvé a calcular el envío.',
        );
        assert(
          input.customer.postalCode === quote.postal_code,
          409,
          'El código postal cambió. Volvé a calcular el envío.',
        );
        const original = JSON.parse(quote.cart);
        const fresh = await loadCart(
          db,
          original.map((p) => ({
            id: p.id,
            quantity: p.quantity,
          })),
        );
        assert(
          JSON.stringify(original) === JSON.stringify(fresh),
          409,
          'Un producto cambió. Actualizá el carrito y volvé a cotizar.',
        );
        const id = randomUUID();
        await db
          .prepare(
            `INSERT INTO orders(id,request_key,quote_id,customer,items,subtotal_cents,shipping_cents,total_cents,shipping,created)
          VALUES(?,?,?,?,?,?,?,?,?,?)`,
          )
          .run(
            id,
            key,
            quote.id,
            JSON.stringify(input.customer),
            quote.cart,
            quote.subtotal_cents,
            quote.shipping_cents,
            quote.subtotal_cents + quote.shipping_cents,
            JSON.stringify({
              service: quote.service,
              origin: config.correo.origin,
              dimensions: JSON.parse(quote.dimensions),
            }),
            Date.now(),
          );
        order = await db.prepare('SELECT * FROM orders WHERE id=?').get(id);
      }
      const url = await mp.createCheckout(order);
      await db.prepare('UPDATE orders SET checkout_url=? WHERE id=?').run(url, order.id);
      res.json({
        url,
        orderId: order.id,
      });
    } finally {
      inFlight.delete(key);
    }
  });
  // Unguessable order reference exposes status only: never buyer details or addresses.
  router.get('/orders/:id/status', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const order = await db
      .prepare('SELECT id,status,tracking,shipped_at FROM orders WHERE id=?')
      .get(id);
    assert(order, 404, 'No encontramos ese pedido.');
    res.json(order);
  });
  router.post('/webhooks/mercadopago', async (req, res) => {
    const id = req.query['data.id'];
    assert(
      typeof id === 'string' &&
        verifyWebhook({
          signature: req.get('x-signature'),
          requestId: req.get('x-request-id'),
          dataId: id,
          secret: config.mp.secret,
        }),
      401,
      'Notificación inválida.',
    );
    if ((req.query.type || req.body.type) !== 'payment') return res.sendStatus(200);
    const payment = await mp.getPayment(id);
    const account = mp.account ? await mp.account() : config.mp;
    assert(String(payment.id) === id, 400, 'Pago inválido.');
    const order = await db
      .prepare('SELECT * FROM orders WHERE id=?')
      .get(payment.external_reference);
    if (!order) return res.sendStatus(200);
    assert(
      payment.currency_id === 'ARS' &&
        Math.round(payment.transaction_amount * 100) === order.total_cents &&
        String(payment.collector_id) === account.collector &&
        payment.live_mode === config.mp.live,
      400,
      'El pago no coincide con el pedido.',
    );
    // A failed second attempt must never undo an already approved payment.
    if (order.payment_id && order.payment_id !== id) {
      assert(
        payment.status !== 'approved',
        409,
        'Pago adicional: requiere conciliación en Mercado Pago.',
      );
      return res.sendStatus(200);
    }
    const status =
      Number(payment.transaction_amount_refunded) > 0
        ? 'refunded'
        : {
            approved: 'paid',
            refunded: 'refunded',
            charged_back: 'charged_back',
            cancelled: 'cancelled',
            rejected: 'rejected',
            in_process: 'pending',
            pending: 'pending',
            authorized: 'pending',
            in_mediation: 'disputed',
          }[payment.status];
    assert(status, 400, 'Estado de pago no reconocido.');
    const updated = Date.parse(payment.date_last_updated);
    assert(Number.isFinite(updated), 400, 'Falta la fecha de actualización del pago.');
    await transaction(db, async () => {
      const current = await db.prepare('SELECT * FROM orders WHERE id=?').get(order.id);
      if (current.payment_updated > updated) return;
      if (current.payment_id && current.payment_id !== id) {
        assert(status !== 'paid', 409, 'Pago adicional: requiere conciliación en Mercado Pago.');
        return;
      }
      // Bind only the successful payment, allowing a buyer to retry a rejected one.
      await db
        .prepare('UPDATE orders SET status=?,payment_id=?,payment_updated=? WHERE id=?')
        .run(
          status,
          ['paid', 'refunded', 'charged_back', 'disputed'].includes(status)
            ? id
            : current.payment_id,
          updated,
          order.id,
        );
      if (status === 'paid')
        await db.prepare('INSERT OR IGNORE INTO notifications(order_id) VALUES(?)').run(order.id);
    });
    res.sendStatus(200);
    if (notifications)
      void notifications.drain().catch(() => console.error('Email outbox retry pending'));
  });
  return router;
}
