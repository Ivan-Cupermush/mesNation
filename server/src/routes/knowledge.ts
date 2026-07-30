import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import pool from '../db/pool';
import { processDocument } from '../services/knowledge/documentProcessor';
import { getEmbedding, generateResponse, checkOllamaHealth } from '../services/knowledge/embeddingService';
import { guessMimeType } from '../services/knowledge/documentParser';

const router = Router();

// Папка для загруженных файлов
const UPLOADS_DIR = path.join(__dirname, '../../uploads/knowledge');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Настройка multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${file.originalname}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'text/markdown',
    ];
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (allowed.includes(file.mimetype) || ['pdf', 'docx', 'doc', 'txt', 'md'].includes(ext || '')) {
      cb(null, true);
    } else {
      cb(new Error(`Неподдерживаемый формат: ${file.mimetype || ext}`));
    }
  },
});

// Разрешённые MIME для админской загрузки
const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'doc', 'txt', 'md'];

// ============================================================
// GET /api/knowledge/health — проверка доступности AI
// ============================================================
router.get('/health', async (req: Request, res: Response) => {
  try {
    const ollamaOk = await checkOllamaHealth();
    const dbOk = await pool.query('SELECT 1').then(() => true).catch(() => false);
    const vectorOk = await pool.query(
      "SELECT extname FROM pg_extension WHERE extname = 'vector'"
    ).then(r => r.rows.length > 0).catch(() => false);

    res.json({
      ollama: ollamaOk,
      database: dbOk,
      pgvector: vectorOk,
      ready: ollamaOk && dbOk && vectorOk,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// УПРАВЛЕНИЕ ДОКУМЕНТАМИ (только для админов)
// ============================================================

// Middleware проверки роли админа
async function requireAdmin(req: Request, res: Response, next: Function) {
  const userId = (req as any).userId;
  const result = await pool.query('SELECT role_id FROM users WHERE id = $1', [userId]);
  
  // role_id: 1=сотрудник, 2=руководитель, 3=админ
  if (result.rows.length === 0 || result.rows[0].role_id < 3) {
    return res.status(403).json({ error: 'Только администратор может управлять базой знаний' });
  }
  next();
}

// POST /api/knowledge/documents — загрузить документ
router.post('/documents', requireAdmin, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'Файл не получен' });
    }

    const ext = file.originalname.toLowerCase().split('.').pop() || '';
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      fs.unlinkSync(file.path);
      return res.status(400).json({ 
        error: `Неподдерживаемый формат: .${ext}. Разрешены: ${ALLOWED_EXTENSIONS.join(', ')}` 
      });
    }

    const mimeType = file.mimetype !== 'application/octet-stream' 
      ? file.mimetype 
      : guessMimeType(file.originalname);

    let tags: string[] = [];
    try {
      tags = req.body.tags ? JSON.parse(req.body.tags) : [];
    } catch {
      tags = [];
    }

    // Создаём запись в БД
    const result = await pool.query(
      `INSERT INTO knowledge_documents 
         (filename, original_name, file_size, mime_type, tags, description, uploaded_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
       RETURNING *`,
      [
        file.filename,
        file.originalname,
        file.size,
        mimeType,
        tags,
        req.body.description || null,
        userId,
      ]
    );

    const doc = result.rows[0];

    // Запускаем асинхронную обработку (не ждём!)
    processDocument(doc.id).catch(err => {
      console.error(`Ошибка фоновой обработки документа ${doc.id}:`, err);
    });

    res.status(201).json({
      ...doc,
      message: 'Документ принят и поставлен в очередь на обработку',
    });
  } catch (error: any) {
    console.error('Ошибка загрузки документа:', error);
    res.status(500).json({ error: error.message || 'Ошибка загрузки' });
  }
});

// GET /api/knowledge/documents — список документов
router.get('/documents', async (req: Request, res: Response) => {
  try {
    const { status, tag } = req.query;
    let query = `
      SELECT d.*, u.display_name AS uploaded_by_name
      FROM knowledge_documents d
      LEFT JOIN users u ON u.id = d.uploaded_by
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      query += ` AND d.status = $${params.length}`;
    }
    if (tag) {
      params.push(tag);
      query += ` AND $${params.length} = ANY(d.tags)`;
    }

    query += ' ORDER BY d.created_at DESC';

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/knowledge/documents/:id — удалить документ
router.delete('/documents/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const docId = parseInt(req.params.id);

    // Получаем имя файла для удаления с диска
    const docRes = await pool.query(
      'SELECT filename FROM knowledge_documents WHERE id = $1',
      [docId]
    );

    if (docRes.rows.length === 0) {
      return res.status(404).json({ error: 'Документ не найден' });
    }

    // Удаляем из БД (чанки удалятся каскадно)
    await pool.query('DELETE FROM knowledge_documents WHERE id = $1', [docId]);

    // Удаляем файл с диска
    const filePath = path.join(UPLOADS_DIR, docRes.rows[0].filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    res.json({ success: true, message: 'Документ удалён' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// RAG ЧАТ
// ============================================================

// POST /api/knowledge/chat — отправить вопрос и получить ответ
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { session_id, message } = req.body;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Сообщение не может быть пустым' });
    }

    // 1. Найти или создать сессию
    let sessionId = session_id;
    
    if (!sessionId) {
      // Создаём новую сессию, заголовок — первые 50 символов вопроса
      const title = message.trim().slice(0, 50) + (message.length > 50 ? '...' : '');
      const sessionRes = await pool.query(
        `INSERT INTO chat_sessions (user_id, title) VALUES ($1, $2) RETURNING id`,
        [userId, title]
      );
      sessionId = sessionRes.rows[0].id;
    } else {
      // Проверяем, что сессия принадлежит пользователю
      const checkRes = await pool.query(
        'SELECT user_id FROM chat_sessions WHERE id = $1',
        [sessionId]
      );
      if (checkRes.rows.length === 0 || checkRes.rows[0].user_id !== userId) {
        return res.status(403).json({ error: 'Сессия не найдена' });
      }
    }

    // 2. Сохраняем сообщение пользователя
    const userMsgRes = await pool.query(
      `INSERT INTO chat_messages (session_id, role, content)
       VALUES ($1, 'user', $2) RETURNING *`,
      [sessionId, message]
    );

    // 3. Проверяем, есть ли знания в базе
    const chunksCountRes = await pool.query(
      'SELECT COUNT(*) FROM knowledge_chunks'
    );
    const totalChunks = parseInt(chunksCountRes.rows[0].count);

    if (totalChunks === 0) {
      // База знаний пуста — отвечаем без RAG
      const fallbackPrompt = `Ты — корпоративный AI-ассистент компании mesNation. 
База знаний пока пуста, документы ещё не загружены.
Вежливо сообщи пользователю, что база знаний в процессе наполнения, 
и ответь на вопрос в общих чертах, если можешь.

Вопрос пользователя: ${message}

Ответ:`;

      const aiResponse = await generateResponse(fallbackPrompt);

      const aiMsgRes = await pool.query(
        `INSERT INTO chat_messages (session_id, role, content)
         VALUES ($1, 'assistant', $2) RETURNING *`,
        [sessionId, aiResponse]
      );

      return res.json({
        session_id: sessionId,
        user_message: userMsgRes.rows[0],
        assistant_message: {
          ...aiMsgRes.rows[0],
          source_chunks: [],
        },
      });
    }

    // 4. Получаем эмбеддинг вопроса
    const questionEmbedding = await getEmbedding(message);
    const embeddingStr = `[${questionEmbedding.join(',')}]`;

    // 5. Ищем топ-5 релевантных чанков (vector search)
    const searchRes = await pool.query(
      `SELECT 
         kc.id, 
         kc.content, 
         kc.document_id,
         kd.original_name AS document_name,
         1 - (kc.embedding <=> $1::vector) AS similarity
       FROM knowledge_chunks kc
       JOIN knowledge_documents kd ON kd.id = kc.document_id
       WHERE kd.status = 'completed'
       ORDER BY kc.embedding <=> $1::vector
       LIMIT 5`,
      [embeddingStr]
    );

    const relevantChunks = searchRes.rows;

    // 6. Формируем контекст из найденных чанков
    const context = relevantChunks
      .map((c, i) => `[Фрагмент ${i + 1} из "${c.document_name}"]\n${c.content}`)
      .join('\n\n');

    // 7. Формируем промпт для LLM
    const prompt = `Ты — корпоративный AI-ассистент компании. Твоя задача — отвечать на вопросы сотрудников строго на основе предоставленного контекста из базы знаний компании.

ПРАВИЛА:
1. Отвечай ТОЛЬКО на основе контекста ниже
2. Если в контексте нет ответа — честно скажи "В базе знаний нет информации по этому вопросу"
3. Отвечай на русском языке
4. Будь конкретным и полезным
5. Не выдумывай факты

КОНТЕКСТ ИЗ БАЗЫ ЗНАНИЙ:
${context}

ВОПРОС ПОЛЬЗОВАТЕЛЯ: ${message}

ОТВЕТ:`;

    // 8. Генерируем ответ через LLM
    const aiResponse = await generateResponse(prompt);

    // 9. Сохраняем ответ в БД
    const sourceChunkIds = relevantChunks.map(c => c.id);
    const aiMsgRes = await pool.query(
      `INSERT INTO chat_messages (session_id, role, content, source_chunk_ids)
       VALUES ($1, 'assistant', $2, $3) RETURNING *`,
      [sessionId, aiResponse, sourceChunkIds]
    );

    // 10. Возвращаем результат
    res.json({
      session_id: sessionId,
      user_message: userMsgRes.rows[0],
      assistant_message: {
        ...aiMsgRes.rows[0],
        source_chunks: relevantChunks.map(c => ({
          chunk_id: c.id,
          document_name: c.document_name,
          document_id: c.document_id,
          content: c.content.slice(0, 300),
          similarity: parseFloat(c.similarity).toFixed(3),
        })),
      },
    });

  } catch (error: any) {
    console.error('Ошибка чата:', error);
    res.status(500).json({ error: error.message || 'Ошибка обработки запроса' });
  }
});

// GET /api/knowledge/sessions — список сессий пользователя
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;

    const result = await pool.query(
      `SELECT 
         cs.id, 
         cs.title, 
         cs.created_at, 
         cs.updated_at,
         (SELECT content FROM chat_messages 
          WHERE session_id = cs.id AND role = 'assistant' 
          ORDER BY created_at DESC LIMIT 1) AS last_message
       FROM chat_sessions cs
       WHERE cs.user_id = $1
       ORDER BY cs.updated_at DESC
       LIMIT 50`,
      [userId]
    );

    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/knowledge/sessions/:id/messages — история сообщений
router.get('/sessions/:id/messages', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const sessionId = parseInt(req.params.id);

    // Проверяем доступ
    const checkRes = await pool.query(
      'SELECT user_id FROM chat_sessions WHERE id = $1',
      [sessionId]
    );

    if (checkRes.rows.length === 0 || checkRes.rows[0].user_id !== userId) {
      return res.status(403).json({ error: 'Сессия не найдена' });
    }

    const result = await pool.query(
      `SELECT * FROM chat_messages 
       WHERE session_id = $1 
       ORDER BY created_at ASC`,
      [sessionId]
    );

    res.json(result.rows);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/knowledge/sessions/:id — удалить сессию
router.delete('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const sessionId = parseInt(req.params.id);

    const result = await pool.query(
      'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2 RETURNING id',
      [sessionId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Сессия не найдена' });
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/knowledge/messages/:id/feedback — отзыв на ответ
router.post('/messages/:id/feedback', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const messageId = parseInt(req.params.id);
    const { feedback, comment } = req.body;

    if (!['positive', 'negative'].includes(feedback)) {
      return res.status(400).json({ error: 'feedback должен быть positive или negative' });
    }

    // Проверяем, что сообщение принадлежит пользователю
    const checkRes = await pool.query(
      `SELECT cm.id FROM chat_messages cm
       JOIN chat_sessions cs ON cs.id = cm.session_id
       WHERE cm.id = $1 AND cs.user_id = $2`,
      [messageId, userId]
    );

    if (checkRes.rows.length === 0) {
      return res.status(404).json({ error: 'Сообщение не найдено' });
    }

    await pool.query(
      `UPDATE chat_messages 
       SET feedback = $1, feedback_comment = $2 
       WHERE id = $3`,
      [feedback, comment || null, messageId]
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/knowledge/stats — статистика (для админов)
router.get('/stats', requireAdmin, async (req: Request, res: Response) => {
  try {
    const docsRes = await pool.query(
      `SELECT status, COUNT(*) FROM knowledge_documents GROUP BY status`
    );
    const chunksRes = await pool.query('SELECT COUNT(*) FROM knowledge_chunks');
    const sessionsRes = await pool.query('SELECT COUNT(*) FROM chat_sessions');
    const messagesRes = await pool.query(
      `SELECT role, COUNT(*) FROM chat_messages GROUP BY role`
    );

    const docsByStatus: Record<string, number> = {};
    docsRes.rows.forEach(r => { docsByStatus[r.status] = parseInt(r.count); });

    const messagesByRole: Record<string, number> = {};
    messagesRes.rows.forEach(r => { messagesByRole[r.role] = parseInt(r.count); });

    res.json({
      documents_by_status: docsByStatus,
      total_chunks: parseInt(chunksRes.rows[0].count),
      total_sessions: parseInt(sessionsRes.rows[0].count),
      messages_by_role: messagesByRole,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
