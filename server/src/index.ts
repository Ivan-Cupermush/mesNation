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
import roleTreeRouter from './routes/roleTree';
import tasksRouter from './routes/tasks';
import notesRouter from './routes/notes';
import kpiImportRouter from './routes/kpiImport';
import kpiSalesRouter from './routes/kpiSales';
import knowledgeRouter from './routes/knowledge';
import pollsRouter from './routes/polls';  // в†ђ Р”РћР‘РђР’Р›Р•РќРћ
import { startDeadlineChecker } from './services/deadlineChecker';

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
fs.mkdirSync('uploads/avatars', { recursive: true });
fs.mkdirSync('uploads/imports', { recursive: true });

// ========== Middleware ==========
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
  if (!authHeader) return res.status(401).json({ error: 'РўРѕРєРµРЅ РЅРµ РїСЂРµРґРѕСЃС‚Р°РІР»РµРЅ' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'РќРµРІРµСЂРЅС‹Р№ С„РѕСЂРјР°С‚ С‚РѕРєРµРЅР°' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'РќРµРґРµР№СЃС‚РІРёС‚РµР»СЊРЅС‹Р№ С‚РѕРєРµРЅ' });
  }
}

function authenticateQuery(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.query.token as string;
  if (!token) return res.status(401).json({ error: 'РўРѕРєРµРЅ РЅРµ РїСЂРµРґРѕСЃС‚Р°РІР»РµРЅ' });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'РќРµРґРµР№СЃС‚РІРёС‚РµР»СЊРЅС‹Р№ РёР»Рё РёСЃС‚РµРєС€РёР№ С‚РѕРєРµРЅ' });
  }
}

// РЎС‚Р°С‚РёРєР° РґР»СЏ Р°РїР»РѕР°РґРѕРІ
app.use('/uploads/thumbs', express.static('uploads/thumbs'));
app.use('/uploads/tasks', express.static('uploads/tasks'));
app.use('/uploads/avatars', express.static('uploads/avatars'));
app.use('/uploads', (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.query.token) return authenticateQuery(req, res, next);
  return authenticate(req, res, next);
}, express.static('uploads'));

// ========== РџСѓР±Р»РёС‡РЅС‹Рµ СЌРЅРґРїРѕРёРЅС‚С‹ ==========
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== РћРЅР±РѕСЂРґРёРЅРі: СЃРѕР·РґР°РЅРёРµ РєРѕРјРїР°РЅРёРё ==========
app.get('/api/auth/has-company', async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(`
      SELECT COUNT(*) FROM users u
      JOIN role_tree rt ON u.role_id = rt.id
      WHERE rt.name = 'director'
    `);
    const count = parseInt(result.rows[0].count);
    res.json({ hasCompany: count > 0 });
  } catch (err) {
    console.error('РћС€РёР±РєР° РїСЂРѕРІРµСЂРєРё РєРѕРјРїР°РЅРёРё:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

app.post('/api/auth/setup-company', async (req: Request, res: Response) => {
  const client = await pool.connect();
  try {
    const directorCheck = await client.query(`
      SELECT COUNT(*) FROM users u
      JOIN role_tree rt ON u.role_id = rt.id
      WHERE rt.name = 'director'
    `);
    if (parseInt(directorCheck.rows[0].count) > 0) {
      client.release();
      return res.status(400).json({ error: 'РљРѕРјРїР°РЅРёСЏ СѓР¶Рµ СЃРѕР·РґР°РЅР°. РСЃРїРѕР»СЊР·СѓР№С‚Рµ РІС…РѕРґ.' });
    }

    const { company_name, username, email, password, display_name } = req.body;

    if (!company_name || !company_name.trim()) {
      client.release();
      return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ РєРѕРјРїР°РЅРёРё РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ' });
    }
    if (!username || !email || !password) {
      client.release();
      return res.status(400).json({ error: 'Р›РѕРіРёРЅ, email Рё РїР°СЂРѕР»СЊ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹' });
    }
    if (password.length < 4) {
      client.release();
      return res.status(400).json({ error: 'РџР°СЂРѕР»СЊ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅРµ РјРµРЅРµРµ 4 СЃРёРјРІРѕР»РѕРІ' });
    }

    await client.query('BEGIN');

    const directorRole = await client.query("SELECT id FROM role_tree WHERE name = 'director'");
    if (directorRole.rows.length === 0) {
      await client.query(`
        INSERT INTO role_tree (name, parent_id, description, level, icon, color) VALUES
          ('director', NULL, 'Р”РёСЂРµРєС‚РѕСЂ', 0, 'рџ‘‘', '#6366F1'),
          ('manager', (SELECT id FROM role_tree WHERE name = 'director'), 'РњРµРЅРµРґР¶РµСЂ', 1, 'рџ’ј', '#10B981'),
          ('employee', (SELECT id FROM role_tree WHERE name = 'manager'), 'РЎРѕС‚СЂСѓРґРЅРёРє', 2, 'рџ‘¤', '#F59E0B')
      `);
    }
    const directorId = (await client.query("SELECT id FROM role_tree WHERE name = 'director'")).rows[0].id;

    await client.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key VARCHAR(100) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('company_name', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [company_name.trim()]
    );

    const password_hash = await bcrypt.hash(password, 10);
    const userResult = await client.query(
      `INSERT INTO users (username, email, password_hash, display_name, role_id, name)
       VALUES ($1, $2, $3, $4, $5, $1)
       RETURNING id, username, email, display_name, avatar_url, role_id`,
      [username.trim(), email.trim().toLowerCase(), password_hash, display_name || username.trim(), directorId]
    );
    const user = userResult.rows[0];

    await client.query(
      'INSERT INTO user_role_assignments (user_id, role_node_id) VALUES ($1, $2)',
      [user.id, directorId]
    );

    await client.query('COMMIT');
    client.release();

    const token = jwt.sign(
      { userId: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        role_id: user.role_id,
      },
      company_name: company_name.trim(),
    });
  } catch (err: any) {
    await client.query('ROLLBACK');
    client.release();
    console.error('РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ РєРѕРјРїР°РЅРёРё:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃ С‚Р°РєРёРј Р»РѕРіРёРЅРѕРј РёР»Рё email СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚' });
    }
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР° РїСЂРё СЃРѕР·РґР°РЅРёРё РєРѕРјРїР°РЅРёРё' });
  }
});

app.get('/api/company', async (_req: Request, res: Response) => {
  try {
    const tableCheck = await pool.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'app_settings')`
    );
    if (!tableCheck.rows[0].exists) {
      return res.json({ company_name: null });
    }
    const result = await pool.query("SELECT value FROM app_settings WHERE key = 'company_name'");
    res.json({ company_name: result.rows[0]?.value || null });
  } catch (err) {
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// ========== Auth ==========
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, email, password, display_name } = req.body;
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'РРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ, email Рё РїР°СЂРѕР»СЊ РѕР±СЏР·Р°С‚РµР»СЊРЅС‹' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE email = $1 OR username = $2', [email, username]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ СЃ С‚Р°РєРёРј email РёР»Рё РёРјРµРЅРµРј СѓР¶Рµ СЃСѓС‰РµСЃС‚РІСѓРµС‚' });
    }
    const password_hash = await bcrypt.hash(password, 10);
    const result = await pool.query(
      `INSERT INTO users (username, email, password_hash, display_name, role_id, name)
       VALUES ($1, $2, $3, $4, (SELECT id FROM role_tree WHERE name = 'employee'), $1)
       RETURNING id, username, email, display_name, avatar_url`,
      [username, email, password_hash, display_name || username]
    );
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('РћС€РёР±РєР° СЂРµРіРёСЃС‚СЂР°С†РёРё:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР° РїСЂРё СЂРµРіРёСЃС‚СЂР°С†РёРё' });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, email, password } = req.body;
    if ((!username && !email) || !password) {
      return res.status(400).json({ error: 'РЈРєР°Р¶РёС‚Рµ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (РёР»Рё email) Рё РїР°СЂРѕР»СЊ' });
    }
    const result = await pool.query(
      'SELECT id, username, email, password_hash, display_name, avatar_url FROM users WHERE username = $1 OR email = $2',
      [username || '', email || '']
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'РќРµРІРµСЂРЅРѕРµ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР»Рё РїР°СЂРѕР»СЊ' });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'РќРµРІРµСЂРЅРѕРµ РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР»Рё РїР°СЂРѕР»СЊ' });
    }
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url } });
  } catch (err) {
    console.error('РћС€РёР±РєР° РІС…РѕРґР°:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР° РїСЂРё РІС…РѕРґРµ' });
  }
});

app.get('/api/auth/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.role_id, u.department_id, rt.name as role_name
       FROM users u
       LEFT JOIN role_tree rt ON u.role_id = rt.id
       WHERE u.id = $1`,
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїСЂРѕС„РёР»СЏ:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });

  }
});

app.get('/api/users', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const result = await pool.query('SELECT id, username, display_name, avatar_url FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

app.post('/api/auth/avatar', authenticate, upload.single('avatar'), async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'РќРµС‚ С„Р°Р№Р»Р°' });
    const avatarUrl = '/uploads/avatars/' + file.filename;
    await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [avatarUrl, req.userId]);
    res.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error('РћС€РёР±РєР° Р·Р°РіСЂСѓР·РєРё Р°РІР°С‚Р°СЂР°:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

app.patch('/api/auth/profile', authenticate, async (req: AuthRequest, res: Response) => {
    try {
      const { display_name, email } = req.body;
      const updates: string[] = [];
      const values: any[] = [];
      let paramIdx = 1;

      if (display_name !== undefined) {
        if (!display_name.trim()) return res.status(400).json({ error: 'РРјСЏ РЅРµ РјРѕР¶РµС‚ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј' });
        updates.push(`display_name = $${paramIdx++}`);
        values.push(display_name.trim());
      }

      if (email !== undefined) {
        if (email.trim() && !email.includes('@')) return res.status(400).json({ error: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ email' });
        // РџСЂРѕРІРµСЂРєР° СѓРЅРёРєР°Р»СЊРЅРѕСЃС‚Рё email
        if (email.trim()) {
          const existing = await pool.query('SELECT id FROM users WHERE email = $1 AND id != $2', [email.trim().toLowerCase(), req.userId]);
          if (existing.rows.length > 0) return res.status(409).json({ error: 'Р­С‚РѕС‚ email СѓР¶Рµ РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ' });
        }
        updates.push(`email = $${paramIdx++}`);
        values.push(email.trim().toLowerCase() || null);
      }

      if (updates.length === 0) return res.status(400).json({ error: 'РќРµС‚ РґР°РЅРЅС‹С… РґР»СЏ РѕР±РЅРѕРІР»РµРЅРёСЏ' });

      values.push(req.userId);
      const result = await pool.query(
        `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING id, username, email, display_name, avatar_url`,
        values
      );
      res.json(result.rows[0]);
    } catch (err) {
      console.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ РїСЂРѕС„РёР»СЏ:', err);
      res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
    }
  });

app.get('/api/file-token/:filename', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join('uploads', filename as string);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Р¤Р°Р№Р» РЅРµ РЅР°Р№РґРµРЅ' });
    const tempToken = jwt.sign({ filename }, JWT_SECRET, { expiresIn: '5m' });
    res.json({ url: `/uploads/${filename}?token=${tempToken}` });
  } catch (err) {
    console.error('РћС€РёР±РєР° РіРµРЅРµСЂР°С†РёРё С‚РѕРєРµРЅР°:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// ========== РћСЃРЅРѕРІРЅС‹Рµ СЂРѕСѓС‚С‹ ==========
app.use('/api/chats', authenticate, chatsRouter);
app.use('/api/role-tree', authenticate, roleTreeRouter);
app.use('/api/tasks', authenticate, tasksRouter);
app.use('/api/notes', authenticate, notesRouter);
app.use('/api/kpi', kpiImportRouter);
app.use('/api/kpi/sales', authenticate, kpiSalesRouter);
app.use('/api/knowledge', authenticate, knowledgeRouter);
app.use('/api/polls', pollsRouter);  // в†ђ Р”РћР‘РђР’Р›Р•РќРћ

// ========== РЎРѕРѕР±С‰РµРЅРёСЏ ==========
app.get('/api/messages/:chatId', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { topic_id } = req.query;
    let query = `
      SELECT m.*,
             u.display_name AS sender_display_name,
             u.username     AS sender_name,
             u.avatar_url   AS sender_avatar_url
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = $1`;
    const params: any[] = [chatId];
    if (topic_id) {
      query += ' AND m.topic_id = $2';
      params.push(topic_id);
    } else {
      query += ' AND m.topic_id IS NULL';
    }
    query += ' ORDER BY m.created_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ошибка получения сообщений' });
  }
});

app.get('/api/messages/:chatId/pinned', async (req: Request, res: Response) => {
  try {
    const { chatId } = req.params;
    const { topic_id } = req.query;
    let query = `
      SELECT m.*,
             u.display_name AS sender_display_name,
             u.username     AS sender_name,
             u.avatar_url   AS sender_avatar_url
      FROM messages m
      LEFT JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = $1 AND m.pinned = true AND m.deleted_for_all = false`;
    const params: any[] = [chatId];
    if (topic_id) {
      query += ' AND m.topic_id = $2';
      params.push(topic_id);
    } else {
      query += ' AND m.topic_id IS NULL';
    }
    query += ' ORDER BY m.created_at ASC';
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Ошибка получения закреплённых:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

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
      `WITH upd AS (
         UPDATE messages SET text = $1, edited_at = NOW() WHERE id = $2 RETURNING *
       )
       SELECT upd.*,
              u.display_name AS sender_display_name,
              u.username     AS sender_name,
              u.avatar_url   AS sender_avatar_url
       FROM upd
       LEFT JOIN users u ON u.id = upd.sender_id`,
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
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ' });
    const msg = msgResult.rows[0];
    if (scope === 'all') {
      const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [msg.chat_id]);
      const chat = chatResult.rows[0];
      if (msg.sender_id !== req.userId && chat.created_by !== req.userId) {
        return res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РґР»СЏ СѓРґР°Р»РµРЅРёСЏ РґР»СЏ РІСЃРµС…' });
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
    console.error('РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// ========== Р—Р°РєСЂРµРїР»РµРЅРёРµ СЃРѕРѕР±С‰РµРЅРёР№ ==========
app.patch('/api/messages/:id/pin', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id as string);
    const userId = req.userId!;
    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ' });
    const msg = msgResult.rows[0];
    let canPin = true;
    const adminCheck = await pool.query('SELECT permissions FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [msg.chat_id, userId]);
    if (adminCheck.rows.length > 0) {
      const perms = adminCheck.rows[0].permissions || [];
      canPin = perms.includes('pin_messages');
    }
    if (!canPin) return res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РЅР° Р·Р°РєСЂРµРїР»РµРЅРёРµ СЃРѕРѕР±С‰РµРЅРёР№' });
    await pool.query('UPDATE messages SET pinned = true WHERE id = $1', [messageId]);
    io.to(msg.chat_id).emit('message_pinned', { id: messageId, pinned: true });
    res.json({ success: true, pinned: true });
  } catch (err) {
    console.error('РћС€РёР±РєР° Р·Р°РєСЂРµРїР»РµРЅРёСЏ:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

app.patch('/api/messages/:id/unpin', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const messageId = parseInt(req.params.id as string);
    const userId = req.userId!;
    const msgResult = await pool.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (msgResult.rows.length === 0) return res.status(404).json({ error: 'РЎРѕРѕР±С‰РµРЅРёРµ РЅРµ РЅР°Р№РґРµРЅРѕ' });
    const msg = msgResult.rows[0];
    let canUnpin = true;
    const adminCheck = await pool.query('SELECT permissions FROM chat_admins WHERE chat_id = $1 AND user_id = $2', [msg.chat_id, userId]);
    if (adminCheck.rows.length > 0) {
      const perms = adminCheck.rows[0].permissions || [];
      canUnpin = perms.includes('pin_messages');
    }
    if (!canUnpin) return res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ РЅР° РѕС‚РєСЂРµРїР»РµРЅРёРµ СЃРѕРѕР±С‰РµРЅРёР№' });
    await pool.query('UPDATE messages SET pinned = false WHERE id = $1', [messageId]);
    io.to(msg.chat_id).emit('message_unpinned', { id: messageId, pinned: false });
    res.json({ success: true, pinned: false });
  } catch (err) {
    console.error('РћС€РёР±РєР° РѕС‚РєСЂРµРїР»РµРЅРёСЏ:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// ========== Р—Р°РіСЂСѓР·РєР° С„Р°Р№Р»РѕРІ ==========
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
      `WITH ins AS (
         INSERT INTO messages (chat_id, sender_id, file_url, file_name, thumb_url, topic_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *
       )
       SELECT ins.*,
              u.display_name AS sender_display_name,
              u.username     AS sender_name,
              u.avatar_url   AS sender_avatar_url
       FROM ins
       LEFT JOIN users u ON u.id = ins.sender_id`,
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
    if (!title) return res.status(400).json({ error: 'РќР°Р·РІР°РЅРёРµ С‚РѕРїРёРєР° РѕР±СЏР·Р°С‚РµР»СЊРЅРѕ' });
    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [chatId]);
    if (chatResult.rows.length === 0) return res.status(404).json({ error: 'Р§Р°С‚ РЅРµ РЅР°Р№РґРµРЅ' });
    const chat = chatResult.rows[0];
    if (!chat.is_supergroup) return res.status(400).json({ error: 'РўРѕРїРёРєРё РґРѕСЃС‚СѓРїРЅС‹ С‚РѕР»СЊРєРѕ РІ СЃСѓРїРµСЂРіСЂСѓРїРїР°С…' });
    if (chat.created_by !== req.userId) return res.status(403).json({ error: 'РўРѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ РјРѕР¶РµС‚ СЃРѕР·РґР°РІР°С‚СЊ С‚РѕРїРёРєРё' });
    const result = await pool.query(
      'INSERT INTO topics (chat_id, title, created_by) VALUES ($1, $2, $3) RETURNING *',
      [chatId, title, req.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('РћС€РёР±РєР° СЃРѕР·РґР°РЅРёСЏ С‚РѕРїРёРєР°:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

app.get('/api/chats/:id/topics', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const chatId = parseInt(req.params.id as string);
    const result = await pool.query('SELECT * FROM topics WHERE chat_id = $1 ORDER BY created_at ASC', [chatId]);
    res.json(result.rows);
  } catch (err) {
    console.error('РћС€РёР±РєР° РїРѕР»СѓС‡РµРЅРёСЏ С‚РѕРїРёРєРѕРІ:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// ========== PATCH /api/topics/:id вЂ” РѕР±РЅРѕРІР»РµРЅРёРµ С‚РѕРїРёРєР° (РЅР°Р·РІР°РЅРёРµ + РёРєРѕРЅРєР°) ==========
app.patch('/api/topics/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.id as string);
    const { title, icon, icon_color, icon_opacity } = req.body;
    const topicResult = await pool.query('SELECT * FROM topics WHERE id = $1', [topicId]);
    if (topicResult.rows.length === 0) return res.status(404).json({ error: 'РўРѕРїРёРє РЅРµ РЅР°Р№РґРµРЅ' });
    const topic = topicResult.rows[0];
    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [topic.chat_id]);
    if (chatResult.rows[0].created_by !== req.userId) {
      return res.status(403).json({ error: 'РўРѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ СЃСѓРїРµСЂРіСЂСѓРїРїС‹ РјРѕР¶РµС‚ РёР·РјРµРЅСЏС‚СЊ С‚РѕРїРёРє' });
    }
    const result = await pool.query(
      `UPDATE topics SET
        title = COALESCE($1, title),
        icon = COALESCE($2, icon),
        icon_color = COALESCE($3, icon_color),
        icon_opacity = COALESCE($4, icon_opacity)
      WHERE id = $5 RETURNING *`,
      [title, icon, icon_color, icon_opacity, topicId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('РћС€РёР±РєР° РѕР±РЅРѕРІР»РµРЅРёСЏ С‚РѕРїРёРєР°:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

app.delete('/api/topics/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const topicId = parseInt(req.params.id as string);
    const topicResult = await pool.query('SELECT * FROM topics WHERE id = $1', [topicId]);
    if (topicResult.rows.length === 0) return res.status(404).json({ error: 'РўРѕРїРёРє РЅРµ РЅР°Р№РґРµРЅ' });
    const topic = topicResult.rows[0];
    const chatResult = await pool.query('SELECT * FROM chats WHERE id = $1', [topic.chat_id]);
    if (chatResult.rows[0].created_by !== req.userId) return res.status(403).json({ error: 'РўРѕР»СЊРєРѕ СЃРѕР·РґР°С‚РµР»СЊ СЃСѓРїРµСЂРіСЂСѓРїРїС‹ РјРѕР¶РµС‚ СѓРґР°Р»СЏС‚СЊ С‚РѕРїРёРєРё' });
    await pool.query('DELETE FROM topics WHERE id = $1', [topicId]);
    res.json({ success: true });
  } catch (err) {
    console.error('РћС€РёР±РєР° СѓРґР°Р»РµРЅРёСЏ С‚РѕРїРёРєР°:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// ========== РџРµСЂРµСЃС‹Р»РєР° РјРµР¶РґСѓ С‡Р°С‚Р°РјРё ==========
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
    const fileUrl = originalMsg.file_url || null;
    const fileName = originalMsg.file_name || null;
    const thumbUrl = originalMsg.thumb_url || null;
    const insertResult = await pool.query(
      `WITH ins AS (
         INSERT INTO messages (chat_id, sender_id, text, reply_to_message_id, topic_id, external_reply_chat_id, file_url, file_name, thumb_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *
       )
       SELECT ins.*,
              u.display_name AS sender_display_name,
              u.username     AS sender_name,
              u.avatar_url   AS sender_avatar_url
       FROM ins
       LEFT JOIN users u ON u.id = ins.sender_id`,
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

// ========== WebSocket ==========
const onlineUsers = new Map<string, Set<number>>();

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
        `WITH ins AS (
           INSERT INTO messages (chat_id, sender_id, text, reply_to_message_id, topic_id)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *
         )
         SELECT ins.*,
                u.display_name AS sender_display_name,
                u.username     AS sender_name,
                u.avatar_url   AS sender_avatar_url
         FROM ins
         LEFT JOIN users u ON u.id = ins.sender_id`,
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

// ========== РњР•Р”РРђ РўРћРџРРљРђ: СЃС‚Р°С‚РёСЃС‚РёРєР° Рё РІРєР»Р°РґРєРё (С„РѕС‚Рѕ/С„Р°Р№Р»С‹/СЃСЃС‹Р»РєРё/РѕРїСЂРѕСЃС‹) ==========
app.get('/api/chats/:chatId/topics/:topicId/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { chatId, topicId } = req.params;
    const base = 'SELECT COUNT(*)::int AS c FROM messages WHERE chat_id = $1 AND topic_id = $2 AND (deleted_for_all IS NULL OR deleted_for_all = false)';
    const media = await pool.query(base + ' AND thumb_url IS NOT NULL', [chatId, topicId]);
    const files = await pool.query(base + ' AND file_url IS NOT NULL AND thumb_url IS NULL', [chatId, topicId]);
    const links = await pool.query(base + " AND text ILIKE '%http%'", [chatId, topicId]);
    const polls = await pool.query(base + ' AND poll_id IS NOT NULL', [chatId, topicId]);
    res.json({
      media: media.rows[0].c,
      files: files.rows[0].c,
      links: links.rows[0].c,
      polls: polls.rows[0].c,
      total_images: media.rows[0].c,
      total_files: files.rows[0].c + media.rows[0].c,
    });
  } catch (err) {
    console.error('РћС€РёР±РєР° СЃС‚Р°С‚РёСЃС‚РёРєРё С‚РѕРїРёРєР°:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

app.get('/api/chats/:chatId/topics/:topicId/media/:type', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { chatId, topicId, type } = req.params;
    let q = 'SELECT * FROM messages WHERE chat_id = $1 AND topic_id = $2 AND (deleted_for_all IS NULL OR deleted_for_all = false)';
    if (type === 'media') q += ' AND thumb_url IS NOT NULL';
    else if (type === 'files') q += ' AND file_url IS NOT NULL AND thumb_url IS NULL';
    else if (type === 'links') q += " AND text ILIKE '%http%'";
    else if (type === 'polls') q += ' AND poll_id IS NOT NULL';
    else return res.status(400).json({ error: 'РќРµРёР·РІРµСЃС‚РЅС‹Р№ С‚РёРї' });
    q += ' ORDER BY created_at DESC LIMIT 100';
    let rows = (await pool.query(q, [chatId, topicId])).rows;

    if (type === 'polls') {
      rows = await Promise.all(rows.map(async (m: any) => {
        if (!m.poll_id) return m;
        const pollRes = await pool.query('SELECT * FROM polls WHERE id = $1', [m.poll_id]);
        if (pollRes.rows.length === 0) return m;
        const poll = pollRes.rows[0];
        const optsRes = await pool.query('SELECT * FROM poll_options WHERE poll_id = $1 ORDER BY option_index', [m.poll_id]);
        const votesRes = await pool.query('SELECT option_id, COUNT(*)::int AS count FROM poll_votes WHERE poll_id = $1 GROUP BY option_id', [m.poll_id]);
        const vm: Record<number, number> = {};
        votesRes.rows.forEach((v: any) => { vm[v.option_id] = v.count; });
        const options = optsRes.rows.map((o: any) => ({ ...o, vote_count: vm[o.id] || 0 }));
        const total = options.reduce((s: number, o: any) => s + o.vote_count, 0);
        const myRes = await pool.query('SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [m.poll_id, req.userId]);
        return {
          ...m,
          poll: { ...poll, options, total_votes: total },
          my_votes: myRes.rows.map((r: any) => r.option_id),
          question: poll.question,
          message_id: m.id,
        };
      }));
    }
    res.json(rows);
  } catch (err) {
    console.error('РћС€РёР±РєР° РјРµРґРёР° С‚РѕРїРёРєР°:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

// ========== РЎРўРђР Рў РЎР•Р Р’Р•Р Рђ ==========
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`рџљЂ РЎРµСЂРІРµСЂ Р·Р°РїСѓС‰РµРЅ РЅР° РїРѕСЂС‚Сѓ ${PORT}`);
  
  // Р—Р°РїСѓСЃРєР°РµРј РїРµСЂРёРѕРґРёС‡РµСЃРєСѓСЋ РїСЂРѕРІРµСЂРєСѓ РґРµРґР»Р°Р№РЅРѕРІ (РєР°Р¶РґС‹Р№ С‡Р°СЃ)
  startDeadlineChecker(60 * 60 * 1000);
});
// ==================== РЎРўРђРўРРЎРўРРљРђ РљРћРќРљР Р•РўРќРћР“Рћ РЎРћРўР РЈР”РќРРљРђ ====================
app.get('/api/kpi/sales/employee/:userId/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = parseInt(req.params.userId);
    if (isNaN(userId)) return res.status(400).json({ error: 'РќРµРєРѕСЂСЂРµРєС‚РЅС‹Р№ ID СЃРѕС‚СЂСѓРґРЅРёРєР°' });
    const period = (req.query.period as string) || 'month';

    const managerCheck = await pool.query(
      'SELECT rt.name as role_name FROM users u LEFT JOIN role_tree rt ON u.role_id = rt.id WHERE u.id = $1',
      [req.userId]
    );
    if (managerCheck.rows.length === 0) return res.status(404).json({ error: 'РџРѕР»СЊР·РѕРІР°С‚РµР»СЊ РЅРµ РЅР°Р№РґРµРЅ' });
    const managerRole = managerCheck.rows[0].role_name;
    const isDirector = managerRole === 'director' || managerRole === 'admin';
    const isManager = managerRole?.includes('manager') || managerRole?.includes('head') || managerRole?.includes('СЂСѓРєРѕРІРѕРґРёС‚РµР»СЊ') || managerRole?.includes('РЅР°С‡Р°Р»СЊРЅРёРє');
    if (!isDirector && !isManager) return res.status(403).json({ error: 'РќРµС‚ РїСЂР°РІ' });

    const dateFilter = period === 'week' ? "CURRENT_DATE - INTERVAL '7 days'"
      : period === 'quarter' ? "CURRENT_DATE - INTERVAL '3 months'"
      : "CURRENT_DATE - INTERVAL '1 month'";

    const [userResult, kpisResult, tasksResult, summaryResult, txResult] = await Promise.all([
      pool.query(
        'SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, rt.name as role_name, rt.id as role_id FROM users u LEFT JOIN role_tree rt ON u.role_id = rt.id WHERE u.id = $1',
        [userId]
      ),
      pool.query(
        "SELECT st.*, ROUND((st.current_value / NULLIF(st.target_value, 0) * 100)::numeric, 1) as progress_percent FROM sales_targets st WHERE st.user_id = $1 AND st.period_start <= CURRENT_DATE AND st.period_end >= CURRENT_DATE ORDER BY st.created_at DESC",
        [userId]
      ).catch(() => ({ rows: [] })),
      pool.query(
        "SELECT id, title, status, priority, deadline FROM tasks WHERE assignee_id = $1 AND status != 'archived' ORDER BY deadline ASC LIMIT 10",
        [userId]
      ).catch(() => ({ rows: [] })),
      pool.query(
        "SELECT COALESCE(SUM(amount), 0) as total_amount, COALESCE(SUM(quantity), 0) as total_quantity, COUNT(*)::int as total_transactions FROM sales_transactions WHERE user_id = $1 AND transaction_date >= " + dateFilter,
        [userId]
      ).catch(() => ({ rows: [{ total_amount: 0, total_quantity: 0, total_transactions: 0 }] })),
      pool.query(
        "SELECT id, product_name, quantity, amount, transaction_date, client_name, notes FROM sales_transactions WHERE user_id = $1 AND transaction_date >= " + dateFilter + " ORDER BY transaction_date DESC, id DESC LIMIT 200",
        [userId]
      ).catch(() => ({ rows: [] })),
    ]);

    if (userResult.rows.length === 0) return res.status(404).json({ error: 'РЎРѕС‚СЂСѓРґРЅРёРє РЅРµ РЅР°Р№РґРµРЅ' });

    const user = userResult.rows[0];
    const kpis = (kpisResult.rows || []).map((k) => ({
      ...k,
      progress: Math.min(100, Math.round(((k.current_value || 0) / Math.max(k.target_value || 1, 1)) * 100))
    }));
    const tasks = tasksResult.rows || [];
    const summary = summaryResult.rows[0] || { total_amount: 0, total_quantity: 0, total_transactions: 0 };
    const transactions = txResult.rows || [];

    const taskStats = {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'done').length,
      in_progress: tasks.filter((t) => t.status === 'in_progress').length,
      overdue: tasks.filter((t) => t.status === 'overdue').length,
    };

    res.json({
      user,
      kpi: kpis[0] || null,
      kpis,
      tasks,
      taskStats,
      summary,
      transactions,
    });
  } catch (err) {
    console.error('РћС€РёР±РєР° СЃС‚Р°С‚РёСЃС‚РёРєРё СЃРѕС‚СЂСѓРґРЅРёРєР°:', err);
    res.status(500).json({ error: 'РћС€РёР±РєР° СЃРµСЂРІРµСЂР°' });
  }
});

