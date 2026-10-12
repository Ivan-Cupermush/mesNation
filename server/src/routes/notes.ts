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
import { addNotification } from '../services/notifications';
import { fireAndForget, notifyNoteRequest } from '../services/push';

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
    `SELECT s.*, COALESCE(u.display_name, u.username) AS sender_name, u.avatar_url AS sender_avatar_url,
            EXISTS (SELECT 1 FROM notes n WHERE n.id = s.note_id) AS original_exists
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
  const [acc, reqs] = await Promise.all([
    pool.query(
      `SELECT a.note_id FROM note_share_acceptances a JOIN notes n ON n.id = a.note_id
       WHERE a.share_id = $1 AND a.user_id = $2`,
      [share.id, req.userId],
    ),
    pool.query(
      `SELECT id, status, result_note_id, created_at, resolved_at FROM note_share_requests
       WHERE share_id = $1 AND requester_id = $2 ORDER BY id DESC LIMIT 1`,
      [share.id, req.userId],
    ),
  ]);
  const isOwner = share.sender_id === req.userId;
  res.json({
    id: share.id,
    title: share.title,
    content: share.content,
    files: share.files,
    sender_id: share.sender_id,
    sender_name: share.sender_name,
    sender_avatar_url: share.sender_avatar_url,
    created_at: share.created_at,
    accepted_note_id: acc.rows[0]?.note_id ?? null,
    is_accepted: acc.rows.length > 0,
    is_owner: isOwner,
    // Автору — его заметка в заметках; остальным — можно ли запросить свежую версию.
    original_note_id: isOwner && share.original_exists ? share.note_id : null,
    original_exists: share.original_exists,
    my_request: reqs.rows[0] ?? null,
  });
});

/**
 * Свободное имя для копии, как в Проводнике Windows:
 * «План», если такой нет, иначе «План (2)», «План (3)»…
 */
async function freeCopyTitle(db: { query: typeof pool.query }, userId: number, title: string) {
  const base = (title || '').trim() || 'Без названия';
  const { rows } = await db.query(
    `SELECT COALESCE(NULLIF(BTRIM(title), ''), 'Без названия') AS t FROM notes
     WHERE user_id = $1 AND (COALESCE(NULLIF(BTRIM(title), ''), 'Без названия') = $2 OR LEFT(title, LENGTH($2) + 2) = $2 || ' (')`,
    [userId, base],
  );
  const taken = new Set(rows.map((r: { t: string }) => r.t));
  if (!taken.has(base)) return base.slice(0, 255);
  for (let n = 2; ; n++) {
    const suffix = ` (${n})`;
    const name = base.slice(0, 255 - suffix.length) + suffix;
    if (!taken.has(name)) return name;
  }
}

/** Копирует заметку (текст и вложения) в заметки пользователя под свободным именем. */
async function copyNoteTo(
  db: { query: typeof pool.query },
  userId: number,
  src: { title: string; content: string },
  files: { file_url: string; file_name: string; file_size: unknown; mime_type: string | null }[],
) {
  const title = await freeCopyTitle(db, userId, src.title);
  const ins = await db.query('INSERT INTO notes (user_id, title, content, note_date) VALUES ($1, $2, $3, $4) RETURNING id', [
    userId,
    title,
    src.content || '',
    today(),
  ]);
  const newId = ins.rows[0].id as number;
  for (const f of files) {
    await db.query('INSERT INTO note_files (note_id, file_url, file_name, file_size, mime_type) VALUES ($1, $2, $3, $4, $5)', [
      newId,
      f.file_url,
      f.file_name,
      f.file_size ?? null,
      f.mime_type ?? null,
    ]);
  }
  return newId;
}

/**
 * Запросить актуальную версию: владелец получает просьбу в колокольчик
 * и push. Повторный запрос, пока владелец не ответил, не дублируется.
 */
router.post('/shared/:id/request', async (req: AuthRequest, res: Response) => {
  const share = await loadShareForViewer(paramId(req), req.userId!);
  if (share.sender_id === req.userId) throw badRequest('Это ваша заметка — актуальная версия у вас в заметках');
  if (!share.original_exists) throw badRequest('Автор удалил эту заметку — актуальной версии больше нет');
  const active = await pool.query('SELECT is_active FROM users WHERE id = $1', [share.sender_id]);
  if (!active.rows[0]?.is_active) throw badRequest('Автор заметки больше не работает в компании');

  const ins = await pool.query(
    `INSERT INTO note_share_requests (share_id, requester_id, owner_id, note_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (share_id, requester_id) WHERE status = 'pending' DO NOTHING
     RETURNING id, status, result_note_id, created_at, resolved_at`,
    [share.id, req.userId, share.sender_id, share.note_id],
  );
  if (!ins.rows.length) {
    const existing = await pool.query(
      `SELECT id, status, result_note_id, created_at, resolved_at FROM note_share_requests
       WHERE share_id = $1 AND requester_id = $2 AND status = 'pending'`,
      [share.id, req.userId],
    );
    res.json({ ...existing.rows[0], already: true });
    return;
  }
  const request = ins.rows[0];
  const note = (await pool.query('SELECT title, content FROM notes WHERE id = $1', [share.note_id])).rows[0];
  const title = note?.title || share.title || '';
  const requester = (await pool.query('SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1', [req.userId])).rows[0];
  await addNotification([share.sender_id], {
    kind: 'note_request',
    actorId: req.userId,
    title: `${requester?.name || 'Коллега'} просит актуальную версию заметки`,
    body: title || 'Без названия',
    data: { request_id: request.id, share_id: share.id, note_id: share.note_id, note_title: title },
  });
  fireAndForget(
    notifyNoteRequest('request', request.id, share.sender_id, req.userId!, title, { preview: note?.content || '' }),
    'запрос заметки',
  );
  res.status(201).json({ ...request, already: false });
});

// ---------- Запросы актуальной версии ----------

async function loadRequest(requestId: number, userId: number) {
  const { rows } = await pool.query(
    `SELECT r.*, s.title AS shared_title, s.created_at AS shared_at,
            n.title AS note_title, n.content AS note_content, n.updated_at AS note_updated_at,
            (SELECT COUNT(*)::int FROM note_files f WHERE f.note_id = n.id) AS note_files_count,
            COALESCE(rq.display_name, rq.username) AS requester_name, rq.avatar_url AS requester_avatar_url,
            COALESCE(ow.display_name, ow.username) AS owner_name, ow.avatar_url AS owner_avatar_url
     FROM note_share_requests r
     JOIN note_shares s ON s.id = r.share_id
     LEFT JOIN notes n ON n.id = r.note_id
     LEFT JOIN users rq ON rq.id = r.requester_id
     LEFT JOIN users ow ON ow.id = r.owner_id
     WHERE r.id = $1`,
    [requestId],
  );
  const r = rows[0];
  if (!r || (r.owner_id !== userId && r.requester_id !== userId)) throw notFound('Запрос не найден');
  return r;
}

function requestView(r: any, userId: number) {
  const isOwner = r.owner_id === userId;
  const exists = r.note_title !== null && r.note_title !== undefined;
  return {
    id: r.id,
    status: r.status,
    created_at: r.created_at,
    resolved_at: r.resolved_at,
    is_owner: isOwner,
    requester: { id: r.requester_id, name: r.requester_name, avatar_url: r.requester_avatar_url },
    owner: { id: r.owner_id, name: r.owner_name, avatar_url: r.owner_avatar_url },
    shared: { id: r.share_id, title: r.shared_title, created_at: r.shared_at },
    // Владелец видит то, чем поделится; запросивший — только название.
    note: exists
      ? {
          id: isOwner ? r.note_id : null,
          title: r.note_title,
          preview: isOwner ? String(r.note_content || '').slice(0, 600) : null,
          files_count: isOwner ? r.note_files_count : null,
          updated_at: r.note_updated_at,
          changed_since_share: new Date(r.note_updated_at).getTime() > new Date(r.shared_at).getTime(),
        }
      : null,
    result_note_id: isOwner ? null : r.result_note_id,
  };
}

/** Ответили на запрос — его уведомление в колокольчике больше не «новое». */
async function markRequestRead(userId: number, requestId: number) {
  await pool.query(
    `UPDATE notifications SET read_at = NOW()
     WHERE user_id = $1 AND kind = 'note_request' AND read_at IS NULL AND data->>'request_id' = $2`,
    [userId, String(requestId)],
  );
}

router.get('/requests/:id', async (req: AuthRequest, res: Response) => {
  res.json(requestView(await loadRequest(paramId(req), req.userId!), req.userId!));
});

/** Поделиться актуальной версией: у запросившего появляется новая копия «Название (2)». */
router.post('/requests/:id/approve', async (req: AuthRequest, res: Response) => {
  const r = await loadRequest(paramId(req), req.userId!);
  if (r.owner_id !== req.userId) throw forbidden('Ответить на запрос может только автор заметки');
  if (r.status !== 'pending') {
    res.json(requestView(r, req.userId!));
    return;
  }
  if (r.note_title === null || r.note_title === undefined) throw badRequest('Заметка удалена — делиться нечем');
  const result = await withTransaction(async (db) => {
    const locked = await db.query('SELECT status FROM note_share_requests WHERE id = $1 FOR UPDATE', [r.id]);
    if (locked.rows[0]?.status !== 'pending') return null;
    const note = (await db.query('SELECT title, content FROM notes WHERE id = $1', [r.note_id])).rows[0];
    if (!note) throw badRequest('Заметка удалена — делиться нечем');
    const files = (
      await db.query('SELECT file_url, file_name, file_size, mime_type FROM note_files WHERE note_id = $1 ORDER BY id', [r.note_id])
    ).rows;
    const newId = await copyNoteTo(db, r.requester_id, note, files);
    await db.query("UPDATE note_share_requests SET status = 'approved', result_note_id = $2, resolved_at = NOW() WHERE id = $1", [
      r.id,
      newId,
    ]);
    return { noteId: newId, title: (await db.query('SELECT title FROM notes WHERE id = $1', [newId])).rows[0].title as string };
  });
  if (result) {
    await addNotification([r.requester_id], {
      kind: 'note_request_approved',
      actorId: req.userId,
      title: `${r.owner_name || 'Автор'} поделился актуальной версией`,
      body: result.title,
      data: { request_id: r.id, note_id: result.noteId, note_title: result.title },
    });
    fireAndForget(notifyNoteRequest('approved', r.id, r.requester_id, req.userId!, result.title, { note_id: result.noteId }), 'ответ на запрос заметки');
    await markRequestRead(req.userId!, r.id);
  }
  res.json(requestView(await loadRequest(r.id, req.userId!), req.userId!));
});

router.post('/requests/:id/decline', async (req: AuthRequest, res: Response) => {
  const r = await loadRequest(paramId(req), req.userId!);
  if (r.owner_id !== req.userId) throw forbidden('Ответить на запрос может только автор заметки');
  const upd = await pool.query(
    "UPDATE note_share_requests SET status = 'declined', resolved_at = NOW() WHERE id = $1 AND status = 'pending' RETURNING id",
    [r.id],
  );
  if (upd.rows.length) {
    const title = r.note_title || r.shared_title || 'Без названия';
    await addNotification([r.requester_id], {
      kind: 'note_request_declined',
      actorId: req.userId,
      title: `${r.owner_name || 'Автор'} не стал делиться новой версией`,
      body: title,
      data: { request_id: r.id, share_id: r.share_id, note_title: title },
    });
    fireAndForget(notifyNoteRequest('declined', r.id, r.requester_id, req.userId!, title), 'ответ на запрос заметки');
    await markRequestRead(req.userId!, r.id);
  }
  res.json(requestView(await loadRequest(r.id, req.userId!), req.userId!));
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
  reply_to_message_id: id.nullish(),
  client_id: z.string().max(64).nullish(),
  comment: z.string().trim().max(4000).optional(),
});

router.post('/:id/share', validate(shareSchema), async (req: AuthRequest, res: Response) => {
  const { chat_id, topic_id, reply_to_message_id, client_id, comment } = req.body as z.infer<typeof shareSchema>;
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
  // Подпись — как у файла: в том же сообщении, под карточкой заметки.
  const message = await createMessage({
    chatId: chat_id,
    senderId: req.userId!,
    topicId: topic_id ?? null,
    replyToMessageId: reply_to_message_id ?? null,
    clientId: client_id ?? null,
    text: comment || null,
    contentType: 'note',
    noteShareId: rows[0].id,
  });
  res.status(201).json(message);
});

export default router;
