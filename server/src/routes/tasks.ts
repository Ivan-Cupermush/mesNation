import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

// Функция для получения поддерева пользователя (всех потомков)
async function getUserSubtree(userId: number): Promise<number[]> {
  const roleResult = await pool.query(
    'SELECT role_id FROM users WHERE id = $1',
    [userId]
  );
  if (roleResult.rows.length === 0 || !roleResult.rows[0].role_id) {
    return [];
  }
  const nodeId = roleResult.rows[0].role_id;
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

// Функция для получения "наддерева" (всех предков)
async function getUserAncestors(userId: number): Promise<number[]> {
  const roleResult = await pool.query(
    'SELECT role_id FROM users WHERE id = $1',
    [userId]
  );
  if (roleResult.rows.length === 0 || !roleResult.rows[0].role_id) {
    return [];
  }
  const nodeId = roleResult.rows[0].role_id;
  const result = await pool.query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id FROM role_tree WHERE id = $1
       UNION ALL
       SELECT rt.id, rt.parent_id FROM role_tree rt
       INNER JOIN ancestors a ON rt.id = a.parent_id
     )
     SELECT id FROM ancestors`,
    [nodeId]
  );
  return result.rows.map((r: any) => r.id);
}

// GET /api/tasks — список задач (с фильтрами)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { filter, status, importance } = req.query;
    
    let whereClause = 'WHERE 1=1';
    const params: any[] = [];
    let paramIdx = 1;
    
    if (filter === 'mine') {
      // Задачи где я исполнитель
      whereClause += ` AND t.id IN (SELECT task_id FROM task_assignees WHERE user_id = $${paramIdx})`;
      params.push(userId);
      paramIdx++;
    } else if (filter === 'created') {
      // Задачи которые я создал
      whereClause += ` AND t.creator_id = $${paramIdx}`;
      params.push(userId);
      paramIdx++;
    } else if (filter === 'watching') {
      // Задачи где я наблюдатель
      whereClause += ` AND t.id IN (SELECT task_id FROM task_watchers WHERE user_id = $${paramIdx})`;
      params.push(userId);
      paramIdx++;
    }
    // filter === 'all' или не указан — показываем задачи где:
    // 1. Я исполнитель
    // 2. Я наблюдатель
    // 3. Создатель из моего поддерева (подчинённые)
    // 4. Создатель из моего наддерева (начальники) + я участвую
    else {
      const subtree = await getUserSubtree(userId);
      const ancestors = await getUserAncestors(userId);
      
      whereClause += ` AND (
        -- Я исполнитель
        t.id IN (SELECT task_id FROM task_assignees WHERE user_id = $${paramIdx})
        -- Я наблюдатель
        OR t.id IN (SELECT task_id FROM task_watchers WHERE user_id = $${paramIdx + 1})
        -- Задача создана кем-то из моего поддерева (подчинённые)
        OR t.creator_id IN (
          SELECT u.id FROM users u
          JOIN user_role_assignments ura ON ura.user_id = u.id
          WHERE ura.role_node_id = ANY($${paramIdx + 2})
        )
        -- Задача создана кем-то из наддерева (начальники), НО только если я участвую
        OR (
          t.creator_id IN (
            SELECT u.id FROM users u
            JOIN user_role_assignments ura ON ura.user_id = u.id
            WHERE ura.role_node_id = ANY($${paramIdx + 3})
          )
          AND (
            t.id IN (SELECT task_id FROM task_assignees WHERE user_id = $${paramIdx})
            OR t.id IN (SELECT task_id FROM task_watchers WHERE user_id = $${paramIdx + 1})
          )
        )
      )`;
      params.push(userId, userId, subtree, ancestors);
      paramIdx += 4;
    }
    
    if (status) {
      whereClause += ` AND t.status_new = $${paramIdx}`;
      params.push(status);
      paramIdx++;
    }
    if (importance) {
      whereClause += ` AND t.importance = $${paramIdx}`;
      params.push(importance);
      paramIdx++;
    }
    
    const result = await pool.query(
      `SELECT t.*, 
              u_creator.username as creator_username,
              u_creator.display_name as creator_name,
              (SELECT COUNT(*) FROM task_assignees WHERE task_id = t.id) as assignees_count,
              (SELECT COUNT(*) FROM task_watchers WHERE task_id = t.id) as watchers_count,
              (SELECT COUNT(*) FROM task_checkpoints WHERE task_id = t.id AND status = 'pending') as pending_checkpoints
       FROM tasks t
       JOIN users u_creator ON u_creator.id = t.creator_id
       ${whereClause}
       ORDER BY 
         CASE t.importance WHEN 'red' THEN 1 WHEN 'yellow' THEN 2 ELSE 3 END,
         t.hard_deadline ASC NULLS LAST,
         t.created_at DESC`,
      params
    );
    
    // Для каждой задачи подгружаем исполнителей
    for (const task of result.rows) {
      const assignees = await pool.query(
        `SELECT u.id, u.username, u.display_name, u.avatar_url 
         FROM task_assignees ta JOIN users u ON u.id = ta.user_id
         WHERE ta.task_id = $1`,
        [task.id]
      );
      task.assignees = assignees.rows;
    }
    
    res.json(result.rows);
  } catch (e) {
    console.error('Ошибка получения задач:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// GET /api/tasks/:id — детали задачи
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const result = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Задача не найдена' });
    const task = result.rows[0];
    
    // Подгружаем связанные данные
    const [assignees, watchers, checkpoints, canvas, files, creator] = await Promise.all([
      pool.query(`SELECT u.id, u.username, u.display_name, u.avatar_url 
                  FROM task_assignees ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = $1`, [id]),
      pool.query(`SELECT u.id, u.username, u.display_name, u.avatar_url 
                  FROM task_watchers tw JOIN users u ON u.id = tw.user_id WHERE tw.task_id = $1`, [id]),
      pool.query('SELECT * FROM task_checkpoints WHERE task_id = $1 ORDER BY deadline', [id]),
      pool.query(`SELECT cp.*, u.username, u.display_name 
                  FROM task_canvas_posts cp JOIN users u ON u.id = cp.author_id 
                  WHERE cp.task_id = $1 ORDER BY cp.created_at`, [id]),
      pool.query('SELECT * FROM task_files WHERE task_id = $1', [id]),
      pool.query('SELECT id, username, display_name, avatar_url FROM users WHERE id = $1', [task.creator_id]),
    ]);
    
    res.json({
      ...task,
      assignees: assignees.rows,
      watchers: watchers.rows,
      checkpoints: checkpoints.rows,
      canvas: canvas.rows,
      files: files.rows,
      creator: creator.rows[0],
    });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/tasks — создать задачу
router.post('/', async (req: AuthRequest, res: Response) => {
  const client = await pool.connect();
  try {
    const { title, description, importance, hard_deadline, assignee_ids, watcher_ids, checkpoints } = req.body;
    const creatorId = req.userId!;
    
    if (!title) return res.status(400).json({ error: 'Название обязательно' });
    if (!assignee_ids || !Array.isArray(assignee_ids) || assignee_ids.length === 0) {
      return res.status(400).json({ error: 'Укажите хотя бы одного исполнителя' });
    }
    
    // Проверка: исполнители должны быть в поддереве создателя
    const subtree = await getUserSubtree(creatorId);
    const assigneesCheck = await pool.query(
      `SELECT u.id FROM users u
       JOIN user_role_assignments ura ON ura.user_id = u.id
       WHERE u.id = ANY($1) AND ura.role_node_id = ANY($2)`,
      [assignee_ids, subtree]
    );
    if (assigneesCheck.rows.length !== assignee_ids.length) {
      return res.status(403).json({ error: 'Некоторые исполнители не из вашего поддерева' });
    }
    
    await client.query('BEGIN');
    
    // Создаём задачу
    const taskResult = await client.query(
      `INSERT INTO tasks (title, description, importance, hard_deadline, creator_id, status_new)
       VALUES ($1, $2, $3, $4, $5, 'new') RETURNING *`,
      [title, description, importance || 'yellow', hard_deadline || null, creatorId]
    );
    const task = taskResult.rows[0];
    
    // Добавляем исполнителей
    for (const userId of assignee_ids) {
      await client.query(
        'INSERT INTO task_assignees (task_id, user_id) VALUES ($1, $2)',
        [task.id, userId]
      );
    }
    
    // Добавляем наблюдателей (по умолчанию создатель, если не указаны)
    const watchers = watcher_ids && Array.isArray(watcher_ids) && watcher_ids.length > 0 
      ? watcher_ids 
      : [creatorId];
    for (const userId of watchers) {
      await client.query(
        'INSERT INTO task_watchers (task_id, user_id) VALUES ($1, $2)',
        [task.id, userId]
      );
    }
    
    // Добавляем контрольные точки
    if (checkpoints && Array.isArray(checkpoints)) {
      for (const cp of checkpoints) {
        if (cp.title && cp.deadline) {
          await client.query(
            'INSERT INTO task_checkpoints (task_id, title, deadline) VALUES ($1, $2, $3)',
            [task.id, cp.title, cp.deadline]
          );
        }
      }
    }
    
    await client.query('COMMIT');
    res.status(201).json(task);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Ошибка создания задачи:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  } finally {
    client.release();
  }
});

// PATCH /api/tasks/:id — обновить задачу
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const { title, description, importance, hard_deadline, status_new, executor_comment, watcher_comment, archived_as } = req.body;
    const userId = req.userId!;
    
    const taskResult = await pool.query('SELECT * FROM tasks WHERE id = $1', [id]);
    if (taskResult.rows.length === 0) return res.status(404).json({ error: 'Задача не найдена' });
    const task = taskResult.rows[0];
    
    // Проверка прав
    const isCreator = task.creator_id === userId;
    const isAssignee = (await pool.query('SELECT 1 FROM task_assignees WHERE task_id = $1 AND user_id = $2', [id, userId])).rows.length > 0;
    const isWatcher = (await pool.query('SELECT 1 FROM task_watchers WHERE task_id = $1 AND user_id = $2', [id, userId])).rows.length > 0;
    
    // Кто что может менять
    if (title !== undefined || description !== undefined || importance !== undefined || archived_as !== undefined) {
      if (!isCreator) return res.status(403).json({ error: 'Только создатель может менять эти поля' });
    }
    if (executor_comment !== undefined && !isAssignee && !isCreator) {
      return res.status(403).json({ error: 'Только исполнитель может писать комментарий исполнителя' });
    }
    if (watcher_comment !== undefined && !isWatcher && !isCreator) {
      return res.status(403).json({ error: 'Только наблюдатель может писать комментарий наблюдателя' });
    }
    
    const result = await pool.query(
      `UPDATE tasks SET 
         title = COALESCE($1, title),
         description = COALESCE($2, description),
         importance = COALESCE($3, importance),
         hard_deadline = COALESCE($4, hard_deadline),
         status_new = COALESCE($5, status_new),
         executor_comment = COALESCE($6, executor_comment),
         watcher_comment = COALESCE($7, watcher_comment),
         archived_as = COALESCE($8, archived_as),
         updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [title, description, importance, hard_deadline, status_new, executor_comment, watcher_comment, archived_as, id]
    );
    res.json(result.rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/tasks/:id/canvas — добавить пост в Shared Canvas
router.post('/:id/canvas', async (req: AuthRequest, res: Response) => {
  try {
    const taskId = parseInt(req.params.id);
    const { content, content_type } = req.body;
    const userId = req.userId!;
    
    if (!content) return res.status(400).json({ error: 'Контент обязателен' });
    
    // Проверка: пользователь должен быть исполнителем или создателем
    const task = await pool.query('SELECT creator_id FROM tasks WHERE id = $1', [taskId]);
    if (task.rows.length === 0) return res.status(404).json({ error: 'Задача не найдена' });
    const isCreator = task.rows[0].creator_id === userId;
    const isAssignee = (await pool.query('SELECT 1 FROM task_assignees WHERE task_id = $1 AND user_id = $2', [taskId, userId])).rows.length > 0;
    
    if (!isCreator && !isAssignee) {
      return res.status(403).json({ error: 'Только создатель или исполнитель может писать в общий блокнот' });
    }
    
    const result = await pool.query(
      `INSERT INTO task_canvas_posts (task_id, author_id, content, content_type)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [taskId, userId, content, content_type || 'text']
    );
    
    // Подгружаем данные автора
    const author = await pool.query(
      'SELECT username, display_name, avatar_url FROM users WHERE id = $1',
      [userId]
    );
    
    res.status(201).json({
      ...result.rows[0],
      ...author.rows[0],
    });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/tasks/:id — удалить задачу (только создатель)
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    const task = await pool.query('SELECT creator_id FROM tasks WHERE id = $1', [id]);
    if (task.rows.length === 0) return res.status(404).json({ error: 'Задача не найдена' });
    if (task.rows[0].creator_id !== req.userId) {
      return res.status(403).json({ error: 'Только создатель может удалить задачу' });
    }
    await pool.query('DELETE FROM tasks WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;