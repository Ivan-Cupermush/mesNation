import { Router, Request, Response, NextFunction } from 'express';
import pool from '../db/pool';
import jwt from 'jsonwebtoken';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'default-secret';

interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Токен не предоставлен' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Неверный формат токена' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Недействительный токен' });
  }
}

// Вспомогательная: результаты опроса
async function getPollResults(pollId: number, userId: number) {
  const pollRes = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
  if (pollRes.rows.length === 0) throw new Error('Poll not found');
  const poll = pollRes.rows[0];

  const optsRes = await pool.query(
    'SELECT * FROM poll_options WHERE poll_id = $1 ORDER BY option_index',
    [pollId],
  );

  const votesRes = await pool.query(
    `SELECT option_id, COUNT(*)::int as count, ARRAY_AGG(user_id) as voters
     FROM poll_votes WHERE poll_id = $1 GROUP BY option_id`,
    [pollId],
  );

  const votesMap: Record<number, { count: number; voters: number[] }> = {};
  votesRes.rows.forEach((r: any) => {
    votesMap[r.option_id] = {
      count: r.count,
      voters: poll.is_anonymous ? [] : (r.voters || []),
    };
  });

  const options = optsRes.rows.map((o: any) => ({
    ...o,
    vote_count: votesMap[o.id]?.count || 0,
    voters: votesMap[o.id]?.voters || [],
  }));

  const totalVotes = options.reduce((s: number, o: any) => s + o.vote_count, 0);
  // СВОЙ голос возвращаем ВСЕГДА (даже в анонимном опросе пользователь видит свой выбор)
  const myRes = await pool.query(
    'SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2',
    [pollId, userId],
  );
  const myVotes = myRes.rows.map((r: any) => r.option_id);

  return {
    poll: { ...poll, options, total_votes: totalVotes },
    my_votes: myVotes,
  };
}

// POST /api/polls — создать опрос
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const {
      chat_id, topic_id, question, options,
      is_anonymous, allows_multiple, is_quiz, correct_option_index,
    } = req.body;

    if (!chat_id || !question || !Array.isArray(options) || options.length < 2 || options.length > 10) {
      return res.status(400).json({ error: 'Нужно 2-10 вариантов ответа' });
    }

    const memberCheck = await pool.query(
      'SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2',
      [chat_id, req.userId],
    );
    if (memberCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Нет доступа к чату' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const pollRes = await client.query(
        `INSERT INTO polls (chat_id, topic_id, creator_id, question, is_anonymous, allows_multiple, is_quiz, correct_option_index)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [chat_id, topic_id || null, req.userId, question, !!is_anonymous, !!allows_multiple, !!is_quiz, correct_option_index ?? null],
      );
      const poll = pollRes.rows[0];

      for (let i = 0; i < options.length; i++) {
        await client.query(
          'INSERT INTO poll_options (poll_id, option_index, text, is_correct) VALUES ($1, $2, $3, $4)',
          [poll.id, i, options[i], !!(is_quiz && correct_option_index === i)],
        );
      }

      const msgRes = await client.query(
        `INSERT INTO messages (chat_id, topic_id, sender_id, content_type, poll_id, created_at)
         VALUES ($1, $2, $3, 'poll', $4, NOW()) RETURNING *`,
        [chat_id, topic_id || null, req.userId, poll.id],
      );

      const optsRes = await client.query(
        'SELECT * FROM poll_options WHERE poll_id = $1 ORDER BY option_index',
        [poll.id],
      );

      await client.query('COMMIT');

      res.json({
        poll: { ...poll, options: optsRes.rows, total_votes: 0 },
        message: msgRes.rows[0],
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err: any) {
    console.error('Ошибка создания опроса:', err);
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

// POST /api/polls/:id/vote — проголосовать
router.post('/:id/vote', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const pollId = parseInt(req.params.id as string);
    const { option_ids } = req.body;

    if (!Array.isArray(option_ids) || option_ids.length === 0) {
      return res.status(400).json({ error: 'Выберите хотя бы один вариант' });
    }

    const pollRes = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
    if (pollRes.rows.length === 0) return res.status(404).json({ error: 'Опрос не найден' });
    const poll = pollRes.rows[0];
    if (poll.is_closed) return res.status(400).json({ error: 'Опрос закрыт' });
    if (!poll.allows_multiple && option_ids.length > 1) {
      return res.status(400).json({ error: 'Можно выбрать только один вариант' });
    }

    await pool.query('DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [pollId, req.userId]);
    for (const oid of option_ids) {
      await pool.query(
        'INSERT INTO poll_votes (poll_id, option_id, user_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [pollId, oid, req.userId],
      );
    }

    res.json(await getPollResults(pollId, req.userId!));
  } catch (err: any) {
    console.error('Ошибка голосования:', err);
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

// DELETE /api/polls/:id/vote — снять голос
router.delete('/:id/vote', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const pollId = parseInt(req.params.id as string);
    await pool.query('DELETE FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [pollId, req.userId]);
    res.json(await getPollResults(pollId, req.userId!));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

// POST /api/polls/:id/close — закрыть опрос
router.post('/:id/close', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const pollId = parseInt(req.params.id as string);
    const pollRes = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
    if (pollRes.rows.length === 0) return res.status(404).json({ error: 'Опрос не найден' });
    if (pollRes.rows[0].creator_id !== req.userId) {
      return res.status(403).json({ error: 'Только создатель может закрыть опрос' });
    }
    await pool.query('UPDATE polls SET is_closed = true WHERE id = $1', [pollId]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

// GET /api/polls/:id/results — результаты
router.get('/:id/results', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const pollId = parseInt(req.params.id as string);
    res.json(await getPollResults(pollId, req.userId!));
  } catch (err: any) {
    console.error('Ошибка результатов опроса:', err);
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

// GET /api/polls/:id — сам опрос
// GET /api/polls/:id/voters — кто за что голосовал (пусто для анонимных)
router.get('/:id/voters', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const pollId = parseInt(req.params.id as string);
    const pollRes = await pool.query('SELECT is_anonymous FROM polls WHERE id = $1', [pollId]);
    if (pollRes.rows.length === 0) return res.status(404).json({ error: 'Опрос не найден' });
    if (pollRes.rows[0].is_anonymous) return res.json([]);
    const rows = await pool.query(
      `SELECT v.option_id, v.user_id, v.created_at, u.username, u.display_name
       FROM poll_votes v JOIN users u ON u.id = v.user_id
       WHERE v.poll_id = $1 ORDER BY v.created_at DESC`,
      [pollId],
    );
    res.json(rows.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const pollId = parseInt(req.params.id as string);
    res.json(await getPollResults(pollId, req.userId!));
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Ошибка сервера' });
  }
});

export default router;