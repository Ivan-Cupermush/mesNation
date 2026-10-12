import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { validate, id } from '../lib/validate';
import { NOTIFICATION_SELECT } from '../services/notifications';

/** Колокольчик: лента уведомлений пользователя. Монтируется на /api/notifications. */
const router = Router();

const listQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
});

router.get('/', async (req: AuthRequest, res: Response) => {
  const { before, limit } = listQuery.parse(req.query);
  const { rows } = await pool.query(
    `SELECT ${NOTIFICATION_SELECT} FROM notifications n LEFT JOIN users a ON a.id = n.actor_id
     WHERE n.user_id = $1 AND ($2::int IS NULL OR n.id < $2)
     ORDER BY n.id DESC LIMIT $3`,
    [req.userId, before ?? null, limit],
  );
  res.json(rows);
});

router.get('/unread-count', async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL', [
    req.userId,
  ]);
  res.json({ count: rows[0].count });
});

/** Отметить прочитанными: перечисленные или все сразу (без ids). */
router.post('/read', validate(z.object({ ids: z.array(id).max(500).optional() })), async (req: AuthRequest, res: Response) => {
  const ids: number[] | undefined = req.body.ids;
  await pool.query(
    `UPDATE notifications SET read_at = NOW()
     WHERE user_id = $1 AND read_at IS NULL AND ($2::int[] IS NULL OR id = ANY($2::int[]))`,
    [req.userId, ids ?? null],
  );
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND read_at IS NULL', [
    req.userId,
  ]);
  res.json({ count: rows[0].count });
});

router.delete('/', async (req: AuthRequest, res: Response) => {
  await pool.query('DELETE FROM notifications WHERE user_id = $1', [req.userId]);
  res.json({ success: true });
});

export default router;
