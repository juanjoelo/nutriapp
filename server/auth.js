import { Router } from 'express';
import { randomBytes, createHash, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { credentialsSchema } from './validation.js';
import { assert } from './errors.js';
import { transaction } from './database.js';
const scrypt = promisify(scryptCallback);
export const tokenHash = (token) => createHash('sha256').update(token).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64);
  return salt + ':' + key.toString('hex');
}
async function verifyPassword(password, encoded) {
  const [salt, key] = (encoded || 'invalid:' + '0'.repeat(128)).split(':');
  const derived = await scrypt(password, salt, 64);
  return timingSafeEqual(derived, Buffer.from(key, 'hex'));
}
export async function syncOwner(db, config) {
  const current = await db.prepare('SELECT * FROM owner WHERE id=1').get();
  if (current?.email !== config.ownerEmail)
    await transaction(db, async () => {
      await db.exec(
        'DELETE FROM sessions; DELETE FROM resets; DELETE FROM owner; DELETE FROM payment_oauth_states; DELETE FROM payment_accounts;',
      );
      if (config.ownerEmail)
        await db.prepare('INSERT INTO owner(id,email) VALUES(1,?)').run(config.ownerEmail);
    });
}
export function ownerMiddleware(db, config) {
  return async (req, res, next) => {
    const token = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('vanina_session='))
      ?.slice(15);
    const session =
      token &&
      /^[a-f0-9]{64}$/.test(token) &&
      (await db
        .prepare('SELECT * FROM sessions WHERE hash=? AND expires>?')
        .get(tokenHash(token), Date.now()));
    assert(session && config.ownerEmail, 401, 'Ingresá a tu cuenta para continuar.');
    req.ownerSessionHash = session.hash;
    next();
  };
}
export async function sendOwnerReset(db, config, mail) {
  assert(config.ownerEmail, 503, 'Falta configurar el email de la dueña.');
  const token = randomBytes(32).toString('hex');
  await db.prepare('DELETE FROM resets WHERE expires<?').run(Date.now());
  await db
    .prepare('INSERT INTO resets(hash,expires) VALUES(?,?)')
    .run(tokenHash(token), Date.now() + 30 * 60 * 1000);
  try {
    await mail.send({
      to: config.ownerEmail,
      subject: 'Tu acceso al espacio de Vanina',
      text:
        'Creá o recuperá tu contraseña desde este enlace. Vence en 30 minutos y solo se puede usar una vez.\n\n' +
        config.appUrl +
        '/admin/recuperar#' +
        token +
        '\n\nSi no lo solicitaste, ignorá este mensaje.',
    });
  } catch (error) {
    await db.prepare('DELETE FROM resets WHERE hash=?').run(tokenHash(token));
    throw error;
  }
}
export function authRoutes(db, config, mail, ownerOnly, authRateLimit = 10) {
  const router = Router();
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
      error: 'Demasiados intentos. Esperá 15 minutos antes de volver a intentar.',
    },
  });
  router.get('/session', ownerOnly, (_req, res) =>
    res.json({
      email: config.ownerEmail,
    }),
  );
  router.post('/login', limit, async (req, res) => {
    const input = credentialsSchema.parse(req.body);
    const owner = await db.prepare('SELECT * FROM owner WHERE id=1').get();
    const valid = await verifyPassword(input.password, owner?.password_hash);
    assert(
      owner?.password_hash && valid && input.email.toLowerCase() === config.ownerEmail,
      401,
      'Email o contraseña incorrectos.',
    );
    const token = randomBytes(32).toString('hex');
    await db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    await db
      .prepare('INSERT INTO sessions(hash,expires) VALUES(?,?)')
      .run(tokenHash(token), Date.now() + 8 * 60 * 60 * 1000);
    res.cookie('vanina_session', token, {
      httpOnly: true,
      secure: config.production,
      sameSite: 'strict',
      path: '/',
      maxAge: 8 * 60 * 60 * 1000,
    });
    res.json({
      email: config.ownerEmail,
    });
  });
  router.post('/logout', async (_req, res) => {
    const token = _req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('vanina_session='))
      ?.slice(15);
    if (token) await db.prepare('DELETE FROM sessions WHERE hash=?').run(tokenHash(token));
    res
      .clearCookie('vanina_session', {
        path: '/',
        httpOnly: true,
        secure: config.production,
        sameSite: 'strict',
      })
      .status(204)
      .end();
  });
  router.post('/forgot', limit, async (req, res) => {
    const email = z.email().max(200).parse(req.body.email).toLowerCase();
    if (email === config.ownerEmail) {
      try {
        await sendOwnerReset(db, config, mail);
      } catch {
        /* Do not disclose configured owner or SMTP details. */
      }
    }
    res.json({
      message:
        'Si el email está autorizado, recibirás un enlace para crear o recuperar tu contraseña.',
    });
  });
  router.post('/reset', limit, async (req, res) => {
    const input = z
      .object({
        token: z.string().regex(/^[a-f0-9]{64}$/),
        password: z.string().min(12).max(128),
      })
      .parse(req.body);
    const hash = tokenHash(input.token);
    assert(
      await db.prepare('SELECT * FROM resets WHERE hash=? AND expires>?').get(hash, Date.now()),
      400,
      'El enlace venció o ya fue usado. Pedí uno nuevo.',
    );
    const password = await hashPassword(input.password);
    await transaction(db, async () => {
      assert(
        (await db.prepare('DELETE FROM resets WHERE hash=? AND expires>?').run(hash, Date.now()))
          .changes,
        400,
        'El enlace ya fue usado.',
      );
      await db.prepare('UPDATE owner SET password_hash=? WHERE id=1').run(password);
      await db.exec('DELETE FROM sessions; DELETE FROM resets;');
    });
    res.json({
      message: 'Contraseña guardada. Ya podés ingresar.',
    });
  });
  return router;
}
