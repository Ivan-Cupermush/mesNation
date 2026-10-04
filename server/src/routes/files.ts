import fs from 'fs';
import path from 'path';
import express, { Router, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import pool from '../db/pool';
import { env } from '../config/env';
import { AuthRequest, extractBearer, verifyUserToken } from '../middleware/auth';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import { UPLOADS_ROOT, UPLOAD_DIRS, urlToDiskPath } from '../lib/uploads';
import { getTaskRoles, isChatMember } from '../services/access';

/**
 * Доступ к загруженным файлам.
 *
 * - /uploads/avatars и /uploads/thumbs — публичные (аватары и превью картинок
 *   со случайными именами).
 * - Файлы сообщений и задач отдаются только тем, у кого есть доступ к чату
 *   или задаче. Клиент передаёт либо заголовок Authorization (так грузятся
 *   картинки в приложении), либо ?token= из подписанной ссылки
 *   (для открытия файла во внешнем приложении/браузере).
 * - Импорты Excel и документы базы знаний наружу не отдаются никогда.
 */

const FILE_TOKEN_TTL = '10m';

function signFileUrl(url: string, userId: number): string {
  const token = jwt.sign({ purpose: 'file', path: url, userId }, env.JWT_SECRET, { expiresIn: FILE_TOKEN_TTL });
  return `${url}?token=${encodeURIComponent(token)}`;
}

/** Есть ли у пользователя доступ к файлу по его публичному URL. */
async function canAccessFile(url: string, userId: number): Promise<boolean> {
  if (url.startsWith('/uploads/avatars/') || url.startsWith('/uploads/thumbs/')) return true;
  if (url.startsWith('/uploads/imports/') || url.startsWith('/uploads/knowledge/')) return false;

  if (url.startsWith('/uploads/tasks/')) {
    const { rows } = await pool.query('SELECT task_id FROM task_files WHERE file_url = $1', [url]);
    for (const r of rows) {
      if ((await getTaskRoles(r.task_id, userId)).canView) return true;
    }
    return false;
  }

  if (url.startsWith('/uploads/notes/')) {
    const { rows } = await pool.query(
      `SELECT 1 FROM note_files nf JOIN notes n ON n.id = nf.note_id
       WHERE nf.file_url = $1 AND n.user_id = $2 LIMIT 1`,
      [url, userId],
    );
    if (rows.length) return true;
    // Вложения пересланной заметки видят участники чата, куда её отправили.
    const shared = await pool.query(
      `SELECT DISTINCT m.chat_id FROM note_shares s JOIN messages m ON m.note_share_id = s.id
       WHERE s.files @> jsonb_build_array(jsonb_build_object('file_url', $1::text)) AND m.deleted_for_all IS NOT TRUE`,
      [url],
    );
    for (const r of shared.rows) {
      if (await isChatMember(r.chat_id, userId)) return true;
    }
    return false;
  }

  // Файлы сообщений: доступ у участников любого чата, где файл был отправлен
  // (при пересылке один файл может оказаться в нескольких чатах).
  const { rows } = await pool.query(
    'SELECT DISTINCT chat_id FROM messages WHERE file_url = $1 AND deleted_for_all IS NOT TRUE',
    [url],
  );
  for (const r of rows) {
    if (await isChatMember(r.chat_id, userId)) return true;
  }
  return false;
}

/** Определяет пользователя по заголовку или по токену из ссылки. */
function resolveViewer(req: AuthRequest, url: string): number | null {
  const bearer = extractBearer(req.headers.authorization);
  if (bearer) {
    try {
      return verifyUserToken(bearer).userId;
    } catch {
      return null;
    }
  }
  const token = typeof req.query.token === 'string' ? req.query.token : null;
  if (!token) return null;
  try {
    const p = jwt.verify(token, env.JWT_SECRET) as { purpose?: string; path?: string; userId?: number };
    // Старые ссылки /api/file-token выдавались на имя файла в корне uploads.
    if (p.purpose === 'file' && p.path === url && typeof p.userId === 'number') return p.userId;
    return null;
  } catch {
    return null;
  }
}

const publicStatic = (dir: string) => express.static(dir, { fallthrough: true, index: false, dotfiles: 'deny' });

export const uploadsRouter = Router();

// Публичные разделы.
uploadsRouter.use('/avatars', publicStatic(UPLOAD_DIRS.avatars));
uploadsRouter.use('/thumbs', publicStatic(UPLOAD_DIRS.thumbs));

// Аватары, загруженные до исправления, лежат в корне uploads/, а URL у них
// /uploads/avatars/<имя>. Отдаём такие файлы из старого места.
uploadsRouter.get('/avatars/:name', async (req, res, next) => {
  const name = path.basename(String(req.params.name));
  const legacy = path.join(UPLOADS_ROOT, name);
  const { rows } = await pool.query('SELECT 1 FROM users WHERE avatar_url = $1 LIMIT 1', [`/uploads/avatars/${name}`]);
  if (rows.length && fs.existsSync(legacy)) return res.sendFile(legacy, { headers: { 'Cache-Control': 'private, max-age=86400' } });
  next();
});

// Всё остальное — только с проверкой доступа.
uploadsRouter.use(async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const url = '/uploads' + req.path;
  const viewer = resolveViewer(req, url);
  if (!viewer) throw unauthorized('Нет доступа к файлу');
  if (!(await canAccessFile(url, viewer))) throw forbidden('Нет доступа к файлу');
  const disk = urlToDiskPath(url);
  if (!disk || !fs.existsSync(disk)) throw notFound('Файл не найден');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(disk);
});

export const filesApiRouter = Router();

/** GET /api/files/url?path=/uploads/... — подписанная ссылка на 10 минут. */
filesApiRouter.get('/files/url', async (req: AuthRequest, res: Response) => {
  const { path: url } = z.object({ path: z.string().startsWith('/uploads/') }).parse(req.query);
  if (!(await canAccessFile(url, req.userId!))) throw forbidden('Нет доступа к файлу');
  res.json({ url: signFileUrl(url, req.userId!) });
});

/** Старый эндпоинт (используется приложением для аватаров): ссылка по имени файла. */
filesApiRouter.get('/file-token/:filename', async (req: AuthRequest, res: Response) => {
  const name = path.basename(String(req.params.filename));
  const candidates = [`/uploads/avatars/${name}`, `/uploads/${name}`];
  for (const url of candidates) {
    const disk = urlToDiskPath(url);
    if (disk && fs.existsSync(disk) && (await canAccessFile(url, req.userId!))) {
      return res.json({ url: url.startsWith('/uploads/avatars/') ? url : signFileUrl(url, req.userId!) });
    }
  }
  // Аватар из старого места.
  const { rows } = await pool.query('SELECT 1 FROM users WHERE avatar_url = $1', [`/uploads/avatars/${name}`]);
  if (rows.length) return res.json({ url: `/uploads/avatars/${name}` });
  throw notFound('Файл не найден');
});

export { signFileUrl, canAccessFile };
