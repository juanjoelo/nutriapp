import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { assert } from './errors.js';

export const paymentKeyReady = (config) => /^[a-f0-9]{64}$/i.test(config.mp.encryptionKey || '');
export function paymentSecrets(config) {
  function key() {
    assert(paymentKeyReady(config), 503, 'Falta configurar el cifrado de las conexiones de pago.');
    return Buffer.from(config.mp.encryptionKey, 'hex');
  }
  return {
    seal(value) {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key(), iv);
      cipher.setAAD(Buffer.from('nutriapp-paypal-v1'));
      const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
      return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
    },
    open(value) {
      const [iv, tag, data] = value.split('.').map((v) => Buffer.from(v, 'base64url'));
      const cipher = createDecipheriv('aes-256-gcm', key(), iv);
      cipher.setAAD(Buffer.from('nutriapp-paypal-v1'));
      cipher.setAuthTag(tag);
      return JSON.parse(Buffer.concat([cipher.update(data), cipher.final()]).toString());
    },
  };
}
