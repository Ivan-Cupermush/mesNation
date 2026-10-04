import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { paramId, validate } from '../lib/validate';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { getAssignableUsers, getUserNode, isDirector, isSubordinate } from '../services/access';
import { loadProfile } from './auth';
import { generatePassword, hashPassword, passwordSchema } from '../lib/passwords';
import { audit, revokeSessions } from '../services/audit';

/** Монтируется на /api/users (после authenticate). */
const router = Router();

const USER_LIST_SELECT = `
  SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.is_active,
         u.deactivated_at, u.created_at,
         rt.id AS role_node_id, rt.name AS role_name, rt.color AS role_color, rt.icon AS role_icon,
         (rt.parent_id IS NULL AND rt.id IS NOT NULL) AS is_director
  FROM users u
  LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
  LEFT JOIN role_tree rt ON rt.id = ura.role_node_id`;

/**
 * Список сотрудников. По умолчанию только активные — деактивированные
 * не должны попадать в выбор участников, исполнителей и т.д.
 * ?include_inactive=true — для экрана управления сотрудниками.
 */
router.get('/', async (req: AuthRequest, res: Response) => {
  const includeInactive = req.query.include_inactive === 'true';
  const { rows } = await pool.query(
    `${USER_LIST_SELECT}
     ${includeInactive ? '' : 'WHERE u.is_active = TRUE'}
     ORDER BY u.is_active DESC, COALESCE(u.display_name, u.username)`,
  );
  res.json(rows);
});

/** Кому текущий пользователь может ставить задачи (себе, вниз по дереву, коллегам своего уровня). */
router.get('/assignable', async (req: AuthRequest, res: Response) => {
  res.json(await getAssignableUsers(req.userId!));
});

/** Может ли текущий пользователь управлять учётной записью target. */
async function canManage(actorId: number, targetId: number): Promise<boolean> {
  if (actorId === targetId) return false;
  if (await isDirector(actorId)) return true;
  return isSubordinate(actorId, targetId);
}

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const userId = paramId(req);
  const profile = await loadProfile(userId);
  if (!profile) throw notFound('Пользователь не найден');
  res.json({ ...profile, can_manage: await canManage(req.userId!, userId) });
});

const activeSchema = z.object({ is_active: z.boolean({ error: 'Укажите is_active' }) });

/**
 * Активация / деактивация сотрудника (вместо удаления — история задач
 * и переписки сохраняется). Доступно директору и руководителям для подчинённых.
 */
router.patch('/:id/active', validate(activeSchema), async (req: AuthRequest, res: Response) => {
  const userId = paramId(req);
  const { is_active } = req.body as z.infer<typeof activeSchema>;
  if (userId === req.userId) throw badRequest('Нельзя деактивировать самого себя');
  if (!(await canManage(req.userId!, userId))) throw forbidden('Можно управлять только своими подчинёнными');
  const target = await getUserNode(userId);
  if (target.isRoot && !is_active) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM users u JOIN user_role_assignments ura ON ura.user_id = u.id
       JOIN role_tree rt ON rt.id = ura.role_node_id WHERE rt.parent_id IS NULL AND u.is_active`,
    );
    if (rows[0].n <= 1) throw badRequest('Нельзя деактивировать единственного директора');
  }
  const { rowCount } = await pool.query(
    `UPDATE users SET is_active = $1,
            deactivated_at = CASE WHEN $1 THEN NULL ELSE NOW() END,
            deactivated_by = CASE WHEN $1 THEN NULL ELSE $2::int END
     WHERE id = $3`,
    [is_active, req.userId, userId],
  );
  if (!rowCount) throw notFound('Пользователь не найден');
  if (!is_active) await revokeSessions(userId);
  await audit(is_active ? 'user_activated' : 'user_deactivated', { actorId: req.userId, targetId: userId, ip: req.ip });
  res.json(await loadProfile(userId));
});

const resetSchema = z.object({ password: passwordSchema.optional() });


/**
 * Сброс пароля сотруднику. Пароли хранятся только в виде хеша, поэтому
 * показать старый невозможно: админ задаёт новый вручную или получает
 * сгенерированный (он возвращается один раз, чтобы передать сотруднику).
 */
router.post('/:id/reset-password', validate(resetSchema), async (req: AuthRequest, res: Response) => {
  const userId = paramId(req);
  if (!(await canManage(req.userId!, userId))) throw forbidden('Можно управлять только своими подчинёнными');
  const password = (req.body as z.infer<typeof resetSchema>).password || generatePassword();
  const { rowCount } = await pool.query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2', [
    await hashPassword(password),
    userId,
  ]);
  if (!rowCount) throw notFound('Пользователь не найден');
  // Старый пароль мог быть скомпрометирован — завершаем все сессии сотрудника.
  await revokeSessions(userId);
  await audit('password_reset', { actorId: req.userId, targetId: userId, ip: req.ip });
  res.json({ password });
});

export default router;
