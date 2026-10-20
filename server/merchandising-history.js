import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assert } from './errors.js';
export async function recordHistory(db, id, kind, event, data) {
  await db
    .prepare('INSERT INTO merchandising_history VALUES(?,?,?,?,?,?,?)')
    .run(randomUUID(), id, kind, event, data.name, JSON.stringify(data), Date.now());
}
export function historyRoutes(db, ownerOnly) {
  const router = Router();
  router.use(ownerOnly);
  router.get('/', async (req, res) => {
    const filter = z.enum(['all', 'campaign', 'combo']).default('all').parse(req.query.kind);
    const page = z.coerce.number().int().min(1).max(100000).default(1).parse(req.query.page);
    const search = z.string().trim().max(100).default('').parse(req.query.search);
    const where = "WHERE (?='all' OR kind=?) AND lower(name) LIKE lower(?)";
    const params = [filter, filter, '%' + search + '%'];
    const total = (
      await db.prepare('SELECT count(*) AS n FROM merchandising_history ' + where).get(...params)
    ).n;
    const entries = (
      await db
        .prepare(
          'SELECT * FROM merchandising_history ' +
            where +
            ' ORDER BY created DESC,id DESC LIMIT 12 OFFSET ?',
        )
        .all(...params, (page - 1) * 12)
    ).map((row) => ({
      ...row,
      data: JSON.parse(row.data),
    }));
    res.json({
      entries,
      total,
      page,
      pages: Math.ceil(total / 12),
    });
  });
  router.delete('/:id', async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const result = await db.prepare('DELETE FROM merchandising_history WHERE id=?').run(id);
    assert(result.changes, 404, 'La versión ya no está en el historial.');
    res.status(204).end();
  });
  return router;
}
