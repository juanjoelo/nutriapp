import nodemailer from 'nodemailer';
import { assert } from '../errors.js';
import { drainShipmentNotifications } from './shipment-mail.js';
import { drainBookingNotifications } from '../bookings.js';
export function createMailer(config) {
  const transport = config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.secure,
        auth: config.smtp.auth,
        requireTLS: !config.smtp.secure,
        connectionTimeout: 10000,
        socketTimeout: 15000,
      })
    : null;
  return {
    async send(message) {
      assert(
        transport && config.smtp.from,
        503,
        'El servicio de email todavía no está configurado.',
      );
      await transport.sendMail({
        from: config.smtp.from,
        ...message,
      });
    },
  };
}
export function createNotificationService(db, config, mail) {
  let running = false;
  return {
    async drain() {
      if (running) return;
      running = true;
      try {
        const pending = await db
          .prepare(
            `SELECT n.*,o.customer,o.items,o.total_cents,o.shipping_cents,o.shipping,o.payment_id,o.status
          FROM notifications n JOIN orders o ON o.id=n.order_id
          WHERE n.sent_at IS NULL AND n.next_attempt<=? AND o.status='paid' LIMIT 10`,
          )
          .all(Date.now());
        for (const order of pending) {
          try {
            const c = JSON.parse(order.customer);
            const shipping = JSON.parse(order.shipping);
            const money = (cents) =>
              new Intl.NumberFormat('es-AR', {
                style: 'currency',
                currency: 'ARS',
              }).format(cents / 100);
            await mail.send({
              to: config.ownerEmail,
              subject: 'Nueva venta confirmada · ' + order.order_id.slice(0, 8),
              messageId: '<sale-' + order.order_id + '@' + new URL(config.appUrl).hostname + '>',
              text: [
                'Venta confirmada por Mercado Pago. Estado actual: ' + order.status,
                'Pedido: ' + order.order_id,
                'Pago: ' + order.payment_id,
                '',
                ...JSON.parse(order.items).map(
                  (i) => i.quantity + ' × ' + i.name + ' — ' + money(i.priceCents * i.quantity),
                ),
                'Envío: ' + money(order.shipping_cents),
                'Total: ' + money(order.total_cents),
                '',
                c.name,
                c.email,
                c.phone,
                c.street + ' ' + c.number + ' ' + c.apartment,
                c.city + ', ' + c.province + ' · CP ' + c.postalCode,
                'Servicio: ' + shipping.service,
                'Prepará el envío en MiCorreo. El cobro del envío no genera una etiqueta automáticamente.',
                config.appUrl + '/admin',
              ].join('\n'),
            });
            await db
              .prepare('UPDATE notifications SET sent_at=?,attempts=attempts+1 WHERE order_id=?')
              .run(Date.now(), order.order_id);
          } catch {
            await db
              .prepare(
                'UPDATE notifications SET attempts=attempts+1,next_attempt=? WHERE order_id=?',
              )
              .run(
                Date.now() + Math.min(24 * 60, 5 * 2 ** Math.min(order.attempts, 8)) * 60 * 1000,
                order.order_id,
              );
          }
        }
        await drainShipmentNotifications(db, mail);
        await drainBookingNotifications(db, mail);
      } finally {
        running = false;
      }
    },
  };
}
