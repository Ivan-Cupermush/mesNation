import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { env } from '../config/env';
import { badRequest } from './errors';

/** Абсолютный путь к корню загрузок. */
export const UPLOADS_ROOT = path.resolve(env.UPLOADS_DIR);

export const UPLOAD_DIRS = {
  chat: UPLOADS_ROOT, // файлы сообщений исторически лежат в корне uploads/
  thumbs: path.join(UPLOADS_ROOT, 'thumbs'),
  avatars: path.join(UPLOADS_ROOT, 'avatars'),
  tasks: path.join(UPLOADS_ROOT, 'tasks'),
  notes: path.join(UPLOADS_ROOT, 'notes'),
  imports: path.join(UPLOADS_ROOT, 'imports'),
  knowledge: path.join(UPLOADS_ROOT, 'knowledge'),
} as const;

for (const dir of Object.values(UPLOAD_DIRS)) fs.mkdirSync(dir, { recursive: true });

/**
 * Расширения, которые можно хранить. Исполняемый в браузере контент
 * (html, svg, js) запрещён, чтобы загруженный файл нельзя было открыть
 * как страницу на нашем домене.
 */
const BLOCKED_EXT = new Set(['.html', '.htm', '.xhtml', '.svg', '.js', '.mjs', '.xml', '.php', '.exe', '.bat', '.cmd', '.sh']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.heic', '.heif', '.bmp']);

export function safeExtension(originalName: string): string {
  const ext = path.extname(originalName || '').toLowerCase().slice(0, 10);
  if (!/^\.[a-z0-9]+$/.test(ext)) return '';
  return BLOCKED_EXT.has(ext) ? '' : ext;
}

/** Имя файла на диске: случайное, непредсказуемое, с безопасным расширением. */
export function randomFileName(originalName: string, prefix = ''): string {
  return `${prefix}${Date.now()}-${crypto.randomBytes(12).toString('hex')}${safeExtension(originalName)}`;
}

/**
 * multer по умолчанию декодирует имя файла как latin1, из-за чего
 * русские имена превращаются в кракозябры. Восстанавливаем UTF-8.
 */
export function fixOriginalName(name: string): string {
  try {
    const decoded = Buffer.from(name, 'latin1').toString('utf8');
    return decoded.includes('�') ? name : decoded;
  } catch {
    return name;
  }
}

interface UploaderOptions {
  dir: string;
  maxSizeMb: number;
  imagesOnly?: boolean;
  allowedExt?: string[];
  prefix?: string;
}

export function makeUploader({ dir, maxSizeMb, imagesOnly, allowedExt, prefix }: UploaderOptions) {
  return multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, dir),
      filename: (_req, file, cb) => {
        file.originalname = fixOriginalName(file.originalname);
        cb(null, randomFileName(file.originalname, prefix));
      },
    }),
    limits: { fileSize: maxSizeMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(fixOriginalName(file.originalname)).toLowerCase();
      if (imagesOnly && !IMAGE_EXT.has(ext) && !file.mimetype.startsWith('image/')) {
        return cb(badRequest('Можно загрузить только изображение'));
      }
      if (allowedExt && !allowedExt.includes(ext)) {
        return cb(badRequest(`Неподдерживаемый формат. Разрешены: ${allowedExt.join(', ')}`));
      }
      cb(null, true);
    },
  });
}

export const isImage = (file: Express.Multer.File) =>
  file.mimetype.startsWith('image/') || IMAGE_EXT.has(path.extname(file.originalname).toLowerCase());

/** Удаляет файл, не падая, если его уже нет. */
export function removeFile(filePath: string | undefined | null) {
  if (filePath) fs.promises.unlink(filePath).catch(() => undefined);
}

/** Переводит публичный URL вида /uploads/... в путь на диске, не выходя за корень. */
export function urlToDiskPath(url: string): string | null {
  if (!url.startsWith('/uploads/')) return null;
  const rel = decodeURIComponent(url.slice('/uploads/'.length));
  const full = path.resolve(UPLOADS_ROOT, rel);
  return full.startsWith(UPLOADS_ROOT + path.sep) ? full : null;
}
