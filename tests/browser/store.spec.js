import { test, expect } from '@playwright/test';
test('public site, responsive navigation, store, shipping and protected admin', async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Volvé a lo simple. Volvé a vos.' }),
  ).toBeVisible();
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('inicio.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Abrir menú' }).click();
  await expect(
    page
      .getByRole('navigation', { name: 'Navegación principal' })
      .getByRole('link', { name: 'Turnos', exact: true }),
  ).toHaveAttribute('href', '/turnos');
  await page
    .getByRole('navigation', { name: 'Navegación principal' })
    .getByRole('link', { name: 'Tienda', exact: true })
    .click();
  await page.getByRole('button', { name: 'Agregar Prueba · Granola artesanal' }).click();
  await page.getByRole('link', { name: 'Ver carrito →' }).click();
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '¿A dónde lo enviamos?' })).toBeVisible();
  await page.getByLabel('Nombre y apellido', { exact: true }).fill('Compradora de prueba');
  await expect(page.getByRole('button', { name: 'Continuar a Mercado Pago' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Código postal', exact: true }).fill('5000');
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿A dónde lo enviamos?' })).toBeVisible();
  await expect(
    page.getByText('Paq.ar prueba · Cotización válida por hasta 10 minutos.'),
  ).toBeVisible();
  await expect(page.getByLabel('Nombre y apellido', { exact: true })).toHaveValue(
    'Compradora de prueba',
  );
  await expect(page.getByRole('button', { name: 'Continuar a Mercado Pago' })).toBeEnabled();
  await page.getByRole('textbox', { name: 'Código postal', exact: true }).fill('5001');
  await expect(page.getByRole('button', { name: 'Continuar a Mercado Pago' })).toBeDisabled();
  await expect(page.getByLabel('Nombre y apellido', { exact: true })).toHaveValue(
    'Compradora de prueba',
  );
  await page.goto('/admin');
  await expect(page.getByRole('heading', { name: 'Hola, Vanina.' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('owner command center: sales graph, products, dispatch and logout', async ({
  page,
}, testInfo) => {
  await page.goto('/admin');
  await page.getByLabel('Tu email').fill('owner@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Entrar a mi centro de comando' }).click();
  await expect(page.getByRole('heading', { name: 'Así crece tu tienda.' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Participación/ })).toBeVisible();
  await page.getByRole('button', { name: 'Barras', exact: true }).click();
  await expect(page.getByRole('group', { name: /Unidades por producto/ })).toBeVisible();
  await page.getByLabel('Ordenar ventas').selectOption('least');
  await expect(page.locator('.chart-row').first().locator('strong')).toHaveText('0');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('centro-comando.png'), fullPage: true });
  await page.getByRole('button', { name: 'Mis productos', exact: true }).click();
  await page.getByRole('button', { name: 'Nuevo producto' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill('Producto nuevo ' + testInfo.project.name);
  await page
    .getByLabel('Descripción', { exact: true })
    .fill('Un producto de prueba para validar la administración.');
  await page.getByLabel('Precio en pesos').fill('8500');
  await page.getByLabel('Categoría', { exact: true }).fill('Pruebas');
  await page.getByLabel('Peso (gramos)').fill('500');
  await page.getByLabel('Alto (cm)').fill('8');
  await page.getByLabel('Ancho (cm)').fill('12');
  await page.getByLabel('Largo (cm)').fill('15');
  await page.locator('input[type=file]').setInputFiles('public/images/mesa-natural.webp');
  await expect(page.getByAltText('Foto del producto')).toBeVisible();
  await page.getByRole('button', { name: 'Guardar producto' }).click();
  await expect(page.getByRole('status')).toContainText('Producto guardado');
  await page.getByRole('button', { name: 'Pedidos y envíos', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('pedidos.png'), fullPage: true });
  const card = page.locator('.order-card').first();
  await expect(card).not.toHaveAttribute('open');
  await expect(card.getByLabel('Número de seguimiento')).toBeHidden();
  await card.locator('summary').click();
  await card.getByLabel('Número de seguimiento').fill('TEST123456');
  page.once('dialog', (dialog) => dialog.accept());
  await card.getByRole('button', { name: 'Marcar como enviado' }).click();
  await expect(page.getByRole('status')).toContainText('Pedido marcado como enviado');
  await page.getByRole('button', { name: 'Enviados', exact: true }).click();
  const shippedCard = page.locator('.order-card').filter({ hasText: 'TEST123456' }).first();
  await expect(shippedCard).not.toHaveAttribute('open');
  await shippedCard.locator('summary').click();
  await expect(page.getByText(/Seguimiento:.*TEST123456/).first()).toBeVisible();
  await expect(page.getByText('Aviso de despacho enviado al comprador').first()).toBeVisible();
  await shippedCard.locator('summary').click();
  await expect(shippedCard.getByText(/Seguimiento:.*TEST123456/)).toBeHidden();
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page.getByRole('heading', { name: 'Hola, Vanina.' })).toBeVisible();
});
