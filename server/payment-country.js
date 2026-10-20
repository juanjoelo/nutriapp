import { timingSafeEqual } from 'node:crypto';

// A trusted edge must overwrite BOTH headers. A visitor-controlled country header is ignored.
export function suggestedCountry(req, config) {
  const expected = config.geo?.edgeKey || '',
    supplied = req.get('x-nutriapp-edge-key') || '';
  if (
    expected.length < 32 ||
    Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
  )
    return null;
  const country = req.get('cf-ipcountry');
  return /^[A-Z]{2}$/.test(country || '') && !['XX', 'T1'].includes(country) ? country : null;
}
