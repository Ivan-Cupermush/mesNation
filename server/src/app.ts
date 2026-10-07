import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import pinoHttp from 'pino-http';
import crypto from 'crypto';
import { corsOrigins, trustProxySetting } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './lib/errors';
import { AuthRequest, authenticate, requireDirector } from './middleware/auth';
import { audit } from './services/audit';
import { z } from 'zod';
import { validate } from './lib/validate';
import pool from './db/pool';
import { getCompanyName, setCompanyName } from './services/company';

import authRouter from './routes/auth';
import usersRouter from './routes/users';
import chatsRouter from './routes/chats';
import messagesRouter from './routes/messages';
import topicsRouter from './routes/topics';
import pollsRouter from './routes/polls';
import roleTreeRouter from './routes/roleTree';
import pushRouter from './routes/push';
import tasksRouter from './routes/tasks';
import notesRouter, { notePdfPublicRouter } from './routes/notes';
import kpiImportRouter from './routes/kpiImport';
import kpiSalesRouter from './routes/kpiSales';
import kpiReportsRouter from './routes/kpiReports';
import knowledgeRouter from './routes/knowledge';
import { filesApiRouter, uploadsRouter } from './routes/files';
import { createWebRouter, resolveWebDist } from './web';
import { lastMigration, serverCommit } from './lib/version';
import { hasFfmpeg } from './services/media';

export interface AppOptions {
  /** Папка собранной веб-версии; null — не раздавать сайт (тесты, отдельный фронтенд). */
  webDistDir?: string | null;
}

/**
 * Политика безопасности контента для веб-версии и всех ответов сервера.
 * Скрипты — только свои (XSS не сможет подгрузить чужой код и унести токен),
 * картинки и видео — свои, data: и blob: (превью выбранных файлов),
 * сеть — только свой адрес (в том числе WebSocket), встраивание в чужие сайты запрещено.
 * upgrade-insecure-requests выключен: иначе сайт, открытый по http://IP:порт
 * в локальной сети, пытался бы грузить скрипты по https и показывал белый экран.
 */
const CSP_DIRECTIVES = {
  'default-src': ["'self'"],
  'base-uri': ["'self'"],
  'script-src': ["'self'"],
  'script-src-attr': ["'none'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'media-src': ["'self'", 'blob:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'worker-src': ["'self'", 'blob:'],
  'manifest-src': ["'self'"],
  'object-src': ["'none'"],
  'frame-src': ["'self'"],
  'frame-ancestors': ["'self'"],
  'form-action': ["'self'"],
  'upgrade-insecure-requests': null,
};

export function createApp(options: AppOptions = {}) {
  const app = express();
  // Реальный IP клиента берётся из X-Forwarded-For только от доверенного прокси
  // (по умолчанию — cloudflared/Caddy на этой же машине), иначе лимиты входа обходятся подделкой заголовка.
  app.set('trust proxy', trustProxySetting());
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string) || crypto.randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
      // Проверки здоровья и файлы сайта не засоряют лог (ошибки по ним всё равно видны по статусу у прокси).
      autoLogging: { ignore: (req) => req.url === '/api/health' || (req.url || '').startsWith('/assets/') },
    }),
  );
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: { useDefaults: false, directives: CSP_DIRECTIVES },
    }),
  );
  // Сжатие JSON и файлов сайта: на медленном или «зажатом» канале страница грузится в разы быстрее.
  app.use(compression());
  app.use(cors({ origin: corsOrigins.length ? corsOrigins : false }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ limit: '2mb', extended: true }));

  // ---------- Публичное ----------
  app.get('/api/health', async (_req, res) => {
    const db = await pool.query('SELECT 1').then(() => true).catch(() => false);
    res.status(db ? 200 : 503).json({
      status: db ? 'ok' : 'degraded',
      database: db,
      // Какой код запущен: коммит и последняя миграция (проверка, что сервер обновлён).
      version: serverCommit(),
      migration: db ? await lastMigration() : null,
      media: { ffmpeg: await hasFfmpeg() },
      timestamp: new Date().toISOString(),
    });
  });
  app.get('/api/company', async (_req, res) => {
    res.json({ company_name: await getCompanyName() });
  });
  app.use('/api/auth', authRouter);
  app.use('/uploads', uploadsRouter);

  // Страница ручного импорта KPI (сама требует входа, данные защищены на API).
  app.use('/api/kpi', kpiImportRouter);

  // ---------- Всё остальное — только с токеном ----------
  // Подписанная ссылка на PDF заметки открывается во внешнем приложении без токена.
  app.use('/api/notes-pdf', notePdfPublicRouter);

  app.use('/api', authenticate);
  // Переименовать компанию может только директор.
  app.patch(
    '/api/company',
    requireDirector,
    validate(z.object({ company_name: z.string().trim().min(1, 'Название компании обязательно').max(200) })),
    async (req, res) => {
      await setCompanyName(req.body.company_name);
      await audit('company_renamed', { actorId: (req as AuthRequest).userId, ip: req.ip });
      res.json({ company_name: await getCompanyName() });
    },
  );
  app.use('/api', filesApiRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/chats', chatsRouter);
  app.use('/api', messagesRouter);
  app.use('/api', topicsRouter);
  app.use('/api/polls', pollsRouter);
  app.use('/api/push', pushRouter);
  app.use('/api/role-tree', roleTreeRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/kpi/sales', kpiSalesRouter);
  app.use('/api/kpi', kpiReportsRouter);
  app.use('/api/knowledge', knowledgeRouter);

  const webDir = options.webDistDir === undefined ? resolveWebDist() : options.webDistDir;
  const web = webDir ? createWebRouter(webDir) : null;
  if (web) app.use(web);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
