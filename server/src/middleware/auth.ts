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
  /** Версия токенов пользователя на момент выдачи (см. users.token_version). */
  tv?: number;
}

export function signUserToken(payload: TokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Выдаёт токен входа с актуальной версией из базы. */
export async function issueUserToken(userId: number): Promise<string> {
  const { rows } = await pool.query('SELECT username, token_version FROM users WHERE id = $1', [userId]);
  return signUserToken({ userId, username: rows[0].username, tv: rows[0].token_version });
}

export function verifyUserToken(token: string): TokenPayload {
  const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as Partial<TokenPayload> & {
    purpose?: string;
  };
  // Токены одноразового доступа к файлам не должны работать как токен входа.
  if (payload.purpose || typeof payload.userId !== 'number') throw new Error('wrong token type');
  return { userId: payload.userId, username: payload.username || '', tv: payload.tv ?? 0 };
}

/**
 * Проверяет, что сессия ещё действует: пользователь есть, активен и токен
 * не отозван. Возвращает текст ошибки или null.
 */
export async function checkSession(payload: TokenPayload): Promise<'not_found' | 'inactive' | 'revoked' | null> {
  const { rows } = await pool.query('SELECT is_active, token_version FROM users WHERE id = $1', [payload.userId]);
  if (rows.length === 0) return 'not_found';
  if (!rows[0].is_active) return 'inactive';
  if ((payload.tv ?? 0) !== rows[0].token_version) return 'revoked';
  return null;
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
  const problem = await checkSession(payload);
  if (problem === 'not_found') throw unauthorized('Пользователь не найден');
  if (problem === 'inactive') throw forbidden('Учётная запись деактивирована');
  if (problem === 'revoked') throw unauthorized('Сессия завершена, войдите заново');
  req.userId = payload.userId;
  req.username = payload.username;
  next();
}

/** Только директор (пользователь в корневом узле дерева ролей). */
export async function requireDirector(req: AuthRequest, _res: Response, next: NextFunction) {
  if (!(await isDirector(req.userId!))) throw forbidden('Действие доступно только директору');
  next();
}
