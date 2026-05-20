import { Router, Request, Response } from 'express';
import pool from '../db/pool';

const router = Router();

interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, user_ids } = req.body;
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
      'INSERT INTO chats (name, type, created_by) VALUES ($1, $2, $3) RETURNING *',
      [name || null, type, userId]
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
    
    // 1. Получаем список чатов
    const chatResult = await pool.query(
      `SELECT c.id, c.name, c.type, c.created_by, c.created_at
       FROM chats c
       JOIN chat_members cm ON c.id = cm.chat_id
       WHERE cm.user_id = $1
       ORDER BY c.created_at DESC`,
      [userId]
    );
    
    const chats = chatResult.rows;
    
    // 2. Для каждого чата получаем участников и последнее сообщение
    for (const chat of chats) {
      const membersResult = await pool.query(
        `SELECT u.id, u.username, u.display_name
         FROM chat_members cm
         JOIN users u ON cm.user_id = u.id
         WHERE cm.chat_id = $1`,
        [chat.id]
      );
      chat.members = membersResult.rows;
      
      const msgResult = await pool.query(
        'SELECT id, text, sender_id, created_at FROM messages WHERE chat_id = $1 ORDER BY created_at DESC LIMIT 1',
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
    const chatId = parseInt(req.params.id);
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

export default router;
