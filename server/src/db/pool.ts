import { Pool, PoolClient } from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/** Единственный пул подключений на весь процесс. */
const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  max: env.DB_POOL_MAX,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Ошибка простаивающего подключения к БД');
});

/**
 * Выполняет функцию в транзакции. Коммит при успехе, откат при любой ошибке,
 * подключение возвращается в пул ровно один раз.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch((rollbackErr) => {
      logger.error({ err: rollbackErr }, 'Не удалось откатить транзакцию');
    });
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
