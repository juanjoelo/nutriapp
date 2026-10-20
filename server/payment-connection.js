import { Router } from 'express';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { assert } from './errors.js';
import { tokenHash } from './auth.js';
import { transaction } from './database.js';

const cookieName = 'vanina_mp_oauth';
export function createPaymentConnection(db, config, fetcher = fetch) {
  const redirectUri = config.appUrl + '/api/payments/mercadopago/callback';
  const configured = () =>
    Boolean(
      config.mp.clientId &&
      config.mp.clientSecret &&
      /^[a-f0-9]{64}$/i.test(config.mp.encryptionKey || '') &&
      redirectUri.startsWith('https://'),
    );
  const key = () => {
    assert(
      /^[a-f0-9]{64}$/i.test(config.mp.encryptionKey || ''),
      503,
      'La conexión de pagos necesita configuración del servidor.',
    );
    return Buffer.from(config.mp.encryptionKey, 'hex');
  };
  function seal(value) {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key(), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString('base64url')).join('.');
  }
  function unseal(value) {
    const [iv, tag, data] = value.split('.').map((s) => Buffer.from(s, 'base64url'));
    const cipher = createDecipheriv('aes-256-gcm', key(), iv);
    cipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString());
  }
  async function api(path, token, body) {
    const response = await fetcher('https://api.mercadopago.com' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(12000),
    });
    assert(
      response.ok,
      response.status === 401 || response.status === 400 ? 409 : 502,
      'No pudimos validar la conexión con Mercado Pago. Volvé a conectarla.',
    );
    return response.json();
  }
  async function tokenRequest(fields) {
    const value = await api('/oauth/token', null, {
      client_id: config.mp.clientId,
      client_secret: config.mp.clientSecret,
      ...fields,
    });
    assert(
      typeof value.access_token === 'string' &&
        typeof value.refresh_token === 'string' &&
        Number.isFinite(value.expires_in) &&
        value.expires_in > 60 &&
        value.user_id &&
        value.live_mode === config.mp.live,
      502,
      'La autorización recibida no corresponde al ambiente configurado.',
    );
    return value;
  }
  async function stored() {
    return db
      .prepare('SELECT * FROM payment_accounts WHERE id=1 AND owner_email=?')
      .get(config.ownerEmail);
  }
  let refreshing;
  async function credentials() {
    const row = await stored();
    if (!row) return config.mp;
    const saved = unseal(row.encrypted);
    assert(
      row.verified > 0 && saved.live_mode === config.mp.live,
      409,
      'Volvé a autorizar tu cuenta de Mercado Pago para este ambiente.',
    );
    if (row.expires > Date.now() + 300000)
      return { ...config.mp, token: saved.access_token, collector: row.collector };
    if (!refreshing)
      refreshing = (async () => {
        const fresh = await tokenRequest({
          grant_type: 'refresh_token',
          refresh_token: unseal(row.encrypted).refresh_token,
        });
        assert(
          String(fresh.user_id) === row.collector,
          409,
          'La cuenta de pagos cambió. Volvé a conectarla.',
        );
        // Do not resurrect an account disconnected/replaced while the provider was responding.
        const changed = await db
          .prepare(
            'UPDATE payment_accounts SET encrypted=?,expires=? WHERE id=1 AND encrypted=? AND owner_email=?',
          )
          .run(seal(fresh), Date.now() + fresh.expires_in * 1000, row.encrypted, config.ownerEmail);
        assert(changed.changes, 409, 'La conexión cambió. Volvé a intentar.');
        return { ...config.mp, token: fresh.access_token, collector: row.collector };
      })().finally(() => {
        refreshing = null;
      });
    return refreshing;
  }
  async function status() {
    const row = await stored();
    let valid = false;
    try {
      valid = Boolean(
        row && row.verified > 0 && unseal(row.encrypted).live_mode === config.mp.live,
      );
    } catch {
      /* Report a disconnected state if the server key is unavailable. */
    }
    return {
      connected: Boolean(valid && row.expires > Date.now()),
      canConnect: configured(),
      nickname: row?.nickname || '',
      collector: row?.collector || '',
      verifiedAt: row?.verified || null,
      expiresAt: row?.expires || null,
      live: config.mp.live,
      checkoutReady: Boolean(
        valid &&
        row.expires > Date.now() &&
        config.mp.secret &&
        config.appUrl.startsWith('https://'),
      ),
      legacyConfigured: Boolean(!row && config.mp.token && config.mp.collector),
    };
  }
  function routes(ownerOnly) {
    const router = Router();
    const cookieOptions = {
      httpOnly: true,
      secure: config.production || config.appUrl.startsWith('https://'),
      sameSite: 'lax',
      path: '/api/payments/mercadopago/callback',
    };
    router.get('/admin/payments', ownerOnly, async (_req, res) => res.json(await status()));
    router.post('/admin/payments/connect', ownerOnly, async (req, res) => {
      assert(
        configured(),
        503,
        'Falta habilitar la conexión de Mercado Pago en el servidor. Una vez configurada, podrás autorizar tu cuenta desde este botón.',
      );
      const state = randomBytes(32).toString('hex'),
        cookie = randomBytes(32).toString('hex'),
        verifier = randomBytes(48).toString('base64url');
      await transaction(db, async () => {
        await db
          .prepare('DELETE FROM payment_oauth_states WHERE expires<? OR session_hash=?')
          .run(Date.now(), req.ownerSessionHash);
        await db
          .prepare('INSERT INTO payment_oauth_states VALUES(?,?,?,?,?,?)')
          .run(
            tokenHash(state),
            req.ownerSessionHash,
            tokenHash(cookie),
            config.ownerEmail,
            seal(verifier),
            Date.now() + 600000,
          );
      });
      res.cookie(cookieName, cookie, { ...cookieOptions, maxAge: 600000 });
      const url = new URL('https://auth.mercadopago.com/authorization');
      url.search = new URLSearchParams({
        client_id: config.mp.clientId,
        response_type: 'code',
        platform_id: 'mp',
        state,
        redirect_uri: redirectUri,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      });
      res.json({ url: url.toString() });
    });
    // Strict admin cookies are not sent on cross-site OAuth returns. A short-lived Lax cookie,
    // one-use state and the original still-valid server session bind this callback to the owner.
    router.get('/payments/mercadopago/callback', async (req, res) => {
      const state = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .safeParse(req.query.state);
      const cookie = req.headers.cookie
        ?.split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith(cookieName + '='))
        ?.split('=')[1];
      let pending;
      if (state.success && /^[a-f0-9]{64}$/.test(cookie || ''))
        pending = await transaction(db, async () => {
          const row = await db
            .prepare(
              'SELECT * FROM payment_oauth_states WHERE hash=? AND cookie_hash=? AND owner_email=? AND expires>?',
            )
            .get(tokenHash(state.data), tokenHash(cookie), config.ownerEmail, Date.now());
          if (!row) return null;
          const session = await db
            .prepare('SELECT hash FROM sessions WHERE hash=? AND expires>?')
            .get(row.session_hash, Date.now());
          await db.prepare('DELETE FROM payment_oauth_states WHERE hash=?').run(row.hash);
          return session ? row : null;
        });
      res.clearCookie(cookieName, cookieOptions);
      const finish = (status) => res.redirect(303, '/admin?section=pagos&mp=' + status);
      if (!pending) return finish('invalid');
      if (req.query.error) return finish('cancelled');
      try {
        const code = z.string().min(1).max(2048).parse(req.query.code);
        const tokens = await tokenRequest({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: unseal(pending.verifier),
          test_token: !config.mp.live,
        });
        const profile = await api('/users/me', tokens.access_token);
        assert(
          String(profile.id) === String(tokens.user_id) && profile.site_id === 'MLA',
          409,
          'La cuenta debe corresponder a Mercado Pago Argentina.',
        );
        await transaction(db, async () => {
          const owner = await db.prepare('SELECT email FROM owner WHERE id=1').get();
          const session = await db
            .prepare('SELECT hash FROM sessions WHERE hash=? AND expires>?')
            .get(pending.session_hash, Date.now());
          assert(owner?.email === pending.owner_email && session, 401, 'Tu sesión venció.');
          const previous = await stored();
          assert(
            !previous || previous.collector === String(profile.id),
            409,
            'Desconectá primero la cuenta anterior.',
          );
          assert(
            !config.mp.collector || config.mp.collector === String(profile.id),
            409,
            'La cuenta no coincide con la configuración del servidor.',
          );
          await db
            .prepare(
              `INSERT INTO payment_accounts VALUES(1,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
            owner_email=excluded.owner_email,collector=excluded.collector,nickname=excluded.nickname,encrypted=excluded.encrypted,expires=excluded.expires,verified=excluded.verified`,
            )
            .run(
              config.ownerEmail,
              String(profile.id),
              String(profile.nickname || 'Cuenta autorizada').slice(0, 120),
              seal(tokens),
              Date.now() + tokens.expires_in * 1000,
              Date.now(),
            );
        });
        return finish('connected');
      } catch {
        return finish('failed');
      }
    });
    router.post('/admin/payments/verify', ownerOnly, async (_req, res) => {
      const row = await stored();
      assert(row, 409, 'Conectá primero tu cuenta de Mercado Pago.');
      try {
        const account = await credentials();
        const profile = await api('/users/me', account.token);
        assert(
          String(profile.id) === row.collector && profile.site_id === 'MLA',
          409,
          'La cuenta no coincide.',
        );
        await db
          .prepare(
            'UPDATE payment_accounts SET verified=? WHERE id=1 AND collector=? AND owner_email=?',
          )
          .run(Date.now(), row.collector, config.ownerEmail);
      } catch (error) {
        await db
          .prepare(
            'UPDATE payment_accounts SET verified=0 WHERE id=1 AND collector=? AND owner_email=?',
          )
          .run(row.collector, config.ownerEmail);
        throw error;
      }
      res.json(await status());
    });
    router.delete('/admin/payments/connection', ownerOnly, async (_req, res) => {
      assert(
        !config.mp.token,
        409,
        'Hay credenciales de pago configuradas en el servidor. Deben retirarse antes de desconectar esta cuenta.',
      );
      const pending = await db
        .prepare("SELECT count(*) AS n FROM orders WHERE status='pending' AND created>?")
        .get(Date.now() - 86400000);
      assert(!pending.n, 409, 'Hay pagos recientes pendientes. Revisalos antes de desconectar.');
      const consultations = await db
        .prepare(
          "SELECT id FROM consultation_payments WHERE provider='mercadopago' AND status='pending' AND created>? LIMIT 1",
        )
        .get(Date.now() - 86400000);
      assert(
        !consultations,
        409,
        'Hay pagos de consultas pendientes. Revisalos antes de desconectar.',
      );
      await transaction(db, async () => {
        await db.exec('DELETE FROM payment_accounts; DELETE FROM payment_oauth_states;');
      });
      res.status(204).end();
    });
    return router;
  }
  return { credentials, status, routes };
}
