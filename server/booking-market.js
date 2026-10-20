import { suggestedCountry } from './payment-country.js';

export function bookingMarket(req, config, inspection = false) {
  const detected = suggestedCountry(req, config);
  const country = detected || (inspection && !config.production ? 'AR' : null);
  return {
    country,
    source: detected ? 'edge' : country ? 'inspection' : 'unknown',
    currency: country === 'AR' ? 'ARS' : country === 'UY' ? 'UYU' : country ? 'USD' : null,
    provider:
      country === 'AR' ? 'mercadopago' : country === 'UY' ? 'prex' : country ? 'paypal' : null,
  };
}
export function marketPrice(service, market) {
  return (
    { ARS: service.priceCents, USD: service.usdPriceCents, UYU: service.uyuPriceCents }[
      market.currency
    ] || null
  );
}
export function setBookingReturnCookie(res, config, packId, token) {
  res.cookie('vanina_booking_return_' + packId, token, {
    httpOnly: true,
    secure: config.appUrl.startsWith('https://'),
    sameSite: 'lax',
    path: '/api/bookings/payment-return',
    maxAge: 2 * 60 * 60 * 1000,
  });
}
