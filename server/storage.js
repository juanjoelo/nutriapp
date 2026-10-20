import { mkdirSync, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
const filenamePattern = /^[a-f0-9-]{36}\.webp$/;
export function createStorage(config) {
  if (config.storage.provider === 'supabase') {
    const client = createClient(config.storage.url, config.storage.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }),
      },
    });
    const bucket = client.storage.from(config.storage.bucket);
    return {
      async put(name, buffer) {
        const { error } = await bucket.upload(name, buffer, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: false,
        });
        if (error) throw new Error('Storage upload unavailable');
      },
      async has(ref) {
        const name = path.basename(ref);
        if (!filenamePattern.test(name)) return false;
        const { data, error } = await bucket.exists(name);
        if (error) throw new Error('Storage verification unavailable');
        return data;
      },
      publicUrl(name) {
        if (!filenamePattern.test(name)) return null;
        return bucket.getPublicUrl(name).data.publicUrl;
      },
    };
  }
  const directory = path.join(config.dataDir, 'uploads');
  mkdirSync(directory, { recursive: true });
  return {
    async put(name, buffer) {
      if (!filenamePattern.test(name)) throw new Error('Invalid image name');
      await writeFile(path.join(directory, name), buffer, { flag: 'wx' });
    },
    async has(ref) {
      const name = path.basename(ref);
      return filenamePattern.test(name) && existsSync(path.join(directory, name));
    },
  };
}
