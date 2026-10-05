import pool from '../db/pool';
import { badRequest } from '../lib/errors';
import { assertChatMember } from './access';
import { emitToChat, emitToUser } from '../realtime/socket';
import { fireAndForget, notifyNewMessage } from './push';

/** Поля сообщения + данные отправителя. Используется во всех выборках. */
export const MESSAGE_SELECT = `
  m.id, m.chat_id, m.sender_id, m.text, m.file_url, m.file_name, m.thumb_url,
  m.reply_to_message_id, m.topic_id, m.external_reply_chat_id, m.edited_at,
  m.pinned, m.deleted_for_all, m.content_type, m.poll_id, m.client_id, m.created_at,
  m.forwarded_from_user_id, m.forwarded_from_message_id,
  m.media_group_id, m.media_kind, m.media_width, m.media_height, m.media_duration, m.file_size, m.mime_type,
  m.media_waveform,
  CASE WHEN m.media_kind IN ('voice', 'video_note') THEN
    COALESCE((SELECT json_agg(ml.user_id) FROM message_listens ml WHERE ml.message_id = m.id), '[]'::json)
  END AS listened_by,
  (SELECT COALESCE(fu.display_name, fu.username) FROM users fu WHERE fu.id = m.forwarded_from_user_id) AS forwarded_from_name,
  m.note_share_id,
  (SELECT p.question FROM polls p WHERE p.id = m.poll_id) AS poll_question,
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
    return { ...rest, text: null, file_url: null, file_name: null, thumb_url: null, poll_id: null, note_share_id: null, note_share: null, media_kind: null, media_waveform: null };
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
  mediaGroupId?: string | null;
  mediaKind?: 'photo' | 'video' | 'file' | 'voice' | 'video_note' | null;
  mediaWidth?: number | null;
  mediaHeight?: number | null;
  mediaDuration?: number | null;
  fileSize?: number | null;
  mimeType?: string | null;
  /** Голосовое: уровни громкости 0..31 через запятую. */
  mediaWaveform?: string | null;
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
                             forwarded_from_user_id, forwarded_from_message_id, note_share_id,
                             media_group_id, media_kind, media_width, media_height, media_duration, file_size, mime_type,
                             media_waveform)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
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
      input.mediaGroupId ?? null,
      input.mediaKind ?? null,
      input.mediaWidth ?? null,
      input.mediaHeight ?? null,
      input.mediaDuration ?? null,
      input.fileSize ?? null,
      input.mimeType ?? null,
      input.mediaWaveform ?? null,
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
  // Скрытый у кого-то личный чат снова появляется в списке при новом сообщении.
  await pool.query('UPDATE chat_members SET hidden_at = NULL WHERE chat_id = $1 AND hidden_at IS NOT NULL', [input.chatId]);
  // Своё сообщение автоматически прочитано отправителем.
  await pool.query(
    'UPDATE chat_members SET last_read_message_id = GREATEST(last_read_message_id, $1) WHERE chat_id = $2 AND user_id = $3',
    [message.id, input.chatId, input.senderId],
  );
  emitToChat(input.chatId, 'new_message', message);
  // Список чатов (счётчики непрочитанных) обновляется у всех участников,
  // даже если чат у них сейчас не открыт.
  const members = await pool.query('SELECT user_id FROM chat_members WHERE chat_id = $1', [input.chatId]);
  for (const r of members.rows) emitToUser(r.user_id, 'chat_activity', { chat_id: input.chatId, message_id: message.id });
  // Push на телефоны (когда приложение свёрнуто или закрыто).
  fireAndForget(notifyNewMessage(message), 'новое сообщение');
  return message;
}

/** Служебное сообщение в чате («Анна добавила Ивана», «Группа переименована»). */
export async function createServiceMessage(chatId: number, actorId: number, text: string, topicId: number | null = null) {
  return createMessage({ chatId, senderId: actorId, text, contentType: 'service', topicId });
}

export async function userName(userId: number): Promise<string> {
  const { rows } = await pool.query('SELECT COALESCE(display_name, username) AS name FROM users WHERE id = $1', [userId]);
  return rows[0]?.name || 'Пользователь';
}
