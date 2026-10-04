import { Router, Response } from 'express';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import sharp from 'sharp';
import path from 'path';
import { z } from 'zod';
import pool, { withTransaction } from '../db/pool';
import { AuthRequest, authenticate, signUserToken } from '../middleware/auth';
import { validate } from '../lib/validate';
import { badRequest, conflict, forbidden, unauthorized } from '../lib/errors';
import { logger } from '../lib/logger';
import { UPLOAD_DIRS, makeUploader, removeFile, urlToDiskPath } from '../lib/uploads';
import { getUserNode, hasSubordinateNodes } from '../services/access';
import { getCompanyName } from '../services/company';

const router = Router();

// Подбор пароля: не больше 10 неудачных попыток входа за 15 минут с одного адреса.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true, // считаем только неудачные попытки: офис за одним IP не блокирует сам себя
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
});

export const passwordSchema = z
  .string({ error: 'Пароль обязателен' })
  .min(6, 'Пароль должен быть не короче 6 символов')
  .max(128, 'Пароль слишком длинный');
export const usernameSchema = z
  .string({ error: 'Логин обязателен' })
  .trim()
  .min(2, 'Логин должен быть не короче 2 символов')
  .max(50, 'Логин слишком длинный')
  .regex(/^[a-zA-Z0-9._-]+$/, 'Логин: только латиница, цифры, точка, дефис и подчёркивание');
export const emailSchema = z
  .string({ error: 'Email обязателен' })
  .trim()
  .toLowerCase()
  .email('Некорректный email')
  .max(255);

/** Публичные данные пользователя + его место в иерархии. */
export async function loadProfile(userId: number) {
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.email, u.display_name, u.avatar_url, u.is_active, u.created_at,
            u.department_id, rt.id AS role_id, rt.name AS role_name, rt.color AS role_color, rt.icon AS role_icon
     FROM users u
     LEFT JOIN user_role_assignments ura ON ura.user_id = u.id
     LEFT JOIN role_tree rt ON rt.id = ura.role_node_id
     WHERE u.id = $1`,
    [userId],
  );
  if (!rows.length) return null;
  const node = await getUserNode(userId);
  return {
    ...rows[0],
    is_director: node.isRoot,
    role_depth: node.depth,
    has_subordinates: await hasSubordinateNodes(userId),
    company_name: await getCompanyName(),
  };
}

// ---------- Онбординг ----------

/** Компания создана, если в корневом узле дерева есть хотя бы один пользователь. */
async function companyExists(): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT EXISTS (
       SELECT 1 FROM user_role_assignments ura
       JOIN role_tree rt ON rt.id = ura.role_node_id
       WHERE rt.parent_id IS NULL
     ) AS exists`,
  );
  return rows[0].exists;
}

router.get('/has-company', async (_req, res) => {
  res.json({ hasCompany: await companyExists() });
});

const setupSchema = z.object({
  company_name: z.string().trim().min(1, 'Название компании обязательно').max(200),
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  display_name: z.string().trim().max(255).optional(),
});

router.post('/setup-company', validate(setupSchema), async (req, res) => {
  const body = req.body as z.infer<typeof setupSchema>;
  const result = await withTransaction(async (client) => {
    // Блокировка, чтобы два одновременных запроса не создали двух директоров.
    await client.query('SELECT pg_advisory_xact_lock(4242001)');
    if (await companyExists()) throw badRequest('Компания уже создана. Используйте вход.');

    let root = (await client.query('SELECT id FROM role_tree WHERE parent_id IS NULL ORDER BY id LIMIT 1')).rows[0];
    if (!root) {
      root = (
        await client.query(
          `INSERT INTO role_tree (name, parent_id, description, level, icon, color)
           VALUES ('Директор', NULL, 'Руководитель компании', 0, '👑', '#6366F1') RETURNING id`,
        )
      ).rows[0];
    }
    await client.query(
      `INSERT INTO app_settings (key, value) VALUES ('company_name', $1)
       ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
      [body.company_name],
    );
    const hash = await bcrypt.hash(body.password, 10);
    const user = (
      await client.query(
        `INSERT INTO users (username, email, password_hash, display_name, role_id, name)
         VALUES ($1, $2, $3, $4, $5, $1)
         RETURNING id, username, email, display_name, avatar_url`,
        [body.username, body.email, hash, body.display_name || body.username, root.id],
      )
    ).rows[0];
    await client.query('INSERT INTO user_role_assignments (user_id, role_node_id) VALUES ($1, $2)', [user.id, root.id]);
    return user;
  });
  logger.info({ userId: result.id }, 'Компания создана');
  res.status(201).json({
    token: signUserToken({ userId: result.id, username: result.username }),
    user: result,
    company_name: body.company_name,
  });
});

/**
 * Самостоятельная регистрация закрыта: корпоративные учётные записи
 * создаёт директор в дереве ролей.
 */
router.post('/register', (_req, _res) => {
  throw forbidden('Регистрация закрыта. Учётную запись создаёт администратор компании.');
});

// ---------- Вход ----------

const loginSchema = z
  .object({
    username: z.string().trim().max(255).optional(),
    email: z.string().trim().max(255).optional(),
    password: z.string({ error: 'Введите пароль' }).min(1, 'Введите пароль').max(128),
  })
  .refine((v) => v.username || v.email, { message: 'Введите логин или email' });

router.post('/login', loginLimiter, validate(loginSchema), async (req, res) => {
  const { username, email, password } = req.body as z.infer<typeof loginSchema>;
  const login = (username || email || '').toLowerCase();
  // Можно войти и по логину, и по email — в любом из двух полей.
  const { rows } = await pool.query(
    `SELECT id, username, email, password_hash, display_name, avatar_url, is_active
     FROM users WHERE LOWER(username) = $1 OR LOWER(email) = $1
     ORDER BY (LOWER(username) = $1) DESC LIMIT 1`,
    [login],
  );
  const user = rows[0];
  const ok = user && (await bcrypt.compare(password, user.password_hash));
  if (!ok) {
    logger.warn({ login }, 'Неудачная попытка входа');
    throw unauthorized('Неверный логин или пароль');
  }
  if (!user.is_active) throw forbidden('Учётная запись деактивирована. Обратитесь к администратору.');
  const { password_hash: _h, is_active: _a, ...safe } = user;
  res.json({ token: signUserToken({ userId: user.id, username: user.username }), user: safe });
});

/** Выход: токены не хранятся на сервере, поэтому достаточно удалить его на клиенте. */
router.post('/logout', (_req, res) => {
  res.json({ success: true });
});

// ---------- Профиль ----------

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  const profile = await loadProfile(req.userId!);
  if (!profile) throw unauthorized('Пользователь не найден');
  res.json(profile);
});

const profileSchema = z
  .object({
    display_name: z.string().trim().min(1, 'Имя не может быть пустым').max(255).optional(),
    email: emailSchema.optional(),
  })
  .refine((v) => v.display_name !== undefined || v.email !== undefined, { message: 'Нет данных для обновления' });

async function updateProfile(req: AuthRequest, res: Response) {
  const { display_name, email } = req.body as z.infer<typeof profileSchema>;
  if (email) {
    const dup = await pool.query('SELECT 1 FROM users WHERE LOWER(email) = $1 AND id <> $2', [email, req.userId]);
    if (dup.rows.length) throw conflict('Этот email уже используется');
  }
  await pool.query(
    `UPDATE users SET display_name = COALESCE($1, display_name), email = COALESCE($2, email) WHERE id = $3`,
    [display_name ?? null, email ?? null, req.userId],
  );
  res.json(await loadProfile(req.userId!));
}

router.patch('/profile', authenticate, validate(profileSchema), updateProfile);
// PUT — для совместимости с веб-клиентом.
router.put('/profile', authenticate, validate(profileSchema), updateProfile);

const changePasswordSchema = z.object({
  current_password: z.string().min(1, 'Введите текущий пароль'),
  new_password: passwordSchema,
});

router.post('/change-password', authenticate, validate(changePasswordSchema), async (req: AuthRequest, res: Response) => {
  const { current_password, new_password } = req.body as z.infer<typeof changePasswordSchema>;
  const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [req.userId]);
  if (!(await bcrypt.compare(current_password, rows[0].password_hash))) throw badRequest('Текущий пароль неверный');
  await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [await bcrypt.hash(new_password, 10), req.userId]);
  res.json({ success: true });
});

const avatarUpload = makeUploader({ dir: UPLOAD_DIRS.avatars, maxSizeMb: 10, imagesOnly: true, prefix: 'u_' });

router.post('/avatar', authenticate, avatarUpload.single('avatar'), async (req: AuthRequest, res: Response) => {
  const file = req.file;
  if (!file) throw badRequest('Файл не получен');
  // Пережимаем в квадратный JPEG 512px: аватар грузится быстро и не тащит EXIF с геометкой.
  const outName = path.basename(file.filename, path.extname(file.filename)) + '.jpg';
  const outPath = path.join(UPLOAD_DIRS.avatars, outName);
  try {
    await sharp(file.path).rotate().resize(512, 512, { fit: 'cover' }).jpeg({ quality: 85 }).toFile(outPath);
  } catch {
    removeFile(file.path);
    throw badRequest('Не удалось обработать изображение');
  }
  if (outPath !== file.path) removeFile(file.path);
  const url = `/uploads/avatars/${outName}`;
  const prev = await pool.query('SELECT avatar_url FROM users WHERE id = $1', [req.userId]);
  await pool.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, req.userId]);
  const oldUrl = prev.rows[0]?.avatar_url;
  if (oldUrl && oldUrl !== url) removeFile(urlToDiskPath(oldUrl));
  res.json({ avatar_url: url });
});

export default router;
