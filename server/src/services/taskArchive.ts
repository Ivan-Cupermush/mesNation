import pool from '../db/pool';
import { logger } from '../lib/logger';
import { emitToUser } from '../realtime/socket';

/** Через сколько дней после выполнения задача уходит в архив. */
export const AUTO_ARCHIVE_DAYS = 3;

/**
 * Выполненные (принятые) задачи через 3 дня после выполнения уходят в архив
 * сами. Дата выполнения — последний переход в «Выполнена»; в истории задачи
 * переход в архив записывается без автора («Автоматически»). Из архива задачу
 * можно вернуть, как обычно.
 */
export async function archiveDoneTasks(days = AUTO_ARCHIVE_DAYS): Promise<number[]> {
  const { rows } = await pool.query(
    `WITH due AS (
       SELECT t.id FROM tasks t
       WHERE t.status_new = 'done'
         AND COALESCE(
               (SELECT MAX(h.created_at) FROM task_status_history h WHERE h.task_id = t.id AND h.to_status = 'done'),
               t.updated_at, t.created_at
             ) < NOW() - make_interval(days => $1::int)
       FOR UPDATE SKIP LOCKED
     ), upd AS (
       UPDATE tasks t SET status_new = 'archived', archived_at = NOW(), archived_as = 'done', archived_by = NULL,
              status_before_archive = 'done', updated_at = NOW()
       FROM due WHERE t.id = due.id AND t.status_new = 'done'
       RETURNING t.id
     ), hist AS (
       INSERT INTO task_status_history (task_id, from_status, to_status, changed_by, comment)
       SELECT id, 'done', 'archived', NULL, $2 FROM upd
     )
     SELECT id FROM upd`,
    [days, `Автоматически: прошло ${days} дня после выполнения`],
  );
  const ids = rows.map((r) => r.id as number);
  if (!ids.length) return ids;
  logger.info(`🗄 В архив автоматически: ${ids.length} выполненных задач`);
  // Список задач у участников обновится сам.
  const people = await pool.query(
    `SELECT id AS task_id, creator_id AS uid FROM tasks WHERE id = ANY($1::int[])
     UNION SELECT task_id, user_id FROM task_assignees WHERE task_id = ANY($1::int[])
     UNION SELECT task_id, user_id FROM task_watchers WHERE task_id = ANY($1::int[])`,
    [ids],
  );
  for (const r of people.rows) emitToUser(r.uid, 'task_updated', { task_id: r.task_id });
  return ids;
}
