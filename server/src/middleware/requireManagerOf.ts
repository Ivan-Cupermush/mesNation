import { Request, Response, NextFunction } from 'express';
import pool from '../db/pool';

/**
 * Проверяет, что текущий пользователь является руководителем целевого юзера
 * через иерархическое дерево role_tree.
 * 
 * Используется для эндпоинтов типа "назначить план подчинённому".
 * Проверяет: role_id целевого юзера находится в поддереве role_id текущего.
 */
export function requireManagerOf(getTargetUserId: (req: Request) => number | undefined) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const managerId = (req as any).userId;
      const targetUserId = getTargetUserId(req);

      if (!managerId) return res.status(401).json({ error: 'Не авторизован' });
      if (!targetUserId) return res.status(400).json({ error: 'Не указан целевой пользователь' });
      if (managerId === targetUserId) return res.status(403).json({ error: 'Нельзя управлять собой' });

      // Получить роли обоих пользователей
      const rolesResult = await pool.query(
        `SELECT 
           (SELECT role_id FROM users WHERE id = $1) as manager_role,
           (SELECT role_id FROM users WHERE id = $2) as target_role`,
        [managerId, targetUserId]
      );

      const { manager_role, target_role } = rolesResult.rows[0];
      if (!manager_role || !target_role) {
        return res.status(403).json({ error: 'У одного из пользователей не задана роль' });
      }

      // Рекурсивно получить поддерево роли руководителя
      const subtreeResult = await pool.query(
        `WITH RECURSIVE subtree AS (
           SELECT id FROM role_tree WHERE id = $1
           UNION
           SELECT rt.id FROM role_tree rt
           INNER JOIN subtree s ON rt.parent_id = s.id
         )
         SELECT id FROM subtree`,
        [manager_role]
      );

      const subtreeIds = subtreeResult.rows.map((r: any) => r.id);
      if (!subtreeIds.includes(target_role)) {
        return res.status(403).json({ 
          error: 'Вы не являетесь руководителем этого пользователя' 
        });
      }

      next();
    } catch (err) {
      console.error('Ошибка проверки руководителя:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
}
