import crypto from 'crypto';
import fs from 'fs';
import pool from '../db/pool';
import { env } from '../config/env';
import { logger } from '../lib/logger';

/**
 * Push-уведомления через Firebase Cloud Messaging (HTTP v1).
 *
 * Отправляются «data»-сообщения с высоким приоритетом: приложение само рисует
 * уведомление (как Telegram — с аватаром, ответом из шторки, группировкой по
 * чату), поэтому внешний вид не зависит от сервера.
 *
 * Ключ сервисного аккаунта задаётся в FIREBASE_SERVICE_ACCOUNT (JSON целиком
 * или путь к файлу). Без него push выключены и функции ничего не делают.
 * OAuth-токен Google подписывается встроенным crypto — без лишних зависимостей.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let account: ServiceAccount | null | undefined;

function loadAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const raw = env.FIREBASE_SERVICE_ACCOUNT.trim();
  account = null;
  if (!raw) return null;
  try {
    const json = raw.startsWith('{') ? raw : fs.readFileSync(raw, 'utf8');
    const parsed = JSON.parse(json);
    if (parsed.project_id && parsed.client_email && parsed.private_key) {
      account = parsed;
      logger.info({ project: parsed.project_id }, 'Push-уведомления включены (Firebase)');
    } else {
      logger.error('FIREBASE_SERVICE_ACCOUNT: в ключе нет project_id / client_email / private_key');
    }
  } catch (err) {
    logger.error({ err }, 'FIREBASE_SERVICE_ACCOUNT: не удалось прочитать ключ сервисного аккаунта');
  }
  return account ?? null;
}

export const pushEnabled = () => !!loadAccount();

const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = b64url(crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key));
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Google OAuth: ${data.error_description || data.error || res.status}`);
  cachedToken = { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

export type PushData = Record<string, string>;

async function sendToToken(sa: ServiceAccount, token: string, data: PushData, collapseKey?: string) {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken(sa)}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        data,
        android: { priority: 'HIGH', ttl: '86400s', ...(collapseKey ? { collapse_key: collapseKey } : {}) },
      },
    }),
  });
  if (res.ok) return;
  const body: any = await res.json().catch(() => ({}));
  const code = body?.error?.details?.find((d: any) => d.errorCode)?.errorCode || body?.error?.status;
  // Приложение удалено / токен устарел — больше на него не отправляем.
  if (res.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') {
    await pool.query('DELETE FROM push_tokens WHERE token = $1', [token]);
    return;
  }
  throw new Error(`FCM ${res.status}: ${body?.error?.message || code || 'ошибка'}`);
}

/** Отправляет data-push всем устройствам пользователей. Ошибки только логируются. */
export async function pushToUsers(userIds: number[], data: PushData, collapseKey?: string): Promise<void> {
  const sa = loadAccount();
  const ids = Array.from(new Set(userIds)).filter((x) => Number.isInteger(x));
  if (!sa || !ids.length) return;
  const { rows } = await pool.query('SELECT token FROM push_tokens WHERE user_id = ANY($1::int[])', [ids]);
  await Promise.all(
    rows.map((r) => sendToToken(sa, r.token, data, collapseKey).catch((err) => logger.warn({ err: err.message }, 'Push не доставлен'))),
  );
}

// ---------- Содержимое уведомлений ----------

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

/** Короткий текст сообщения для уведомления (как превью в Telegram). */
export function pushPreview(m: any): string {
  if (m.poll_id) return `Опрос: ${m.poll_question || ''}`.trim();
  if (m.note_share_id) return `Заметка: ${m.note_share?.title || ''}`.trim();
  const text = (m.text || '').trim();
  const kind = m.media_kind || (m.thumb_url ? 'photo' : m.file_url ? 'file' : null);
  const label = kind === 'photo' ? 'Фото' : kind === 'video' ? 'Видео' : kind === 'file' ? m.file_name || 'Файл' : '';
  if (label && text) return clip(`${label}, ${text}`, 300);
  return clip(text || label || 'Сообщение', 300);
}

/** Новое сообщение: всем участникам чата, кроме отправителя и тех, у кого чат без звука. */
export async function notifyNewMessage(m: any): Promise<void> {
  if (!pushEnabled() || m.content_type === 'service' || m.deleted_for_all) return;
  const chatId = Number(m.chat_id);
  const chat = (await pool.query('SELECT id, name, type, avatar_url, is_supergroup FROM chats WHERE id = $1', [chatId])).rows[0];
  if (!chat) return;
  const { rows } = await pool.query(
    `SELECT cm.user_id FROM chat_members cm JOIN users u ON u.id = cm.user_id AND u.is_active
     WHERE cm.chat_id = $1 AND cm.user_id <> $2 AND (cm.muted_until IS NULL OR cm.muted_until < NOW())`,
    [chatId, m.sender_id],
  );
  if (!rows.length) return;
  const topic = m.topic_id ? (await pool.query('SELECT title FROM topics WHERE id = $1', [m.topic_id])).rows[0] : null;
  const senderName = m.sender_display_name || m.sender_name || 'Участник';
  const isGroup = chat.type !== 'private';
  await pushToUsers(
    rows.map((r) => r.user_id),
    {
      type: 'message',
      chat_id: String(chatId),
      chat_name: isGroup ? chat.name || 'Группа' : senderName,
      chat_avatar: (isGroup ? chat.avatar_url : m.sender_avatar_url) || '',
      is_group: isGroup ? '1' : '0',
      topic_id: m.topic_id ? String(m.topic_id) : '',
      topic_name: topic?.title || '',
      message_id: String(m.id),
      sender_id: String(m.sender_id),
      sender_name: senderName,
      sender_avatar: m.sender_avatar_url || '',
      text: pushPreview(m),
      sent_at: new Date(m.created_at || Date.now()).toISOString(),
    },
  );
}

/** Чат прочитан на одном устройстве — убираем его уведомления на остальных. */
export async function notifyChatRead(userId: number, chatId: number, messageId: number): Promise<void> {
  if (!pushEnabled()) return;
  await pushToUsers([userId], { type: 'read', chat_id: String(chatId), message_id: String(messageId) }, `read-${chatId}`);
}

export type TaskPushKind = 'assigned' | 'review' | 'rejected' | 'done' | 'returned';

/** События задачи: назначили, сдали на проверку, вернули, приняли. */
export async function notifyTask(kind: TaskPushKind, taskId: number, userIds: number[], actorId: number, comment?: string | null) {
  const recipients = userIds.filter((u) => u !== actorId);
  if (!pushEnabled() || !recipients.length) return;
  const { rows } = await pool.query(
    `SELECT t.id, t.title, t.description, t.importance,
            COALESCE(t.executor_deadline, t.hard_deadline) AS deadline, t.reviewer_deadline,
            (SELECT COALESCE(display_name, username) FROM users WHERE id = $2) AS actor_name,
            (SELECT avatar_url FROM users WHERE id = $2) AS actor_avatar
     FROM tasks t WHERE t.id = $1`,
    [taskId, actorId],
  );
  const t = rows[0];
  if (!t) return;
  await pushToUsers(recipients, {
    type: 'task',
    kind,
    task_id: String(t.id),
    title: clip(t.title || 'Задача', 200),
    description: clip((t.description || '').trim(), 400),
    importance: t.importance || 'yellow',
    deadline: t.deadline ? new Date(t.deadline).toISOString() : '',
    review_deadline: t.reviewer_deadline ? new Date(t.reviewer_deadline).toISOString() : '',
    actor_name: t.actor_name || '',
    actor_avatar: t.actor_avatar || '',
    comment: clip((comment || '').trim(), 300),
  });
}

/** Для фоновых задач: ошибка уведомления не должна ломать основной запрос. */
export function fireAndForget(p: Promise<unknown>, what: string) {
  p.catch((err) => logger.warn({ err: err?.message || err }, `Уведомление не отправлено: ${what}`));
}
