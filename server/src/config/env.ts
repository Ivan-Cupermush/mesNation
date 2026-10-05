import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

/**
 * Единая точка чтения переменных окружения.
 * Сервер не стартует с небезопасной конфигурацией: без JWT_SECRET
 * любой мог бы подписать себе токен известным ключом.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  // На каком адресе слушать. За прокси на этой же машине (cloudflared, Caddy) — 127.0.0.1,
  // тогда порт 5000 недоступен из сети в обход прокси. 0.0.0.0 — доступ по IP из локальной сети.
  HOST: z.string().default('0.0.0.0'),

  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_USER: z.string().min(1, 'DB_USER обязателен'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().min(1, 'DB_NAME обязателен'),
  DB_POOL_MAX: z.coerce.number().int().positive().default(20),

  JWT_SECRET: z
    .string({ error: 'JWT_SECRET обязателен (сгенерируйте: openssl rand -hex 48)' })
    .min(32, 'JWT_SECRET должен быть не короче 32 символов'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Список разрешённых origin через запятую. Пусто — CORS для браузеров закрыт
  // (мобильному приложению CORS не нужен, веб ходит через тот же домен).
  CORS_ORIGINS: z.string().default(''),

  // Кому доверять заголовок X-Forwarded-For (реальный IP клиента для лимитов
  // входа и журнала). По умолчанию — только прокси на этой же машине
  // (cloudflared, Caddy, nginx). Клиент из интернета подделать IP не сможет.
  // Значения: loopback | число хопов | список адресов/подсетей через запятую.
  TRUST_PROXY: z.string().default('loopback'),

  // Собранная веб-версия (npm run build в web/). Сервер отдаёт её с того же
  // адреса, что и API: один процесс, один порт, никакого dev-сервера Vite.
  WEB_DIST_DIR: z.string().default('../web/dist'),

  UPLOADS_DIR: z.string().default('uploads'),
  OLLAMA_HOST: z.string().default('http://localhost:11434'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Push-уведомления через Firebase Cloud Messaging. Ключ сервисного аккаунта
  // Firebase: содержимое JSON целиком или путь к файлу. Пусто — push выключены,
  // уведомления приходят, только пока приложение запущено.
  FIREBASE_SERVICE_ACCOUNT: z.string().default(''),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  // Логгер ещё не создан (он сам зависит от env), поэтому пишем в stderr напрямую.
  console.error(`Некорректная конфигурация окружения (.env):\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Значение для app.set('trust proxy'): число хопов или список адресов. */
export function trustProxySetting(raw: string = env.TRUST_PROXY): number | string | boolean {
  const value = raw.trim();
  if (value === 'false' || value === '') return false;
  if (/^\d+$/.test(value)) return Number(value);
  // `true` доверял бы любому X-Forwarded-For — тогда лимиты входа обходятся подделкой заголовка.
  if (value === 'true') return 'loopback';
  return value;
}
