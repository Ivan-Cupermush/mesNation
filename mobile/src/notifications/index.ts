import { AppState } from 'react-native';
import notifee, { EventType } from '@notifee/react-native';
import { getApps } from '@react-native-firebase/app';
import {
  deleteToken,
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import { request } from '../services/http';
import { subscribe } from '../services/socket';
import { MessagePush, TaskPush, parsePush } from './model';
import { ensureChannels } from './display';
import { handleIncoming, handleNotificationEvent } from './handlers';

/**
 * Запуск уведомлений.
 *
 * Основной путь — Firebase Cloud Messaging: сервер присылает push, даже когда
 * приложение закрыто. Если Firebase ещё не настроен (нет google-services.json
 * в сборке или ключа на сервере), уведомления приходят через сокет — пока
 * приложение запущено или свёрнуто.
 */

const firebaseReady = () => {
  try {
    return getApps().length > 0;
  } catch {
    return false;
  }
};

/** Регистрируется в index.js до запуска приложения: работает и при закрытом приложении. */
export function registerBackgroundHandlers() {
  notifee.onBackgroundEvent(handleNotificationEvent);
  if (firebaseReady()) {
    setBackgroundMessageHandler(getMessaging(), async (msg) => {
      await handleIncoming(parsePush(msg.data as Record<string, string>));
    });
  }
}

/** Как приходят уведомления: push (и при закрытом приложении) или только через сокет. */
export type PushMode = 'push' | 'socket' | 'off';
let mode: PushMode = 'off';
export const getPushMode = () => mode;

let teardown: (() => void)[] = [];
let deviceToken: string | null = null;
let started = false;

const registerToken = (token: string) =>
  request<{ enabled: boolean }>('/api/push/token', { method: 'POST', body: { token, platform: 'android' } });

/** После входа в аккаунт. */
export async function startNotifications(): Promise<void> {
  if (started) return;
  started = true;
  try {
    await ensureChannels();
  } catch {
    // каналы создадутся при первом уведомлении
  }
  await notifee.requestPermission().catch(() => undefined);
  teardown.push(notifee.onForegroundEvent(handleNotificationEvent));

  // Приложение открыли нажатием на уведомление (холодный старт).
  const initial = await notifee.getInitialNotification().catch(() => null);
  if (initial) {
    await handleNotificationEvent({
      type: initial.pressAction?.id === 'default' ? EventType.PRESS : EventType.ACTION_PRESS,
      detail: { notification: initial.notification, pressAction: initial.pressAction, input: initial.input },
    });
  }

  let pushActive = false;
  if (firebaseReady()) {
    try {
      const messaging = getMessaging();
      deviceToken = await getToken(messaging);
      pushActive = (await registerToken(deviceToken)).enabled;
      teardown.push(
        onTokenRefresh(messaging, (token) => {
          deviceToken = token;
          registerToken(token).catch(() => undefined);
        }),
      );
      teardown.push(onMessage(messaging, (msg) => handleIncoming(parsePush(msg.data as Record<string, string>))));
      // Смена пароля или «выйти на других устройствах» отвязывает телефоны на
      // сервере — при возвращении в приложение привязываем этот снова.
      let lastSync = Date.now();
      const sub = AppState.addEventListener('change', (st) => {
        if (st !== 'active' || !deviceToken || Date.now() - lastSync < 10 * 60 * 1000) return;
        lastSync = Date.now();
        registerToken(deviceToken).catch(() => undefined);
      });
      teardown.push(() => sub.remove());
    } catch {
      pushActive = false;
    }
  }
  // Без push на сервере — уведомления через сокет (не дублируются: одно событие показывается один раз).
  mode = pushActive ? 'push' : 'socket';
  if (!pushActive) teardown.push(startSocketFallback());
}

/** После смены пароля сервер отвязывает телефоны — привязываем этот заново. */
export async function refreshPushRegistration(): Promise<void> {
  if (deviceToken) await registerToken(deviceToken).catch(() => undefined);
}

/** Выход из аккаунта: устройство больше не получает уведомления этого пользователя. */
export async function stopNotifications({ unregister = true } = {}): Promise<void> {
  teardown.forEach((off) => off());
  teardown = [];
  started = false;
  mode = 'off';
  if (unregister && deviceToken) {
    await request('/api/push/token', { method: 'DELETE', body: { token: deviceToken } }).catch(() => undefined);
  }
  if (firebaseReady()) await deleteToken(getMessaging()).catch(() => undefined);
  deviceToken = null;
  await notifee.cancelAllNotifications().catch(() => undefined);
}

// ---------- Запасной путь: сокет ----------

const chatCache = new Map<string, { name: string; isGroup: boolean; avatar: string }>();
let me: number | null = null;

async function myId(): Promise<number | null> {
  if (me) return me;
  try {
    const u = await request<any>('/api/auth/me');
    me = Number(u?.id) || null;
  } catch {
    me = null;
  }
  return me;
}

async function chatInfo(chatId: string) {
  const hit = chatCache.get(chatId);
  if (hit) return hit;
  const c = await request<any>(`/api/chats/${chatId}`);
  const info = { name: c?.name || 'Чат', isGroup: c?.type !== 'private', avatar: c?.avatar_url || '' };
  chatCache.set(chatId, info);
  return info;
}

function startSocketFallback(): () => void {
  me = null;
  const offs = [
    subscribe('chat_activity', async (e: any) => {
      if (!e?.chat_id || !e?.message_id) return; // прочтение — не новое сообщение
      try {
        const [uid, list] = await Promise.all([myId(), request<any[]>(`/api/messages/${e.chat_id}`, { query: { limit: 1 } })]);
        const m = list?.[list.length - 1];
        if (!m || m.id !== e.message_id || m.sender_id === uid || m.content_type === 'service') return;
        if (chatMuted.has(String(e.chat_id))) return;
        const chat = await chatInfo(String(e.chat_id));
        const senderName = m.sender_display_name || m.sender_name || 'Участник';
        const push: MessagePush = {
          type: 'message',
          chatId: String(e.chat_id),
          chatName: chat.isGroup ? chat.name : senderName,
          chatAvatar: chat.isGroup ? chat.avatar : m.sender_avatar_url || '',
          isGroup: chat.isGroup,
          topicId: m.topic_id || null,
          topicName: '',
          messageId: m.id,
          senderId: m.sender_id,
          senderName,
          senderAvatar: m.sender_avatar_url || '',
          text: previewOf(m),
          sentAt: new Date(m.created_at).getTime() || Date.now(),
        };
        await handleIncoming(push);
      } catch {
        // нет сети — пропускаем
      }
    }),
    subscribe('task_created', async (e: any) => {
      if (!e?.task_id) return;
      try {
        const t = await request<any>(`/api/tasks/${e.task_id}`);
        if (!t?.is_assignee || t.is_creator) return;
        const push: TaskPush = {
          type: 'task',
          kind: 'assigned',
          taskId: t.id,
          title: t.title || 'Задача',
          description: t.description || '',
          importance: t.importance || 'yellow',
          deadline: t.executor_deadline || t.hard_deadline || '',
          reviewDeadline: t.reviewer_deadline || '',
          actorName: t.creator_name || '',
          actorAvatar: '',
          comment: '',
        };
        await handleIncoming(push);
      } catch {
        // нет сети — пропускаем
      }
    }),
  ];
  return () => offs.forEach((off) => off());
}

/** Чаты «без звука» для запасного пути (сервер сам не шлёт push по таким чатам). */
const chatMuted = new Set<string>();
export function setChatMutedLocally(chatId: string, muted: boolean) {
  if (muted) chatMuted.add(String(chatId));
  else chatMuted.delete(String(chatId));
}

function previewOf(m: any): string {
  if (m.poll_id) return `Опрос: ${m.poll_question || ''}`.trim();
  if (m.note_share_id) return 'Заметка';
  const text = (m.text || '').trim();
  const label = m.media_kind === 'photo' ? 'Фото' : m.media_kind === 'video' ? 'Видео' : m.file_url ? m.file_name || 'Файл' : '';
  if (label && text) return `${label}, ${text}`;
  return text || label || 'Сообщение';
}
