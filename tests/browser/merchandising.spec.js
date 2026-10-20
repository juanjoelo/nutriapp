import { test, expect } from '@playwright/test';
async function login(page) {
  await page.goto('/admin');
  await page.getByLabel('Tu email').fill('owner@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Entrar a mi centro de comando' }).click();
  await expect(page.getByRole('heading', { name: 'Así crece tu tienda.' })).toBeVisible();
}
test('scheduled campaign expires on an open storefront and refreshes product prices', async ({
  page,
}) => {
  await login(page);
  const id = crypto.randomUUID(),
    end = Date.now() + 6000;
  const response = await page.request.put('/api/admin/campaigns/' + id, {
    headers: { Origin: 'http://127.0.0.1:4173', 'x-store-request': '1' },
    data: {
      name: 'Campaña breve',
      enabled: true,
      scheduled: true,
      start: Date.now() - 1000,
      end,
      discount: 15,
      productIds: [],
      appearance: true,
      priority: 100,
      title: 'Oferta por tiempo limitado',
      subtitle: 'Prueba de fechas',
      announcement: 'Oferta breve',
      button: 'Ver tienda',
      color: '#304c3d',
      background: '#faf9f5',
      ink: '#2f4437',
      image: '',
    },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/tienda');
  await expect(page.getByRole('heading', { name: 'Oferta por tiempo limitado' })).toBeVisible();
  await expect(page.locator('.product-card .offer-badge').first()).toHaveText('−15%');
  await expect(page.getByRole('heading', { name: 'Oferta por tiempo limitado' })).toHaveCount(0, {
    timeout: 12000,
  });
  await expect(page.locator('.product-card .offer-badge')).toHaveCount(0);
  await expect(page.locator('html')).not.toHaveAttribute('data-campaign');
});
test('shop heading comes first, monthly slider follows products and charts inspect sales', async ({
  page,
}, info) => {
  await page.goto('/tienda');
  await expect(page.locator('.bestseller-card').first()).toContainText(
    'Prueba · Granola artesanal',
  );
  expect(
    await page
      .locator('.shop-page')
      .evaluate(
        (el) =>
          el.firstElementChild.classList.contains('shop-heading') &&
          el
            .querySelector('.bestsellers')
            .previousElementSibling.classList.contains('product-grid'),
      ),
  ).toBe(true);
  await page.getByRole('button', { name: 'Favoritos siguientes' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('favoritos.png'), fullPage: true });
  await login(page);
  await expect(page.getByRole('img', { name: /Participación/ })).toBeVisible();
  await page
    .getByRole('button', { name: 'Inspeccionar Prueba · Granola artesanal', exact: true })
    .click();
  const detail = page.getByRole('region', { name: 'Detalle de Prueba · Granola artesanal' });
  await expect(detail).toContainText('6');
  await expect(detail.locator('tbody tr')).toHaveCount(1);
  await page.getByLabel('Medir por').selectOption('revenueCents');
  await expect(page.locator('.pie-chart')).toContainText('ventas de productos');
  await page.screenshot({ path: info.outputPath('graficos-detalle.png'), fullPage: true });
  await page
    .getByRole('button', { name: 'Inspeccionar Prueba · Infusión natural', exact: true })
    .click();
  await expect(page.getByText('No registró ventas en este período.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('owner configures seasonal offer and bundle; storefront and shipping use discounted prices', async ({
  page,
}, info) => {
  const campaign = 'Black Friday ' + info.project.name,
    combo = 'Combo bienestar ' + info.project.name;
  await login(page);
  await page.getByRole('button', { name: 'Ofertas y ocasiones', exact: true }).click();
  await page.getByRole('button', { name: 'Crear campaña o descuento' }).click();
  await page.getByLabel('Punto de partida').selectOption('black');
  await page.getByLabel('Nombre', { exact: true }).fill(campaign);
  await page.getByLabel('Descuento (%)').fill('20');
  await page.getByLabel('Activar campaña', { exact: true }).check();
  await page.getByLabel('Título del banner').fill('Especial de bienestar');
  await page.getByLabel('Color principal').fill('#405647');
  await page.screenshot({ path: info.outputPath('campaña-editor.png'), fullPage: true });
  await page.getByRole('button', { name: 'Guardar campaña' }).click();
  await expect(page.getByRole('status')).toHaveText('Campaña guardada.');
  await page.getByRole('button', { name: 'Combos', exact: true }).click();
  await page.getByRole('button', { name: 'Crear combo', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill(combo);
  await page
    .getByLabel('Descripción del combo')
    .fill('Una selección de granola y semillas para empezar el día.');
  await page.getByLabel('Descuento (%)').fill('25');
  await page.getByRole('checkbox', { name: /Prueba · Granola artesanal/ }).check();
  await page.getByRole('checkbox', { name: /Prueba · Mix de semillas/ }).check();
  await page.getByRole('button', { name: 'Guardar combo' }).click();
  await expect(page.getByRole('status')).toHaveText('Combo guardado.');
  await page.goto('/tienda');
  await expect(page.getByRole('heading', { name: 'Especial de bienestar' })).toBeVisible();
  await expect(page.locator('html')).toHaveCSS('background-color', 'rgb(242, 238, 229)');
  expect(
    await page
      .locator('.shop-page')
      .evaluate(
        (el) =>
          el.firstElementChild.classList.contains('shop-heading') &&
          el
            .querySelector('.bestsellers')
            .previousElementSibling.classList.contains('product-grid'),
      ),
  ).toBe(true);
  const card = page
    .locator('.product-card')
    .filter({ has: page.getByRole('heading', { name: combo, exact: true }) });
  await expect(card.locator('.offer-badge')).toHaveText('−25%');
  await card.locator('.product-card-link').click();
  await expect(page.getByRole('heading', { name: 'Este combo incluye' })).toBeVisible();
  await page.getByRole('button', { name: 'Agregar ' + combo, exact: true }).click();
  await page.getByRole('link', { name: 'Ver carrito →' }).click();
  await page.getByRole('textbox', { name: 'Código postal', exact: true }).fill('5000');
  await page.getByRole('button', { name: 'Calcular', exact: true }).click();
  await expect(page.getByRole('heading', { name: '¿A dónde lo enviamos?' })).toBeVisible();
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Ofertas y ocasiones', exact: true }).click();
  await page.getByRole('button', { name: 'Editar ' + campaign, exact: true }).click();
  await page.getByLabel('Activar campaña', { exact: true }).uncheck();
  await page.getByRole('button', { name: 'Guardar campaña' }).click();
  await expect(page.getByRole('status')).toHaveText('Campaña guardada.');
  await page.getByRole('button', { name: 'Combos', exact: true }).click();
  await page.getByRole('button', { name: 'Editar ' + combo, exact: true }).click();
  await page.getByLabel('Visible en la tienda').uncheck();
  await page.getByRole('button', { name: 'Guardar combo' }).click();
  await expect(page.getByRole('status')).toHaveText('Combo guardado.');
  await page.goto('/tienda');
  await expect(page.getByRole('heading', { name: 'Especial de bienestar' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: combo, exact: true })).toHaveCount(0);
});
