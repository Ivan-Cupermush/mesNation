import express, { Request, Response } from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
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

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Загрузка файла (без БД)
app.post('/api/upload', upload.single('file'), (req: Request, res: Response) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Нет файла' });
  const msg = {
    id: Date.now(),
    chat_id: req.body.chatId,
    sender_id: parseInt(req.body.senderId) || 1,
    file_url: `/uploads/${file.filename}`,
    file_name: file.originalname,
    created_at: new Date().toISOString(),
  };
  io.to(req.body.chatId).emit('new_message', msg);
  res.status(201).json(msg);
});

// Socket.IO
io.on('connection', (socket) => {
  console.log('+ user connected:', socket.id);

  socket.on('join_chat', (chatId: string) => socket.join(chatId));

  socket.on('send_message', (data: { chatId: string; senderId: number; text: string }) => {
    const msg = {
      id: Date.now(),
      chat_id: data.chatId,
      sender_id: data.senderId,
      text: data.text,
      created_at: new Date().toISOString(),
    };
    io.to(data.chatId).emit('new_message', msg);
  });

  socket.on('disconnect', () => console.log('- user disconnected:', socket.id));
});

httpServer.listen(PORT, () => console.log(`Сервер запущен на порту ${PORT}`));
