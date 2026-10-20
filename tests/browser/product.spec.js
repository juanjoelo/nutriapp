import { test, expect } from '@playwright/test';

test('short cards, flight to cart, full product page and direct navigation', async ({
  page,
}, testInfo) => {
  const description =
    'Una mezcla para acompañar tus desayunos y meriendas. ' +
    'La descripción completa permite conocer la presentación, los ingredientes y las sugerencias de uso. '.repeat(
      3,
    ) +
    '\nConservación: guardar el envase bien cerrado en un lugar fresco y seco.';
  let product;
  await page.route('**/api/products', async (route) => {
    const response = await route.fetch();
    const items = await response.json();
    product = items.find((p) => p.name === 'Prueba · Granola artesanal');
    product.description = description;
    product.images = [product.image, '/images/vanina.webp'];
    await route.fulfill({ response, json: items });
  });
  await page.goto('/tienda');
  const card = page
    .locator('.product-card')
    .filter({ has: page.getByRole('heading', { name: 'Prueba · Granola artesanal' }) });
  await expect(card.locator('.product-summary')).toContainText('Una mezcla');
  const summary = await card.locator('.product-summary').innerText();
  expect(summary.length).toBeLessThan(description.length);
  expect(summary).toMatch(/…$/);
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  const add = card.getByRole('button', { name: 'Agregar Prueba · Granola artesanal' });
  await add.click();
  await expect(page.locator('.cart-flight')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Carrito, 1 productos' })).toBeVisible();
  await expect(page.locator('.cart-flight')).toHaveCount(0);
  await expect(page).toHaveURL(/\/tienda$/);
  await card.locator('.product-card-link').click();
  await expect(page).toHaveURL(new RegExp('/tienda/' + product.id + '$'));
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await expect(page.locator('.product-description p')).toHaveText(description);
  const photo = page.locator('.product-main-photo img');
  await page.getByRole('button', { name: 'Ver foto 2 de ' + product.name }).click();
  await expect(photo).toHaveAttribute('src', '/images/vanina.webp');
  await page.reload();
  await expect(page.getByRole('heading', { name: product.name, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Carrito, 1 productos' })).toBeVisible();
  await page.getByRole('button', { name: 'Agregar ' + product.name }).click();
  await expect(page.getByRole('link', { name: 'Carrito, 2 productos' })).toBeVisible();
  await expect(page.locator('.cart-flight')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('producto.png'), fullPage: true });
  await page.getByRole('link', { name: 'Ver carrito →' }).click();
  await expect(page.getByRole('spinbutton', { name: 'Cantidad' })).toHaveValue('2');
});

test('reduced motion and item limits still confirm real additions without a flight', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tienda');
  const add = page.getByRole('button', { name: 'Agregar Prueba · Granola artesanal' });
  await add.click();
  await expect(page.getByRole('link', { name: 'Carrito, 1 productos' })).toBeVisible();
  await expect(page.locator('.cart-flight')).toHaveCount(0);
  await expect(page.getByRole('status')).toContainText('se agregó a tu carrito');
  // Consecutive clicks also exercise the cart's synchronous quantity limit.
  await add.evaluate((button) => {
    for (let i = 0; i < 15; i++) button.click();
  });
  await expect(page.getByRole('link', { name: 'Carrito, 10 productos' })).toBeVisible();
  await expect(add).toBeDisabled();
  await expect(page.locator('.cart-flight')).toHaveCount(0);
});

test('unavailable product and loading failures offer a way back or retry', async ({ page }) => {
  await page.goto('/tienda/producto-inexistente');
  await expect(
    page.getByRole('heading', { name: 'Este producto no está disponible.' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Volver a la tienda', exact: true })).toBeVisible();
  await page.route('**/api/products', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Servicio temporalmente no disponible.' }),
    }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText('Servicio temporalmente no disponible.');
  await page.unroute('**/api/products');
  await page.getByRole('button', { name: 'Volver a intentar' }).click();
  await expect(
    page.getByRole('heading', { name: 'Este producto no está disponible.' }),
  ).toBeVisible();
});
