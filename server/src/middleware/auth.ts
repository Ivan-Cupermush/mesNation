import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import pool from '../db/pool';
import { forbidden, unauthorized } from '../lib/errors';
import { isDirector } from '../services/access';

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

export interface TokenPayload {
  userId: number;
  username: string;
}

export function signUserToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] });
}

export function verifyUserToken(token: string): TokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET) as Partial<TokenPayload> & { purpose?: string };
  // Токены одноразового доступа к файлам не должны работать как токен входа.
  if (payload.purpose || typeof payload.userId !== 'number') throw new Error('wrong token type');
  return { userId: payload.userId, username: payload.username || '' };
}

export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}

/**
 * Проверяет JWT и то, что пользователь существует и активен.
 * Деактивированный сотрудник теряет доступ сразу, а не через 7 дней,
 * когда истечёт его токен.
 */
export async function authenticate(req: AuthRequest, _res: Response, next: NextFunction) {
  const token = extractBearer(req.headers.authorization);
  if (!token) throw unauthorized('Токен не предоставлен');
  let payload: TokenPayload;
  try {
    payload = verifyUserToken(token);
  } catch {
    throw unauthorized('Сессия истекла, войдите заново');
  }
  const { rows } = await pool.query('SELECT is_active FROM users WHERE id = $1', [payload.userId]);
  if (rows.length === 0) throw unauthorized('Пользователь не найден');
  if (!rows[0].is_active) throw forbidden('Учётная запись деактивирована');
  req.userId = payload.userId;
  req.username = payload.username;
  next();
}

/** Только директор (пользователь в корневом узле дерева ролей). */
export async function requireDirector(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!(await isDirector(req.userId!))) throw forbidden('Действие доступно только директору');
  next();
}
