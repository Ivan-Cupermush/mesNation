import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { z } from 'zod';

/**
 * Пароли хранятся только как bcrypt-хеш (cost 12 — ~250 мс на проверку,
 * дорого для перебора, незаметно для человека). bcrypt учитывает только
 * первые 72 байта, поэтому более длинные пароли не принимаем.
 */
const COST = 12;

export const passwordSchema = z
  .string({ error: 'Пароль обязателен' })
  .min(8, 'Пароль должен быть не короче 8 символов')
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, 'Пароль слишком длинный')
  // По рекомендациям NIST важнее длина, чем «спецсимволы»; отсекаем лишь самые частые пароли.
  .refine((p) => !COMMON.has(p.toLowerCase()), 'Этот пароль слишком распространён — придумайте другой');

const COMMON = new Set([
  '12345678', '123456789', '1234567890', 'password', 'password1', 'qwertyui', 'qwerty123', '11111111',
  '00000000', 'iloveyou', '1q2w3e4r', 'qwertyuiop', 'йцукенгш', 'пароль123', 'admin123', 'abc12345',
]);

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

// Хеш-заглушка: если логин не найден, всё равно тратим время на проверку,
// чтобы по скорости ответа нельзя было узнать, существует ли пользователь.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), COST);

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash || DUMMY_HASH);
  return Boolean(hash) && ok;
}

/** Человекочитаемый пароль без похожих символов (0/O, 1/l), с буквами и цифрами. */
export function generatePassword(length = 12): string {
  const letters = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const alphabet = letters + digits;
  for (;;) {
    const out = Array.from(crypto.randomBytes(length), (b) => alphabet[b % alphabet.length]).join('');
    if (/\d/.test(out) && /[a-zA-Z]/.test(out)) return out;
  }
}
