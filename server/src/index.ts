import { createServer } from 'http';
import { env } from './config/env';
import { logger } from './lib/logger';
import pool from './db/pool';
import { migrate } from './db/migrate';
import { createApp } from './app';
import { initSocket } from './realtime/socket';
import { startDeadlineChecker } from './services/deadlineChecker';
import { startScheduledDispatcher } from './services/scheduledMessages';

async function main() {
  // Схема БД приводится к актуальной версии до приёма запросов.
  const applied = await migrate();
  if (applied.length) logger.info({ applied }, 'Применены миграции');

  const app = createApp();
  const server = createServer(app);
  // Прокси (cloudflared, Caddy) держат соединения открытыми дольше Node по умолчанию (5 с):
  // если Node закроет соединение первым, прокси успевает отправить в него запрос и отдаёт 502.
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  // Файл в чат до 200 МБ на медленном канале грузится дольше стандартных 5 минут.
  server.requestTimeout = 30 * 60_000;
  const io = initSocket(server);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      logger.fatal(`Порт ${env.PORT} уже занят: сервер запущен второй раз (служба + ручной npm run dev?). Остановите лишний процесс.`);
    } else {
      logger.fatal({ err }, 'Ошибка HTTP-сервера');
    }
    process.exit(1);
  });

  server.listen(env.PORT, env.HOST, () => {
    logger.info(`Сервер запущен на ${env.HOST}:${env.PORT} (${env.NODE_ENV})`);
    startDeadlineChecker(60 * 60 * 1000);
    startScheduledDispatcher();
  });

  // Корректная остановка: новые подключения не принимаем, сокеты закрываем,
  // текущие запросы дорабатывают, затем закрывается пул БД.
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info(`${signal}: остановка сервера`);
    // io.close() отключает сокеты и закрывает HTTP-сервер; колбэк — когда закрыт и он.
    io.close(() => pool.end().finally(() => process.exit(0)));
    server.closeIdleConnections();
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
