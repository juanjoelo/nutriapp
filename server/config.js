import path from 'node:path';
export function readConfig(env = process.env) {
  const config = {
    production: env.NODE_ENV === 'production',
    port: Number(env.PORT || 4100),
    host: env.HOST || '127.0.0.1',
    appUrl: (env.APP_URL || 'http://localhost:5173').replace(/\/$/, ''),
    dataDir: path.resolve(env.DATA_DIR || './data'),
    database: {
      provider: env.DATABASE_PROVIDER || 'sqlite',
      url: env.DATABASE_URL,
      ca: env.DATABASE_CA_CERT,
    },
    storage: {
      provider: env.STORAGE_PROVIDER || 'local',
      url: env.SUPABASE_URL,
      key: env.SUPABASE_SECRET_KEY,
      bucket: env.SUPABASE_STORAGE_BUCKET || 'nutriapp-products',
    },
    ownerEmail: (env.OWNER_EMAIL || '').trim().toLowerCase(),
    trustProxy: Number(env.TRUST_PROXY_HOPS || 0),
    geo: { edgeKey: env.COUNTRY_EDGE_KEY },
    smtp: {
      host: env.SMTP_HOST,
      port: Number(env.SMTP_PORT || 587),
      secure: env.SMTP_SECURE === 'true',
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
      from: env.MAIL_FROM,
    },
    mp: {
      clientId: env.MP_CLIENT_ID,
      clientSecret: env.MP_CLIENT_SECRET,
      encryptionKey: env.PAYMENT_ENCRYPTION_KEY,
      token: env.MP_ACCESS_TOKEN,
      secret: env.MP_WEBHOOK_SECRET,
      collector: env.MP_COLLECTOR_ID,
      live: env.MP_LIVE_MODE === 'true',
    },
    correo: {
      production: env.CORREO_ENV === 'production',
      user: env.CORREO_API_USER,
      password: env.CORREO_API_PASSWORD,
      customer: env.CORREO_CUSTOMER_ID,
      base:
        env.CORREO_ENV === 'production'
          ? 'https://api.correoargentino.com.ar/micorreo/v1'
          : 'https://apitest.correoargentino.com.ar/micorreo/v1',
      origin: env.SHIPPING_ORIGIN_POSTAL_CODE || '5881',
      packagingWeight: Number(env.PACKAGING_WEIGHT_GRAMS || 100),
    },
  };
  const url = new URL(config.appUrl);
  if (
    !['sqlite', 'supabase'].includes(config.database.provider) ||
    !['local', 'supabase'].includes(config.storage.provider)
  )
    throw new Error('Invalid persistence provider');
  if (config.database.provider === 'supabase' && !config.database.url)
    throw new Error('DATABASE_URL is required');
  if (config.storage.provider === 'supabase' && (!config.storage.url || !config.storage.key))
    throw new Error('Supabase Storage configuration is required');
  if (config.storage.provider === 'supabase' && new URL(config.storage.url).protocol !== 'https:')
    throw new Error('Supabase Storage requires HTTPS');
  if (config.production && url.protocol !== 'https:')
    throw new Error('APP_URL must use HTTPS in production');
  if (!Number.isInteger(config.correo.packagingWeight) || config.correo.packagingWeight < 0)
    throw new Error('Invalid packaging weight');
  if (!/^\d{4}$/.test(config.correo.origin)) throw new Error('Invalid origin postal code');
  if (config.mp.live && !config.correo.production)
    throw new Error('Live payments require production shipping rates');
  return config;
}
export function readiness(config, account = config.mp) {
  return {
    owner: Boolean(config.ownerEmail),
    email: Boolean(
      config.ownerEmail &&
      config.smtp.host &&
      config.smtp.from &&
      config.smtp.auth.user &&
      config.smtp.auth.pass,
    ),
    payment: Boolean(
      account.token &&
      config.mp.secret &&
      account.collector &&
      config.appUrl.startsWith('https://'),
    ),
    shipping: Boolean(config.correo.user && config.correo.password && config.correo.customer),
  };
}
