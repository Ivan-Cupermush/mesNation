import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from './logger';

/** Ожидаемая ошибка с HTTP-статусом и понятным пользователю текстом. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new AppError(400, msg, details);
export const unauthorized = (msg = 'Требуется авторизация') => new AppError(401, msg);
export const forbidden = (msg = 'Недостаточно прав') => new AppError(403, msg);
export const notFound = (msg = 'Не найдено') => new AppError(404, msg);
export const conflict = (msg: string) => new AppError(409, msg);

/** Коды ошибок PostgreSQL, которые означают ошибку клиента, а не сервера. */
const PG_CLIENT_ERRORS: Record<string, [number, string]> = {
  '23505': [409, 'Запись с такими данными уже существует'],
  '23503': [409, 'Связанная запись не найдена или используется'],
  '22P02': [400, 'Некорректный формат данных'],
  '23514': [400, 'Значение не прошло проверку'],
};

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `Маршрут не найден: ${req.method} ${req.path}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err, path: req.path }, err.message);
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    return res.status(400).json({ error: details[0]?.message || 'Некорректные данные', details });
  }
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Файл слишком большой' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Слишком большой запрос' });
  }
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Некорректный JSON' });
  }
  const pg = typeof err?.code === 'string' ? PG_CLIENT_ERRORS[err.code] : undefined;
  if (pg) {
    logger.warn({ code: err.code, detail: err.detail, path: req.path }, 'Ошибка ограничения БД');
    return res.status(pg[0]).json({ error: pg[1] });
  }
  logger.error({ err, method: req.method, path: req.path }, 'Необработанная ошибка');
  return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
}
