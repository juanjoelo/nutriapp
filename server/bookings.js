import { Router } from 'express';
import { randomBytes, randomUUID } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { assert } from './errors.js';
import { tokenHash } from './auth.js';
import { transaction } from './database.js';
import { setBookingReturnCookie } from './booking-market.js';
import {
  bookingHoldMs,
  occupiedAppointments,
  appointmentView,
  confirmPaidAppointments,
} from './booking-payment-state.js';

const dayMs = 86400000;
export const bookingDate = (time) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(time);
const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      Number.isFinite(Date.parse(s + 'T12:00:00Z')) &&
      new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s,
  );
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const intervalSchema = z
  .object({ start: timeSchema, end: timeSchema })
  .refine((v) => v.start < v.end, 'Revisá el horario.');
const settingsSchema = z
  .object({
    enabled: z.boolean(),
    location: z.string().trim().max(250),
    noticeHours: z.number().int().min(1).max(168),
    horizonDays: z.number().int().min(7).max(180),
    cancellationHours: z.number().int().min(1).max(168),
    weekly: z
      .array(
        z.object({
          day: z.number().int().min(0).max(6),
          intervals: z.array(intervalSchema).max(3),
        }),
      )
      .length(7),
  })
  .strict()
  .refine((v) => new Set(v.weekly.map((d) => d.day)).size === 7, 'Los días no pueden repetirse.')
  .refine(
    (v) =>
      v.weekly.every((d) => {
        const list = [...d.intervals].sort((a, b) => a.start.localeCompare(b.start));
        return list.every((i, n) => n === 0 || list[n - 1].end <= i.start);
      }),
    'Los horarios no pueden superponerse.',
  );
const serviceSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(1200),
    duration: z.number().int().min(15).max(180).multipleOf(5),
    sessions: z.number().int().min(1).max(24),
    priceCents: z.number().int().min(0).max(100000000).nullable(),
    online: z.boolean().default(false),
    usdPriceCents: z.number().int().min(1).max(100000000).nullable().default(null),
    uyuPriceCents: z.number().int().min(1).max(100000000).nullable().default(null),
    active: z.boolean(),
  })
  .strict();
const customerSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    email: z
      .email()
      .max(200)
      .transform((s) => s.toLowerCase()),
    phone: z.string().trim().min(6).max(40),
  })
  .strict();
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const timestampSchema = z.number().int().min(0).max(4102444800000);
const defaults = {
  enabled: false,
  location: '',
  noticeHours: 2,
  horizonDays: 60,
  cancellationHours: 24,
  weekly: Array.from({ length: 7 }, (_, day) => ({ day, intervals: [] })),
};

export async function initializeBookings(db) {
  await transaction(db, async () => {
    const exists = await db.prepare('SELECT id FROM booking_settings WHERE id=1').get();
    if (exists) return;
    await db.prepare('INSERT INTO booking_settings VALUES(1,?)').run(JSON.stringify(defaults));
    for (const [name, sessions] of [
      ['Pack de tratamiento · 3 consultas iniciales', 3],
      ['Consulta de control', 1],
      ['Pack de seguimiento', null],
    ])
      await db.prepare('INSERT INTO booking_services VALUES(?,?)').run(
        randomUUID(),
        JSON.stringify({
          name,
          description:
            name === 'Pack de seguimiento'
              ? 'Configurá la cantidad de consultas antes de publicarlo.'
              : '',
          duration: 30,
          sessions,
          priceCents: null,
          active: false,
        }),
      );
  });
}
async function settings(db) {
  return JSON.parse((await db.prepare('SELECT data FROM booking_settings WHERE id=1').get()).data);
}
async function services(db) {
  return (await db.prepare('SELECT * FROM booking_services ORDER BY id').all()).map((r) => ({
    id: r.id,
    ...JSON.parse(r.data),
  }));
}
const localTime = (date, time) => Date.parse(date + 'T' + time + ':00-03:00');
async function freeSlot(db, start, end, exclude = null) {
  const occupied = await db
    .prepare(
      `SELECT id FROM appointments WHERE ${occupiedAppointments} AND starts<? AND ends>? AND id<>?`,
    )
    .get(Date.now() - bookingHoldMs, end, start, exclude || '');
  const blocked = await db
    .prepare('SELECT id FROM booking_blocks WHERE starts<? AND ends>?')
    .get(end, start);
  return !occupied && !blocked;
}
async function slots(db, service, date, exclude = null) {
  const cfg = await settings(db);
  if (!cfg.enabled) return [];
  const now = Date.now(),
    day = new Date(date + 'T12:00:00Z').getUTCDay();
  if (date < bookingDate(now) || date > bookingDate(now + cfg.horizonDays * dayMs)) return [];
  const dayStart = localTime(date, '00:00'),
    dayEnd = dayStart + dayMs;
  const busy = await db
    .prepare(
      `SELECT starts,ends FROM appointments WHERE ${occupiedAppointments} AND starts<? AND ends>? AND id<>?`,
    )
    .all(Date.now() - bookingHoldMs, dayEnd, dayStart, exclude || '');
  busy.push(
    ...(await db
      .prepare('SELECT starts,ends FROM booking_blocks WHERE starts<? AND ends>?')
      .all(dayEnd, dayStart)),
  );
  const result = [];
  for (const interval of cfg.weekly.find((d) => d.day === day).intervals) {
    const finish = localTime(date, interval.end);
    for (
      let start = localTime(date, interval.start);
      start + service.duration * 60000 <= finish;
      start += service.duration * 60000
    )
      if (
        start >= now + cfg.noticeHours * 3600000 &&
        !busy.some((b) => b.starts < start + service.duration * 60000 && b.ends > start)
      )
        result.push(start);
  }
  return result;
}
async function packageFromToken(db, token) {
  const row = await db
    .prepare('SELECT * FROM booking_packages WHERE token_hash=?')
    .get(tokenHash(tokenSchema.parse(token)));
  assert(row, 404, 'No encontramos esta reserva. Revisá tu enlace privado.');
  return row;
}
async function packageView(db, row) {
  const appointments = (
    await db
      .prepare(
        'SELECT id,starts,ends,status,created FROM appointments WHERE package_id=? ORDER BY starts',
      )
      .all(row.id)
  ).map(appointmentView);
  const service = JSON.parse(row.service),
    cfg = await settings(db);
  return {
    id: row.id,
    service,
    customer: JSON.parse(row.customer),
    appointments,
    remaining: Math.max(
      0,
      service.sessions -
        appointments.filter((a) =>
          ['confirmed', 'completed', 'no_show', 'pending_payment'].includes(a.status),
        ).length,
    ),
    paymentStatus: row.payment_status,
    location: cfg.location,
    cancellationHours: cfg.cancellationHours,
  };
}
async function queueBookingMail(db, config, row, subject, token = null) {
  const view = await packageView(db, row);
  const when = (time) =>
    new Intl.DateTimeFormat('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(time);
  const text = [
    subject,
    view.customer.name,
    view.service.name,
    ...view.appointments.filter((a) => a.status === 'confirmed').map((a) => when(a.starts)),
    view.location,
    '',
    'Pago: se coordina con Vanina. La reserva no registra un cobro.',
    ...(token
      ? [
          config.appUrl + '/turnos/mi-reserva#' + token,
          'Conservá este enlace privado para ver o gestionar tus consultas, sin crear una cuenta.',
        ]
      : []),
  ].join('\n');
  for (const recipient of [view.customer.email, config.ownerEmail].filter(Boolean)) {
    const id = randomUUID();
    await db.prepare('INSERT INTO booking_notifications(id,message) VALUES(?,?)').run(
      id,
      JSON.stringify({
        to: recipient,
        subject: subject + ' · Vanina Alaniz',
        messageId: '<booking-' + id + '@' + new URL(config.appUrl).hostname + '>',
        text,
      }),
    );
  }
}
export async function drainBookingNotifications(db, mail) {
  for (const row of await db
    .prepare(
      'SELECT * FROM booking_notifications WHERE sent_at IS NULL AND next_attempt<=? LIMIT 10',
    )
    .all(Date.now())) {
    try {
      await mail.send(JSON.parse(row.message));
      await db
        .prepare('UPDATE booking_notifications SET sent_at=?,attempts=attempts+1 WHERE id=?')
        .run(Date.now(), row.id);
    } catch {
      await db
        .prepare('UPDATE booking_notifications SET attempts=attempts+1,next_attempt=? WHERE id=?')
        .run(Date.now() + Math.min(1440, 5 * 2 ** Math.min(row.attempts, 8)) * 60000, row.id);
    }
  }
}

export function bookingRoutes(db, config, ownerOnly, notifications, autoMail = true, payments) {
  const router = Router();
  const limit = rateLimit({
    windowMs: 3600000,
    limit: 12,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: 'Alcanzaste el límite de solicitudes. Intentá más tarde o contactá a Vanina.',
    },
  });
  const drain = () => {
    if (autoMail) void notifications.drain().catch(() => {});
  };
  router.get('/bookings/options', async (req, res) => {
    const cfg = await settings(db);
    const available = cfg.enabled ? (await services(db)).filter((s) => s.active) : [];
    const market = payments.market(req);
    res.json({
      settings: cfg,
      market,
      services: await Promise.all(
        available.map(async (s) => ({ ...s, checkout: await payments.quote(s, market) })),
      ),
    });
  });
  router.get('/bookings/slots', async (req, res) => {
    const date = dateSchema.parse(req.query.date),
      id = z.string().uuid().parse(req.query.serviceId);
    const service = (await services(db)).find((s) => s.id === id && s.active);
    assert(service, 404, 'Ese servicio no está disponible.');
    res.json({ slots: await slots(db, service, date) });
  });
  router.post('/bookings', limit, async (req, res) => {
    const input = z
      .object({
        serviceId: z.string().uuid(),
        starts: timestampSchema,
        customer: customerSchema,
        consent: z.literal(true),
        requestKey: z.string().uuid(),
        checkout: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    const token = randomBytes(32).toString('hex');
    const result = await transaction(db, async () => {
      const duplicate = await db
        .prepare('SELECT id FROM booking_packages WHERE request_key=?')
        .get(input.requestKey);
      assert(
        !duplicate,
        409,
        'Esta solicitud ya fue procesada. Abrí el enlace privado de tu reserva.',
      );
      const service = (await services(db)).find((s) => s.id === input.serviceId && s.active);
      assert(service, 409, 'El servicio ya no está disponible.');
      const market = input.checkout ? payments.market(req) : null;
      if (market) {
        const quote = await payments.quote(service, market);
        assert(quote.available, 409, quote.reason);
      }
      assert(
        market || service.priceCents > 0,
        409,
        'Este servicio todavía no tiene un precio configurado para reservar. Contactá a Vanina.',
      );
      assert(
        (await slots(db, service, bookingDate(input.starts))).includes(input.starts),
        409,
        'Ese horario ya no está disponible. Elegí otro.',
      );
      const id = randomUUID(),
        now = Date.now();
      await db
        .prepare(
          'INSERT INTO booking_packages(id,token_hash,request_key,service_id,service,customer,created) VALUES(?,?,?,?,?,?,?)',
        )
        .run(
          id,
          tokenHash(token),
          input.requestKey,
          service.id,
          JSON.stringify({
            ...service,
            paymentRequired: true,
            ...(market ? { paymentMarket: market } : {}),
          }),
          JSON.stringify(input.customer),
          now,
        );
      await db
        .prepare(
          "INSERT INTO appointments(id,package_id,starts,ends,created,status) VALUES(?,?,?,?,?,'pending_payment')",
        )
        .run(randomUUID(), id, input.starts, input.starts + service.duration * 60000, now);
      const row = await db.prepare('SELECT * FROM booking_packages WHERE id=?').get(id);
      return packageView(db, row);
    });
    setBookingReturnCookie(res, config, result.id, token);
    let payment = null,
      checkoutError = null;
    if (input.checkout) {
      try {
        payment = await payments.start(await packageFromToken(db, token), payments.market(req));
      } catch (error) {
        checkoutError = error.status
          ? error.message
          : 'No pudimos abrir el pago. Reintentá desde tu enlace privado.';
      }
    }
    res.status(201).json({ ...result, token, payment, checkoutError });
    drain();
  });
  // Tokens travel in POST bodies, not URLs/query strings or browser storage.
  router.post('/bookings/manage', limit, async (req, res) =>
    res.json(await packageView(db, await packageFromToken(db, req.body.token))),
  );
  router.post('/bookings/manage/slots', async (req, res) => {
    const row = await packageFromToken(db, req.body.token),
      date = dateSchema.parse(req.body.date);
    const appointmentId = z.string().uuid().optional().parse(req.body.appointmentId);
    if (appointmentId)
      assert(
        await db
          .prepare('SELECT id FROM appointments WHERE id=? AND package_id=?')
          .get(appointmentId, row.id),
        404,
        'No encontramos ese turno.',
      );
    res.json({ slots: await slots(db, JSON.parse(row.service), date, appointmentId) });
  });
  router.post('/bookings/manage/change', limit, async (req, res) => {
    const input = z
      .object({
        token: tokenSchema,
        action: z.enum(['cancel', 'reschedule', 'next']),
        appointmentId: z.string().uuid().optional(),
        starts: timestampSchema.optional(),
      })
      .strict()
      .refine(
        (v) => v.action !== 'next' || !v.appointmentId,
        'No corresponde indicar un turno anterior para una nueva consulta.',
      )
      .parse(req.body);
    const result = await transaction(db, async () => {
      const row = await packageFromToken(db, input.token),
        cfg = await settings(db),
        service = JSON.parse(row.service);
      assert(
        !service.paymentRequired || row.payment_status === 'paid',
        409,
        'Completá el pago antes de gestionar las consultas del pack.',
      );
      const appointment = input.appointmentId
        ? await db
            .prepare('SELECT * FROM appointments WHERE id=? AND package_id=?')
            .get(input.appointmentId, row.id)
        : null;
      if (input.action !== 'next')
        assert(
          appointment?.status === 'confirmed' &&
            appointment.starts > Date.now() + cfg.cancellationHours * 3600000,
          409,
          'Para cambiar este turno contactá a Vanina. Está dentro del plazo de cancelación o ya fue atendido.',
        );
      if (input.action === 'cancel')
        await db
          .prepare("UPDATE appointments SET status='cancelled' WHERE id=?")
          .run(appointment.id);
      else {
        assert(Number.isSafeInteger(input.starts), 400, 'Elegí un horario.');
        if (input.action === 'next') {
          const view = await packageView(db, row);
          assert(view.remaining > 0, 409, 'Ya reservaste todas las consultas de este pack.');
        }
        assert(
          (await slots(db, service, bookingDate(input.starts), appointment?.id)).includes(
            input.starts,
          ),
          409,
          'Ese horario ya no está disponible.',
        );
        if (input.action === 'next')
          await db
            .prepare(
              'INSERT INTO appointments(id,package_id,starts,ends,created) VALUES(?,?,?,?,?)',
            )
            .run(
              randomUUID(),
              row.id,
              input.starts,
              input.starts + service.duration * 60000,
              Date.now(),
            );
        else
          await db
            .prepare('UPDATE appointments SET starts=?,ends=? WHERE id=?')
            .run(input.starts, input.starts + service.duration * 60000, appointment.id);
      }
      await queueBookingMail(
        db,
        config,
        row,
        input.action === 'cancel' ? 'Turno cancelado' : 'Reserva actualizada',
        input.token,
      );
      return packageView(db, row);
    });
    res.json(result);
    drain();
  });
  router.get('/admin/bookings/config', ownerOnly, async (_req, res) =>
    res.json({
      settings: await settings(db),
      services: await services(db),
      url: config.appUrl + '/turnos',
    }),
  );
  router.put('/admin/bookings/config', ownerOnly, async (req, res) => {
    const value = settingsSchema.parse(req.body);
    await transaction(db, () =>
      db.prepare('UPDATE booking_settings SET data=? WHERE id=1').run(JSON.stringify(value)),
    );
    res.json(value);
  });
  router.put('/admin/bookings/services/:id', ownerOnly, async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      value = serviceSchema.parse(req.body);
    await transaction(db, () =>
      db
        .prepare(
          'INSERT INTO booking_services VALUES(?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data',
        )
        .run(id, JSON.stringify(value)),
    );
    res.json({ id, ...value });
  });
  router.get('/admin/bookings', ownerOnly, async (req, res) => {
    const from = dateSchema.parse(req.query.from),
      to = dateSchema.parse(req.query.to);
    const start = localTime(from, '00:00'),
      end = localTime(to, '00:00') + dayMs;
    assert(end > start && end - start <= 185 * dayMs, 400, 'Elegí un período de hasta seis meses.');
    const all = await db
      .prepare(
        `SELECT a.*,p.service,p.customer,p.payment_status,p.id AS pack_id FROM appointments a JOIN booking_packages p ON p.id=a.package_id WHERE a.starts>=? AND a.starts<? ORDER BY a.starts`,
      )
      .all(start, end);
    res.json({
      appointments: all.map((a) => ({
        ...appointmentView(a),
        service: JSON.parse(a.service),
        customer: JSON.parse(a.customer),
      })),
      blocks: await db
        .prepare('SELECT * FROM booking_blocks WHERE starts<? AND ends>? ORDER BY starts')
        .all(end, start),
    });
  });
  router.post('/admin/bookings/blocks', ownerOnly, async (req, res) => {
    const value = z
      .object({
        starts: timestampSchema,
        ends: timestampSchema,
        reason: z.string().trim().max(200),
      })
      .strict()
      .parse(req.body);
    assert(
      value.starts < value.ends && value.ends - value.starts <= 185 * dayMs,
      400,
      'Revisá el período a bloquear.',
    );
    await transaction(db, async () => {
      assert(
        await freeSlot(db, value.starts, value.ends),
        409,
        'Hay una reserva o bloqueo en ese horario. Revisalo antes de bloquear.',
      );
      await db
        .prepare('INSERT INTO booking_blocks VALUES(?,?,?,?)')
        .run(randomUUID(), value.starts, value.ends, value.reason);
    });
    res.status(201).json({ ok: true });
  });
  router.delete('/admin/bookings/blocks/:id', ownerOnly, async (req, res) => {
    await db
      .prepare('DELETE FROM booking_blocks WHERE id=?')
      .run(z.string().uuid().parse(req.params.id));
    res.status(204).end();
  });
  router.patch('/admin/bookings/:id', ownerOnly, async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      input = z
        .object({ status: z.enum(['cancelled', 'completed', 'no_show']) })
        .strict()
        .parse(req.body);
    await transaction(db, async () => {
      const a = await db.prepare('SELECT * FROM appointments WHERE id=?').get(id);
      assert(
        a &&
          (a.status === 'confirmed' ||
            (input.status === 'cancelled' && a.status === 'pending_payment')),
        409,
        'El turno ya cambió. Actualizá la agenda.',
      );
      assert(
        input.status === 'cancelled' || a.starts <= Date.now(),
        409,
        'El turno todavía no comenzó.',
      );
      await db.prepare('UPDATE appointments SET status=? WHERE id=?').run(input.status, id);
      const row = await db.prepare('SELECT * FROM booking_packages WHERE id=?').get(a.package_id);
      if (input.status === 'cancelled')
        await queueBookingMail(
          db,
          config,
          row,
          'Vanina canceló tu turno. Contactanos para coordinar otra fecha.',
        );
    });
    res.json({ ok: true });
    drain();
  });
  router.patch('/admin/bookings/packages/:id/payment', ownerOnly, async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      value = z.enum(['pending', 'paid']).parse(req.body.status);
    await transaction(db, async () => {
      assert(
        !(await db.prepare('SELECT id FROM consultation_payments WHERE package_id=?').get(id)),
        409,
        'Este pack tiene un cobro vinculado. Revisalo desde Pagos.',
      );
      const changed = await db
        .prepare('UPDATE booking_packages SET payment_status=? WHERE id=?')
        .run(value, id);
      assert(changed.changes, 404, 'No encontramos ese pack.');
      if (value === 'paid') await confirmPaidAppointments(db, id);
    });
    res.json({ ok: true });
  });
  return router;
}
