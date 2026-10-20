import { createHmac, timingSafeEqual } from 'node:crypto';
import { assert } from '../errors.js';
export function verifyWebhook({ signature, requestId, dataId, secret }) {
  if (!secret || !signature || !requestId || !/^[a-zA-Z0-9]+$/.test(dataId || '')) return false;
  const fields = Object.fromEntries(signature.split(',').map((part) => part.trim().split('=')));
  if (!/^\d+$/.test(fields.ts || '') || !/^[a-f0-9]{64}$/.test(fields.v1 || '')) return false;
  const manifest =
    'id:' + dataId.toLowerCase() + ';request-id:' + requestId + ';ts:' + fields.ts + ';';
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(fields.v1, 'hex'));
}
export function createMercadoPago(config, fetcher = fetch, connection = null) {
  const account = () => (connection ? connection.credentials() : Promise.resolve(config.mp));
  async function request(endpoint, options = {}) {
    const credentials = await account();
    assert(credentials.token, 503, 'Los pagos todavía no están habilitados.');
    const result = await fetcher('https://api.mercadopago.com' + endpoint, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + credentials.token,
        'Content-Type': 'application/json',
        ...options.headers,
      },
      signal: AbortSignal.timeout(12000),
    });
    assert(result.ok, 502, 'Mercado Pago no está disponible en este momento. Intentá nuevamente.');
    return result.json();
  }
  return {
    account,
    async createConsultationCheckout(charge, pack) {
      const service = JSON.parse(pack.service);
      const customer = JSON.parse(pack.customer);
      const back = config.appUrl + '/turnos/pago?booking=' + pack.id;
      const result = await request('/checkout/preferences', {
        method: 'POST',
        body: JSON.stringify({
          external_reference: charge.id,
          items: [
            {
              id: pack.service_id,
              title: service.name,
              quantity: 1,
              currency_id: 'ARS',
              unit_price: charge.amount / 100,
            },
          ],
          payer: { email: customer.email, name: customer.name },
          back_urls: { success: back, pending: back, failure: back },
          auto_return: 'approved',
          notification_url: config.appUrl + '/api/webhooks/mercadopago/consultations',
          expires: true,
          expiration_date_to: new Date(pack.created + 30 * 60 * 1000).toISOString(),
        }),
      });
      const url = config.mp.live ? result.init_point : result.sandbox_init_point;
      assert(
        typeof url === 'string' && /^https:\/\/([a-z0-9-]+\.)*mercadopago\.com\.ar\//.test(url),
        502,
        'Mercado Pago no devolvió un enlace válido.',
      );
      return url;
    },
    async consultationPayments(reference) {
      const credentials = await account();
      const query = new URLSearchParams({
        external_reference: reference,
        collector_id: credentials.collector,
        sort: 'date_created',
        criteria: 'desc',
        limit: '100',
      });
      const data = await request('/v1/payments/search?' + query);
      assert(Array.isArray(data.results), 502, 'No se pudo verificar el pago.');
      return data.results;
    },
    async createCheckout(order) {
      const customer = JSON.parse(order.customer);
      const back = config.appUrl + '/compra/' + order.id;
      const result = await request('/checkout/preferences', {
        method: 'POST',
        body: JSON.stringify({
          external_reference: order.id,
          items: JSON.parse(order.items).map((p) => ({
            id: p.id,
            title: p.name,
            quantity: p.quantity,
            currency_id: 'ARS',
            unit_price: p.priceCents / 100,
          })),
          shipments: { cost: order.shipping_cents / 100, mode: 'not_specified' },
          payer: { email: customer.email, name: customer.name },
          back_urls: { success: back, pending: back, failure: back },
          auto_return: 'approved',
          notification_url: config.appUrl + '/api/webhooks/mercadopago',
          expires: true,
          expiration_date_to: new Date(order.created + 30 * 60 * 1000).toISOString(),
        }),
      });
      const url = config.mp.live ? result.init_point : result.sandbox_init_point;
      assert(
        typeof url === 'string' && /^https:\/\/([a-z0-9-]+\.)*mercadopago\.com\.ar\//.test(url),
        502,
        'Mercado Pago no devolvió un enlace de pago válido.',
      );
      return url;
    },
    getPayment(id) {
      assert(/^\d+$/.test(id), 400, 'Identificador de pago inválido.');
      return request('/v1/payments/' + id);
    },
  };
}
