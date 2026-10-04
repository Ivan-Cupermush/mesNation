import pool from '../db/pool';
import { logger } from '../lib/logger';

export type AuditAction =
  | 'login'
  | 'login_failed'
  | 'logout_all'
  | 'password_changed'
  | 'password_reset'
  | 'user_activated'
  | 'user_deactivated'
  | 'user_created'
  | 'role_assigned'
  | 'company_renamed';

/**
 * Журнал событий безопасности. Ошибка записи не должна ломать сам запрос,
 * поэтому пишем и в лог, и в таблицу «по возможности».
 */
export async function audit(
  action: AuditAction,
  opts: { actorId?: number | null; targetId?: number | null; ip?: string | null; meta?: Record<string, unknown> } = {},
) {
  logger.info({ audit: action, actor: opts.actorId, target: opts.targetId, ...opts.meta }, 'audit');
  await pool
    .query('INSERT INTO audit_log (actor_id, action, target_id, ip, meta) VALUES ($1, $2, $3, $4, $5)', [
      opts.actorId ?? null,
      action,
      opts.targetId ?? null,
      opts.ip ?? null,
      JSON.stringify(opts.meta ?? {}),
    ])
    .catch((err) => logger.error({ err }, 'Не удалось записать событие аудита'));
}

/** Отзывает все токены пользователя (и рвёт его сокеты, если они открыты). */
export async function revokeSessions(userId: number) {
  await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = $1', [userId]);
  const { disconnectUser } = await import('../realtime/socket');
  disconnectUser(userId);
}
