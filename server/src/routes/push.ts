import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../db/pool';
import { AuthRequest } from '../middleware/auth';
import { validate } from '../lib/validate';
import { pushEnabled } from '../services/push';

/**
 * Регистрация устройств для push-уведомлений. Монтируется на /api/push.
 * Один токен — одно устройство; при входе другим пользователем на том же
 * телефоне токен переходит к нему (старый владелец уведомлений не получит).
 */
const router = Router();

const tokenSchema = z.object({
  token: z.string().trim().min(20, 'Некорректный токен устройства').max(4096),
  platform: z.enum(['android', 'ios']).default('android'),
});

router.get('/status', (_req, res) => {
  res.json({ enabled: pushEnabled() });
});

router.post('/token', validate(tokenSchema), async (req: AuthRequest, res: Response) => {
  const { token, platform } = req.body as z.infer<typeof tokenSchema>;
  await pool.query(
    `INSERT INTO push_tokens (token, user_id, platform) VALUES ($1, $2, $3)
     ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id, platform = EXCLUDED.platform, updated_at = NOW()`,
    [token, req.userId, platform],
  );
  res.json({ success: true, enabled: pushEnabled() });
});

router.delete('/token', validate(tokenSchema.pick({ token: true })), async (req: AuthRequest, res: Response) => {
  await pool.query('DELETE FROM push_tokens WHERE token = $1 AND user_id = $2', [req.body.token, req.userId]);
  res.json({ success: true });
});

export default router;
