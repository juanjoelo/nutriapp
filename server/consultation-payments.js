import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assert } from './errors.js';
import { transaction } from './database.js';
import { tokenHash } from './auth.js';
import { paymentSecrets, paymentKeyReady } from './payment-secrets.js';
import { bookingMarket, marketPrice, setBookingReturnCookie } from './booking-market.js';
import { createPayPal } from './integrations/paypal.js';
import { confirmPaidAppointments, bookingHoldMs } from './booking-payment-state.js';
import { verifyWebhook } from './integrations/mercadopago.js';

const token = z.string().regex(/^[a-f0-9]{64}$/);
const country = z.string().regex(/^[A-Z]{2}$/);
const emptyPrex = { enabled: false, holder: '', account: '', instructions: '' };
const prexSchema = z
  .object({
    enabled: z.boolean(),
    holder: z.string().trim().max(120),
    account: z
      .string()
      .trim()
      .max(40)
      .regex(/^[0-9 -]*$/),
    instructions: z.string().trim().max(600),
  })
  .strict()
  .refine(
    (v) => !v.enabled || (v.holder.length >= 3 && v.account.replace(/\D/g, '').length >= 4),
    'Ingresá el titular y número de cuenta Prex Argentina.',
  );
const paypalSchema = z
  .object({
    clientId: z.string().trim().min(10).max(256),
    secret: z.string().trim().min(10).max(256),
    merchant: z.string().regex(/^[A-Z0-9]{10,20}$/),
    live: z.boolean(),
  })
  .strict();
const publicCharge = (row) =>
  row
    ? {
        id: row.id,
        provider: row.provider,
        country: row.country,
        currency: row.currency,
        amount: row.amount,
        status: row.status,
        url: row.checkout_url,
        created: row.created,
        updated: row.updated,
        reference: row.reference,
        live: Boolean(row.live),
        instructions: row.provider === 'prex' ? JSON.parse(row.receiver) : null,
      }
    : null;

export function consultationPaymentRoutes(
  db,
  config,
  ownerOnly,
  notifications,
  fetcher = fetch,
  autoMail = true,
  { mp, inspection = false } = {},
) {
  const router = Router(),
    secrets = paymentSecrets(config),
    paypal = createPayPal(fetcher);
  const drain = () => {
    if (autoMail) void notifications.drain().catch(() => {});
  };
  const getPrex = async () =>
    JSON.parse(
      (await db.prepare('SELECT data FROM international_payment_settings WHERE id=1').get())
        ?.data || JSON.stringify(emptyPrex),
    );
  const getAccount = async () =>
    db.prepare('SELECT * FROM paypal_accounts WHERE id=1 AND owner_email=?').get(config.ownerEmail);
  async function accountState() {
    const saved = await getAccount();
    let ready = false;
    try {
      ready = Boolean(saved?.verified && secrets.open(saved.encrypted).clientId);
    } catch {
      /* Key unavailable. */
    }
    return {
      connected: ready,
      merchant: saved?.merchant || '',
      live: Boolean(saved?.live),
      verifiedAt: saved?.verified || null,
      canConnect: paymentKeyReady(config) && config.appUrl.startsWith('https://'),
    };
  }
  async function accountFor(row) {
    const saved = await getAccount();
    assert(
      saved && saved.verified && saved.merchant === row.receiver && saved.live === row.live,
      409,
      'La cuenta PayPal cambió o requiere verificación.',
    );
    return {
      ...secrets.open(saved.encrypted),
      merchant: saved.merchant,
      live: Boolean(saved.live),
    };
  }
  async function packFromToken(value) {
    const row = await db
      .prepare('SELECT * FROM booking_packages WHERE token_hash=?')
      .get(tokenHash(token.parse(value)));
    assert(row, 404, 'No encontramos esta reserva. Abrí tu enlace privado.');
    return row;
  }
  const chargeFor = async (id) =>
    db.prepare('SELECT * FROM consultation_payments WHERE package_id=?').get(id);
  async function options(pack, selected) {
    const service = JSON.parse(pack.service),
      methods = [];
    if (
      service.paymentRequired &&
      pack.payment_status !== 'paid' &&
      !(await db
        .prepare(
          "SELECT id FROM appointments WHERE package_id=? AND status='pending_payment' AND created>? AND starts>?",
        )
        .get(pack.id, Date.now() - bookingHoldMs, Date.now()))
    )
      return methods;
    if (pack.payment_status !== 'paid' && service.priceCents > 0) {
      if (inspection && !config.production && selected === 'AR')
        methods.push({
          id: 'inspection',
          name: 'Simular pago aprobado · sin dinero real',
          currency: 'ARS',
          amount: service.priceCents,
        });
      else if (selected === 'AR') {
        let account;
        try {
          account = await mp?.account();
        } catch {
          /* Connection unavailable. */
        }
        if (
          account?.token &&
          account.collector &&
          config.mp.secret &&
          config.appUrl.startsWith('https://') &&
          (!config.production || config.mp.live)
        )
          methods.push({
            id: 'mercadopago',
            name: 'Mercado Pago',
            currency: 'ARS',
            amount: service.priceCents,
            live: config.mp.live,
          });
      }
    }
    if (service.online && pack.payment_status !== 'paid') {
      const state = await accountState(),
        prex = await getPrex();
      if (selected === 'UY' && prex.enabled && service.priceCents > 0 && service.uyuPriceCents > 0)
        methods.push({
          id: 'prex',
          name: 'Prex Uruguay → Prex Argentina',
          currency: 'ARS',
          amount: service.priceCents,
        });
      if (
        selected &&
        !['AR', 'UY'].includes(selected) &&
        state.connected &&
        state.canConnect &&
        (!config.production || state.live) &&
        service.usdPriceCents > 0
      )
        methods.push({
          id: 'paypal',
          name: 'PayPal',
          currency: 'USD',
          amount: service.usdPriceCents,
          live: state.live,
        });
    }
    return methods;
  }
  async function applyStatus(row, status, reference = '', providerUpdated = null) {
    return transaction(db, async () => {
      const current = await db
        .prepare('SELECT * FROM consultation_payments WHERE id=?')
        .get(row.id);
      if (row.provider === 'prex')
        assert(current.status === 'pending', 409, 'La transferencia ya fue procesada.');
      if (row.provider === 'mercadopago') {
        if (current.provider_id && current.provider_id !== reference) {
          assert(
            status !== 'paid',
            409,
            'Hay un pago adicional. Contactá a Vanina para revisarlo.',
          );
          return current;
        }
        if (current.provider_id && current.updated > providerUpdated) return current;
        if (['paid', 'refunded'].includes(status))
          await db
            .prepare('UPDATE consultation_payments SET provider_id=? WHERE id=?')
            .run(reference, row.id);
      }
      // A stale pending response must not undo a verified receipt or refund.
      if (status === 'pending' && ['paid', 'refunded'].includes(current.status)) return current;
      if (current.status === 'refunded' && status === 'paid') return current;
      await db
        .prepare('UPDATE consultation_payments SET status=?,updated=?,reference=? WHERE id=?')
        .run(status, providerUpdated ?? Date.now(), reference || current.reference, row.id);
      if (['paid', 'refunded'].includes(status))
        await db
          .prepare('UPDATE booking_packages SET payment_status=? WHERE id=?')
          .run(status, row.package_id);
      if (status === 'paid') await confirmPaidAppointments(db, row.package_id);
      if (
        status !== current.status &&
        ['paid', 'refunded'].includes(status) &&
        row.provider !== 'inspection'
      ) {
        const pack = await db
            .prepare('SELECT * FROM booking_packages WHERE id=?')
            .get(row.package_id),
          customer = JSON.parse(pack.customer);
        for (const [index, to] of [customer.email, config.ownerEmail].entries()) {
          if (!to) continue;
          const id = 'consultation-' + row.id + '-' + status + '-' + index;
          await db
            .prepare('INSERT OR IGNORE INTO booking_notifications(id,message) VALUES(?,?)')
            .run(
              id,
              JSON.stringify({
                to,
                subject:
                  (status === 'paid' ? 'Pago registrado' : 'Revisamos tu pago') +
                  ' · Vanina Alaniz',
                messageId: '<' + id + '@' + new URL(config.appUrl).hostname + '>',
                text:
                  customer.name +
                  '\n' +
                  JSON.parse(pack.service).name +
                  '\n' +
                  (row.amount / 100).toFixed(2) +
                  ' ' +
                  row.currency +
                  ' · ' +
                  row.provider +
                  '\nEstado: ' +
                  (status === 'paid' ? 'Pagado' : 'Reembolso total o parcial; contactá a Vanina.'),
              }),
            );
        }
      }
      return db.prepare('SELECT * FROM consultation_payments WHERE id=?').get(row.id);
    });
  }
  const marketFor = (req) => bookingMarket(req, config, inspection);
  async function quote(service, market) {
    const amount = marketPrice(service, market);
    const methods = await options(
      {
        service: JSON.stringify({ ...service, paymentRequired: false }),
        payment_status: 'pending',
      },
      market.country,
    );
    const method = methods[0];
    return {
      available: Boolean(market.country && amount && method),
      currency: market.currency,
      amount,
      provider: method?.id || market.provider,
      indicative: market.country === 'UY',
      reason: !market.country
        ? 'No pudimos identificar tu país. Contactá a Vanina para coordinar el pago.'
        : !amount
          ? 'Próximamente · falta definir el precio para tu país.'
          : !method
            ? 'Los pagos para este servicio todavía no están habilitados. Contactá a Vanina.'
            : null,
    };
  }
  router.get('/payments/country', (req, res) => res.json(marketFor(req)));
  router.get('/admin/payments/international', ownerOnly, async (_req, res) =>
    res.json({
      paypal: await accountState(),
      prex: await getPrex(),
      geoConfigured: Boolean(config.geo?.edgeKey?.length >= 32),
    }),
  );
  router.put('/admin/payments/prex', ownerOnly, async (req, res) => {
    const value = prexSchema.parse(req.body);
    await db
      .prepare(
        'INSERT INTO international_payment_settings VALUES(1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
      )
      .run(JSON.stringify(value));
    res.json(value);
  });
  router.post('/admin/payments/paypal/connect', ownerOnly, async (req, res) => {
    assert(
      paymentKeyReady(config) && config.appUrl.startsWith('https://'),
      503,
      'Falta habilitar HTTPS y el cifrado de pagos en el servidor.',
    );
    const value = paypalSchema.parse(req.body);
    await paypal.verify(value);
    await transaction(db, async () => {
      const old = await getAccount();
      if (!old || old.merchant !== value.merchant || Boolean(old.live) !== value.live) {
        const existing = await db
          .prepare(
            "SELECT id FROM consultation_payments WHERE provider='paypal' AND live=1 LIMIT 1",
          )
          .get();
        assert(
          !existing,
          409,
          'Hay pagos vinculados a esta cuenta. Conservá la cuenta y el ambiente para poder verificarlos.',
        );
      }
      await db
        .prepare(
          'INSERT INTO paypal_accounts VALUES(1,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET owner_email=excluded.owner_email,merchant=excluded.merchant,encrypted=excluded.encrypted,live=excluded.live,verified=excluded.verified',
        )
        .run(
          config.ownerEmail,
          value.merchant,
          secrets.seal({ clientId: value.clientId, secret: value.secret }),
          value.live ? 1 : 0,
          Date.now(),
        );
    });
    res.json(await accountState());
  });
  router.post('/admin/payments/paypal/verify', ownerOnly, async (_req, res) => {
    const saved = await getAccount();
    assert(saved, 409, 'Conectá PayPal primero.');
    try {
      await paypal.verify({ ...secrets.open(saved.encrypted), live: Boolean(saved.live) });
    } catch (error) {
      await db
        .prepare('UPDATE paypal_accounts SET verified=0 WHERE id=1 AND encrypted=?')
        .run(saved.encrypted);
      throw error;
    }
    await db
      .prepare('UPDATE paypal_accounts SET verified=? WHERE id=1 AND encrypted=?')
      .run(Date.now(), saved.encrypted);
    res.json(await accountState());
  });
  router.delete('/admin/payments/paypal', ownerOnly, async (_req, res) => {
    await transaction(db, async () => {
      assert(
        !(await db
          .prepare("SELECT id FROM consultation_payments WHERE provider='paypal' LIMIT 1")
          .get()),
        409,
        'Hay pagos vinculados. Conservá esta conexión para verificarlos.',
      );
      await db.exec('DELETE FROM paypal_accounts');
    });
    res.status(204).end();
  });
  router.post('/bookings/payments/options', async (req, res) => {
    const input = z
      .object({ token, country: country.nullable().optional() })
      .strict()
      .parse(req.body);
    const pack = await packFromToken(input.token),
      service = JSON.parse(pack.service);
    const market = service.paymentMarket || marketFor(req);
    res.json({
      market,
      quote: await quote(service, market),
      methods: await options(pack, market.country),
      payment: publicCharge(await chargeFor(pack.id)),
      paid: pack.payment_status === 'paid',
    });
  });
  async function start(pack, market, requestedProvider) {
    market = JSON.parse(pack.service).paymentMarket || market;
    const existingCharge = await chargeFor(pack.id);
    const method = (await options(pack, market.country))[0];
    const provider = existingCharge?.provider || method?.id;
    if (requestedProvider === 'inspection')
      assert(
        inspection && !config.production,
        403,
        'La simulación solo está disponible en inspección local.',
      );
    assert(
      !requestedProvider || requestedProvider === provider,
      409,
      'El medio de pago se determina automáticamente para esta reserva.',
    );
    assert(
      provider,
      409,
      (await quote(JSON.parse(pack.service), market)).reason ||
        'El plazo para pagar venció. Volvé a la agenda.',
    );
    const input = { provider, country: existingCharge?.country || market.country };
    let charge = await transaction(db, async () => {
      const fresh = await db
        .prepare('SELECT payment_status FROM booking_packages WHERE id=?')
        .get(pack.id);
      assert(fresh.payment_status !== 'paid', 409, 'Este pack ya tiene un pago registrado.');
      if (JSON.parse(pack.service).paymentRequired) {
        const hold = await db
          .prepare(
            "SELECT id FROM appointments WHERE package_id=? AND status='pending_payment' AND created>? AND starts>? ",
          )
          .get(pack.id, Date.now() - bookingHoldMs, Date.now());
        assert(hold, 409, 'El plazo para pagar venció. Volvé a la agenda y elegí un horario.');
      }
      const existing = await chargeFor(pack.id);
      if (existing) {
        assert(
          existing.provider === input.provider,
          409,
          'Ya hay un pago iniciado para este pack. Contactá a Vanina antes de cambiar de medio.',
        );
        return existing;
      }
      const method = (await options(pack, input.country)).find((m) => m.id === input.provider);
      assert(method, 409, 'Este medio no está disponible para el país y el precio del pack.');
      const account = input.provider === 'paypal' ? await getAccount() : null;
      const receiver =
        input.provider === 'mercadopago'
          ? (await mp.account()).collector
          : account?.merchant || JSON.stringify(await getPrex());
      const id = randomUUID(),
        now = Date.now();
      await db
        .prepare(
          'INSERT INTO consultation_payments(id,package_id,provider,country,currency,amount,receiver,status,created,updated,live) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          id,
          pack.id,
          input.provider,
          input.country,
          method.currency,
          method.amount,
          receiver,
          'pending',
          now,
          now,
          input.provider === 'mercadopago' ? Number(config.mp.live) : account?.live || 0,
        );
      return db.prepare('SELECT * FROM consultation_payments WHERE id=?').get(id);
    });
    if (charge.provider === 'inspection') {
      charge = {
        ...charge,
        checkout_url: config.appUrl + '/turnos/pago-prueba?booking=' + pack.id,
      };
    }
    if (charge.provider === 'mercadopago' && !charge.checkout_url) {
      const url = await mp.createConsultationCheckout(charge, pack);
      await db
        .prepare(
          'UPDATE consultation_payments SET checkout_url=? WHERE id=? AND checkout_url IS NULL',
        )
        .run(url, charge.id);
      charge = await chargeFor(pack.id);
    }
    if (charge.provider === 'paypal' && !charge.provider_id) {
      // Keep the same idempotency key; never silently create a second order after its retention window.
      assert(
        charge.created > Date.now() - 5 * 3600000,
        409,
        'Este intento requiere revisión de Vanina antes de crear otro cobro.',
      );
      const result = await paypal.create(await accountFor(charge), charge, config.appUrl);
      await db
        .prepare(
          'UPDATE consultation_payments SET provider_id=?,checkout_url=? WHERE id=? AND provider_id IS NULL',
        )
        .run(result.id, result.url, charge.id);
      charge = await chargeFor(pack.id);
    }
    return publicCharge(charge);
  }
  router.checkout = { market: marketFor, quote, start };
  router.post('/bookings/payments/start', async (req, res) => {
    const input = z
      .object({
        token,
        country: country.optional(),
        provider: z.enum(['paypal', 'prex', 'mercadopago', 'inspection']).optional(),
      })
      .strict()
      .parse(req.body);
    const pack = await packFromToken(input.token);
    setBookingReturnCookie(res, config, pack.id, input.token);
    res.json(await start(pack, marketFor(req), input.provider));
  });
  async function returnPack(req) {
    const id = z.string().uuid().parse(req.body.booking);
    const name = 'vanina_booking_return_' + id + '=';
    const value = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith(name))
      ?.slice(name.length);
    assert(
      value && /^[a-f0-9]{64}$/.test(value),
      401,
      'Abrí tu enlace privado en el navegador donde iniciaste el pago.',
    );
    const pack = await packFromToken(value);
    assert(pack.id === id, 403, 'La reserva no coincide.');
    return { pack, token: value };
  }
  router.post('/bookings/payment-return', async (req, res) => {
    const result = await returnPack(req);
    let charge = await chargeFor(result.pack.id);
    let verificationError = null;
    if (['mercadopago', 'paypal'].includes(charge?.provider)) {
      try {
        charge = await verifyCharge(charge);
      } catch {
        verificationError =
          'No pudimos verificar el pago todavía. No vuelvas a pagar; revisalo desde tu reserva.';
      }
    }
    res.json({ token: result.token, payment: publicCharge(charge), verificationError });
    drain();
  });
  router.post('/bookings/payment-return/simulate', async (req, res) => {
    assert(inspection && !config.production, 404, 'No disponible.');
    const result = await returnPack(req),
      charge = await chargeFor(result.pack.id);
    assert(charge?.provider === 'inspection', 409, 'No corresponde a un pago de prueba.');
    res.json({
      token: result.token,
      payment: publicCharge(await applyStatus(charge, 'paid', 'LOCAL-SIMULATED')),
    });
  });
  async function verifyCharge(row) {
    if (row?.provider === 'mercadopago') {
      if (row.provider_id) return applyMercadoPago(row, await mp.getPayment(row.provider_id));
      const payments = await mp.consultationPayments(row.id);
      const payment = payments.find((p) => p.status === 'approved') || payments[0];
      return payment ? applyMercadoPago(row, payment) : row;
    }
    assert(
      row?.provider === 'paypal',
      409,
      'Esta transferencia se confirma manualmente desde el panel.',
    );
    return applyStatus(row, await paypal.inspect(await accountFor(row), row));
  }
  async function applyMercadoPago(row, payment) {
    const account = await mp.account();
    assert(
      payment.external_reference === row.id &&
        payment.currency_id === row.currency &&
        Math.round(payment.transaction_amount * 100) === row.amount &&
        String(payment.collector_id) === row.receiver &&
        row.receiver === account.collector &&
        payment.live_mode === Boolean(row.live) &&
        Boolean(row.live) === config.mp.live &&
        /^\d+$/.test(String(payment.id)),
      400,
      'El pago no coincide con la consulta.',
    );
    const updated = Date.parse(payment.date_last_updated);
    assert(Number.isFinite(updated), 400, 'Falta la fecha de actualización del pago.');
    const status =
      Number(payment.transaction_amount_refunded) > 0 ||
      ['refunded', 'charged_back'].includes(payment.status)
        ? 'refunded'
        : payment.status === 'approved'
          ? 'paid'
          : 'pending';
    return applyStatus(row, status, String(payment.id), updated);
  }
  router.post('/webhooks/mercadopago/consultations', async (req, res) => {
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
    assert(String(payment.id) === id, 400, 'Pago inválido.');
    const row = await db
      .prepare("SELECT * FROM consultation_payments WHERE id=? AND provider='mercadopago'")
      .get(payment.external_reference);
    if (row) await applyMercadoPago(row, payment);
    res.sendStatus(200);
    drain();
  });
  router.post('/bookings/payments/verify', async (req, res) => {
    const input = z.object({ token }).strict().parse(req.body),
      pack = await packFromToken(input.token);
    res.json(publicCharge(await verifyCharge(await chargeFor(pack.id))));
    drain();
  });
  router.get('/admin/payments/consultations', ownerOnly, async (req, res) => {
    const page = z.coerce.number().int().min(1).max(10000).default(1).parse(req.query.page),
      limit = 20;
    const total = (await db.prepare('SELECT count(*) AS n FROM consultation_payments').get()).n;
    const rows = await db
      .prepare(
        'SELECT p.*,b.customer,b.service FROM consultation_payments p JOIN booking_packages b ON b.id=p.package_id ORDER BY p.created DESC,p.id LIMIT ? OFFSET ?',
      )
      .all(limit, (page - 1) * limit);
    res.json({
      total,
      page,
      pages: Math.ceil(total / limit),
      payments: rows.map((row) => ({
        ...publicCharge(row),
        customer: JSON.parse(row.customer).name,
        service: JSON.parse(row.service).name,
      })),
    });
  });
  router.post('/admin/payments/consultations/:id/verify', ownerOnly, async (req, res) => {
    const row = await db
      .prepare('SELECT * FROM consultation_payments WHERE id=?')
      .get(z.string().uuid().parse(req.params.id));
    res.json(publicCharge(await verifyCharge(row)));
    drain();
  });
  router.post('/admin/payments/consultations/:id/confirm-prex', ownerOnly, async (req, res) => {
    const input = z
      .object({ reference: z.string().trim().min(3).max(120), received: z.literal(true) })
      .strict()
      .parse(req.body);
    const row = await db
      .prepare('SELECT * FROM consultation_payments WHERE id=?')
      .get(z.string().uuid().parse(req.params.id));
    assert(
      row?.provider === 'prex' && row.status === 'pending',
      409,
      'La transferencia ya fue procesada o no corresponde a Prex.',
    );
    res.json(publicCharge(await applyStatus(row, 'paid', input.reference)));
    drain();
  });
  return router;
}
