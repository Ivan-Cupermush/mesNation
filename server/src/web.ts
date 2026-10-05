import fs from 'fs';
import path from 'path';
import express, { Router, Request, Response, NextFunction } from 'express';
import { env } from './config/env';
import { logger } from './lib/logger';

/**
 * Веб-версия, собранная `npm run build` в web/, раздаётся тем же процессом
 * и с того же адреса, что и API и Socket.IO.
 *
 * Раньше сайт отдавал dev-сервер Vite на отдельном порту: сотни мелких
 * несжатых модулей, кеш «оптимизированных зависимостей», который у разных
 * браузеров расходился, и отдельный домен для API. Отсюда «работает только
 * в Хроме / только в Яндексе / то грузится, то нет».
 *
 * Здесь:
 * - /assets/* — файлы с хешем в имени, кешируются браузером навсегда;
 *   отсутствующий файл — честный 404, а не index.html (иначе после
 *   обновления сайта старая вкладка получает HTML вместо JS);
 * - любой другой GET, который ждёт HTML, получает index.html — маршруты
 *   React (/tasks/12, /chats/5) открываются по прямой ссылке и после F5;
 * - index.html не кешируется, поэтому новая версия сайта видна сразу.
 */

/** Пути, которые обслуживает сервер, а не веб-приложение. */
const SERVER_PATHS = /^\/(api|uploads|socket\.io)(\/|$)/;

export function resolveWebDist(dir: string = env.WEB_DIST_DIR): string {
  return path.resolve(dir);
}

export function createWebRouter(dir: string = resolveWebDist()): Router | null {
  const index = path.join(dir, 'index.html');
  if (!fs.existsSync(index)) {
    logger.warn({ dir }, 'Веб-версия не собрана (нет index.html) — сайт не раздаётся. Соберите: cd web && npm run build');
    return null;
  }

  const router = Router();

  router.use(
    '/assets',
    express.static(path.join(dir, 'assets'), { index: false, immutable: true, maxAge: '1y', fallthrough: true }),
    (_req: Request, res: Response) => {
      res.status(404).type('text/plain').send('Not found');
    },
  );

  // favicon, иконки, manifest — без хеша в имени, кешируем ненадолго.
  router.use(express.static(dir, { index: false, maxAge: '1h', dotfiles: 'ignore' }));

  router.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (SERVER_PATHS.test(req.path)) return next();
    if (!req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });

  logger.info({ dir }, 'Веб-версия раздаётся сервером');
  return router;
}
