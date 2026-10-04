import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { paramId, validate } from '../lib/validate';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { assertChatMember, getChatRights } from '../services/access';
import { MESSAGE_SELECT, serializeMessage } from '../services/messages';
import { emitToChat } from '../realtime/socket';

/** Топики супергрупп. Монтируется на /api (после authenticate). */
const router = Router();

async function loadTopic(topicId: number) {
  const { rows } = await pool.query('SELECT * FROM topics WHERE id = $1 AND deleted_at IS NULL', [topicId]);
  if (!rows.length) throw notFound('Топик не найден');
  return rows[0];
}

async function assertCanManageTopic(topic: { chat_id: number; created_by: number | null }, userId: number, message: string) {
  const rights = await getChatRights(topic.chat_id, userId);
  if (!rights.isMember) throw forbidden('Вы не участник этого чата');
  if (topic.created_by !== userId && !rights.can('change_info')) throw forbidden(message);
}

const topicSchema = z.object({
  title: z.string().trim().min(1, 'Название топика обязательно').max(255),
  icon: z.string().max(50).optional(),
  icon_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Цвет в формате #RRGGBB').optional(),
  icon_opacity: z.number().min(0).max(1).optional(),
});

router.post('/chats/:id/topics', validate(topicSchema), async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  // Как в Telegram: создавать темы могут все участники, менять и удалять —
  // автор темы и админы с правом изменения группы.
  await assertChatMember(chatId, req.userId!);
  const chat = (await pool.query('SELECT is_supergroup FROM chats WHERE id = $1', [chatId])).rows[0];
  if (!chat?.is_supergroup) throw badRequest('Топики доступны только в супергруппах');
  const { title, icon, icon_color, icon_opacity } = req.body as z.infer<typeof topicSchema>;
  const { rows } = await pool.query(
    `INSERT INTO topics (chat_id, title, created_by, icon, icon_color, icon_opacity)
     VALUES ($1, $2, $3, COALESCE($4, 'hash'), COALESCE($5, '#1F7A52'), COALESCE($6, 1)) RETURNING *`,
    [chatId, title, req.userId, icon ?? null, icon_color ?? null, icon_opacity ?? null],
  );
  emitToChat(chatId, 'topic_created', rows[0]);
  res.status(201).json(rows[0]);
});

router.get('/chats/:id/topics', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req);
  await assertChatMember(chatId, req.userId!);
  const { rows } = await pool.query(
    `SELECT t.*,
            (SELECT row_to_json(lm) FROM (
               SELECT m.id, m.text, m.sender_id, m.created_at, m.file_name, m.content_type, m.media_kind, m.thumb_url, m.file_url, m.poll_id,
                      COALESCE(u.display_name, u.username) AS sender_name
               FROM messages m LEFT JOIN users u ON u.id = m.sender_id
               WHERE m.chat_id = $1::text AND m.topic_id = t.id AND m.deleted_for_all IS NOT TRUE
               ORDER BY m.created_at DESC LIMIT 1) lm) AS last_message
     FROM topics t WHERE t.chat_id = $1 AND t.deleted_at IS NULL ORDER BY t.created_at ASC`,
    [chatId],
  );
  res.json(rows);
});

router.patch('/topics/:id', validate(topicSchema.partial()), async (req: AuthRequest, res: Response) => {
  const topic = await loadTopic(paramId(req));
  await assertCanManageTopic(topic, req.userId!, 'Нет прав на изменение топика');
  const { title, icon, icon_color, icon_opacity } = req.body;
  const { rows } = await pool.query(
    `UPDATE topics SET title = COALESCE($1, title), icon = COALESCE($2, icon),
            icon_color = COALESCE($3, icon_color), icon_opacity = COALESCE($4, icon_opacity)
     WHERE id = $5 RETURNING *`,
    [title ?? null, icon ?? null, icon_color ?? null, icon_opacity ?? null, topic.id],
  );
  emitToChat(topic.chat_id, 'topic_updated', rows[0]);
  res.json(rows[0]);
});

/** Мягкое удаление: сообщения топика остаются в базе и не попадают в общий чат. */
router.delete('/topics/:id', async (req: AuthRequest, res: Response) => {
  const topic = await loadTopic(paramId(req));
  await assertCanManageTopic(topic, req.userId!, 'Нет прав на удаление топика');
  await pool.query('UPDATE topics SET deleted_at = NOW() WHERE id = $1', [topic.id]);
  emitToChat(topic.chat_id, 'topic_deleted', { id: topic.id });
  res.json({ success: true });
});

const FILTERS: Record<string, string> = {
  media: "(m.media_kind IN ('photo', 'video') OR (m.media_kind IS NULL AND m.thumb_url IS NOT NULL))",
  files: "m.file_url IS NOT NULL AND (m.media_kind = 'file' OR (m.media_kind IS NULL AND m.thumb_url IS NULL))",
  links: "m.text ~* 'https?://'",
  polls: 'm.poll_id IS NOT NULL',
};

router.get('/chats/:chatId/topics/:topicId/stats', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req, 'chatId');
  const topicId = paramId(req, 'topicId');
  await assertChatMember(chatId, req.userId!);
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE ${FILTERS.media})::int AS media,
            COUNT(*) FILTER (WHERE ${FILTERS.files})::int AS files,
            COUNT(*) FILTER (WHERE ${FILTERS.links})::int AS links,
            COUNT(*) FILTER (WHERE ${FILTERS.polls})::int AS polls
     FROM messages m WHERE m.chat_id = $1 AND m.topic_id = $2 AND m.deleted_for_all IS NOT TRUE`,
    [String(chatId), topicId],
  );
  const s = rows[0];
  res.json({ ...s, total_images: s.media, total_files: s.files + s.media });
});

router.get('/chats/:chatId/topics/:topicId/media/:type', async (req: AuthRequest, res: Response) => {
  const chatId = paramId(req, 'chatId');
  const topicId = paramId(req, 'topicId');
  const type = String(req.params.type);
  if (!FILTERS[type]) throw badRequest('Неизвестный тип');
  await assertChatMember(chatId, req.userId!);
  const { rows } = await pool.query(
    `SELECT ${MESSAGE_SELECT} FROM messages m LEFT JOIN users u ON u.id = m.sender_id
     WHERE m.chat_id = $1 AND m.topic_id = $2 AND m.deleted_for_all IS NOT TRUE AND ${FILTERS[type]}
     ORDER BY m.created_at DESC LIMIT 100`,
    [String(chatId), topicId],
  );
  if (type !== 'polls') return res.json(rows.map(serializeMessage));
  const { getPollResults } = await import('../services/polls');
  const out = [];
  for (const m of rows) {
    const results = await getPollResults(m.poll_id, req.userId!);
    out.push({ ...serializeMessage(m), ...results, question: results.poll.question, message_id: m.id });
  }
  res.json(out);
});

export default router;
