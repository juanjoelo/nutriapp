import { test, expect } from '@playwright/test';
async function openPanel(page) {
  await page.goto('/admin');
  await page.getByLabel('Tu email').fill('owner@example.test');
  await page.getByLabel('Contraseña', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: 'Entrar a mi centro de comando' }).click();
  await page.getByRole('button', { name: 'Ofertas y ocasiones', exact: true }).click();
}
test('campaign history preserves edits, reuses a disabled copy and deletes one version', async ({
  page,
}, info) => {
  const name = 'Campaña historial ' + info.project.name;
  await openPanel(page);
  await page.getByRole('button', { name: 'Crear campaña o descuento' }).click();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Descuento (%)').fill('17');
  await page.getByLabel('Anuncio superior').fill('Mi anuncio conservado');
  await page.getByRole('button', { name: 'Guardar campaña' }).click();
  await page.getByRole('button', { name: 'Editar ' + name, exact: true }).click();
  await page.getByLabel('Descuento (%)').fill('25');
  await page.getByRole('button', { name: 'Guardar campaña' }).click();
  const current = page
    .locator('.merch-summary')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await current.getByText('Eliminar campaña', { exact: true }).click();
  await current.getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(current).toHaveCount(0);
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await page.getByLabel('Buscar en el historial').fill(name);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.locator('.history-card')).toHaveCount(3);
  const created = page.locator('.history-card').filter({ hasText: 'CAMPAÑA · Creación' });
  await created.getByText('Ver configuración guardada').click();
  await expect(created).toContainText('Mi anuncio conservado');
  await expect(created.locator('.offer-badge')).toHaveText('17% de descuento');
  await page.screenshot({ path: info.outputPath('historial-campañas.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await created.getByRole('button', { name: 'Reutilizar configuración' }).click();
  await expect(page.getByLabel('Descuento (%)')).toHaveValue('17');
  await expect(page.getByLabel('Activar campaña', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Anuncio superior')).toHaveValue('Mi anuncio conservado');
  await page.getByRole('button', { name: 'Guardar campaña' }).click();
  await expect(
    page.getByRole('button', { name: 'Editar Copia de ' + name, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await page.getByLabel('Buscar en el historial').fill(name);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.locator('.history-card')).toHaveCount(4);
  const removed = page
    .locator('.history-card')
    .filter({ hasText: 'Eliminación de la lista' })
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await removed.getByText('Eliminar esta versión', { exact: true }).click();
  await removed.getByRole('button', { name: 'Confirmar borrado de versión' }).click();
  await expect(page.locator('.history-card')).toHaveCount(3);
  await page.reload();
  await page.getByRole('button', { name: 'Ofertas y ocasiones', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Editar Copia de ' + name, exact: true }),
  ).toBeVisible();
});
test('deleted combo can be reused with its quantities and discount', async ({ page }, info) => {
  const name = 'Combo historial ' + info.project.name;
  await openPanel(page);
  await page.getByRole('button', { name: 'Combos', exact: true }).click();
  await page.getByRole('button', { name: 'Crear combo', exact: true }).click();
  await page.getByLabel('Nombre', { exact: true }).fill(name);
  await page.getByLabel('Descripción del combo').fill('Configuración que quiero volver a usar.');
  await page.getByRole('checkbox', { name: /Prueba · Granola artesanal/ }).check();
  await page.getByRole('checkbox', { name: /Prueba · Mix de semillas/ }).check();
  await page.getByLabel('Unidades de Prueba · Granola artesanal', { exact: true }).fill('2');
  await page.getByLabel('Visible en la tienda').uncheck();
  await page.getByRole('button', { name: 'Guardar combo' }).click();
  const current = page
    .locator('.merch-summary')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await current.getByText('Eliminar combo', { exact: true }).click();
  await current.getByRole('button', { name: 'Confirmar eliminación' }).click();
  await expect(current).toHaveCount(0);
  await page.getByRole('button', { name: 'Historial', exact: true }).click();
  await page.getByLabel('Tipo de configuración').selectOption('combo');
  await page.getByLabel('Buscar en el historial').fill(name);
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  const removed = page
    .locator('.history-card')
    .filter({ hasText: 'Eliminación de la lista' })
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await removed.getByRole('button', { name: 'Reutilizar configuración' }).click();
  await expect(page.getByLabel('Visible en la tienda')).not.toBeChecked();
  await expect(
    page.getByLabel('Unidades de Prueba · Granola artesanal', { exact: true }),
  ).toHaveValue('2');
  await expect(page.getByLabel('Descuento (%)')).toHaveValue('10');
  await page.getByRole('button', { name: 'Guardar combo' }).click();
  await expect(
    page.getByRole('button', { name: 'Editar Copia de ' + name, exact: true }),
  ).toBeVisible();
});
