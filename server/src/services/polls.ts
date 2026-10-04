import pool from '../db/pool';
import { notFound } from '../lib/errors';

/** Опрос с вариантами, числом голосов и голосом текущего пользователя. */
export async function getPollResults(pollId: number, userId: number) {
  const pollRes = await pool.query('SELECT * FROM polls WHERE id = $1', [pollId]);
  if (!pollRes.rows.length) throw notFound('Опрос не найден');
  const poll = pollRes.rows[0];

  const [opts, votes, mine, voters] = await Promise.all([
    pool.query('SELECT * FROM poll_options WHERE poll_id = $1 ORDER BY option_index', [pollId]),
    pool.query(
      `SELECT option_id, COUNT(*)::int AS count, ARRAY_AGG(user_id) AS voters
       FROM poll_votes WHERE poll_id = $1 GROUP BY option_id`,
      [pollId],
    ),
    pool.query('SELECT option_id FROM poll_votes WHERE poll_id = $1 AND user_id = $2', [pollId, userId]),
    pool.query('SELECT COUNT(DISTINCT user_id)::int AS n FROM poll_votes WHERE poll_id = $1', [pollId]),
  ]);

  const byOption = new Map<number, { count: number; voters: number[] }>();
  for (const r of votes.rows) {
    byOption.set(r.option_id, { count: r.count, voters: poll.is_anonymous ? [] : r.voters || [] });
  }
  const myVotes = mine.rows.map((r) => r.option_id);
  // В викторине правильный ответ раскрывается только проголосовавшим.
  const revealCorrect = !poll.is_quiz || myVotes.length > 0 || poll.is_closed;
  const options = opts.rows.map((o) => ({
    ...o,
    is_correct: revealCorrect ? o.is_correct : false,
    vote_count: byOption.get(o.id)?.count || 0,
    voters: byOption.get(o.id)?.voters || [],
  }));
  // Число проголосовавших людей (в опросе с несколькими ответами голосов больше).
  const totalVotes: number = voters.rows[0].n;

  return {
    poll: {
      ...poll,
      correct_option_index: revealCorrect ? poll.correct_option_index : null,
      options,
      total_votes: totalVotes,
    },
    my_votes: myVotes,
  };
}
