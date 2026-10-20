export async function api(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const response = await fetch('/api' + path, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'x-store-request': '1',
      ...(!isForm && options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    body: options.body ? (isForm ? options.body : JSON.stringify(options.body)) : undefined,
  });
  if (response.status === 204) return null;
  const data = await response
    .json()
    .catch(() => ({ error: 'No se pudo conectar con la tienda. Intentá nuevamente.' }));
  if (!response.ok) {
    const error = new Error(data.error || 'No pudimos completar la operación.');
    error.status = response.status;
    error.fields = data.fields;
    throw error;
  }
  return data;
}
export const money = (cents) =>
  new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(cents / 100);
export const date = (timestamp) =>
  new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date(timestamp));
export const paymentLabel = {
  paid: 'Pago confirmado',
  pending: 'Pago pendiente',
  rejected: 'Pago rechazado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado / parcial',
  charged_back: 'Contracargo',
  disputed: 'En revisión',
};
