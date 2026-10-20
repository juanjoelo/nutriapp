import { assert } from '../errors.js';
import { createHash } from 'node:crypto';

const cents = (value) => {
  const match = typeof value === 'string' && /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(value);
  return match ? Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0')) : null;
};

export function createPayPal(fetcher = fetch) {
  const base = (account) =>
    account.live ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
  async function access(account) {
    const response = await fetcher(base(account) + '/v1/oauth2/token', {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' + Buffer.from(account.clientId + ':' + account.secret).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(12000),
    });
    assert(
      response.ok,
      409,
      'PayPal no validó estas credenciales. Revisá la aplicación y su ambiente.',
    );
    const value = await response.json();
    assert(
      typeof value.access_token === 'string' && value.access_token.length > 0,
      502,
      'Respuesta de PayPal inválida.',
    );
    return value.access_token;
  }
  async function request(account, path, body, key) {
    const token = await access(account);
    const response = await fetcher(base(account) + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(key ? { 'PayPal-Request-Id': key } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    assert(
      response.ok,
      502,
      'No pudimos completar la operación con PayPal. Verificá el pago antes de reintentar.',
    );
    return response.json();
  }
  return {
    verify: access,
    async create(account, charge, appUrl) {
      const order = await request(
        account,
        '/v2/checkout/orders',
        {
          intent: 'CAPTURE',
          purchase_units: [
            {
              reference_id: charge.id,
              custom_id: charge.id,
              invoice_id: charge.id,
              description: 'Consultas online · Vanina Alaniz',
              payee: { merchant_id: account.merchant },
              amount: { currency_code: 'USD', value: (charge.amount / 100).toFixed(2) },
            },
          ],
          payment_source: {
            paypal: {
              experience_context: {
                shipping_preference: 'NO_SHIPPING',
                user_action: 'PAY_NOW',
                return_url: appUrl + '/turnos/pago?booking=' + charge.package_id,
                cancel_url: appUrl + '/turnos/pago?cancelled=1&booking=' + charge.package_id,
              },
            },
          },
        },
        charge.id,
      );
      const url = order.links?.find((l) => ['payer-action', 'approve'].includes(l.rel))?.href;
      const parsed = new URL(url || 'https://invalid.local');
      assert(
        /^[A-Z0-9]{8,40}$/.test(order.id || '') &&
          parsed.protocol === 'https:' &&
          parsed.hostname === (account.live ? 'www.paypal.com' : 'www.sandbox.paypal.com'),
        502,
        'PayPal no devolvió un enlace válido.',
      );
      return { id: order.id, url };
    },
    async inspect(account, charge, capture = true) {
      assert(
        /^[A-Z0-9]{8,40}$/.test(charge.provider_id || ''),
        409,
        'El pago todavía no tiene una orden de PayPal.',
      );
      let order = await request(account, '/v2/checkout/orders/' + charge.provider_id);
      const validate = (value) => {
        const unit = value.purchase_units?.[0];
        assert(
          value.id === charge.provider_id &&
            value.intent === 'CAPTURE' &&
            value.purchase_units?.length === 1 &&
            unit.custom_id === charge.id &&
            unit.payee?.merchant_id === charge.receiver &&
            unit.amount?.currency_code === charge.currency &&
            cents(unit.amount.value) === charge.amount,
          502,
          'El pago no coincide con la reserva, el importe o la cuenta receptora.',
        );
      };
      validate(order);
      if (order.status === 'APPROVED' && capture) {
        await request(
          account,
          '/v2/checkout/orders/' + charge.provider_id + '/capture',
          {},
          createHash('sha256')
            .update('capture:' + charge.id)
            .digest('hex')
            .slice(0, 32),
        );
        order = await request(account, '/v2/checkout/orders/' + charge.provider_id);
        validate(order);
      }
      const captures = order.purchase_units[0].payments?.captures || [];
      if (!captures.length) return 'pending';
      assert(captures.length === 1, 502, 'Este pago necesita revisión en PayPal.');
      assert(
        /^[A-Z0-9]{8,40}$/.test(captures[0].id || ''),
        502,
        'PayPal devolvió una captura inválida.',
      );
      const paid = await request(account, '/v2/payments/captures/' + captures[0].id);
      assert(
        paid.id === captures[0].id &&
          paid.amount?.currency_code === charge.currency &&
          cents(paid.amount.value) === charge.amount,
        502,
        'El importe capturado no coincide.',
      );
      if (['REFUNDED', 'PARTIALLY_REFUNDED'].includes(paid.status)) return 'refunded';
      if (paid.status === 'COMPLETED' && order.status === 'COMPLETED') return 'paid';
      return 'pending';
    },
  };
}
