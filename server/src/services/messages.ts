import pool from '../db/pool';
import { badRequest } from '../lib/errors';
import { assertChatMember } from './access';
import { emitToChat } from '../realtime/socket';

/** Поля сообщения + данные отправителя. Используется во всех выборках. */
export const MESSAGE_SELECT = `
  m.id, m.chat_id, m.sender_id, m.text, m.file_url, m.file_name, m.thumb_url,
  m.reply_to_message_id, m.topic_id, m.external_reply_chat_id, m.edited_at,
  m.pinned, m.deleted_for_all, m.content_type, m.poll_id, m.client_id, m.created_at,
  m.forwarded_from_user_id, m.forwarded_from_message_id,
  (SELECT COALESCE(fu.display_name, fu.username) FROM users fu WHERE fu.id = m.forwarded_from_user_id) AS forwarded_from_name,
  m.note_share_id,
  (SELECT json_build_object(
     'id', ns.id, 'title', ns.title, 'preview', LEFT(ns.content, 400),
     'files_count', jsonb_array_length(ns.files), 'sender_id', ns.sender_id,
     'accepted_user_ids', COALESCE((SELECT json_agg(a.user_id) FROM note_share_acceptances a WHERE a.share_id = ns.id), '[]'::json))
   FROM note_shares ns WHERE ns.id = m.note_share_id) AS note_share,
  u.display_name AS sender_display_name,
  u.username     AS sender_name,
  u.avatar_url   AS sender_avatar_url`;

/**
 * Приводит сообщение к виду для клиента: содержимое удалённого для всех
 * сообщения не отдаётся никому, а список "удалено у себя" — чужая
 * информация и тоже не отдаётся.
 */
export function serializeMessage(m: any) {
  const { deleted_for_user_ids: _hidden, ...rest } = m;
  if (rest.deleted_for_all) {
    return { ...rest, text: null, file_url: null, file_name: null, thumb_url: null, poll_id: null, note_share_id: null, note_share: null };
  }
  return rest;
}

export interface NewMessage {
  chatId: number;
  senderId: number;
  text?: string | null;
  replyToMessageId?: number | null;
  topicId?: number | null;
  clientId?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  thumbUrl?: string | null;
  externalReplyChatId?: number | null;
  contentType?: string;
  pollId?: number | null;
  forwardedFromUserId?: number | null;
  forwardedFromMessageId?: number | null;
  noteShareId?: number | null;
}

/**
 * Создаёт сообщение и рассылает его участникам чата.
 * Повторная отправка с тем же client_id (после обрыва связи) не создаёт
 * дубль, а возвращает уже сохранённое сообщение.
 */
export async function createMessage(input: NewMessage) {
  await assertChatMember(input.chatId, input.senderId);

  if (input.clientId) {
    const existing = await pool.query(
      `SELECT ${MESSAGE_SELECT} FROM messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.sender_id = $1 AND m.client_id = $2`,
      [input.senderId, input.clientId],
    );
    if (existing.rows.length) return serializeMessage(existing.rows[0]);
  }

  if (input.topicId) {
    const t = await pool.query('SELECT 1 FROM topics WHERE id = $1 AND chat_id = $2', [input.topicId, input.chatId]);
    if (!t.rows.length) throw badRequest('Топик не найден в этом чате');
  }
  if (input.replyToMessageId && !input.externalReplyChatId) {
    const r = await pool.query('SELECT 1 FROM messages WHERE id = $1 AND chat_id = $2', [
      input.replyToMessageId,
      String(input.chatId),
    ]);
    if (!r.rows.length) throw badRequest('Сообщение для ответа не найдено');
  }

  const { rows } = await pool.query(
    `WITH ins AS (
       INSERT INTO messages (chat_id, sender_id, text, reply_to_message_id, topic_id, client_id,
                             file_url, file_name, thumb_url, external_reply_chat_id, content_type, poll_id,
                             forwarded_from_user_id, forwarded_from_message_id, note_share_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (sender_id, client_id) WHERE client_id IS NOT NULL DO NOTHING
       RETURNING *
     )
     SELECT ${MESSAGE_SELECT.replace(/\bm\./g, 'ins.')} FROM ins LEFT JOIN users u ON u.id = ins.sender_id`,
    [
      String(input.chatId),
      input.senderId,
      input.text ?? null,
      input.replyToMessageId ?? null,
      input.topicId ?? null,
      input.clientId ?? null,
      input.fileUrl ?? null,
      input.fileName ?? null,
      input.thumbUrl ?? null,
      input.externalReplyChatId ?? null,
      input.contentType ?? 'text',
      input.pollId ?? null,
      input.forwardedFromUserId ?? null,
      input.forwardedFromMessageId ?? null,
      input.noteShareId ?? null,
    ],
  );

  // Гонка двух одинаковых отправок: вторая не вставилась — вернём первую.
  if (!rows.length && input.clientId) {
    const again = await pool.query(
      `SELECT ${MESSAGE_SELECT} FROM messages m LEFT JOIN users u ON u.id = m.sender_id
       WHERE m.sender_id = $1 AND m.client_id = $2`,
      [input.senderId, input.clientId],
    );
    return serializeMessage(again.rows[0]);
  }

  const message = serializeMessage(rows[0]);
  emitToChat(input.chatId, 'new_message', message);
  return message;
}
