import { Router, Response } from 'express';
import { PoolClient } from 'pg';
import { z } from 'zod';
import pool, { withTransaction } from '../db/pool';
import { AuthRequest, requireDirector } from '../middleware/auth';
import { id, paramId, validate } from '../lib/validate';
import { badRequest, conflict, notFound } from '../lib/errors';
import { getAssignableUsers, getSubtreeNodeIds } from '../services/access';
import { emailSchema, usernameSchema } from './auth';
import { hashPassword, passwordSchema } from '../lib/passwords';
import { audit } from '../services/audit';

/**
 * Дерево ролей (иерархия должностей). Монтируется на /api/role-tree.
 * Читать дерево может любой сотрудник, изменять — только директор.
 */
const router = Router();

const NODE_SELECT = `
  WITH RECURSIVE t AS (
    SELECT id, 0 AS depth FROM role_tree WHERE parent_id IS NULL
    UNION ALL
    SELECT rt.id, t.depth + 1 FROM role_tree rt JOIN t ON rt.parent_id = t.id WHERE t.depth < 100
  )
  SELECT rt.*, t.depth, (rt.parent_id IS NULL) AS is_root,
         (SELECT COUNT(*)::int FROM user_role_assignments ura JOIN users u ON u.id = ura.user_id
          WHERE ura.role_node_id = rt.id AND u.is_active) AS users_count
  FROM role_tree rt LEFT JOIN t ON t.id = rt.id`;

/** Пересчитывает колонку level по фактической структуре (после переноса/удаления узлов). */
async function recomputeLevels(client: PoolClient) {
  await client.query(`
    WITH RECURSIVE t AS (
      SELECT id, 0 AS depth FROM role_tree WHERE parent_id IS NULL
      UNION ALL
      SELECT rt.id, t.depth + 1 FROM role_tree rt JOIN t ON rt.parent_id = t.id WHERE t.depth < 100
    )
    UPDATE role_tree SET level = t.depth FROM t WHERE role_tree.id = t.id AND role_tree.level IS DISTINCT FROM t.depth`);
}

router.get('/', async (_req, res) => {
  const { rows } = await pool.query(`${NODE_SELECT} ORDER BY t.depth NULLS LAST, rt.id`);
  res.json(rows);
});

/** Кому текущий пользователь может ставить задачи (для веб-клиента). */
router.get('/subtree-users', async (req: AuthRequest, res: Response) => {
  res.json(await getAssignableUsers(req.userId!));
});

router.get('/:id/subtree', async (req: AuthRequest, res: Response) => {
  const ids = await getSubtreeNodeIds(paramId(req));
  const { rows } = await pool.query(`${NODE_SELECT} WHERE rt.id = ANY($1::int[]) ORDER BY t.depth, rt.id`, [ids]);
  res.json(rows);
});

const USER_SELECT = `
  SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.is_active,
         rt.id AS role_node_id, rt.name AS role_name
  FROM users u
  JOIN user_role_assignments ura ON ura.user_id = u.id
  JOIN role_tree rt ON rt.id = ura.role_node_id`;

/** Люди, привязанные непосредственно к узлу (без поддерева). */
router.get('/:id/users', async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.include_inactive === 'true';
  const { rows } = await pool.query(
    `${USER_SELECT} WHERE rt.id = $1 ${includeInactive ? '' : 'AND u.is_active'}
     ORDER BY COALESCE(u.display_name, u.username)`,
    [paramId(req)],
  );
  res.json(rows);
});

/** Люди всего поддерева узла. */
router.get('/users/in-subtree/:nodeId', async (req: AuthRequest, res: Response) => {
  const ids = await getSubtreeNodeIds(paramId(req, 'nodeId'));
  const { rows } = await pool.query(
    `${USER_SELECT} WHERE rt.id = ANY($1::int[]) AND u.is_active ORDER BY COALESCE(u.display_name, u.username)`,
    [ids],
  );
  res.json(rows);
});

const nodeSchema = z.object({
  name: z.string().trim().min(1, 'Название обязательно').max(100, 'Название слишком длинное'),
  parent_id: id,
  description: z.string().trim().max(1000).nullish(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Цвет в формате #RRGGBB').optional(),
  icon: z.string().max(16).optional(),
});

router.post('/', requireDirector, validate(nodeSchema), async (req: AuthRequest, res: Response) => {
  const { name, parent_id, description, color, icon } = req.body as z.infer<typeof nodeSchema>;
  const node = await withTransaction(async (client) => {
    const parent = await client.query('SELECT level FROM role_tree WHERE id = $1', [parent_id]);
    if (!parent.rows.length) throw notFound('Родительская роль не найдена');
    const created = (
      await client.query(
        `INSERT INTO role_tree (name, parent_id, description, level, color, icon, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [name, parent_id, description ?? null, (parent.rows[0].level ?? 0) + 1, color || '#6366F1', icon || '👤', req.userId],
      )
    ).rows[0];
    await recomputeLevels(client);
    return created;
  });
  const { rows } = await pool.query(`${NODE_SELECT} WHERE rt.id = $1`, [node.id]);
  res.status(201).json(rows[0]);
});

const patchSchema = nodeSchema.partial();

router.patch('/:id', requireDirector, validate(patchSchema), async (req: AuthRequest, res: Response) => {
  const nodeId = paramId(req);
  const { name, description, color, icon, parent_id } = req.body as z.infer<typeof patchSchema>;
  await withTransaction(async (client) => {
    // Блокируем дерево на время изменения, чтобы параллельные переносы не создали цикл.
    await client.query('SELECT pg_advisory_xact_lock(4242002)');
    const node = (await client.query('SELECT * FROM role_tree WHERE id = $1', [nodeId])).rows[0];
    if (!node) throw notFound('Роль не найдена');
    if (parent_id !== undefined && parent_id !== node.parent_id) {
      if (node.parent_id === null) throw badRequest('Корень дерева (директора) перенести нельзя');
      const sub = await getSubtreeNodeIds(nodeId);
      if (sub.includes(parent_id)) throw badRequest('Нельзя перенести роль внутрь её собственного поддерева');
      const parent = await client.query('SELECT 1 FROM role_tree WHERE id = $1', [parent_id]);
      if (!parent.rows.length) throw notFound('Родительская роль не найдена');
    }
    await client.query(
      `UPDATE role_tree SET name = COALESCE($1, name), description = COALESCE($2, description),
              color = COALESCE($3, color), icon = COALESCE($4, icon), parent_id = COALESCE($5, parent_id)
       WHERE id = $6`,
      [name ?? null, description ?? null, color ?? null, icon ?? null, parent_id ?? null, nodeId],
    );
    await recomputeLevels(client);
  });
  const { rows } = await pool.query(`${NODE_SELECT} WHERE rt.id = $1`, [nodeId]);
  res.json(rows[0]);
});

/** Удаление роли: дети переходят к родителю. Роль с людьми удалить нельзя. */
router.delete('/:id', requireDirector, async (req: AuthRequest, res: Response) => {
  const nodeId = paramId(req);
  await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(4242002)');
    const node = (await client.query('SELECT * FROM role_tree WHERE id = $1', [nodeId])).rows[0];
    if (!node) throw notFound('Роль не найдена');
    if (node.parent_id === null) throw badRequest('Корень дерева удалить нельзя');
    const users = await client.query(
      `SELECT COUNT(*)::int AS n FROM user_role_assignments WHERE role_node_id = $1`,
      [nodeId],
    );
    if (users.rows[0].n > 0) {
      throw badRequest(`К роли «${node.name}» привязано сотрудников: ${users.rows[0].n} (включая деактивированных). Сначала перенесите их.`);
    }
    await client.query('UPDATE role_tree SET parent_id = $1 WHERE parent_id = $2', [node.parent_id, nodeId]);
    await client.query('UPDATE users SET role_id = NULL WHERE role_id = $1', [nodeId]);
    await client.query('DELETE FROM role_tree WHERE id = $1', [nodeId]);
    await recomputeLevels(client);
  });
  res.json({ success: true, message: 'Роль удалена, дочерние роли перешли к родителю' });
});

/** Привязывает пользователя к узлу (единый источник + синхронизация users.role_id). */
async function assignNode(client: PoolClient, userId: number, nodeId: number, actorId: number) {
  await client.query(
    `INSERT INTO user_role_assignments (user_id, role_node_id, assigned_by) VALUES ($1, $2, $3)
     ON CONFLICT (user_id) DO UPDATE SET role_node_id = $2, assigned_by = $3, assigned_at = NOW()`,
    [userId, nodeId, actorId],
  );
  await client.query('UPDATE users SET role_id = $1 WHERE id = $2', [nodeId, userId]);
}

const assignSchema = z.object({ role_node_id: id });

router.post('/users/:userId/assign', requireDirector, validate(assignSchema), async (req: AuthRequest, res: Response) => {
  const userId = paramId(req, 'userId');
  const { role_node_id } = req.body as z.infer<typeof assignSchema>;
  await withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(4242002)');
    const node = (await client.query('SELECT parent_id FROM role_tree WHERE id = $1', [role_node_id])).rows[0];
    if (!node) throw notFound('Роль не найдена');
    const user = (await client.query('SELECT id FROM users WHERE id = $1', [userId])).rows[0];
    if (!user) throw notFound('Пользователь не найден');
    const current = (
      await client.query(
        `SELECT rt.parent_id FROM user_role_assignments ura JOIN role_tree rt ON rt.id = ura.role_node_id WHERE ura.user_id = $1`,
        [userId],
      )
    ).rows[0];
    if (current && current.parent_id === null && node.parent_id !== null) {
      const directors = await client.query(
        `SELECT COUNT(*)::int AS n FROM user_role_assignments ura
         JOIN role_tree rt ON rt.id = ura.role_node_id JOIN users u ON u.id = ura.user_id
         WHERE rt.parent_id IS NULL AND u.is_active`,
      );
      if (directors.rows[0].n <= 1) throw badRequest('Нельзя убрать единственного директора с позиции директора');
    }
    await assignNode(client, userId, role_node_id, req.userId!);
  });
  await audit('role_assigned', { actorId: req.userId, targetId: userId, ip: req.ip, meta: { role_node_id } });
  res.json({ success: true });
});

const createUserSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  display_name: z.string().trim().max(255).optional(),
  role_node_id: id,
});

router.post('/users', requireDirector, validate(createUserSchema), async (req: AuthRequest, res: Response) => {
  const body = req.body as z.infer<typeof createUserSchema>;
  const user = await withTransaction(async (client) => {
    const node = await client.query('SELECT 1 FROM role_tree WHERE id = $1', [body.role_node_id]);
    if (!node.rows.length) throw notFound('Роль не найдена');
    const dup = await client.query('SELECT 1 FROM users WHERE LOWER(username) = LOWER($1) OR LOWER(email) = $2', [
      body.username,
      body.email,
    ]);
    if (dup.rows.length) throw conflict('Пользователь с таким логином или email уже существует');
    const created = (
      await client.query(
        `INSERT INTO users (username, email, password_hash, display_name, role_id, name)
         VALUES ($1, $2, $3, $4, $5, $1) RETURNING id, username, email, display_name, avatar_url, is_active`,
        [body.username, body.email, await hashPassword(body.password), body.display_name || body.username, body.role_node_id],
      )
    ).rows[0];
    await assignNode(client, created.id, body.role_node_id, req.userId!);
    return created;
  });
  await audit('user_created', { actorId: req.userId, targetId: user.id, ip: req.ip });
  res.status(201).json({ ...user, role_node_id: body.role_node_id });
});

export default router;
