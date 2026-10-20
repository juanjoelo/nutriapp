import { test, expect } from '@playwright/test';

test('connected Mercado Pago history filters, expands and paginates without horizontal overflow', async ({
  page,
}, testInfo) => {
  // UI-only provider fixtures: this does not assert any real account is connected.
  await page.route('**/api/admin/payments', (route) =>
    route.fulfill({
      json: {
        connected: true,
        collector: '123',
        nickname: 'Cuenta de prueba',
        live: false,
        verifiedAt: Date.now(),
        canConnect: false,
        checkoutReady: false,
      },
    }),
  );
  const queries = [];
  await page.route('**/api/admin/payments/history?*', (route) => {
    const query = new URL(route.request().url()).searchParams;
    queries.push(query.toString());
    const page = Number(query.get('page'));
    return route.fulfill({
      json: {
        payments:
          query.get('status') === 'refunded'
            ? []
            : [
                {
                  id: String(page),
                  description: 'Consulta de prueba ' + page,
                  created: '2026-10-01T15:00:00Z',
                  status: 'approved',
                  statusDetail: 'accredited',
                  amount: 15000,
                  currency: 'ARS',
                  refunded: 0,
                  method: 'visa',
                  installments: 1,
                  orderId: null,
                },
              ],
        total: query.get('status') === 'refunded' ? 0 : 21,
        page,
        pages: query.get('status') === 'refunded' ? 0 : 2,
        live: false,
        fetchedAt: Date.now(),
      },
    });
  });
  await page.goto('/admin');
  await page.getByLabel('Tu email').fill('owner@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Entrar a mi centro de comando' }).click();
  await page.getByRole('button', { name: 'Pagos', exact: true }).click();
  const history = page
    .locator('.payment-history')
    .filter({ has: page.getByRole('heading', { name: 'Historial de pagos', exact: true }) });
  await history.getByText('Consulta de prueba 1', { exact: true }).click();
  await expect(history.getByText('visa · 1 cuota(s)', { exact: true })).toBeVisible();
  await history.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(history.getByText('Consulta de prueba 2', { exact: true })).toBeVisible();
  await history.getByLabel('Estado del pago').selectOption('refunded');
  await history.getByRole('button', { name: 'Ver pagos', exact: true }).click();
  await expect(history.getByText('No hay pagos para estos filtros.')).toBeVisible();
  expect(queries.at(-1)).toContain('status=refunded');
  expect(queries.at(-1)).toContain('page=1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('historial.png'), fullPage: true });
});

test('guest PayPal redirects without country selection and confirms only verified server status', async ({
  page,
}) => {
  const privateToken = 'a'.repeat(64);
  let started = false,
    paid = false;
  const payment = {
    id: 'test',
    provider: 'paypal',
    amount: 4500,
    currency: 'USD',
    status: 'pending',
    live: false,
    url: 'https://www.sandbox.paypal.com/checkoutnow?token=TESTORDER1234567',
  };
  await page.route('**/api/bookings/manage', (route) =>
    route.fulfill({
      json: {
        service: {
          name: 'Pack online de prueba',
          online: true,
          sessions: 3,
          paymentRequired: true,
        },
        customer: { name: 'Paciente de prueba' },
        remaining: 0,
        paymentStatus: paid ? 'paid' : 'pending',
        appointments: [],
      },
    }),
  );
  await page.route('**/api/bookings/payments/options', (route) => {
    expect(route.request().postDataJSON()).toEqual({ token: privateToken });
    return route.fulfill({
      json: {
        paid,
        payment: started ? { ...payment, status: paid ? 'paid' : 'pending' } : null,
        market: { country: 'US', currency: 'USD', source: 'edge' },
        methods: [{ id: 'paypal', name: 'PayPal', amount: 4500, currency: 'USD' }],
      },
    });
  });
  await page.route('**/api/bookings/payments/start', (route) => {
    expect(route.request().postDataJSON()).toEqual({ token: privateToken });
    started = true;
    return route.fulfill({ json: payment });
  });
  // Stub the provider page: no real PayPal request, account, or charge.
  await page.route('https://www.sandbox.paypal.com/checkoutnow?*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<a href="http://127.0.0.1:4173/turnos/pago?booking=test&status=approved">Volver al sitio</a>',
    }),
  );
  await page.route('**/api/bookings/payment-return', (route) =>
    route.fulfill({ json: { token: privateToken, payment } }),
  );
  await page.route('**/api/bookings/payments/verify', (route) => {
    paid = true;
    return route.fulfill({ json: { ...payment, status: 'paid' } });
  });
  await page.goto('/turnos/mi-reserva#' + privateToken);
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continuar a PayPal' }).click();
  await expect(page).toHaveURL(payment.url);
  await page.getByRole('link', { name: 'Volver al sitio' }).click();
  await expect(page).toHaveURL('http://127.0.0.1:4173/turnos/mi-reserva#' + privateToken);
  await expect(page.getByRole('heading', { name: 'Pago registrado', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Ya pagué · verificar estado' }).click();
  await expect(page.getByRole('heading', { name: 'Pago registrado', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
