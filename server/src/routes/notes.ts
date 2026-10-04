import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool, { withTransaction } from '../db/pool';
import { env } from '../config/env';
import { AuthRequest } from '../middleware/auth';
import { badRequest, forbidden, notFound, unauthorized } from '../lib/errors';
import { validate, id, paramId } from '../lib/validate';
import { makeUploader, removeFile, UPLOAD_DIRS, urlToDiskPath } from '../lib/uploads';
import { assertChatMember } from '../services/access';
import { createMessage } from '../services/messages';
import { getCompanyName } from '../services/company';
import { renderNotePdf } from '../services/notePdf';

/**
 * Личные заметки сотрудника: календарь, избранное, вложения,
 * копирование, экспорт в PDF и отправка во внутренний чат.
 */
const router = Router();

const month = z.string().regex(/^\d{4}-\d{2}$/, 'Месяц в формате ГГГГ-ММ');
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Дата в формате ГГГГ-ММ-ДД');
const listQuery = z.object({ month: month.optional(), date: date.optional(), favorite: z.enum(['true', 'false']).optional() });
const noteSchema = z.object({
  title: z.string().max(255).optional(),
  content: z.string().max(200000).optional(),
  note_date: date.optional(),
  is_favorite: z.boolean().optional(),
});

const NOTE_SELECT = `
  n.id, n.user_id, n.title, n.content, n.is_favorite,
  TO_CHAR(n.note_date, 'YYYY-MM-DD') AS note_date, n.created_at, n.updated_at,
  (SELECT COUNT(*)::int FROM note_files f WHERE f.note_id = n.id) AS files_count`;

const today = () => new Date().toISOString().split('T')[0];

async function loadOwnNote(noteId: number, userId: number) {
  const { rows } = await pool.query(`SELECT ${NOTE_SELECT} FROM notes n WHERE n.id = $1`, [noteId]);
  if (!rows.length) throw notFound('Заметка не найдена');
  if (rows[0].user_id !== userId) throw forbidden('Нет доступа к заметке');
  return rows[0];
}

async function loadFiles(noteId: number) {
  const { rows } = await pool.query(
    'SELECT id, note_id, file_url, file_name, file_size, mime_type, created_at FROM note_files WHERE note_id = $1 ORDER BY id',
    [noteId],
  );
  return rows;
}

/**
 * Файл заметки может принадлежать нескольким заметкам (после копирования
 * или принятия пересланной заметки) — удаляем с диска, только когда
 * на него больше никто не ссылается.
 */
async function removeIfOrphan(fileUrl: string) {
  const { rows } = await pool.query(
    `SELECT EXISTS (SELECT 1 FROM note_files WHERE file_url = $1)
         OR EXISTS (SELECT 1 FROM note_shares WHERE files @> jsonb_build_array(jsonb_build_object('file_url', $1::text))) AS used`,
    [fileUrl],
  );
  if (!rows[0].used) removeFile(urlToDiskPath(fileUrl));
}

// ---------- Списки ----------

// GET /api/notes - Получить заметки с фильтрами
router.get('/', async (req: AuthRequest, res: Response) => {
  const { month: m, date: d, favorite } = listQuery.parse(req.query);
  let query = `SELECT ${NOTE_SELECT} FROM notes n WHERE n.user_id = $1`;
  const params: unknown[] = [req.userId];
  if (m) {
    params.push(m);
    query += ` AND TO_CHAR(n.note_date, 'YYYY-MM') = $${params.length}`;
  }
  if (d) {
    params.push(d);
    query += ` AND n.note_date = $${params.length}::date`;
  }
  if (favorite === 'true') query += ' AND n.is_favorite = TRUE';
  query += ' ORDER BY n.updated_at DESC';
  const { rows } = await pool.query(query, params);
  res.json(rows);
});

// GET /api/notes/days-with-notes - Получить дни с заметками за месяц
router.get(['/days-with-notes', '/days'], async (req: AuthRequest, res: Response) => {
  const { month: m } = listQuery.parse(req.query);
  if (!m) throw badRequest('Параметр month обязателен (формат: YYYY-MM)');
  const { rows } = await pool.query(
    `SELECT TO_CHAR(note_date, 'YYYY-MM-DD') AS note_date, COUNT(*)::int AS note_count
     FROM notes WHERE user_id = $1 AND TO_CHAR(note_date, 'YYYY-MM') = $2
     GROUP BY note_date ORDER BY note_date`,
    [req.userId, m],
  );
  res.json(rows);
});

// Совместимость с веб-клиентом.
router.get('/favorites', async (req: AuthRequest, res: Response) => {
  const { rows } = await pool.query(
    `SELECT ${NOTE_SELECT} FROM notes n WHERE n.user_id = $1 AND n.is_favorite ORDER BY n.updated_at DESC`,
    [req.userId],
  );
  res.json(rows);
});

// ---------- Пересланные заметки ----------

async function loadShareForViewer(shareId: number, userId: number) {
  const { rows } = await pool.query(
    `SELECT s.*, COALESCE(u.display_name, u.username) AS sender_name
     FROM note_shares s LEFT JOIN users u ON u.id = s.sender_id WHERE s.id = $1`,
    [shareId],
  );
  if (!rows.length) throw notFound('Пересланная заметка не найдена');
  const share = rows[0];
  // Смотреть может отправитель и участники любого чата, куда заметка попала (в т. ч. пересылкой).
  if (share.sender_id !== userId) {
    const chats = await pool.query(
      'SELECT DISTINCT chat_id FROM messages WHERE note_share_id = $1 AND deleted_for_all IS NOT TRUE',
      [shareId],
    );
    let allowed = false;
    for (const c of chats.rows) {
      try {
        await assertChatMember(Number(c.chat_id), userId);
        allowed = true;
        break;
      } catch {
        // не участник этого чата — проверяем следующий
      }
    }
    if (!allowed) throw forbidden('Нет доступа к заметке');
  }
  return share;
}

router.get('/shared/:id', async (req: AuthRequest, res: Response) => {
  const share = await loadShareForViewer(paramId(req), req.userId!);
  const acc = await pool.query('SELECT note_id FROM note_share_acceptances WHERE share_id = $1 AND user_id = $2', [
    share.id,
    req.userId,
  ]);
  res.json({
    id: share.id,
    title: share.title,
    content: share.content,
    files: share.files,
    sender_id: share.sender_id,
    sender_name: share.sender_name,
    created_at: share.created_at,
    accepted_note_id: acc.rows[0]?.note_id ?? null,
    is_accepted: acc.rows.length > 0,
  });
});

/** Принять пересланную заметку: она копируется в заметки получателя на сегодня. */
router.post('/shared/:id/accept', async (req: AuthRequest, res: Response) => {
  const share = await loadShareForViewer(paramId(req), req.userId!);
  const noteId = await withTransaction(async (db) => {
    const existing = await db.query(
      `SELECT a.note_id FROM note_share_acceptances a JOIN notes n ON n.id = a.note_id
       WHERE a.share_id = $1 AND a.user_id = $2`,
      [share.id, req.userId],
    );
    if (existing.rows.length) return existing.rows[0].note_id as number;

    const ins = await db.query(
      'INSERT INTO notes (user_id, title, content, note_date) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.userId, share.title, share.content, today()],
    );
    const newId = ins.rows[0].id as number;
    for (const f of share.files as any[]) {
      await db.query(
        'INSERT INTO note_files (note_id, file_url, file_name, file_size, mime_type) VALUES ($1, $2, $3, $4, $5)',
        [newId, f.file_url, f.file_name, f.file_size ?? null, f.mime_type ?? null],
      );
    }
    await db.query(
      `INSERT INTO note_share_acceptances (share_id, user_id, note_id) VALUES ($1, $2, $3)
       ON CONFLICT (share_id, user_id) DO UPDATE SET note_id = EXCLUDED.note_id, accepted_at = NOW()`,
      [share.id, req.userId, newId],
    );
    return newId;
  });
  const note = await loadOwnNote(noteId, req.userId!);
  res.status(201).json({ ...note, files: await loadFiles(noteId) });
});

// ---------- Одна заметка ----------

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const note = await loadOwnNote(paramId(req), req.userId!);
  res.json({ ...note, files: await loadFiles(note.id) });
});

// POST /api/notes - Создать новую заметку
router.post('/', validate(noteSchema), async (req: AuthRequest, res: Response) => {
  const { title = '', content = '', note_date, is_favorite = false } = req.body as z.infer<typeof noteSchema>;
  const { rows } = await pool.query(
    'INSERT INTO notes (user_id, title, content, note_date, is_favorite) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [req.userId, title, content, note_date || today(), is_favorite],
  );
  res.status(201).json({ ...(await loadOwnNote(rows[0].id, req.userId!)), files: [] });
});

// PATCH /api/notes/:id - Обновить заметку
async function updateNote(req: AuthRequest, res: Response) {
  const noteId = paramId(req);
  await loadOwnNote(noteId, req.userId!);
  const body = req.body as z.infer<typeof noteSchema>;
  const updates: string[] = [];
  const values: unknown[] = [];
  const set = (sql: string, value: unknown) => {
    values.push(value);
    updates.push(`${sql} = $${values.length}`);
  };
  if (body.title !== undefined) set('title', body.title);
  if (body.content !== undefined) set('content', body.content);
  if (body.is_favorite !== undefined) set('is_favorite', body.is_favorite);
  if (body.note_date !== undefined) set('note_date', body.note_date);
  if (!updates.length) throw badRequest('Нет данных для обновления');
  values.push(noteId);
  await pool.query(`UPDATE notes SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length}`, values);
  res.json({ ...(await loadOwnNote(noteId, req.userId!)), files: await loadFiles(noteId) });
}
router.patch('/:id', validate(noteSchema), updateNote);
router.put('/:id', validate(noteSchema), updateNote);

// DELETE /api/notes/:id - Удалить заметку
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  const noteId = paramId(req);
  const files = await loadFiles(noteId);
  const { rows } = await pool.query('DELETE FROM notes WHERE id = $1 AND user_id = $2 RETURNING id', [noteId, req.userId]);
  if (!rows.length) throw notFound('Заметка не найдена');
  for (const f of files) await removeIfOrphan(f.file_url);
  res.json({ success: true });
});

/** Копия заметки (с теми же вложениями). */
router.post('/:id/duplicate', validate(z.object({ note_date: date.optional() })), async (req: AuthRequest, res: Response) => {
  const src = await loadOwnNote(paramId(req), req.userId!);
  const newId = await withTransaction(async (db) => {
    const ins = await db.query(
      'INSERT INTO notes (user_id, title, content, note_date) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.userId, src.title ? `${src.title} (копия)`.slice(0, 255) : '', src.content, req.body.note_date || src.note_date],
    );
    await db.query(
      `INSERT INTO note_files (note_id, file_url, file_name, file_size, mime_type)
       SELECT $1, file_url, file_name, file_size, mime_type FROM note_files WHERE note_id = $2 ORDER BY id`,
      [ins.rows[0].id, src.id],
    );
    return ins.rows[0].id as number;
  });
  res.status(201).json({ ...(await loadOwnNote(newId, req.userId!)), files: await loadFiles(newId) });
});

// ---------- Вложения ----------

const noteUpload = makeUploader({ dir: UPLOAD_DIRS.notes, maxSizeMb: 50 });
const MAX_FILES_PER_NOTE = 20;

router.post('/:id/files', noteUpload.single('file'), async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) throw badRequest('Файл не получен');
  try {
    const note = await loadOwnNote(paramId(req), req.userId!);
    if (note.files_count >= MAX_FILES_PER_NOTE) throw badRequest(`К заметке можно прикрепить не больше ${MAX_FILES_PER_NOTE} файлов`);
    const { rows } = await pool.query(
      `INSERT INTO note_files (note_id, file_url, file_name, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, note_id, file_url, file_name, file_size, mime_type, created_at`,
      [note.id, `/uploads/notes/${file.filename}`, file.originalname, file.size, file.mimetype],
    );
    await pool.query('UPDATE notes SET updated_at = NOW() WHERE id = $1', [note.id]);
    res.status(201).json(rows[0]);
  } catch (err) {
    removeFile(file.path);
    throw err;
  }
});

router.delete('/:id/files/:fileId', async (req: AuthRequest, res: Response) => {
  const note = await loadOwnNote(paramId(req), req.userId!);
  const { rows } = await pool.query('DELETE FROM note_files WHERE id = $1 AND note_id = $2 RETURNING file_url', [
    paramId(req, 'fileId'),
    note.id,
  ]);
  if (!rows.length) throw notFound('Файл не найден');
  await removeIfOrphan(rows[0].file_url);
  res.json({ success: true });
});

// ---------- Экспорт в PDF ----------

const PDF_TOKEN_TTL = '10m';

/**
 * Ссылка на PDF живёт 10 минут и открывается во внешнем приложении
 * (браузере / просмотрщике PDF) без заголовка авторизации.
 */
router.get('/:id/pdf-link', async (req: AuthRequest, res: Response) => {
  const note = await loadOwnNote(paramId(req), req.userId!);
  const token = jwt.sign({ purpose: 'note-pdf', noteId: note.id, userId: req.userId }, env.JWT_SECRET, {
    expiresIn: PDF_TOKEN_TTL,
  });
  res.json({ url: `/api/notes-pdf?token=${encodeURIComponent(token)}` });
});

async function sendPdf(res: Response, noteId: number, userId: number) {
  const note = await loadOwnNote(noteId, userId);
  const [files, author, company] = await Promise.all([
    loadFiles(noteId),
    pool.query('SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1', [userId]),
    getCompanyName(),
  ]);
  const pdf = await renderNotePdf({
    title: note.title,
    content: note.content,
    note_date: note.note_date,
    author: author.rows[0]?.name || '',
    company,
    files,
  });
  const fileName = `${(note.title || 'Заметка').replace(/[\\/:*?"<>|\r\n]+/g, ' ').trim().slice(0, 80) || 'Заметка'}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="note.pdf"; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.send(pdf);
}

router.get('/:id/pdf', async (req: AuthRequest, res: Response) => {
  await sendPdf(res, paramId(req), req.userId!);
});

/** Публичный обработчик подписанной ссылки (монтируется до authenticate). */
export const notePdfPublicRouter = Router();
notePdfPublicRouter.get('/', async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  let payload: { purpose?: string; noteId?: number; userId?: number };
  try {
    payload = jwt.verify(token, env.JWT_SECRET) as typeof payload;
  } catch {
    throw unauthorized('Ссылка устарела. Откройте экспорт ещё раз.');
  }
  if (payload.purpose !== 'note-pdf' || !payload.noteId || !payload.userId) throw unauthorized('Недействительная ссылка');
  const active = await pool.query('SELECT is_active FROM users WHERE id = $1', [payload.userId]);
  if (!active.rows[0]?.is_active) throw unauthorized('Недействительная ссылка');
  await sendPdf(res, payload.noteId, payload.userId);
});

// ---------- Отправка в чат ----------

const shareSchema = z.object({
  chat_id: id,
  topic_id: id.nullish(),
  comment: z.string().trim().max(4000).optional(),
});

router.post('/:id/share', validate(shareSchema), async (req: AuthRequest, res: Response) => {
  const { chat_id, topic_id, comment } = req.body as z.infer<typeof shareSchema>;
  const note = await loadOwnNote(paramId(req), req.userId!);
  await assertChatMember(chat_id, req.userId!);
  const files = await loadFiles(note.id);
  const snapshot = files.map((f) => ({
    file_url: f.file_url,
    file_name: f.file_name,
    file_size: f.file_size === null ? null : Number(f.file_size),
    mime_type: f.mime_type,
  }));
  const { rows } = await pool.query(
    `INSERT INTO note_shares (note_id, sender_id, chat_id, title, content, files)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
    [note.id, req.userId, chat_id, note.title || '', note.content || '', JSON.stringify(snapshot)],
  );
  if (comment) {
    await createMessage({ chatId: chat_id, senderId: req.userId!, text: comment, topicId: topic_id ?? null });
  }
  const message = await createMessage({
    chatId: chat_id,
    senderId: req.userId!,
    topicId: topic_id ?? null,
    text: `📝 ${note.title || 'Заметка'}`,
    contentType: 'note',
    noteShareId: rows[0].id,
  });
  res.status(201).json(message);
});

export default router;
