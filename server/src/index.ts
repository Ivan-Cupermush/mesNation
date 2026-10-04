import { createServer } from 'http';
import { env } from './config/env';
import { logger } from './lib/logger';
import pool from './db/pool';
import { migrate } from './db/migrate';
import { createApp } from './app';
import { initSocket } from './realtime/socket';
import { startDeadlineChecker } from './services/deadlineChecker';

async function main() {
  // Схема БД приводится к актуальной версии до приёма запросов.
  const applied = await migrate();
  if (applied.length) logger.info({ applied }, 'Применены миграции');

  const app = createApp();
  const server = createServer(app);
  initSocket(server);

  server.listen(env.PORT, '0.0.0.0', () => {
    logger.info(`Сервер запущен на порту ${env.PORT} (${env.NODE_ENV})`);
    startDeadlineChecker(60 * 60 * 1000);
  });

  // Корректная остановка: дожидаемся текущих запросов и закрываем пул БД.
  const shutdown = (signal: string) => {
    logger.info(`${signal}: остановка сервера`);
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

process.on('unhandledRejection', (err) => logger.error({ err }, 'Необработанный rejection'));

main().catch((err) => {
  logger.fatal({ err }, 'Сервер не смог запуститься');
  process.exit(1);
});
