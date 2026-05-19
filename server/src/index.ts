import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db/pool';
import multer from 'multer';
import path from 'path';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

const PORT = process.env.PORT || 5000;
const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
