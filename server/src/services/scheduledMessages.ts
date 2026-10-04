import pool from '../db/pool';
import { logger } from '../lib/logger';
import { createMessage } from './messages';
import { emitToUser } from '../realtime/socket';

/**
 * Отправляет отложенные сообщения, время которых пришло.
 * FOR UPDATE SKIP LOCKED — если когда-нибудь будет несколько экземпляров
 * сервера, одно сообщение не отправится дважды.
 */
export async function dispatchDueMessages(): Promise<number> {
  const client = await pool.connect();
  let due: any[] = [];
  try {
    await client.query('BEGIN');
    due = (
      await client.query(
        `SELECT * FROM scheduled_messages
         WHERE status = 'pending' AND send_at <= NOW()
         ORDER BY send_at LIMIT 50 FOR UPDATE SKIP LOCKED`,
      )
    ).rows;
    for (const s of due) {
      try {
        const msg = await createMessage({
          chatId: s.chat_id,
          senderId: s.sender_id,
          text: s.text,
          topicId: s.topic_id,
          replyToMessageId: s.reply_to_message_id,
          clientId: `scheduled-${s.id}`,
        });
        await client.query(`UPDATE scheduled_messages SET status = 'sent', sent_message_id = $1 WHERE id = $2`, [msg.id, s.id]);
      } catch (err: any) {
        // Например, автора исключили из чата: сообщение не отправляем, но сохраняем причину.
        await client.query(`UPDATE scheduled_messages SET status = 'failed', error = $1 WHERE id = $2`, [
          String(err?.message || err).slice(0, 500),
          s.id,
        ]);
        logger.warn({ err, scheduledId: s.id }, 'Отложенное сообщение не отправлено');
      }
      emitToUser(s.sender_id, 'scheduled_changed', { chat_id: s.chat_id });
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return due.length;
}

export function startScheduledDispatcher(intervalMs = 15_000) {
  const tick = () => dispatchDueMessages().catch((err) => logger.error({ err }, 'Ошибка отправки отложенных сообщений'));
  tick();
  return setInterval(tick, intervalMs);
}
