import { requireRole } from "../middleware/requireRole";
import { requireRole } from "../middleware/requireRole";
import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

router.post('/', requireRole('director', 'manager'), async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, user_ids, is_supergroup } = req.body;
    const userId = req.userId;

    if (!type || !['private', 'group'].includes(type)) {
      return res.status(400).json({ error: 'Тип чата обязателен: private или group' });
    }

    if (type === 'group' && !name) {
      return res.status(400).json({ error: 'Название группы обязательно' });
    }

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'Список участников обязателен' });
    }

    if (type === 'private') {
      if (user_ids.length !== 1) {
        return res.status(400).json({ error: 'Приватный чат должен иметь ровно одного собеседника' });
      }
      if (user_ids[0] === userId) {
        return res.status(400).json({ error: 'Нельзя создать чат с самим собой' });
      }

      const existing = await pool.query(
        `SELECT c.id FROM chats c
         JOIN chat_members m1 ON c.id = m1.chat_id AND m1.user_id = $1
         JOIN chat_members m2 ON c.id = m2.chat_id AND m2.user_id = $2
         WHERE c.type = 'private'`,
        [userId, user_ids[0]]
      );
      if (existing.rows.length > 0) {
        return res.json(existing.rows[0]);
      }
    }

    const result = await pool.query(
      'INSERT INTO chats (name, type, created_by, is_supergroup) VALUES ($1, $2, $3, $4) RETURNING *',
      [name || null, type, userId, is_supergroup || false]
    );
    const chat = result.rows[0];

    const members = [userId, ...user_ids];
    for (const uid of members) {
      await pool.query(
        'INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [chat.id, uid]
      );
    }

    res.status(201).json(chat);
  } catch (err) {
    console.error('Ошибка создания чата:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    
    const chatResult = await pool.query(
      `SELECT c.id, c.name, c.type, c.is_supergroup, c.created_by, c.created_at
       FROM chats c
       JOIN chat_members cm ON c.id = cm.chat_id
       WHERE cm.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );
    
    const chats = chatResult.rows;
    
    for (const chat of chats) {
      const membersResult = await pool.query(
        `SELECT u.id, u.username, u.display_name,
         CASE WHEN c.created_by = u.id THEN 'creator'
              WHEN ca.user_id IS NOT NULL THEN 'admin'
              ELSE 'member'
         END AS role
         FROM chat_members cm
         JOIN users u ON cm.user_id = u.id
         JOIN chats c ON c.id = cm.chat_id
         LEFT JOIN chat_admins ca ON ca.chat_id = cm.chat_id AND ca.user_id = u.id
         WHERE cm.chat_id = $1`,
        [chat.id]
      );
      chat.members = membersResult.rows;
      
      const msgResult = await pool.query(
        'SELECT id, text, sender_id, created_at FROM messages WHERE chat_id = $1 AND (topic_id IS NULL OR topic_id = 0) ORDER BY created_at DESC LIMIT 1',
        [chat.id]
      );
      chat.last_message = msgResult.rows[0] || null;
    }
    
    res.json(chats);
  } catch (err) {
    console.error('Ошибка получения чатов:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.post('/:id/members', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const { user_ids } = req.body;
    const userId = req.userId;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ error: 'Список участников обязателен' });
    }

    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) {
      return res.status(404).json({ error: 'Чат не найден' });
    }
    const chat = chatResult.rows[0];

    if (chat.type !== 'group') {
      return res.status(400).json({ error: 'В приватный чат нельзя добавлять участников' });
    }

    if (chat.created_by !== userId) {
      return res.status(403).json({ error: 'Только создатель чата может добавлять участников' });
    }

    for (const uid of user_ids) {
      await pool.query(
        'INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [chatId, uid]
      );
    }

    const membersResult = await pool.query(
      'SELECT u.id, u.username, u.display_name FROM chat_members cm JOIN users u ON cm.user_id = u.id WHERE cm.chat_id = $1',
      [chatId]
    );

    res.json(membersResult.rows);
  } catch (err) {
    console.error('Ошибка добавления участников:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удаление участника из чата (только создатель)
router.delete('/:id/members/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const memberId = parseInt(req.params.userId as string);
    const userId = req.userId;

    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
    const chat = chatResult.rows[0];

    if (chat.created_by !== userId) {
      return res.status(403).json({ error: 'Только создатель может удалять участников' });
    }

    if (memberId === userId) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя. Используйте выход из чата.' });
    }

    await pool.query('DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, memberId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления участника:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH /api/chats/:id — изменить чат
router.patch('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const { name, is_supergroup, keep_topic_id } = req.body;
    const userId = req.userId;

    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
    const chat = chatResult.rows[0];

    if (chat.created_by !== userId) {
      return res.status(403).json({ error: 'Только создатель может изменять чат' });
    }

    if (name !== undefined) {
      await pool.query('UPDATE chats SET name = $1 WHERE id = $2', [name, chatId]);
    }

    // Обработка переключения супергруппы
    if (is_supergroup !== undefined && chat.type === 'group') {
  if (is_supergroup) {
    // Включаем супергруппу
    await pool.query('UPDATE chats SET is_supergroup = true WHERE id = $1', [chatId]);
  } else {
    // Выключаем супергруппу
    const topicToKeep = keep_topic_id ? parseInt(keep_topic_id) : null;

    if (topicToKeep) {
      // Удаляем все топики, кроме выбранного
      await pool.query('DELETE FROM topics WHERE chat_id = $1 AND id != $2', [chatId, topicToKeep]);
      // Удаляем сообщения из других топиков
      await pool.query(
        'DELETE FROM messages WHERE chat_id = $1 AND topic_id IS NOT NULL AND topic_id != $2',
        [chatId, topicToKeep]
      );
      // Переносим сообщения выбранного топика в общий чат
      await pool.query(
        'UPDATE messages SET topic_id = NULL WHERE chat_id = $1 AND topic_id = $2',
        [chatId, topicToKeep]
      );
      // Удаляем сам выбранный топик (он больше не нужен)
      await pool.query('DELETE FROM topics WHERE id = $1', [topicToKeep]);
    } else {
      // Удаляем все топики и все сообщения в них
      await pool.query('DELETE FROM topics WHERE chat_id = $1', [chatId]);
      await pool.query('DELETE FROM messages WHERE chat_id = $1 AND topic_id IS NOT NULL', [chatId]);
    }

    await pool.query('UPDATE chats SET is_supergroup = false WHERE id = $1', [chatId]);
  }
}

    const updated = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    res.json(updated.rows[0]);
  } catch (err) {
    console.error('Ошибка изменения чата:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/chats/:id — удаление/выход из чата
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const userId = req.userId;

    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
    const chat = chatResult.rows[0];

    const memberCheck = await pool.query(
      'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, userId]
    );
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Вы не участник этого чата' });

    if (chat.type === 'group' && chat.created_by === userId) {
      // Каскадное удаление
      await pool.query('DELETE FROM messages WHERE chat_id = $1', [chatId]);
      await pool.query('DELETE FROM topics WHERE chat_id = $1', [chatId]);
      await pool.query('DELETE FROM chat_members WHERE chat_id = $1', [chatId]);
      await pool.query('DELETE FROM chats WHERE id = $1', [chatId]);
      res.json({ success: true, action: 'deleted' });
    } else {
      await pool.query('DELETE FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, userId]);
      res.json({ success: true, action: 'left' });
    }
  } catch (err) {
    console.error('Ошибка удаления чата:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});


// GET /api/chats/:id/admins — список администраторов с правами
router.get('/:id/admins', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const result = await pool.query(
      `SELECT u.id, u.username, u.display_name, u.avatar_url, ca.promoted_at, ca.permissions
       FROM chat_admins ca JOIN users u ON ca.user_id = u.id
       WHERE ca.chat_id = $1 ORDER BY ca.promoted_at`,
      [chatId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения админов:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// POST /api/chats/:id/admins — назначить администратора (создатель или админ с правом add_admins)
router.post('/:id/admins', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const { user_id, permissions } = req.body;
    const userId = req.userId;

    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
    const chat = chatResult.rows[0];

    // Проверяем, имеет ли текущий пользователь право назначать админов
    const isCreator = chat.created_by === userId;
    let hasPermission = isCreator;
    if (!isCreator) {
      const adminCheck = await pool.query(
        'SELECT permissions FROM chat_admins WHERE chat_id = $1 AND user_id = $2',
        [chatId, userId]
      );
      if (adminCheck.rows.length > 0) {
        const perms = adminCheck.rows[0].permissions || [];
        hasPermission = perms.includes('add_admins');
      }
    }
    if (!hasPermission) return res.status(403).json({ error: 'Нет прав на добавление администраторов' });

    // Проверяем, что пользователь состоит в чате
    const member = await pool.query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, user_id]);
    if (member.rows.length === 0) return res.status(400).json({ error: 'Пользователь не является участником' });

    // По умолчанию все права, кроме add_admins (если не переданы)
    const defaultPerms = ['change_info', 'delete_messages', 'ban_users', 'add_users', 'pin_messages'];
    const finalPerms = permissions || defaultPerms;

    await pool.query(
      `INSERT INTO chat_admins (chat_id, user_id, promoted_by, permissions)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (chat_id, user_id) DO UPDATE SET permissions = $4, promoted_by = $3`,
      [chatId, user_id, userId, finalPerms]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error('Ошибка назначения админа:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// PATCH /api/chats/:id/admins/:userId — изменить права администратора
router.patch('/:id/admins/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const adminId = parseInt(req.params.userId as string);
    const { permissions } = req.body;
    const userId = req.userId;

    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
    const chat = chatResult.rows[0];

    // Право на изменение прав: создатель или админ с правом add_admins
    const isCreator = chat.created_by === userId;
    let hasPermission = isCreator;
    if (!isCreator) {
      const adminCheck = await pool.query(
        'SELECT permissions FROM chat_admins WHERE chat_id = $1 AND user_id = $2',
        [chatId, userId]
      );
      if (adminCheck.rows.length > 0) {
        const perms = adminCheck.rows[0].permissions || [];
        hasPermission = perms.includes('add_admins');
      }
    }
    if (!hasPermission) return res.status(403).json({ error: 'Нет прав на изменение прав администраторов' });

    // Обновляем права
    await pool.query(
      'UPDATE chat_admins SET permissions = $1 WHERE chat_id = $2 AND user_id = $3',
      [permissions, chatId, adminId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка изменения прав:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// DELETE /api/chats/:id/admins/:userId — снять администратора
router.delete('/:id/admins/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const adminId = parseInt(req.params.userId as string);
    const userId = req.userId;

    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
    const chat = chatResult.rows[0];

    // Создатель может снять любого, админ с правом add_admins может снять другого, либо админ может снять себя
    const isCreator = chat.created_by === userId;
    let canRemove = isCreator || adminId === userId;
    if (!isCreator && adminId !== userId) {
      const adminCheck = await pool.query(
        'SELECT permissions FROM chat_admins WHERE chat_id = $1 AND user_id = $2',
        [chatId, userId]
      );
      if (adminCheck.rows.length > 0) {
        const perms = adminCheck.rows[0].permissions || [];
        canRemove = perms.includes('add_admins');
      }
    }
    if (!canRemove) return res.status(403).json({ error: 'Нет прав на снятие этого администратора' });

    await pool.query('DELETE FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [chatId, adminId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка снятия админа:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

export default router;
