import chatsRouter from './routes/chats';
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

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/api/chats', authenticate, chatsRouter);

// ---------- Вспомогательный middleware для проверки JWT ----------
interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Токен не предоставлен' });
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Неверный формат токена' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Недействительный токен' });
  }
}

// ---------- Health check ----------
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------- Регистрация ----------
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password, display_name } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Имя пользователя, email и пароль обязательны' });
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1 OR username = $2',
      [email, username]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Пользователь с таким email или именем уже существует' });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name, role_id, name)
       VALUES ($1, $2, $3, $4, (SELECT id FROM roles WHERE name = 'employee'), $5)
       RETURNING id, username, email, display_name, avatar_url`,
      [username, email, password_hash, display_name || username, username]
    );

    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Ошибка регистрации:', err);
    res.status(500).json({ error: 'Ошибка сервера при регистрации' });
  }
});

// ---------- Вход ----------
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

// ---------- Профиль текущего пользователя (защищённый) ----------
app.get('/api/auth/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, display_name, avatar_url, role_id, department_id FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Ошибка получения профиля:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ---------- История сообщений ----------
app.get('/api/messages/:chatId', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const result = await pool.query(
      'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
      [chatId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

// ---------- Загрузка файла ----------
app.post('/api/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { chatId, senderId } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Нет файла' });

    const fileUrl = `/uploads/${file.filename}`;
    const result = await pool.query(
      `INSERT INTO messages (chat_id, sender_id, file_url, file_name)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [chatId, senderId || 0, fileUrl, file.originalname]
    );
    const msg = result.rows[0];
    io.to(chatId).emit('new_message', msg);
    res.status(201).json(msg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка загрузки файла' });
  }
});

// ---------- WebSocket чат ----------
io.on('connection', (socket) => {
  console.log('+ user connected:', socket.id);

  socket.on('join_chat', (chatId: string) => socket.join(chatId));

  socket.on('send_message', async (data: { chatId: string; senderId: number; text: string }) => {
    try {
      const { chatId, senderId, text } = data;
      const result = await pool.query(
        `INSERT INTO messages (chat_id, sender_id, text) VALUES ($1, $2, $3) RETURNING *`,
        [chatId, senderId || 0, text]
      );
      const msg = result.rows[0];
      io.to(chatId).emit('new_message', msg);
    } catch (err) {
      console.error(err);
    }
  });

  socket.on('disconnect', () => console.log('- user disconnected:', socket.id));
});

httpServer.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
