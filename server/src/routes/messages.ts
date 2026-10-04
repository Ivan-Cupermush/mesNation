import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { id, paramId, validate } from '../lib/validate';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { UPLOAD_DIRS, makeUploader, removeFile } from '../lib/uploads';
import { assertChatMember, assertChatPermission, getChatRights } from '../services/access';
import { MESSAGE_SELECT, createMessage, serializeMessage } from '../services/messages';
import { processUpload } from '../services/media';
import { emitToChat, emitToUser } from '../realtime/socket';

/** Монтируется на /api (после authenticate). */
const router = Router();

const historyQuery = z.object({
  topic_id: id.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
  before: id.optional(),
});

/**
 * История сообщений чата (или топика). Без limit — вся история, как раньше;
 * с limit/before — постраничная загрузка (более старые сообщения).
 */
router.get('/messages/:chatId', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req, 'chatId');
  const q = historyQuery.parse(req.query);
  await assertChatMember(chatId, req.userId!);
  const params: unknown[] = [String(chatId), req.userId];
  let where = `m.chat_id = $1 AND NOT ($2::int = ANY(COALESCE(m.deleted_for_user_ids, '{}')))`;
  if (q.topic_id) {
    params.push(q.topic_id);
    where += ` AND m.topic_id = $${params.length}`;
  } else {
    where += ' AND m.topic_id IS NULL';
  }
  if (q.before) {
    params.push(q.before);
    where += ` AND m.id < $${params.length}`;
  }
  let sql = `SELECT ${MESSAGE_SELECT} FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE ${where}`;
  if (q.limit) {
    params.push(q.limit);
    sql = `SELECT * FROM (${sql} ORDER BY m.created_at DESC, m.id DESC LIMIT $${params.length}) page ORDER BY created_at ASC, id ASC`;
  } else {
    sql += ' ORDER BY m.created_at ASC, m.id ASC';
  }
  const { rows } = await pool.query(sql, params);
  res.json(rows.map(serializeMessage));
});

router.get('/messages/:chatId/pinned', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req, 'chatId');
  const { topic_id } = historyQuery.parse(req.query);
  await assertChatMember(chatId, req.userId!);
  const params: unknown[] = [String(chatId)];
  let where = 'm.chat_id = $1 AND m.pinned = TRUE AND m.deleted_for_all IS NOT TRUE';
  if (topic_id) {
    params.push(topic_id);
    where += ' AND m.topic_id = $2';
  } else {
    where += ' AND m.topic_id IS NULL';
  }
  const { rows } = await pool.query(
    `SELECT ${MESSAGE_SELECT} FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE ${where} ORDER BY m.created_at ASC`,
    params,
  );
  res.json(rows.map(serializeMessage));
});

async function loadMessage(messageId: number) {
  const { rows } = await pool.query(
    `SELECT ${MESSAGE_SELECT} FROM messages m LEFT JOIN users u ON u.id = m.sender_id WHERE m.id = $1`,
    [messageId],
  );
  if (!rows.length || rows[0].deleted_for_all) throw notFound('Сообщение не найдено');
  return rows[0];
}

const editSchema = z.object({ text: z.string().trim().max(4000) });

router.patch('/messages/:id', validate(editSchema), async (req: AuthRequest, res: Response) => {
  const msg = await loadMessage(paramId(req));
  if (msg.sender_id !== req.userId) throw forbidden('Редактировать можно только свои сообщения');
  if (msg.poll_id || msg.note_share_id || msg.content_type === 'service') throw badRequest('Это сообщение нельзя изменить');
  // У фото и файлов подпись можно убрать, у текстового сообщения текст обязателен.
  if (!req.body.text && !msg.file_url) throw badRequest('Текст обязателен');
  await assertChatMember(msg.chat_id, req.userId!);
  await pool.query('UPDATE messages SET text = $1, edited_at = NOW() WHERE id = $2', [req.body.text || null, msg.id]);
  const updated = serializeMessage(await loadMessage(msg.id));
  emitToChat(msg.chat_id, 'message_edited', updated);
  res.json(updated);
});

router.delete('/messages/:id', async (req: AuthRequest, res: Response) => {
  const msg = await loadMessage(paramId(req));
  const scope = req.query.scope === 'all' ? 'all' : 'me';
  const rights = await getChatRights(Number(msg.chat_id), req.userId!);
  if (!rights.isMember) throw forbidden('Вы не участник этого чата');
  if (scope === 'all') {
    const own = msg.sender_id === req.userId;
    if (!own && !rights.isCreator && !(rights.isAdmin && rights.can('delete_messages'))) {
      throw forbidden('Удалить для всех можно только своё сообщение или с правами администратора');
    }
    // Мягкое удаление: запись остаётся в базе (аудит), содержимое никому не отдаётся.
    await pool.query('UPDATE messages SET deleted_for_all = TRUE, pinned = FALSE WHERE id = $1', [msg.id]);
    emitToChat(msg.chat_id, 'message_deleted', { id: msg.id, scope: 'all' });
  } else {
    await pool.query(
      `UPDATE messages SET deleted_for_user_ids = array_append(COALESCE(deleted_for_user_ids, '{}'), $1)
       WHERE id = $2 AND NOT ($1 = ANY(COALESCE(deleted_for_user_ids, '{}')))`,
      [req.userId, msg.id],
    );
    // "Удалить у себя" касается только этого пользователя (на всех его устройствах).
    emitToUser(req.userId!, 'message_deleted', { id: msg.id, scope: 'me' });
  }
  res.json({ success: true });
});

async function setPinned(req: AuthRequest, res: Response, pinned: boolean) {
  const msg = await loadMessage(paramId(req));
  await assertChatPermission(Number(msg.chat_id), req.userId!, 'pin_messages', 'Нет прав на закрепление сообщений');
  await pool.query('UPDATE messages SET pinned = $1 WHERE id = $2', [pinned, msg.id]);
  emitToChat(msg.chat_id, pinned ? 'message_pinned' : 'message_unpinned', { id: msg.id, pinned });
  res.json({ success: true, pinned });
}
// Приложение отправляет POST, веб — PATCH: поддерживаем оба.
router.post('/messages/:id/pin', (req, res) => setPinned(req, res, true));
router.patch('/messages/:id/pin', (req, res) => setPinned(req, res, true));
router.post('/messages/:id/unpin', (req, res) => setPinned(req, res, false));
router.patch('/messages/:id/unpin', (req, res) => setPinned(req, res, false));

// ---------- Пересылка ----------

const forwardSchema = z.object({
  messageId: id,
  toChatId: id,
  topicId: id.nullish(),
  comment: z.string().trim().max(4000).optional(),
});

/** Пересылка: копия сообщения в другой чат с пометкой «Переслано от ...». */
router.post('/messages/forward', validate(forwardSchema), async (req: AuthRequest, res: Response) => {
  const { messageId, toChatId, topicId, comment } = req.body as z.infer<typeof forwardSchema>;
  const original = await loadMessage(messageId);
  await assertChatMember(original.chat_id, req.userId!);
  await assertChatMember(toChatId, req.userId!);
  if (original.poll_id) throw badRequest('Опросы пересылать нельзя');
  if (original.content_type === 'service') throw badRequest('Служебные сообщения не пересылаются');
  if (comment) {
    await createMessage({ chatId: toChatId, senderId: req.userId!, text: comment, topicId: topicId ?? null });
  }
  const message = await createMessage({
    chatId: toChatId,
    senderId: req.userId!,
    topicId: topicId ?? null,
    text: original.text,
    fileUrl: original.file_url,
    fileName: original.file_name,
    thumbUrl: original.thumb_url,
    contentType: original.content_type || 'text',
    noteShareId: original.note_share_id ?? null,
    mediaKind: original.media_kind ?? null,
    mediaWidth: original.media_width ?? null,
    mediaHeight: original.media_height ?? null,
    mediaDuration: original.media_duration === null ? null : Number(original.media_duration),
    fileSize: original.file_size === null ? null : Number(original.file_size),
    mimeType: original.mime_type ?? null,
    forwardedFromUserId: original.forwarded_from_user_id ?? original.sender_id,
    forwardedFromMessageId: original.forwarded_from_message_id ?? original.id,
  });
  res.status(201).json(message);
});

const replyElsewhereSchema = z.object({
  message_id: id,
  target_chat_id: id,
  target_topic_id: id.nullish(),
  text: z.string().trim().max(4000).optional(),
});

/** Ответ на сообщение в другом чате (цитата со ссылкой на исходный чат). */
router.post('/messages/reply-to-another-chat', validate(replyElsewhereSchema), async (req: AuthRequest, res: Response) => {
  const { message_id, target_chat_id, target_topic_id, text } = req.body as z.infer<typeof replyElsewhereSchema>;
  const original = await loadMessage(message_id);
  await assertChatMember(original.chat_id, req.userId!);
  const sameChat = Number(original.chat_id) === target_chat_id;
  const message = await createMessage({
    chatId: target_chat_id,
    senderId: req.userId!,
    text: text || original.text || '',
    replyToMessageId: message_id,
    topicId: target_topic_id ?? null,
    externalReplyChatId: sameChat ? null : Number(original.chat_id),
  });
  res.status(201).json(message);
});

// ---------- Файлы в чате ----------

const chatUpload = makeUploader({ dir: UPLOAD_DIRS.chat, maxSizeMb: 200 });
const optionalId = id.optional().or(z.literal('').transform(() => undefined));
const uploadSchema = z.object({
  chatId: id,
  topicId: optionalId,
  client_id: z.string().max(64).optional(),
  caption: z.string().trim().max(4000).optional(),
  reply_to_message_id: optionalId,
  // Несколько фото/видео, отправленных вместе, показываются альбомом.
  media_group_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
  // «Отправить как файл»: без сжатия и превью.
  as_file: z.enum(['true', 'false']).optional(),
});

router.post('/upload', chatUpload.single('file'), async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) throw badRequest('Файл не получен');
  try {
    // Отправитель — всегда владелец токена; senderId из запроса игнорируется.
    const body = uploadSchema.parse(req.body);
    await assertChatMember(body.chatId, req.userId!);
    const media = await processUpload(file, body.as_file === 'true');
    const message = await createMessage({
      chatId: body.chatId,
      senderId: req.userId!,
      topicId: body.topicId ?? null,
      text: body.caption || null,
      clientId: body.client_id ?? null,
      replyToMessageId: body.reply_to_message_id ?? null,
      fileUrl: `/uploads/${file.filename}`,
      fileName: file.originalname,
      thumbUrl: media.thumbUrl,
      contentType: media.kind === 'file' ? 'file' : media.kind,
      mediaGroupId: media.kind === 'file' ? null : body.media_group_id ?? null,
      mediaKind: media.kind,
      mediaWidth: media.width,
      mediaHeight: media.height,
      mediaDuration: media.duration,
      fileSize: file.size,
      mimeType: file.mimetype,
    });
    res.status(201).json(message);
  } catch (err) {
    removeFile(file.path);
    throw err;
  }
});

// ---------- Отложенная отправка ----------

const scheduleSchema = z.object({
  text: z.string().trim().min(1, 'Пустое сообщение').max(4000),
  send_at: z.coerce.date({ error: 'Некорректное время отправки' }),
  topic_id: id.nullish(),
  reply_to_message_id: id.nullish(),
});

function assertFuture(sendAt: Date) {
  const now = Date.now();
  if (sendAt.getTime() < now + 30_000) throw badRequest('Время отправки должно быть в будущем');
  if (sendAt.getTime() > now + 366 * 86400_000) throw badRequest('Можно запланировать не дальше чем на год');
}

/** Мои запланированные сообщения в чате (другие участники их не видят). */
router.get('/chats/:id/scheduled', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  await assertChatMember(chatId, req.userId!);
  const topicId = req.query.topic_id ? id.parse(req.query.topic_id) : null;
  const { rows } = await pool.query(
    `SELECT * FROM scheduled_messages
     WHERE chat_id = $1 AND sender_id = $2 AND status = 'pending' AND topic_id IS NOT DISTINCT FROM $3
     ORDER BY send_at`,
    [chatId, req.userId, topicId],
  );
  res.json(rows);
});

router.post('/chats/:id/scheduled', validate(scheduleSchema), async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  await assertChatMember(chatId, req.userId!);
  const body = req.body as z.infer<typeof scheduleSchema>;
  assertFuture(body.send_at);
  const { rows } = await pool.query(
    `INSERT INTO scheduled_messages (chat_id, topic_id, sender_id, text, reply_to_message_id, send_at)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [chatId, body.topic_id ?? null, req.userId, body.text, body.reply_to_message_id ?? null, body.send_at],
  );
  res.status(201).json(rows[0]);
});

async function loadOwnScheduled(req: AuthRequest) {
  const { rows } = await pool.query(
    `SELECT * FROM scheduled_messages WHERE id = $1 AND sender_id = $2 AND status = 'pending'`,
    [paramId(req), req.userId],
  );
  if (!rows.length) throw notFound('Запланированное сообщение не найдено или уже отправлено');
  return rows[0];
}

router.patch('/scheduled/:id', validate(scheduleSchema.pick({ text: true, send_at: true }).partial()), async (req: AuthRequest, res: Response) => {
  const s = await loadOwnScheduled(req);
  const { text, send_at } = req.body as { text?: string; send_at?: Date };
  if (send_at) assertFuture(send_at);
  const { rows } = await pool.query(
    'UPDATE scheduled_messages SET text = COALESCE($1, text), send_at = COALESCE($2, send_at) WHERE id = $3 RETURNING *',
    [text ?? null, send_at ?? null, s.id],
  );
  res.json(rows[0]);
});

router.delete('/scheduled/:id', async (req: AuthRequest, res: Response) => {
  const s = await loadOwnScheduled(req);
  await pool.query(`UPDATE scheduled_messages SET status = 'cancelled' WHERE id = $1`, [s.id]);
  res.json({ success: true });
});

/** «Отправить сейчас» — запланированное сообщение уходит немедленно. */
router.post('/scheduled/:id/send-now', async (req: AuthRequest, res: Response) => {
  const s = await loadOwnScheduled(req);
  await pool.query('UPDATE scheduled_messages SET send_at = NOW() WHERE id = $1', [s.id]);
  const { dispatchDueMessages } = await import('../services/scheduledMessages');
  await dispatchDueMessages();
  res.json({ success: true });
});

export default router;
