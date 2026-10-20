import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { createStorage } from './storage.js';
import { productSchema } from './validation.js';
import { assert } from './errors.js';
import { serializeProduct } from './product.js';
export { serializeProduct } from './product.js';
import { catalog } from './merchandising.js';
export function catalogRoutes(db, config, ownerOnly) {
  const router = Router();
  const storage = createStorage(config);
  router.get('/products', async (_req, res) => res.json(await catalog(db)));
  router.get('/admin/products', ownerOnly, async (_req, res) => {
    const combos = new Set(
      (await db.prepare("SELECT id FROM merchandising WHERE kind='combo'").all()).map((p) => p.id),
    );
    res.json(
      (await db.prepare('SELECT * FROM products ORDER BY updated DESC').all()).map((p) => ({
        ...serializeProduct(p),
        isCombo: combos.has(p.id),
      })),
    );
  });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 5 * 1024 * 1024,
      files: 1,
      fields: 0,
    },
  });
  router.post('/admin/uploads', ownerOnly, upload.single('image'), async (req, res) => {
    assert(req.file, 400, 'Elegí una foto JPG, PNG o WebP de hasta 5 MB.');
    const filename = randomUUID() + '.webp';
    try {
      const source = sharp(req.file.buffer, {
        limitInputPixels: 20000000,
        animated: false,
      });
      const metadata = await source.metadata();
      assert(
        ['jpeg', 'png', 'webp'].includes(metadata.format),
        400,
        'Usá una foto JPG, PNG o WebP.',
      );
      const buffer = await source
        .rotate()
        .resize(1600, 1600, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({
          quality: 82,
        })
        .toBuffer();
      await storage.put(filename, buffer);
    } catch {
      assert(
        false,
        400,
        'No pudimos procesar la foto. Usá JPG, PNG o WebP de hasta 20 megapíxeles.',
      );
    }
    res.status(201).json({
      image: '/uploads/' + filename,
    });
  });
  async function save(req, res, create) {
    const p = productSchema.parse(req.body);
    const images = [...new Set(p.images || [p.image])];
    assert(images[0] === p.image, 400, 'La primera foto debe ser la portada.');
    assert(
      (await Promise.all(images.map((img) => storage.has(img)))).every(Boolean),
      400,
      'Volvé a cargar las fotos del producto.',
    );
    const id = create ? randomUUID() : req.params.id;
    assert(
      !(await db.prepare("SELECT id FROM merchandising WHERE kind='combo' AND id=?").get(id)),
      409,
      'Editá este combo desde Ofertas y ocasiones.',
    );
    if (!create)
      assert(
        await db.prepare('SELECT id FROM products WHERE id=?').get(id),
        404,
        'Producto no encontrado.',
      );
    await db
      .prepare(
        `INSERT INTO products(id,name,description,category,price_cents,image,weight,height,width,length,active,updated)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,
      description=excluded.description,category=excluded.category,price_cents=excluded.price_cents,image=excluded.image,
      weight=excluded.weight,height=excluded.height,width=excluded.width,length=excluded.length,
      active=excluded.active,updated=excluded.updated`,
      )
      .run(
        id,
        p.name,
        p.description,
        p.category,
        p.priceCents,
        p.image,
        p.weight,
        p.height,
        p.width,
        p.length,
        Number(p.active),
        Date.now(),
      );
    await db
      .prepare('UPDATE products SET gallery=? WHERE id=?')
      .run(JSON.stringify(images.slice(1)), id);
    res
      .status(create ? 201 : 200)
      .json(serializeProduct(await db.prepare('SELECT * FROM products WHERE id=?').get(id)));
  }
  router.post('/admin/products', ownerOnly, (req, res) => save(req, res, true));
  router.put('/admin/products/:id', ownerOnly, (req, res) => save(req, res, false));
  router.delete('/admin/products/:id', ownerOnly, async (req, res) => {
    assert(
      !(await db
        .prepare("SELECT id FROM merchandising WHERE kind='combo' AND id=?")
        .get(req.params.id)),
      409,
      'Eliminá este combo desde Ofertas y ocasiones para conservar su historial.',
    );
    const result = await db
      .prepare('UPDATE products SET active=0, updated=? WHERE id=?')
      .run(Date.now(), req.params.id);
    assert(result.changes, 404, 'Producto no encontrado.');
    res.status(204).end();
  });
  return router;
}
