import { Router } from 'express';
import { z } from 'zod';
import { assert } from './errors.js';

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const time = Date.parse(value + 'T12:00:00Z');
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  });
const statuses = [
  'all',
  'approved',
  'pending',
  'in_process',
  'authorized',
  'rejected',
  'cancelled',
  'refunded',
  'charged_back',
  'in_mediation',
];
const params = z
  .object({
    from: date,
    to: date,
    status: z.enum(statuses).default('all'),
    page: z.coerce.number().int().min(1).max(500).default(1),
  })
  .strict();

export function paymentHistoryRoutes(db, connection, ownerOnly, fetcher = fetch) {
  const router = Router();
  router.get('/admin/payments/history', ownerOnly, async (req, res) => {
    const query = params.parse(req.query);
    const begin = Date.parse(query.from + 'T00:00:00-03:00'),
      end = Date.parse(query.to + 'T23:59:59.999-03:00');
    assert(end >= begin && end - begin < 366 * 86400000, 400, 'Elegí un período de hasta un año.');
    const state = await connection.status();
    assert(state.collector, 409, 'Conectá tu cuenta de Mercado Pago para consultar el historial.');
    const account = await connection.credentials();
    assert(
      account.token && account.collector === state.collector,
      409,
      'La conexión cambió. Volvé a cargar el historial.',
    );
    const limit = 20,
      offset = (query.page - 1) * limit;
    const search = new URLSearchParams({
      collector_id: account.collector,
      range: 'date_created',
      begin_date: new Date(begin).toISOString(),
      end_date: new Date(end).toISOString(),
      sort: 'date_created',
      criteria: 'desc',
      limit: String(limit),
      offset: String(offset),
    });
    if (query.status !== 'all') search.set('status', query.status);
    const response = await fetcher('https://api.mercadopago.com/v1/payments/search?' + search, {
      headers: { Authorization: 'Bearer ' + account.token },
      signal: AbortSignal.timeout(12000),
    });
    assert(
      response.ok,
      response.status === 401 || response.status === 403 ? 409 : 502,
      response.status === 401 || response.status === 403
        ? 'Revisá la autorización de Mercado Pago para acceder al historial.'
        : 'No pudimos consultar el historial de Mercado Pago. Intentá nuevamente.',
    );
    const payload = await response.json();
    assert(
      Array.isArray(payload.results) &&
        payload.results.length <= limit &&
        Number.isSafeInteger(payload.paging?.total) &&
        payload.paging.total >= 0,
      502,
      'Mercado Pago devolvió un historial inválido.',
    );
    const payments = [];
    for (const value of payload.results) {
      // Never return another seller's payment, even if a provider response is inconsistent.
      assert(
        String(value.collector_id) === account.collector && value.live_mode === account.live,
        502,
        'El historial recibido no corresponde a esta cuenta o ambiente.',
      );
      assert(
        /^\d+$/.test(String(value.id)) &&
          Number.isFinite(value.transaction_amount) &&
          value.transaction_amount >= 0 &&
          /^[A-Z]{3}$/.test(value.currency_id || '') &&
          Number.isFinite(Date.parse(value.date_created)) &&
          (!value.date_approved || Number.isFinite(Date.parse(value.date_approved))),
        502,
        'El historial contiene un importe o fecha inválidos.',
      );
      const order =
        typeof value.external_reference === 'string'
          ? await db
              .prepare('SELECT id FROM orders WHERE id=? AND payment_id=?')
              .get(value.external_reference, String(value.id))
          : null;
      payments.push({
        id: String(value.id),
        created: value.date_created,
        approved: value.date_approved || null,
        status: String(value.status || ''),
        statusDetail: String(value.status_detail || ''),
        amount: value.transaction_amount,
        currency: value.currency_id,
        refunded: Number.isFinite(value.transaction_amount_refunded)
          ? value.transaction_amount_refunded
          : 0,
        description: typeof value.description === 'string' ? value.description.slice(0, 500) : '',
        method: String(value.payment_method_id || ''),
        installments: Number.isSafeInteger(value.installments) ? value.installments : null,
        orderId: order?.id || null,
      });
    }
    res.json({
      payments,
      total: payload.paging.total,
      page: query.page,
      pages: Math.ceil(payload.paging.total / limit),
      fetchedAt: Date.now(),
      live: account.live,
    });
  });
  return router;
}
