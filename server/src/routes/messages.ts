import { Router, Response } from 'express';
import path from 'path';
import sharp from 'sharp';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { id, paramId, validate } from '../lib/validate';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { UPLOAD_DIRS, isImage, makeUploader, removeFile } from '../lib/uploads';
import { assertChatMember, assertChatPermission, getChatRights } from '../services/access';
import { MESSAGE_SELECT, createMessage, serializeMessage } from '../services/messages';
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

const editSchema = z.object({ text: z.string().trim().min(1, 'Текст обязателен').max(4000) });

router.patch('/messages/:id', validate(editSchema), async (req: AuthRequest, res: Response) => {
  const msg = await loadMessage(paramId(req));
  if (msg.sender_id !== req.userId) throw forbidden('Редактировать можно только свои сообщения');
  await assertChatMember(msg.chat_id, req.userId!);
  await pool.query('UPDATE messages SET text = $1, edited_at = NOW() WHERE id = $2', [req.body.text, msg.id]);
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

const chatUpload = makeUploader({ dir: UPLOAD_DIRS.chat, maxSizeMb: 100 });
const uploadSchema = z.object({
  chatId: id,
  topicId: id.optional().or(z.literal('').transform(() => undefined)),
  client_id: z.string().max(64).optional(),
  caption: z.string().trim().max(4000).optional(),
});

router.post('/upload', chatUpload.single('file'), async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) throw badRequest('Файл не получен');
  try {
    // Отправитель — всегда владелец токена; senderId из запроса игнорируется.
    const body = uploadSchema.parse(req.body);
    await assertChatMember(body.chatId, req.userId!);
    let thumbUrl: string | null = null;
    if (isImage(file)) {
      const thumbName = 'thumb_' + path.basename(file.filename, path.extname(file.filename)) + '.jpg';
      try {
        await sharp(file.path).rotate().resize(400, 400, { fit: 'inside' }).jpeg({ quality: 80 }).toFile(path.join(UPLOAD_DIRS.thumbs, thumbName));
        thumbUrl = `/uploads/thumbs/${thumbName}`;
      } catch {
        // Не картинка, хоть и с таким расширением — отправим как обычный файл.
      }
    }
    const message = await createMessage({
      chatId: body.chatId,
      senderId: req.userId!,
      topicId: body.topicId ?? null,
      text: body.caption || null,
      clientId: body.client_id ?? null,
      fileUrl: `/uploads/${file.filename}`,
      fileName: file.originalname,
      thumbUrl,
    });
    res.status(201).json(message);
  } catch (err) {
    removeFile(file.path);
    throw err;
  }
});

export default router;
