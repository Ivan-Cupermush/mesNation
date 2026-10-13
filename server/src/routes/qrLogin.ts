import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest, authenticate, issueUserToken } from '../middleware/auth';
import { validate } from '../lib/validate';
import { badRequest, notFound } from '../lib/errors';
import { audit } from '../services/audit';
import { describeDevice } from '../lib/device';

/**
 * Вход на сайт по QR-коду с телефона (как в Telegram и WhatsApp Web).
 *
 * 1. Сайт: POST /api/auth/qr → { token, secret }. token рисуется в QR-коде,
 *    secret остаётся в браузере.
 * 2. Телефон (уже вошедший): GET /api/auth/qr/:token — что за устройство
 *    просит вход; сайт в это время показывает «Подтвердите на телефоне».
 * 3. Телефон: POST /api/auth/qr/:token/approve (или /decline).
 * 4. Сайт: POST /api/auth/qr/poll { token, secret } → после подтверждения
 *    один раз получает токен входа, как при обычном входе.
 *
 * Сфотографировать код с чужого экрана бесполезно: без secret сессию не забрать.
 */

const router = Router();

/** Сколько живёт один код: сайт сам показывает новый, когда старый истёк. */
export const QR_TTL_SECONDS = 90;

const hash = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
const tokenSchema = z.string().trim().regex(/^[A-Za-z0-9_-]{20,64}$/, 'Некорректный код');

// Новый код — не чаще пары раз в секунду с адреса (сайт обновляет его раз в полторы минуты).
const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Подождите минуту.' },
});

// Опрос статуса — раз в 1–2 секунды с открытой страницы входа.
const pollLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Слишком много запросов. Подождите минуту.' },
});

router.post('/', createLimiter, async (req: Request, res: Response) => {
  const token = crypto.randomBytes(24).toString('base64url');
  const secret = crypto.randomBytes(32).toString('base64url');
  // Старые коды больше не нужны — заодно чистим.
  await pool.query(`DELETE FROM qr_logins WHERE expires_at < NOW() - INTERVAL '1 day'`);
  const { rows } = await pool.query(
    `INSERT INTO qr_logins (token_hash, secret_hash, user_agent, ip, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + make_interval(secs => $5)) RETURNING expires_at`,
    [hash(token), hash(secret), String(req.headers['user-agent'] || '').slice(0, 500), req.ip || null, QR_TTL_SECONDS],
  );
  res.status(201).json({ token, secret, expires_at: rows[0].expires_at, ttl: QR_TTL_SECONDS });
});

const pollSchema = z.object({ token: tokenSchema, secret: z.string().trim().min(20).max(100) });

router.post('/poll', pollLimiter, validate(pollSchema), async (req: Request, res: Response) => {
  const { token, secret } = req.body as z.infer<typeof pollSchema>;
  const { rows } = await pool.query(
    `SELECT q.id, q.status, q.user_id, q.secret_hash, q.expires_at < NOW() AS expired,
            u.username, u.display_name, u.avatar_url, u.email, u.is_active
     FROM qr_logins q LEFT JOIN users u ON u.id = q.user_id
     WHERE q.token_hash = $1`,
    [hash(token)],
  );
  const row = rows[0];
  // Чужой secret — как будто кода нет: не подсказываем, что код существует.
  if (!row || row.secret_hash !== hash(secret)) throw notFound('Код не найден');
  if (row.status === 'used') return res.json({ status: 'expired' });
  if (row.status === 'declined') return res.json({ status: 'declined' });
  if (row.status === 'approved') {
    // Забрать сессию можно ровно один раз.
    const claimed = await pool.query(`UPDATE qr_logins SET status = 'used' WHERE id = $1 AND status = 'approved' RETURNING id`, [row.id]);
    if (!claimed.rows.length || !row.is_active) return res.json({ status: 'expired' });
    await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [row.user_id]);
    await audit('login', { actorId: row.user_id, targetId: row.user_id, ip: req.ip, meta: { method: 'qr' } });
    return res.json({
      status: 'approved',
      token: await issueUserToken(row.user_id),
      user: { id: row.user_id, username: row.username, email: row.email, display_name: row.display_name, avatar_url: row.avatar_url },
    });
  }
  if (row.expired) return res.json({ status: 'expired' });
  if (row.status === 'scanned' && row.user_id) {
    // Сайт показывает, чей телефон отсканировал код: «Подтвердите вход на телефоне».
    return res.json({ status: 'scanned', user: { display_name: row.display_name || row.username, avatar_url: row.avatar_url } });
  }
  res.json({ status: 'pending' });
});

/** Код из QR (телефон) — какое устройство просит вход. */
async function loadForPhone(token: string) {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) throw badRequest('Это не код входа Offix');
  const { rows } = await pool.query(
    `SELECT id, status, user_id, user_agent, ip, created_at, expires_at, expires_at < NOW() AS expired
     FROM qr_logins WHERE token_hash = $1`,
    [hash(parsed.data)],
  );
  if (!rows[0]) throw notFound('Код входа не найден. Обновите страницу на компьютере и отсканируйте новый.');
  return rows[0];
}

function phoneView(row: any) {
  const status = row.expired && (row.status === 'pending' || row.status === 'scanned') ? 'expired' : row.status;
  return {
    status,
    device: describeDevice(row.user_agent),
    ip: row.ip,
    created_at: row.created_at,
    expires_at: row.expires_at,
  };
}

router.get('/:token', authenticate, async (req: AuthRequest, res: Response) => {
  const row = await loadForPhone(String(req.params.token));
  if (!row.expired && row.status === 'pending') {
    await pool.query(`UPDATE qr_logins SET status = 'scanned', user_id = $1 WHERE id = $2 AND status = 'pending'`, [req.userId, row.id]);
    row.status = 'scanned';
  }
  res.json(phoneView(row));
});

router.post('/:token/approve', authenticate, async (req: AuthRequest, res: Response) => {
  const row = await loadForPhone(String(req.params.token));
  if (row.expired || !['pending', 'scanned'].includes(row.status)) {
    throw badRequest('Код уже недействителен. Обновите страницу на компьютере и отсканируйте новый.');
  }
  const { rowCount } = await pool.query(
    `UPDATE qr_logins SET status = 'approved', user_id = $1
     WHERE id = $2 AND status IN ('pending', 'scanned') AND expires_at > NOW()`,
    [req.userId, row.id],
  );
  if (!rowCount) throw badRequest('Код уже недействителен. Обновите страницу на компьютере и отсканируйте новый.');
  await audit('qr_login_approved', { actorId: req.userId, targetId: req.userId, ip: req.ip, meta: { device: describeDevice(row.user_agent).label, web_ip: row.ip } });
  res.json({ ...phoneView({ ...row, status: 'approved' }), status: 'approved' });
});

router.post('/:token/decline', authenticate, async (req: AuthRequest, res: Response) => {
  const row = await loadForPhone(String(req.params.token));
  await pool.query(`UPDATE qr_logins SET status = 'declined' WHERE id = $1 AND status IN ('pending', 'scanned')`, [row.id]);
  res.json({ status: 'declined' });
});

export default router;
