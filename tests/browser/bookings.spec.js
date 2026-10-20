import { test, expect } from '@playwright/test';
const dateValue = (time) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(time);
async function login(page) {
  await page.goto('/admin');
  await page.getByLabel('Tu email').fill('owner@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Entrar a mi centro de comando' }).click();
  await expect(page.getByRole('heading', { name: 'Así crece tu tienda.' })).toBeVisible();
}
const noOverflow = async (page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test('payments state, owner service configuration, QR and responsive booking screens', async ({
  page,
}, testInfo) => {
  const errors = [];
  await page.setExtraHTTPHeaders({
    'cf-ipcountry': 'UY',
    'x-nutriapp-edge-key': 'isolated-browser-country-fixture-key-123456',
  });
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page);
  await page.getByRole('button', { name: 'Pagos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Conectá tu Mercado Pago' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Mercado Pago', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Conectar Mercado Pago' })).toBeDisabled();
  await expect(page.getByText('MercadoPago conectado', { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Historial de pagos', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Nombre completo del titular').fill('Vanina test');
  await page.getByLabel('Número de cuenta Prex Argentina').fill('12345678');
  await page.getByLabel('Ofrecer transferencia Prex para Uruguay').check();
  await page.getByRole('button', { name: 'Guardar Prex', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Preferencias de Prex guardadas.' }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('pagos.png'), fullPage: true });
  await page.getByRole('button', { name: 'Turnos', exact: true }).click();
  await page.getByRole('button', { name: 'Servicios y packs', exact: true }).click();
  const service = page
    .locator('.booking-service-editor')
    .filter({ has: page.locator('input[value="Pack de tratamiento · 3 consultas iniciales"]') });
  await service.getByLabel('Precio del servicio o pack (ARS)', { exact: true }).fill('15000');
  await service.getByLabel('Disponible para reservar').check();
  await service.getByLabel('Consulta o pack online').check();
  await service.getByLabel('USD · cobro por PayPal').fill('45');
  await service.getByLabel('UYU · referencia para Prex').fill('1800');
  await service.getByRole('button', { name: 'Guardar servicio' }).click();
  await expect(service.getByRole('status')).toHaveText('Servicio guardado.');
  await noOverflow(page);
  await page.getByRole('button', { name: 'Disponibilidad', exact: true }).click();
  // Configure an isolated test schedule through the same authenticated API; never persistent user data.
  const config = (await (await page.request.get('/api/admin/bookings/config')).json()).settings;
  const configured = {
    ...config,
    enabled: true,
    location: 'Consultorio de prueba',
    weekly: config.weekly.map((d) => ({ ...d, intervals: [{ start: '09:00', end: '17:00' }] })),
  };
  const response = await page.request.put('/api/admin/bookings/config', {
    headers: { Origin: 'http://127.0.0.1:4173', 'x-store-request': '1' },
    data: configured,
  });
  expect(response.ok()).toBe(true);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('disponibilidad.png'), fullPage: true });
  await page.getByRole('button', { name: 'Enlace y QR', exact: true }).click();
  await expect(
    page.getByRole('img', { name: 'Código QR para abrir la agenda de Vanina' }),
  ).toHaveAttribute('src', /^data:image\/png/);
  await expect(page.getByRole('link', { name: 'Descargar QR' })).toHaveAttribute(
    'download',
    'turnos-vanina-alaniz.png',
  );
  await noOverflow(page);
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.goto('/turnos');
  await page.getByRole('button', { name: /Pack de tratamiento/ }).click();
  const date = dateValue(Date.now() + (testInfo.project.name === 'mobile' ? 5 : 4) * 86400000);
  await page.getByLabel('Elegí una fecha').fill(date);
  await page.getByRole('button', { name: '09:00', exact: true }).click();
  await page.getByLabel('Nombre y apellido').fill('Paciente ' + testInfo.project.name);
  await page.getByLabel('Email', { exact: true }).fill('patient@example.test');
  await page.getByLabel('Teléfono', { exact: true }).fill('1122334455');
  await page.getByLabel('Acepto que mis datos').check();
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('reserva.png'), fullPage: true });
  await page.getByRole('button', { name: 'Reservar turno · ver datos Prex', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Completá el pago para confirmar.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Ver y gestionar mi reserva' }).click();
  const privateReservationUrl = page.url();
  await expect(page.getByText(/2 disponibles para agendar/)).toBeVisible();
  await expect(page.getByText('Pendiente de pago · sin confirmar', { exact: true })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Cambiar horario' })).toHaveCount(0);
  await expect(page.locator('.consultation-payment')).toContainText('ARS');
  await expect(page.locator('.consultation-payment')).toContainText('UYU');
  await expect(page.locator('.consultation-payment')).toContainText('12345678');
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('pago-prex.png'), fullPage: true });
  await login(page);
  await page.getByRole('button', { name: 'Pagos', exact: true }).click();
  const charge = page
    .locator('.payment-history-entry')
    .filter({ hasText: 'Paciente ' + testInfo.project.name });
  await charge.locator('summary').click();
  await charge
    .getByLabel('Número de operación recibida')
    .fill('PREX-TEST-' + testInfo.project.name);
  await charge.getByLabel('Confirmé que el importe completo').check();
  await charge.getByRole('button', { name: 'Confirmar recepción de Prex' }).click();
  await expect(charge.locator('.status-tag')).toHaveText('Pagado');
  await page.getByRole('button', { name: 'Turnos', exact: true }).click();
  await page.getByLabel('Buscar reserva').fill('Paciente ' + testInfo.project.name);
  await expect(page.locator('.appointment-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Calendario', exact: true }).click();
  await expect(page.locator('.calendar-day .appointment-card')).toHaveCount(1);
  await noOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('agenda.png'), fullPage: true });
  await page.getByRole('button', { name: 'Cerrar sesión', exact: true }).click();
  await page.goto(privateReservationUrl);
  await expect(page.getByText('Confirmado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cambiar horario' }).click();
  await page.getByRole('button', { name: '10:00', exact: true }).click();
  await page.getByRole('button', { name: 'Guardar horario' }).click();
  await expect(page.locator('.booking-reservations h3')).toContainText('10:00');
  await noOverflow(page);
  expect(errors).toEqual([]);
});
