import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { badRequest, notFound } from '../lib/errors';
import { paramId, validate } from '../lib/validate';
import { getChatRights } from '../services/access';

/**
 * Свои имена для коллег («Изменить контакт» в Telegram): видны только
 * владельцу — в списке чатов, шапке чата и подписях сообщений.
 * Монтируется на /api/contacts.
 */
const router = Router();

router.get('/names', async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    'SELECT user_id, first_name, last_name FROM contact_names WHERE owner_id = $1 ORDER BY user_id',
    [req.userId],
  );
  res.json(rows);
});

const nameSchema = z.object({
  first_name: z.string().trim().max(100).default(''),
  last_name: z.string().trim().max(100).default(''),
});

router.put('/:userId/name', validate(nameSchema), async (req: AuthRequest, res: Response) => {
  const userId = paramId(req, 'userId');
  if (userId === req.userId) throw badRequest('Своё имя меняется в профиле');
  const exists = await pool.query('SELECT 1 FROM users WHERE id = $1', [userId]);
  if (!exists.rows.length) throw notFound('Сотрудник не найден');
  const { first_name, last_name } = req.body as z.infer<typeof nameSchema>;
  if (!first_name && !last_name) {
    await pool.query('DELETE FROM contact_names WHERE owner_id = $1 AND user_id = $2', [req.userId, userId]);
    return res.json({ user_id: userId, first_name: '', last_name: '', reset: true });
  }
  const { rows } = await pool.query(
    `INSERT INTO contact_names (owner_id, user_id, first_name, last_name) VALUES ($1, $2, $3, $4)
     ON CONFLICT (owner_id, user_id) DO UPDATE SET first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, updated_at = NOW()
     RETURNING user_id, first_name, last_name`,
    [req.userId, userId, first_name, last_name],
  );
  res.json(rows[0]);
});

router.delete('/:userId/name', async (req: AuthRequest, res: Response) => {
  await pool.query('DELETE FROM contact_names WHERE owner_id = $1 AND user_id = $2', [req.userId, paramId(req, 'userId')]);
  res.json({ success: true });
});

/**
 * «Добавить в группу»: мои группы, куда я могу добавлять участников,
 * с пометкой, где сотрудник уже есть.
 */
router.get('/:userId/groups', async (req: AuthRequest, res: Response) => {
  const userId = paramId(req, 'userId');
  const { rows } = await pool.query(
    `SELECT c.id, c.name, c.avatar_url, c.is_supergroup,
            (SELECT COUNT(*)::int FROM chat_members x JOIN users xu ON xu.id = x.user_id AND xu.is_active WHERE x.chat_id = c.id) AS members_count,
            EXISTS (SELECT 1 FROM chat_members x WHERE x.chat_id = c.id AND x.user_id = $2) AS is_member
     FROM chats c
     JOIN chat_members cm ON cm.chat_id = c.id AND cm.user_id = $1
     WHERE c.type = 'group' AND c.deleted_at IS NULL
     ORDER BY COALESCE((SELECT MAX(id) FROM messages WHERE chat_id = c.id::text), 0) DESC`,
    [req.userId, userId],
  );
  const out = [];
  for (const c of rows) {
    const rights = await getChatRights(c.id, req.userId!);
    out.push({ ...c, can_add: rights.can('add_users') });
  }
  res.json(out);
});

/** Имя контакта целиком («Имя Фамилия») или null, если не задано. */
export async function contactNamesFor(ownerId: number): Promise<Map<number, string>> {
  const { rows } = await pool.query('SELECT user_id, first_name, last_name FROM contact_names WHERE owner_id = $1', [ownerId]);
  return new Map(rows.map((r) => [r.user_id as number, `${r.first_name} ${r.last_name}`.trim()]));
}

export default router;
