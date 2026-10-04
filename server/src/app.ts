import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import crypto from 'crypto';
import { corsOrigins } from './config/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './lib/errors';
import { authenticate, requireDirector } from './middleware/auth';
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
import tasksRouter from './routes/tasks';
import notesRouter, { notePdfPublicRouter } from './routes/notes';
import kpiImportRouter from './routes/kpiImport';
import kpiSalesRouter from './routes/kpiSales';
import knowledgeRouter from './routes/knowledge';
import { filesApiRouter, uploadsRouter } from './routes/files';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // сервер стоит за туннелем/прокси: нужен реальный IP для лимитов
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
      autoLogging: { ignore: (req) => req.url === '/api/health' },
    }),
  );
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: corsOrigins.length ? corsOrigins : false }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ limit: '2mb', extended: true }));

  // ---------- Публичное ----------
  app.get('/api/health', async (_req, res) => {
    const db = await pool.query('SELECT 1').then(() => true).catch(() => false);
    res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', database: db, timestamp: new Date().toISOString() });
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
      res.json({ company_name: await getCompanyName() });
    },
  );
  app.use('/api', filesApiRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/chats', chatsRouter);
  app.use('/api', messagesRouter);
  app.use('/api', topicsRouter);
  app.use('/api/polls', pollsRouter);
  app.use('/api/role-tree', roleTreeRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/notes', notesRouter);
  app.use('/api/kpi/sales', kpiSalesRouter);
  app.use('/api/knowledge', knowledgeRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
