import { assert } from '../errors.js';
export function parcelDimensions(items, packagingWeight) {
  // Conservative upright stacking: each product includes its individual protective packaging.
  const parcel = { weight: packagingWeight, height: 2, width: 0, length: 0 };
  for (const p of items) {
    parcel.weight += p.weight * p.quantity;
    parcel.height += p.height * p.quantity;
    parcel.width = Math.max(parcel.width, p.width + 2);
    parcel.length = Math.max(parcel.length, p.length + 2);
  }
  assert(
    parcel.weight <= 25000 && Math.max(parcel.height, parcel.width, parcel.length) <= 150,
    422,
    'Este carrito supera el tamaño de un paquete. Dividí la compra en envíos más pequeños.',
  );
  return parcel;
}
export function createCorreo(config, fetcher = fetch) {
  const c = config.correo;
  return {
    async quote(postalCode, dimensions) {
      assert(
        c.user && c.password && c.customer,
        503,
        'Los envíos todavía no están habilitados. Contactanos para consultar.',
      );
      const auth = await fetcher(c.base + '/token', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(c.user + ':' + c.password).toString('base64'),
        },
        signal: AbortSignal.timeout(10000),
      });
      assert(
        auth.ok,
        502,
        'No pudimos consultar Correo Argentino. Intentá nuevamente en unos minutos.',
      );
      const { token } = await auth.json();
      assert(typeof token === 'string', 502, 'Respuesta inválida de Correo Argentino.');
      const response = await fetcher(c.base + '/rates', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: c.customer,
          postalCodeOrigin: c.origin,
          postalCodeDestination: postalCode,
          deliveredType: 'D',
          dimensions,
        }),
        signal: AbortSignal.timeout(10000),
      });
      assert(
        response.ok,
        502,
        'Correo Argentino no pudo cotizar ese destino. Revisá el código postal o intentá más tarde.',
      );
      const data = await response.json();
      const rate = data.rates
        ?.filter((r) => r.deliveredType === 'D' && Number.isFinite(r.price) && r.price > 0)
        .sort((a, b) => a.price - b.price)[0];
      assert(rate, 422, 'No hay entrega a domicilio disponible para ese código postal.');
      const expires = Math.min(Date.now() + 10 * 60 * 1000, Date.parse(data.validTo));
      assert(
        Number.isFinite(expires) && expires > Date.now(),
        502,
        'La cotización de Correo venció. Volvé a intentarlo.',
      );
      return {
        cents: Math.round(rate.price * 100),
        service: String(rate.productName || 'Paq.ar'),
        expires,
      };
    },
  };
}
