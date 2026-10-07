import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import pool from '../db/pool';

/**
 * Какая версия кода запущена: коммит git и последняя применённая миграция.
 * Видно в /api/health — так за секунду проверяется, что сервер обновлён
 * (например, после слияния в main и запуска update.ps1).
 */
let commit: string | null | undefined;

export function serverCommit(): string | null {
  if (commit !== undefined) return commit;
  if (process.env.APP_VERSION) return (commit = process.env.APP_VERSION);
  // update.ps1 кладёт коммит сборки в dist\VERSION: git pull без пересборки
  // не должен выдавать новую версию за запущенную.
  try {
    const stamped = fs.readFileSync(path.resolve(__dirname, '../../VERSION'), 'utf8').trim();
    if (stamped) return (commit = stamped);
  } catch {
    /* нет файла — спросим git */
  }
  try {
    commit = execFileSync('git', ['-C', path.resolve(__dirname, '..'), 'rev-parse', '--short', 'HEAD'], {
      timeout: 3000,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    commit = null;
  }
  return commit;
}

export async function lastMigration(): Promise<string | null> {
  try {
    const { rows } = await pool.query('SELECT name FROM schema_migrations ORDER BY name DESC LIMIT 1');
    return rows[0]?.name ?? null;
  } catch {
    return null;
  }
}
