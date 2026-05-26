import { Request, Response, NextFunction } from 'express';
import pool from '../db/pool';

interface AuthRequest extends Request { userId?: number; username?: string; }

export function requireRole(...roles: string[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const userId = req.userId;
      if (!userId) return res.status(401).json({ error: 'Не авторизован' });
      const result = await pool.query(
        `SELECT r.name as role FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1`,
        [userId]
      );
      if (result.rows.length === 0) return res.status(403).json({ error: 'Пользователь не найден' });
      const userRole = result.rows[0].role;
      if (!roles.includes(userRole)) return res.status(403).json({ error: 'Недостаточно прав' });
      next();
    } catch (err) {
      console.error('Ошибка проверки роли:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  };
}
