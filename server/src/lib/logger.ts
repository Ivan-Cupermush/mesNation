import pino from 'pino';
import { env } from '../config/env';

/**
 * Структурированный логгер. В продакшене пишет JSON (удобно грепать и
 * отправлять в любую систему сбора логов), в разработке — читаемый вывод.
 * Чувствительные поля вырезаются автоматически.
 */
export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.query.token',
      '*.password',
      '*.password_hash',
      '*.token',
    ],
    censor: '[скрыто]',
  },
  transport:
    env.NODE_ENV === 'development'
      ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } }
      : undefined,
});
