import { Request, Response, NextFunction } from 'express';
import { z, ZodType } from 'zod';

type Part = 'body' | 'query' | 'params';

/**
 * Проверяет часть запроса схемой zod. Ошибка уходит в общий обработчик
 * и превращается в 400 с понятным сообщением. В body кладётся уже
 * очищенное значение (лишние поля отбрасываются).
 */
export function validate(schema: ZodType, part: Part = 'body') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const parsed = schema.parse(req[part]);
    if (part === 'body') {
      req.body = parsed;
    } else {
      // В Express 5 req.query — геттер, поэтому подменяем значение явно.
      Object.defineProperty(req, part, { value: parsed, writable: true, configurable: true });
    }
    next();
  };
}

/** Положительный целочисленный id из строки параметра или числа. */
export const id = z.coerce
  .number({ error: 'Некорректный идентификатор' })
  .int('Некорректный идентификатор')
  .positive('Некорректный идентификатор');

export const idParam = z.object({ id });

/** Читает числовой параметр маршрута, бросая 400 при мусоре. */
export function paramId(req: Request, name = 'id'): number {
  return id.parse(req.params[name]);
}
