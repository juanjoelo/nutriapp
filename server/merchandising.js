import { Router } from 'express';
import { createStorage } from './storage.js';
import { z } from 'zod';
import { serializeProduct } from './product.js';
import { transaction } from './database.js';
import { assert } from './errors.js';
import { salesSummary } from './admin.js';
import { recordHistory } from './merchandising-history.js';
const image = z.string().regex(/^\/uploads\/[a-f0-9-]{36}\.webp$/);
const percent = z.number().int().min(0).max(90);
const campaignSchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    enabled: z.boolean(),
    scheduled: z.boolean(),
    start: z.number().int().nonnegative().nullable(),
    end: z.number().int().nonnegative().nullable(),
    discount: percent,
    productIds: z.array(z.string().uuid()).max(200),
    appearance: z.boolean(),
    priority: z.number().int().min(0).max(100),
    title: z.string().trim().max(120),
    subtitle: z.string().trim().max(300),
    announcement: z.string().trim().max(180),
    button: z.string().trim().min(1).max(40),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    background: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    ink: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    image: z.union([image, z.literal('')]),
  })
  .strict()
  .refine((c) => !c.scheduled || (c.start !== null && c.end !== null && c.end > c.start), {
    message: 'Indicá inicio y fin válidos para la campaña.',
  });
const comboSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().min(5).max(4000),
    image: z.union([image, z.literal('')]),
    discount: percent,
    active: z.boolean(),
    components: z
      .array(
        z
          .object({
            id: z.string().uuid(),
            quantity: z.number().int().min(1).max(10),
          })
          .strict(),
      )
      .min(2)
      .max(10),
  })
  .strict()
  .refine(
    (c) =>
      new Set(c.components.map((p) => p.id)).size === c.components.length &&
      c.components.reduce((n, p) => n + p.quantity, 0) <= 20,
  );
export async function content(db, kind) {
  return (
    await db
      .prepare(
        'SELECT id,data FROM merchandising WHERE kind=? AND id NOT IN (SELECT id FROM merchandising_archived) ORDER BY id',
      )
      .all(kind)
  ).map((r) => ({
    ...JSON.parse(r.data),
    id: r.id,
  }));
}
export async function activeCampaigns(db, now = Date.now()) {
  return (await content(db, 'campaign'))
    .filter((c) => c.enabled && (!c.scheduled || (c.start <= now && now < c.end)))
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}
export async function catalog(db, now = Date.now()) {
  const campaigns = await activeCampaigns(db, now);
  const originals = (await db.prepare('SELECT * FROM products ORDER BY updated DESC').all()).map(
    serializeProduct,
  );
  const byId = new Map(originals.map((p) => [p.id, p]));
  const combos = new Map((await content(db, 'combo')).map((c) => [c.id, c]));
  return originals
    .filter((p) => p.active)
    .flatMap((p) => {
      let base = p.priceCents,
        discount = 0,
        components;
      const combo = combos.get(p.id);
      if (combo) {
        components = combo.components.map((c) => ({
          ...byId.get(c.id),
          quantity: c.quantity,
        }));
        if (components.some((c) => !c.active || combos.has(c.id))) return [];
        base = components.reduce((n, c) => n + c.priceCents * c.quantity, 0);
        discount = combo.discount;
        p = {
          ...p,
          weight: components.reduce((n, c) => n + c.weight * c.quantity, 0),
          height: components.reduce((n, c) => n + c.height * c.quantity, 0),
          width: Math.max(...components.map((c) => c.width)),
          length: Math.max(...components.map((c) => c.length)),
        };
      }
      for (const c of campaigns)
        if (!c.productIds.length || c.productIds.includes(p.id))
          discount = Math.max(discount, c.discount);
      const priceCents = Math.round((base * (100 - discount)) / 100);
      return [
        {
          ...p,
          basePriceCents: base,
          priceCents,
          discountPercent: discount,
          ...(components
            ? {
                components: components.map((c) => ({
                  id: c.id,
                  name: c.name,
                  quantity: c.quantity,
                })),
              }
            : {}),
        },
      ];
    });
}
export function merchandisingRoutes(db, config, ownerOnly) {
  const router = Router();
  const storage = createStorage(config);
  router.get('/storefront', async (_req, res) => {
    const products = new Map((await catalog(db)).map((p) => [p.id, p]));
    const bestsellers = (await salesSummary(db, 30)).products
      .filter((p) => p.units > 0 && products.has(p.id))
      .slice(0, 12)
      .map((p) => ({
        ...products.get(p.id),
        units: p.units,
      }));
    const c = (await activeCampaigns(db)).find((c) => c.appearance);
    const boundaries = (await content(db, 'campaign'))
      .filter((c) => c.enabled && c.scheduled)
      .flatMap((c) => [c.start, c.end])
      .filter((time) => time > Date.now());
    res.json({
      bestsellers,
      nextChange: boundaries.length ? Math.min(...boundaries) : null,
      campaign: c
        ? {
            id: c.id,
            title: c.title,
            subtitle: c.subtitle,
            announcement: c.announcement,
            button: c.button,
            color: c.color,
            background: c.background,
            ink: c.ink,
            image: c.image,
          }
        : null,
    });
  });
  router.get('/admin/merchandising', ownerOnly, async (_req, res) =>
    res.json({
      campaigns: await content(db, 'campaign'),
      combos: await content(db, 'combo'),
    }),
  );
  async function checkImage(value) {
    assert(!value || (await storage.has(value)), 400, 'Volvé a cargar la imagen.');
  }
  router.put('/admin/campaigns/:id', ownerOnly, async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      c = campaignSchema.parse(req.body);
    assert(
      !(await db.prepare('SELECT id FROM merchandising_archived WHERE id=?').get(id)),
      409,
      'Reutilizá la configuración como una copia nueva desde el historial.',
    );
    assert(
      !(await db.prepare("SELECT id FROM merchandising WHERE id=? AND kind!='campaign'").get(id)),
      409,
      'Identificador ocupado.',
    );
    await checkImage(c.image);
    const knownProducts = new Set(
      (await db.prepare('SELECT id FROM products').all()).map((p) => p.id),
    );
    assert(
      c.productIds.every((id) => knownProducts.has(id)),
      400,
      'Revisá los productos elegidos.',
    );
    await transaction(db, async () => {
      assert(
        !(await db.prepare('SELECT id FROM merchandising_archived WHERE id=?').get(id)),
        409,
        'Esta configuración fue eliminada. Reutilizala como una copia.',
      );
      const exists = await db.prepare('SELECT id FROM merchandising WHERE id=?').get(id);
      await db
        .prepare(
          "INSERT INTO merchandising VALUES(?,'campaign',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE merchandising.kind='campaign'",
        )
        .run(id, JSON.stringify(c));
      await recordHistory(db, id, 'campaign', exists ? 'updated' : 'created', c);
    });
    res.json({
      ...c,
      id,
    });
  });
  router.put('/admin/combos/:id', ownerOnly, async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      c = comboSchema.parse(req.body);
    assert(
      !(await db.prepare('SELECT id FROM merchandising_archived WHERE id=?').get(id)),
      409,
      'Reutilizá la configuración como una copia nueva desde el historial.',
    );
    assert(
      !(await db.prepare("SELECT id FROM merchandising WHERE id=? AND kind!='combo'").get(id)),
      409,
      'Identificador ocupado.',
    );
    await checkImage(c.image);
    const comboIds = new Set(
      (await db.prepare("SELECT id FROM merchandising WHERE kind='combo'").all()).map((c) => c.id),
    );
    const parts = await Promise.all(
      c.components.map(async (c) => ({
        ...(await db.prepare('SELECT * FROM products WHERE id=?').get(c.id)),
        quantity: c.quantity,
      })),
    );
    assert(
      parts.every((p) => p.id && (p.active || !c.active) && p.id !== id && !comboIds.has(p.id)),
      400,
      'Elegí productos individuales visibles.',
    );
    const existing = await db.prepare('SELECT id FROM products WHERE id=?').get(id);
    assert(!existing || comboIds.has(id), 409, 'Este identificador pertenece a otro producto.');
    const weight = parts.reduce((n, p) => n + p.weight * p.quantity, 0),
      height = parts.reduce((n, p) => n + p.height * p.quantity, 0);
    assert(
      weight <= 24900 && height <= 148 && parts.every((p) => p.width <= 148 && p.length <= 148),
      400,
      'El combo supera el límite de un paquete. Reducí sus unidades.',
    );
    const price = parts.reduce((n, p) => n + p.price_cents * p.quantity, 0);
    assert(price <= 100000000, 400, 'El combo supera el precio máximo permitido.');
    await transaction(db, async () => {
      assert(
        !(await db.prepare('SELECT id FROM merchandising_archived WHERE id=?').get(id)),
        409,
        'Esta configuración fue eliminada. Reutilizala como una copia.',
      );
      const exists = await db.prepare('SELECT id FROM merchandising WHERE id=?').get(id);
      await db
        .prepare(
          "INSERT INTO merchandising VALUES(?,'combo',?) ON CONFLICT(id) DO UPDATE SET data=excluded.data WHERE merchandising.kind='combo'",
        )
        .run(id, JSON.stringify(c));
      await db
        .prepare(
          `INSERT INTO products(id,name,description,category,price_cents,image,weight,height,width,length,active,updated)
        VALUES(?,?,?,'Combos',?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,
        price_cents=excluded.price_cents,image=excluded.image,active=excluded.active,updated=excluded.updated`,
        )
        .run(
          id,
          c.name,
          c.description,
          price,
          c.image || parts[0].image,
          weight,
          height,
          Math.max(...parts.map((p) => p.width)),
          Math.max(...parts.map((p) => p.length)),
          Number(c.active),
          Date.now(),
        );
      await recordHistory(db, id, 'combo', exists ? 'updated' : 'created', c);
    });
    res.json({
      ...c,
      id,
    });
  });
  for (const [route, kind] of [
    ['campaigns', 'campaign'],
    ['combos', 'combo'],
  ])
    router.delete('/admin/' + route + '/:id', ownerOnly, async (req, res) => {
      const id = z.string().uuid().parse(req.params.id);
      await transaction(db, async () => {
        const row = await db
          .prepare(
            'SELECT * FROM merchandising WHERE id=? AND kind=? AND id NOT IN (SELECT id FROM merchandising_archived)',
          )
          .get(id, kind);
        assert(row, 404, 'Esta configuración ya no está en la lista.');
        await recordHistory(db, id, kind, 'deleted', JSON.parse(row.data));
        await db.prepare('INSERT INTO merchandising_archived VALUES(?)').run(id);
        if (kind === 'combo')
          await db.prepare('UPDATE products SET active=0,updated=? WHERE id=?').run(Date.now(), id);
      });
      res.status(204).end();
    });
  return router;
}
