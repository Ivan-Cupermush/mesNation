import pool from '../db/pool';
import { emitToUser } from '../realtime/socket';

/**
 * Колокольчик: лента событий пользователя (новые задачи, запросы заметок
 * и ответы на них). Запись в ленту не зависит от push — уведомление
 * остаётся в приложении, даже если телефон его не показал.
 */
export type NotificationKind = 'task' | 'note_request' | 'note_request_approved' | 'note_request_declined';

export interface NewNotification {
  kind: NotificationKind;
  actorId?: number | null;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
}

export const NOTIFICATION_SELECT = `
  n.id, n.kind, n.title, n.body, n.data, n.read_at, n.created_at,
  n.actor_id, COALESCE(a.display_name, a.username) AS actor_name, a.avatar_url AS actor_avatar_url,
  CASE WHEN n.kind = 'note_request' THEN
    (SELECT r.status FROM note_share_requests r WHERE r.id = (n.data->>'request_id')::int)
  END AS request_status`;

export async function addNotification(userIds: number[], n: NewNotification): Promise<void> {
  const ids = Array.from(new Set(userIds)).filter((u) => Number.isInteger(u) && u !== n.actorId);
  if (!ids.length) return;
  const { rows } = await pool.query(
    `WITH ins AS (
       INSERT INTO notifications (user_id, kind, actor_id, title, body, data)
       SELECT u, $2, $3, $4, $5, $6::jsonb FROM unnest($1::int[]) AS u
       RETURNING *)
     SELECT n.user_id, ${NOTIFICATION_SELECT} FROM ins n LEFT JOIN users a ON a.id = n.actor_id`,
    [ids, n.kind, n.actorId ?? null, n.title, n.body ?? null, JSON.stringify(n.data || {})],
  );
  for (const { user_id, ...row } of rows) emitToUser(user_id, 'notification', row);
}
