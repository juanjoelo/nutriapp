import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import path from 'node:path';
import { ZodError } from 'zod';
import { fileURLToPath } from 'node:url';
import { connectDatabase } from './connection.js';
import { authRoutes, ownerMiddleware, syncOwner } from './auth.js';
import { catalogRoutes } from './catalog.js';
import { merchandisingRoutes } from './merchandising.js';
import { historyRoutes } from './merchandising-history.js';
import { commerceRoutes } from './commerce.js';
import { adminRoutes } from './admin.js';
import { createMailer, createNotificationService } from './integrations/mail.js';
import { createCorreo } from './integrations/correo.js';
import { createMercadoPago } from './integrations/mercadopago.js';
import { assert } from './errors.js';
import { createStorage } from './storage.js';
import { createPaymentConnection } from './payment-connection.js';
import { paymentHistoryRoutes } from './payment-history.js';
import { consultationPaymentRoutes } from './consultation-payments.js';
import { initializeBookings, bookingRoutes } from './bookings.js';
export async function createApp(config, overrides = {}) {
  const db = overrides.db || (await connectDatabase(config));
  await syncOwner(db, config);
  await initializeBookings(db);
  const mail = overrides.mail || createMailer(config);
  const notifications = createNotificationService(db, config, mail);
  const ownerOnly = ownerMiddleware(db, config);
  const connection = createPaymentConnection(db, config, overrides.paymentFetch);
  const mp = overrides.mp || createMercadoPago(config, fetch, connection);
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: config.production
        ? {
            directives: {
              imgSrc: [
                "'self'",
                'data:',
                ...(config.storage.provider === 'supabase'
                  ? [new URL(config.storage.url).origin]
                  : []),
              ],
            },
          }
        : false,
      strictTransportSecurity: config.production ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  app.use(
    express.json({
      limit: '32kb',
    }),
  );
  app.use('/api', (req, _res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !['/webhooks/mercadopago', '/webhooks/mercadopago/consultations'].includes(req.path)
    ) {
      assert(
        req.get('origin') === new URL(config.appUrl).origin && req.get('x-store-request') === '1',
        403,
        'Origen de solicitud no permitido.',
      );
    }
    next();
  });
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: overrides.apiRateLimit || 180,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      skip: (req) => req.path === '/webhooks/mercadopago',
      message: {
        error: 'Demasiadas solicitudes. Intentá de nuevo en un minuto.',
      },
    }),
  );
  app.get('/api/health', (_req, res) =>
    res.json({
      ok: true,
    }),
  );
  app.use('/api/auth', authRoutes(db, config, mail, ownerOnly, overrides.authRateLimit));
  app.use('/api', connection.routes(ownerOnly));
  app.use('/api', paymentHistoryRoutes(db, connection, ownerOnly, overrides.paymentHistoryFetch));
  const consultationPayments = consultationPaymentRoutes(
    db,
    config,
    ownerOnly,
    notifications,
    overrides.paypalFetch,
    !overrides.disableAutoMail,
    { mp, inspection: overrides.inspectionPayments === true && !config.production },
  );
  app.use('/api', consultationPayments);
  app.use(
    '/api',
    bookingRoutes(
      db,
      config,
      ownerOnly,
      notifications,
      !overrides.disableAutoMail,
      consultationPayments.checkout,
    ),
  );
  app.use('/api', catalogRoutes(db, config, ownerOnly));
  app.use('/api', merchandisingRoutes(db, config, ownerOnly));
  app.use('/api/admin/merchandising/history', historyRoutes(db, ownerOnly));
  app.use(
    '/api',
    commerceRoutes(db, config, {
      correo: overrides.correo || createCorreo(config),
      mp,
      notifications: overrides.disableAutoMail ? null : notifications,
    }),
  );
  app.use(
    '/api/admin',
    adminRoutes(db, config, ownerOnly, notifications, !overrides.disableAutoMail, connection),
  );
  app.use('/api', (_req, res) =>
    res.status(404).json({
      error: 'Recurso no encontrado.',
    }),
  );
  if (config.storage.provider === 'supabase')
    app.get('/uploads/:filename', (req, res) => {
      const url = createStorage(config).publicUrl(req.params.filename);
      if (!url) return res.sendStatus(404);
      res.redirect(302, url);
    });
  app.use(
    '/uploads',
    express.static(path.join(config.dataDir, 'uploads'), {
      dotfiles: 'deny',
      immutable: true,
      maxAge: '1y',
    }),
  );
  const dist = fileURLToPath(new URL('../dist/', import.meta.url));
  app.use(express.static(dist));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError)
      return res.status(400).json({
        error: 'Revisá los datos ingresados.',
        fields: error.issues.map((i) => ({
          field: i.path.join('.'),
          message: i.message,
        })),
      });
    if (error.code === 'LIMIT_FILE_SIZE')
      return res.status(400).json({
        error: 'La foto debe pesar menos de 5 MB.',
      });
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({
        error: 'Formato de solicitud inválido.',
      });
    const status = error.status >= 400 && error.status <= 599 ? error.status : 500;
    if (status === 500) console.error('Request failed:', error.name); // No payloads, credentials or buyer data.
    res.status(status).json({
      error:
        status === 500 ? 'No pudimos completar la operación. Intentá nuevamente.' : error.message,
    });
  });
  return {
    app,
    db,
    notifications,
  };
}
