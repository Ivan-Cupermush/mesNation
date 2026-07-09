import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

// Middleware: проверкака что пользователь — директор
async function requireDirector(req: AuthRequest, res: Response, next: Function) {
  try {
    const result = await pool.query(
      `SELECT rt.name FROM users u
       JOIN role_tree rt ON u.role_id = rt.id
       WHERE u.id = $1`,
      [req.userId]
    );
    if (result.rows.length === 0 || result.rows[0].name !== 'director') {
      return res.status(403).json({ error: 'Только директор может редактировать дерево прав' });
    }
    next();
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

// Рекурсивный CTE для получения всего поддерева
async function getSubtreeIds(nodeId: number): Promise<number[]> {
  const result = await pool.query(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM role_tree WHERE id = $1
       UNION ALL
       SELECT rt.id FROM role_tree rt
       INNER JOIN subtree s ON rt.parent_id = s.id
     )
     SELECT id FROM subtree`,
    [nodeId]
  );
  return result.rows.map((r: any) => r.id);
}

// GET /api/role-tree — получить всё дерево
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT rt.*, 
              (SELECT COUNT(*) FROM user_role_assignments ura WHERE ura.role_node_id = rt.id) as users_count
       FROM role_tree rt
       ORDER BY rt.level, rt.id`
    );
    res.json(result.rows);
  } catch (e) {
    console.error('Ошибка получения дерева:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/role-tree/:id/subtree — получить поддерево
router.get('/:id/subtree', async (req: AuthRequest, res: Response) => {
  try {
    const nodeId = parseInt(req.params.id);
    const ids = await getSubtreeIds(nodeId);
    const result = await pool.query(
      'SELECT * FROM role_tree WHERE id = ANY($1) ORDER BY level, id',
      [ids]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/role-tree — создать новый узел (только директор)
router.post('/', requireDirector, async (req: AuthRequest, res: Response) => {
  try {
    const { name, parent_id, description, color, icon } = req.body;
    if (!name) return res.status(400).json({ error: 'Название обязательно' });
    
    let level = 0;
    if (parent_id) {
      const parent = await pool.query('SELECT level FROM role_tree WHERE id = $1', [parent_id]);
      if (parent.rows.length === 0) return res.status(404).json({ error: 'Родительский узел не найден' });
      level = parent.rows[0].level + 1;
    }
    
    const result = await pool.query(
      `INSERT INTO role_tree (name, parent_id, description, level, color, icon, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, parent_id || null, description, level, color || '#6366F1', icon || '👤', req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (e) {
    console.error('Ошибка создания узла:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH /api/role-tree/:id — обновить узел (только директор)
router.patch('/:id', requireDirector, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, color, icon, parent_id } = req.body;
    
    // Защита: нельзя сделать узел своим же потомком
    if (parent_id) {
      const subtree = await getSubtreeIds(id);
      if (subtree.includes(parent_id)) {
        return res.status(400).json({ error: 'Нельзя переместить узел в своё поддерево' });
      }
    }
    
    const result = await pool.query(
      `UPDATE role_tree SET name = COALESCE($1, name), description = COALESCE($2, description),
       color = COALESCE($3, color), icon = COALESCE($4, icon), parent_id = COALESCE($5, parent_id)
       WHERE id = $6 RETURNING *`,
      [name, description, color, icon, parent_id, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Узел не найден' });
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/role-tree/:id — удалить узел (только если нет привязанных пользователей)
router.delete('/:id', requireDirector, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    
    // Защита: нельзя удалить корень (director)
    const node = await pool.query('SELECT name, parent_id FROM role_tree WHERE id = $1', [id]);
    if (node.rows.length === 0) return res.status(404).json({ error: 'Узел не найден' });
    if (node.rows[0].name === 'director') {
      return res.status(400).json({ error: 'Нельзя удалить корень дерева' });
    }
    
    // Проверка: есть ли пользователи в этом узле или в поддереве
    const subtree = await getSubtreeIds(id);
    const usersCheck = await pool.query(
      'SELECT COUNT(*) as cnt FROM user_role_assignments WHERE role_node_id = ANY($1)',
      [subtree]
    );
    if (parseInt(usersCheck.rows[0].cnt) > 0) {
      return res.status(400).json({ 
        error: 'Нельзя удалить: есть пользователи в этом узле или поддереве. Сначала переназначьте их.' 
      });
    }
    
    // Рекурсивно удаляем всё поддерево
    await pool.query('DELETE FROM role_tree WHERE id = ANY($1)', [subtree]);
    res.json({ success: true, deleted_count: subtree.length });
  } catch (e) {
    console.error('Ошибка удаления:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/users/:id/role — назначить роль пользователю
router.post('/users/:userId/assign', requireDirector, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    const { role_node_id } = req.body;
    
    if (!role_node_id) return res.status(400).json({ error: 'Укажите role_node_id' });
    
    const node = await pool.query('SELECT id FROM role_tree WHERE id = $1', [role_node_id]);
    if (node.rows.length === 0) return res.status(404).json({ error: 'Узел не найден' });
    
    // Обновляем users.role_id (для совместимости)
    await pool.query('UPDATE users SET role_id = $1 WHERE id = $2', [role_node_id, userId]);
    
    // Вставляем/обновляем в user_role_assignments
    await pool.query(
      `INSERT INTO user_role_assignments (user_id, role_node_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET role_node_id = $2, assigned_by = $3, assigned_at = NOW()`,
      [userId, role_node_id, req.userId]
    );
    
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/users/in-subtree/:nodeId — получить пользователей из поддерева
router.get('/users/in-subtree/:nodeId', async (req: AuthRequest, res: Response) => {
  try {
    const nodeId = parseInt(req.params.nodeId);
    const subtree = await getSubtreeIds(nodeId);
    const result = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, rt.name as role_name
       FROM users u
       JOIN user_role_assignments ura ON ura.user_id = u.id
       JOIN role_tree rt ON rt.id = ura.role_node_id
       WHERE ura.role_node_id = ANY($1)
       ORDER BY u.display_name`,
      [subtree]
    );
    res.json(result.rows);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
