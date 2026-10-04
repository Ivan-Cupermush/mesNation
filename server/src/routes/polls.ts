import { Router, Response } from 'express';
import { z } from 'zod';
import pool, { withTransaction } from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { id, paramId, validate } from '../lib/validate';
import { badRequest, forbidden, notFound } from '../lib/errors';
import { assertChatMember } from '../services/access';
import { createMessage } from '../services/messages';
import { getPollResults } from '../services/polls';
import { emitToChat } from '../realtime/socket';

/** Монтируется на /api/polls (после authenticate). */
const router = Router();

async function loadPollForMember(pollId: number, userId: number) {
  const { rows } = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
  if (!rows.length) throw notFound('Опрос не найден');
  await assertChatMember(rows[0].chat_id, userId);
  return rows[0];
}

const createSchema = z
  .object({
    chat_id: id,
    topic_id: id.nullish(),
    question: z.string().trim().min(1, 'Введите вопрос').max(255),
    options: z.array(z.string().trim().min(1, 'Пустой вариант ответа').max(100)).min(2, 'Нужно 2–10 вариантов').max(10, 'Нужно 2–10 вариантов'),
    is_anonymous: z.boolean().optional(),
    allows_multiple: z.boolean().optional(),
    is_quiz: z.boolean().optional(),
    correct_option_index: z.number().int().min(0).nullish(),
    // Пояснение к викторине: показывается после ответа (как в Telegram).
    explanation: z.string().trim().max(200).nullish(),
  })
  .refine((p) => !p.is_quiz || (p.correct_option_index != null && p.correct_option_index < p.options.length), {
    message: 'В викторине отметьте правильный ответ',
  });

router.post('/', validate(createSchema), async (req: AuthRequest, res: Response) => {
  const p = req.body as z.infer<typeof createSchema>;
  await assertChatMember(p.chat_id, req.userId!);
  const poll = await withTransaction(async (client) => {
    const created = (
      await client.query(
        `INSERT INTO polls (chat_id, topic_id, creator_id, question, is_anonymous, allows_multiple, is_quiz, correct_option_index, explanation)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          p.chat_id,
          p.topic_id ?? null,
          req.userId,
          p.question,
          !!p.is_anonymous,
          !!p.allows_multiple && !p.is_quiz,
          !!p.is_quiz,
          p.is_quiz ? p.correct_option_index : null,
          p.is_quiz ? p.explanation || null : null,
        ],
      )
    ).rows[0];
    for (let i = 0; i < p.options.length; i++) {
      await client.query('INSERT INTO poll_options (poll_id, option_index, text, is_correct) VALUES ($1, $2, $3, $4)', [
        created.id,
        i,
        p.options[i],
        !!p.is_quiz && p.correct_option_index === i,
      ]);
    }
    return created;
  });
  // Сообщение с опросом рассылается всем участникам через сокет.
  let message;
  try {
    message = await createMessage({ chatId: p.chat_id, senderId: req.userId!, topicId: p.topic_id ?? null, contentType: 'poll', pollId: poll.id });
  } catch (err) {
    await pool.query('DELETE FROM polls WHERE id = $1', [poll.id]);
    throw err;
  }
  const results = await getPollResults(poll.id, req.userId!);
  res.status(201).json({ ...results, message });
});

const voteSchema = z.object({ option_ids: z.array(id).min(1, 'Выберите хотя бы один вариант').max(10) });

router.post('/:id/vote', validate(voteSchema), async (req: AuthRequest, res: Response) => {
  const poll = await loadPollForMember(paramId(req), req.userId!);
  const optionIds = Array.from(new Set((req.body as z.infer<typeof voteSchema>).option_ids));
  if (poll.is_closed) throw badRequest('Опрос закрыт');
  if (!poll.allows_multiple && optionIds.length > 1) throw badRequest('Можно выбрать только один вариант');
  const valid = await pool.query('SELECT id FROM poll_options WHERE poll_id = $1 AND id = ANY($2::int[])', [poll.id, optionIds]);
  if (valid.rows.length !== optionIds.length) throw badRequest('Вариант ответа не относится к этому опросу');
  await withTransaction(async (client) => {
    if (poll.is_quiz) {
      // В викторине ответ меняет нельзя.
      const already = await client.query('SELECT 1 FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [poll.id, req.userId]);
      if (already.rows.length) throw badRequest('Ответ в викторине нельзя изменить');
    }
    await client.query('DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [poll.id, req.userId]);
    for (const oid of optionIds) {
      await client.query('INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES ($1, $2, $3)', [poll.id, oid, req.userId]);
    }
  });
  emitToChat(poll.chat_id, 'poll_updated', { poll_id: poll.id });
  res.json(await getPollResults(poll.id, req.userId!));
});

router.delete('/:id/vote', async (req: AuthRequest, res: Response) => {
  const poll = await loadPollForMember(paramId(req), req.userId!);
  if (poll.is_closed) throw badRequest('Опрос закрыт');
  if (poll.is_quiz) throw badRequest('Ответ в викторине нельзя отменить');
  await pool.query('DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [poll.id, req.userId]);
  emitToChat(poll.chat_id, 'poll_updated', { poll_id: poll.id });
  res.json(await getPollResults(poll.id, req.userId!));
});

router.post('/:id/close', async (req: AuthRequest, res: Response) => {
  const poll = await loadPollForMember(paramId(req), req.userId!);
  if (poll.creator_id !== req.userId) throw forbidden('Только автор может остановить опрос');
  await pool.query('UPDATE polls SET is_closed = TRUE, closed_at = NOW() WHERE id = $1', [poll.id]);
  emitToChat(poll.chat_id, 'poll_updated', { poll_id: poll.id });
  res.json(await getPollResults(poll.id, req.userId!));
});

router.get('/:id/results', async (req: AuthRequest, res: Response) => {
  const poll = await loadPollForMember(paramId(req), req.userId!);
  res.json(await getPollResults(poll.id, req.userId!));
});

router.get('/:id/voters', async (req: AuthRequest, res: Response) => {
  const poll = await loadPollForMember(paramId(req), req.userId!);
  if (poll.is_anonymous) return res.json([]);
  const { rows } = await pool.query(
    `SELECT v.option_id, v.user_id, v.created_at, u.username, u.display_name, u.avatar_url
     FROM poll_votes v JOIN users u ON u.id = v.user_id
     WHERE v.poll_id = $1 ORDER BY v.created_at DESC`,
    [poll.id],
  );
  res.json(rows);
});

router.get('/:id', async (req: AuthRequest, res: Response) => {
  const poll = await loadPollForMember(paramId(req), req.userId!);
  res.json(await getPollResults(poll.id, req.userId!));
});

export default router;
