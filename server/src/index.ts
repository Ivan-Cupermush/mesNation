import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db/pool';
import multer from 'multer';
import path from 'path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import fs from 'fs';
import chatsRouter from './routes/chats';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 }
});

fs.mkdirSync('uploads/thumbs', { recursive: true });

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));
app.use(express.static(path.join(__dirname, '../public')));

interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Токен не предоставлен' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Неверный формат токена' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Недействительный токен' });
  }
}

function authenticateQuery(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.query.token as string;
  if (!token) return res.status(401).json({ error: 'Токен не предоставлен' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Недействительный или истекший токен' });
  }
}

app.use('/uploads/thumbs', express.static('uploads/thumbs'));
app.use('/uploads/avatars', express.static('uploads/avatars'));
app.use('/uploads', (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.query.token) return authenticateQuery(req, res, next);
  return authenticate(req, res, next);
}, express.static('uploads'));

app.get('/api/file-token/:filename', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join('uploads', filename as string);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл не найден' });
    const tempToken = jwt.sign({ filename }, JWT_SECRET, { expiresIn: '5m' });
    res.json({ url: `/uploads/${filename}?token=${tempToken}` });
  } catch (err) {
    console.error('Ошибка генерации токена:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password, display_name } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Имя пользователя, email и пароль обязательны' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким email или именем уже существует' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name, role_id, name)
       VALUES ($1, $2, $3, $4, (SELECT id FROM roles WHERE name = 'employee'), $1)
       RETURNING id, username, email, display_name, avatar_url`,
      [username, email, password_hash, display_name || username]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    res.status(500).json({ error: 'Ошибка сервера при регистрации' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    if ((!username && !email) || !password) {
      return res.status(400).json({ error: 'Укажите имя пользователя (или email) и пароль' });
    }
    const result = await pool.query(
      'SELECT id, username, email, password_hash, display_name, avatar_url FROM users WHERE username = $1 OR email = $2',
      [username || '', email || '']
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Неверное имя пользователя или пароль' });
    }
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url } });
  } catch (err) {
    console.error('Ошибка входа:', err);
    res.status(500).json({ error: 'Ошибка сервера при входе' });
  }
});

app.get('/api/auth/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, display_name, avatar_url, role_id, department_id FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка получения профиля:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/users', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT id, username, display_name, avatar_url FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения пользователей:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.use('/api/chats', authenticate, chatsRouter);

app.get('/api/messages/:chatId', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { topic_id } = req.query;
    let query = 'SELECT * FROM messages WHERE chat_id = $1';
    const params: any[] = [chatId];
    if (topic_id) {
      query += ' AND topic_id = $2';
      params.push(topic_id);
    } else {
      query += ' AND topic_id IS NULL';
    }
    query += ' ORDER BY created_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

app.post('/api/upload', authenticate, upload.single('file'), async (req: AuthRequest, res: Response) => {
  try {
    const { chatId, senderId, topicId } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Нет файла' });
    if (!chatId || !senderId) return res.status(400).json({ error: 'Не указан чат или отправитель' });

    const memberCheck = await pool.query(
      'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
      [chatId, senderId]
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Пользователь не состоит в чате' });
    }

    let thumbUrl: string | null = null;
    const isImage = file.mimetype.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.originalname);
    if (isImage) {
      const thumbFilename = 'thumb_' + file.filename;
      const thumbPath = path.join('uploads', 'thumbs', thumbFilename);
      try {
        await sharp(file.path).resize(300, 300, { fit: 'inside' }).toFile(thumbPath);
        thumbUrl = '/uploads/thumbs/' + thumbFilename;
      } catch (sharpErr) {
        console.error('Ошибка создания миниатюры:', sharpErr);
      }
    }

    const result = await pool.query(
      `INSERT INTO messages (chat_id, sender_id, file_url, file_name, thumb_url, topic_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [chatId, senderId, `/uploads/${file.filename}`, file.originalname, thumbUrl, topicId || null]
    );
    const msg = result.rows[0];
    io.to(chatId).emit('new_message', msg);
    res.status(201).json(msg);
  } catch (err) {
    console.error('Ошибка загрузки файла:', err);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

app.post('/api/chats/:id/topics', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'Название топика обязательно' });
    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) return res.status(404).json({ error: 'Чат не найден' });
    const chat = chatResult.rows[0];
    if (!chat.is_supergroup) return res.status(400).json({ error: 'Топики доступны только в супергруппах' });
    if (chat.created_by !== req.userId) return res.status(403).json({ error: 'Только создатель может создавать топики' });
    const result = await pool.query(
      'INSERT INTO topics (chat_id, title, created_by) VALUES ($1, $2, $3) RETURNING *',
      [chatId, title, req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка создания топика:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/api/chats/:id/topics', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const result = await pool.query('SELECT * FROM topics WHERE chat_id = $1 ORDER BY created_at ASC', [chatId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения топиков:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/api/topics/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.id as string);
    const topicResult = await pool.query('SELECT * FROM topics WHERE id = $1', [topicId]);
    if (topicResult.rows.length === 0) return res.status(404).json({ error: 'Топик не найден' });
    const topic = topicResult.rows[0];
    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [topic.chat_id]);
    if (chatResult.rows[0].created_by !== req.userId) return res.status(403).json({ error: 'Только создатель супергруппы может удалять топики' });
    await pool.query('DELETE FROM topics WHERE id = $1', [topicId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления топика:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ====== Закрепление сообщений ======

// Закрепить сообщение
app.patch('/api/messages/:id/pin', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id as string);
    const userId = req.userId!;

    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
    const msg = msgResult.rows[0];

    let canPin = true;
    const adminCheck = await pool.query('SELECT permissions FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [msg.chat_id, userId]);
    if (adminCheck.rows.length > 0) {
      const perms = adminCheck.rows[0].permissions || [];
      canPin = perms.includes('pin_messages');
    }
    if (!canPin) return res.status(403).json({ error: 'Нет прав на закрепление сообщений' });

    await pool.query('UPDATE messages SET pinned = true WHERE id = $1', [messageId]);
    io.to(msg.chat_id).emit('message_pinned', { id: messageId, pinned: true });
    res.json({ success: true, pinned: true });
  } catch (err) {
    console.error('Ошибка закрепления:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Открепить сообщение
app.patch('/api/messages/:id/unpin', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id as string);
    const userId = req.userId!;

    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
    const msg = msgResult.rows[0];

    let canUnpin = true;
    const adminCheck = await pool.query('SELECT permissions FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [msg.chat_id, userId]);
    if (adminCheck.rows.length > 0) {
      const perms = adminCheck.rows[0].permissions || [];
      canUnpin = perms.includes('pin_messages');
    }
    if (!canUnpin) return res.status(403).json({ error: 'Нет прав на открепление сообщений' });

    await pool.query('UPDATE messages SET pinned = false WHERE id = $1', [messageId]);
    io.to(msg.chat_id).emit('message_unpinned', { id: messageId, pinned: false });
    res.json({ success: true, pinned: false });
  } catch (err) {
    console.error('Ошибка открепления:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить закреплённые сообщения чата
app.get('/api/messages/:chatId/pinned', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { topic_id } = req.query;
    let query = 'SELECT * FROM messages WHERE chat_id = $1 AND pinned = true AND deleted_for_all = false';
    const params: any[] = [chatId];
    if (topic_id) {
      query += ' AND topic_id = $2';
      params.push(topic_id);
    } else {
      query += ' AND topic_id IS NULL';
    }
    query += ' ORDER BY created_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения закреплённых:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ====== Редактирование и удаление ======

app.patch('/api/messages/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id as string);
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: 'Текст обязателен' });
    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
    const msg = msgResult.rows[0];
    if (msg.sender_id !== req.userId) return res.status(403).json({ error: 'Только автор может редактировать сообщение' });
    const result = await pool.query(
      'UPDATE messages SET text = $1, edited_at = NOW() WHERE id = $2 RETURNING *',
      [text, messageId]
    );
    const updatedMsg = result.rows[0];
    io.to(msg.chat_id).emit('message_edited', updatedMsg);
    res.json(updatedMsg);
  } catch (err) {
    console.error('Ошибка редактирования:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/api/messages/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id as string);
    const { scope } = req.query;
    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Сообщение не найдено' });
    const msg = msgResult.rows[0];
    if (scope === 'all') {
      const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [msg.chat_id]);
      const chat = chatResult.rows[0];
      if (msg.sender_id !== req.userId && chat.created_by !== req.userId) {
        return res.status(403).json({ error: 'Нет прав для удаления для всех' });
      }
      await pool.query('UPDATE messages SET deleted_for_all = true WHERE id = $1', [messageId]);
    } else {
      await pool.query(
        'UPDATE messages SET deleted_for_user_ids = array_append(deleted_for_user_ids, $1) WHERE id = $2',
        [req.userId, messageId]
      );
    }
    io.to(msg.chat_id).emit('message_deleted', { id: messageId, scope, userId: req.userId });
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Отслеживание онлайн-пользователей
const onlineUsers = new Map<string, Set<number>>(); // chatId -> Set<userId>

io.on('connection', (socket) => {
  console.log('+ user connected:', socket.id);

  socket.on('join_chat', (chatId: string) => {
    socket.join(chatId);
    const userId = (socket as any).handshake?.auth?.userId;
    if (userId && chatId) {
      if (!onlineUsers.has(chatId)) onlineUsers.set(chatId, new Set());
      onlineUsers.get(chatId)!.add(userId);
      io.to(chatId).emit('online_users', Array.from(onlineUsers.get(chatId)!));
    }
  });

  socket.on('send_message', async (data: { chatId: string; senderId: number; text: string; reply_to_message_id?: number; topic_id?: number }) => {
    try {
      const { chatId, senderId, text, reply_to_message_id, topic_id } = data;
      if (reply_to_message_id) {
        const replyMsg = await pool.query('SELECT id FROM messages WHERE id = $1 AND chat_id = $2', [reply_to_message_id, chatId]);
        if (replyMsg.rows.length === 0) return;
      }
      const result = await pool.query(
        `INSERT INTO messages (chat_id, sender_id, text, reply_to_message_id, topic_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [chatId, senderId || 0, text, reply_to_message_id || null, topic_id || null]
      );
      io.to(chatId).emit('new_message', result.rows[0]);
    } catch (err) { console.error(err); }
  });

  socket.on('typing', async ({ chatId, userId }: { chatId: string; userId: number }) => {
    const user = await pool.query('SELECT username, display_name FROM users WHERE id = $1', [userId]);
    const name = user.rows[0]?.display_name || user.rows[0]?.username || 'User ' + userId;
    socket.to(chatId).emit('user_typing', { chatId, userId, userName: name });
  });

  socket.on('stop_typing', ({ chatId, userId }: { chatId: string; userId: number }) => {
    socket.to(chatId).emit('user_stop_typing', { chatId, userId });
  });

  socket.on('disconnect', () => {
    console.log('- user disconnected:', socket.id);
    for (const [chatId, users] of onlineUsers) {
      const userId = (socket as any).handshake?.auth?.userId;
      if (userId && users.has(userId)) {
        users.delete(userId);
        if (users.size === 0) onlineUsers.delete(chatId);
        else io.to(chatId).emit('online_users', Array.from(users));
      }
    }
  });
});




// Переслать сообщение в другой чат
app.post('/api/messages/reply-to-another-chat', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { message_id, target_chat_id, target_topic_id, text } = req.body;
    const userId = req.userId!;

    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [message_id]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'Исходное сообщение не найдено' });
    const originalMsg = msgResult.rows[0];

    const memberCheck = await pool.query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [target_chat_id, userId]);
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Вы не являетесь участником целевого чата' });

    const externalChatId = (originalMsg.chat_id != target_chat_id) ? originalMsg.chat_id : null;
    const finalText = (text && text.trim() !== '') ? text : (originalMsg.text || '');

    // Копируем файловые поля, если есть
    const fileUrl = originalMsg.file_url || null;
    const fileName = originalMsg.file_name || null;
    const thumbUrl = originalMsg.thumb_url || null;

    const insertResult = await pool.query(
      `INSERT INTO messages (chat_id, sender_id, text, reply_to_message_id, topic_id, external_reply_chat_id, file_url, file_name, thumb_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [target_chat_id, userId, finalText, message_id, target_topic_id || null, externalChatId, fileUrl, fileName, thumbUrl]
    );
    const newMsg = insertResult.rows[0];
    io.to(target_chat_id.toString()).emit('new_message', newMsg);
    res.status(201).json(newMsg);
  } catch (err) {
    console.error('Ошибка пересылки:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/api/admin/create-user', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Проверяем, что пользователь – director
    const roleCheck = await pool.query(
      'SELECT r.name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1',
      [req.userId]
    );
    if (roleCheck.rows.length === 0 || roleCheck.rows[0].name !== 'director') {
      return res.status(403).json({ error: 'Только директор может создавать пользователей' });
    }

    const { username, email, password, display_name, position, role } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Имя, email и пароль обязательны' });
    }

    // Проверяем, что пользователь не существует
    const existing = await pool.query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким email или именем уже существует' });
    }

    // Определяем role_id по названию роли (по умолчанию employee)
    let roleName = role || 'employee';
    const roleResult = await pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
    if (roleResult.rows.length === 0) {
      return res.status(400).json({ error: 'Неверная роль. Допустимые: director, manager, employee' });
    }
    const roleId = roleResult.rows[0].id;

    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name, role_id, name, position)
       VALUES ($1, $2, $3, $4, $5, $1, $6)
       RETURNING id, username, email, display_name, position`,
      [username, email, password_hash, display_name || username, roleId, position || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка создания пользователя:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Получить всех пользователей (только для director)
app.get('/api/admin/users', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const roleCheck = await pool.query(
      'SELECT r.name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1',
      [req.userId]
    );
    if (roleCheck.rows.length === 0 || roleCheck.rows[0].name !== 'director') {
      return res.status(403).json({ error: 'Только директор может просматривать список пользователей' });
    }
    const result = await pool.query('SELECT id, username, email, display_name, position FROM users ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения пользователей:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Удалить пользователя (только для director, нельзя удалить самого себя)
app.delete('/api/admin/users/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.id as string);
    const roleCheck = await pool.query(
      'SELECT r.name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1',
      [req.userId]
    );
    if (roleCheck.rows.length === 0 || roleCheck.rows[0].name !== 'director') {
      return res.status(403).json({ error: 'Только директор может удалять пользователей' });
    }
    if (userId === req.userId) {
      return res.status(400).json({ error: 'Нельзя удалить самого себя' });
    }
    // Удаляем связанные данные
    await pool.query('DELETE FROM messages WHERE sender_id = $1', [userId]);
    await pool.query('DELETE FROM chat_members WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM chat_admins WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Ошибка удаления пользователя:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

httpServer.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));

// Загрузка аватара
app.post('/api/auth/avatar', authenticate, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Нет файла' });
    const avatarUrl = '/uploads/avatars/' + file.filename;
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.userId]);
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error('Ошибка загрузки аватара:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Обновление профиля
app.patch('/api/auth/profile', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { display_name } = req.body;
    if (!display_name) return res.status(400).json({ error: 'Имя обязательно' });
    await pool.query('UPDATE users SET display_name = $1 WHERE id = $2', [display_name, req.userId]);
    res.json({ display_name });
  } catch (err) {
    console.error('Ошибка обновления профиля:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});