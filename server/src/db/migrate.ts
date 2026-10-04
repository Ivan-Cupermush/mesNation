import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import pool from './pool';
import { logger } from '../lib/logger';

/**
 * Раннер миграций.
 *
 * - Файлы src/db/migrations/NNNN_name.sql применяются по порядку, каждый в своей
 *   транзакции, и записываются в таблицу schema_migrations.
 * - 0001_baseline.sql — полная схема для пустой базы. Если база уже содержит
 *   таблицы проекта (рабочий сервер, база разработчика), baseline помечается
 *   применённым без выполнения.
 * - Изменённый после применения файл — ошибка: миграции не редактируют,
 *   а добавляют новые.
 *
 * Запуск: npm run migrate
 */
const DIR = path.join(__dirname, 'migrations');
const BASELINE = '0001_baseline.sql';

const checksum = (sql: string) => crypto.createHash('sha256').update(sql).digest('hex');

export async function migrate(): Promise<string[]> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);

  const files = fs.readdirSync(DIR).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  const applied = new Map<string, string>(
    (await pool.query('SELECT name, checksum FROM schema_migrations')).rows.map((r) => [r.name, r.checksum]),
  );

  if (!applied.has(BASELINE)) {
    const { rows } = await pool.query(`SELECT to_regclass('public.users') IS NOT NULL AS exists`);
    if (rows[0].exists) {
      const sql = fs.readFileSync(path.join(DIR, BASELINE), 'utf8');
      await pool.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [BASELINE, checksum(sql)]);
      applied.set(BASELINE, checksum(sql));
      logger.info('Существующая база: эталонная схема помечена как применённая');
    }
  }

  const done: string[] = [];
  for (const file of files) {
    const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
    const sum = checksum(sql);
    const prev = applied.get(file);
    if (prev) {
      if (prev !== sum && file !== BASELINE) {
        throw new Error(`Миграция ${file} изменена после применения. Создайте новую миграцию вместо правки старой.`);
      }
      continue;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file, sum]);
      await client.query('COMMIT');
      logger.info({ file }, 'Миграция применена');
      done.push(file);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Ошибка в миграции ${file}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
  return done;
}

if (require.main === module) {
  migrate()
    .then((done) => {
      logger.info(done.length ? `Применено миграций: ${done.length}` : 'База в актуальном состоянии');
      return pool.end();
    })
    .catch((err) => {
      logger.fatal(err.message);
      process.exit(1);
    });
}
