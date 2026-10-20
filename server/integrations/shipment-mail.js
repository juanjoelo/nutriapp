// Persist the checkout recipient and dispatch details together with the shipment.
export async function queueShipmentNotification(db, config, order, tracking) {
  const customer = JSON.parse(order.customer);
  const shipping = JSON.parse(order.shipping);
  const message = {
    to: customer.email,
    subject: 'Tu pedido ya fue despachado · Vanina Alaniz',
    messageId: '<shipment-' + order.id + '@' + new URL(config.appUrl).hostname + '>',
    text: [
      'Hola, ' + customer.name + '.',
      '',
      'Tu pedido ya fue despachado por Correo Argentino.',
      'Pedido: ' + order.id,
      'Servicio: ' + shipping.service,
      'Número de seguimiento: ' + tracking,
      '',
      'Podés consultar los datos de tu envío en:',
      config.appUrl + '/compra/' + order.id,
      '',
      'Gracias por tu compra.',
      'Vanina Alaniz',
    ].join('\n'),
  };
  await db
    .prepare('INSERT INTO shipment_notifications(order_id,message) VALUES(?,?)')
    .run(order.id, JSON.stringify(message));
}

// Called inside the shared outbox lock; retries also survive a server restart.
export async function drainShipmentNotifications(db, mail) {
  const pending = await db
    .prepare(
      'SELECT * FROM shipment_notifications WHERE sent_at IS NULL AND next_attempt<=? LIMIT 10',
    )
    .all(Date.now());
  for (const notification of pending) {
    try {
      await mail.send(JSON.parse(notification.message));
      await db
        .prepare('UPDATE shipment_notifications SET sent_at=?,attempts=attempts+1 WHERE order_id=?')
        .run(Date.now(), notification.order_id);
    } catch {
      await db
        .prepare(
          'UPDATE shipment_notifications SET attempts=attempts+1,next_attempt=? WHERE order_id=?',
        )
        .run(
          Date.now() + Math.min(24 * 60, 5 * 2 ** Math.min(notification.attempts, 8)) * 60 * 1000,
          notification.order_id,
        );
    }
  }
}
