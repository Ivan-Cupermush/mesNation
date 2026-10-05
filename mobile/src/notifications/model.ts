import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Данные уведомлений и настройки. Push с сервера приходит строками
 * (так устроен FCM), здесь они приводятся к удобному виду.
 */

export interface MessagePush {
  type: 'message';
  chatId: string;
  chatName: string;
  chatAvatar: string;
  isGroup: boolean;
  topicId: number | null;
  topicName: string;
  messageId: number;
  senderId: number;
  senderName: string;
  senderAvatar: string;
  text: string;
  sentAt: number;
}

export type TaskKind = 'assigned' | 'review' | 'rejected' | 'done' | 'returned';

export interface TaskPush {
  type: 'task';
  kind: TaskKind;
  taskId: number;
  title: string;
  description: string;
  importance: 'green' | 'yellow' | 'red';
  deadline: string;
  reviewDeadline: string;
  actorName: string;
  actorAvatar: string;
  comment: string;
}

export interface ReadPush {
  type: 'read';
  chatId: string;
  messageId: number;
}

export type PushPayload = MessagePush | TaskPush | ReadPush;

const num = (v: unknown) => (v ? Number(v) : 0);

/** Разбор data-сообщения FCM (все значения — строки). */
export function parsePush(data: Record<string, any> | undefined | null): PushPayload | null {
  if (!data || typeof data !== 'object') return null;
  if (data.type === 'message' && data.chat_id) {
    return {
      type: 'message',
      chatId: String(data.chat_id),
      chatName: data.chat_name || 'Чат',
      chatAvatar: data.chat_avatar || '',
      isGroup: data.is_group === '1' || data.is_group === true,
      topicId: num(data.topic_id) || null,
      topicName: data.topic_name || '',
      messageId: num(data.message_id),
      senderId: num(data.sender_id),
      senderName: data.sender_name || 'Участник',
      senderAvatar: data.sender_avatar || '',
      text: data.text || 'Сообщение',
      sentAt: data.sent_at ? new Date(data.sent_at).getTime() || Date.now() : Date.now(),
    };
  }
  if (data.type === 'task' && data.task_id) {
    return {
      type: 'task',
      kind: (['assigned', 'review', 'rejected', 'done', 'returned'].includes(data.kind) ? data.kind : 'assigned') as TaskKind,
      taskId: num(data.task_id),
      title: data.title || 'Задача',
      description: data.description || '',
      importance: (['green', 'yellow', 'red'].includes(data.importance) ? data.importance : 'yellow') as TaskPush['importance'],
      deadline: data.deadline || '',
      reviewDeadline: data.review_deadline || '',
      actorName: data.actor_name || '',
      actorAvatar: data.actor_avatar || '',
      comment: data.comment || '',
    };
  }
  if (data.type === 'read' && data.chat_id) {
    return { type: 'read', chatId: String(data.chat_id), messageId: num(data.message_id) };
  }
  return null;
}

// ---------- Настройки ----------

export interface NotifySettings {
  /** Уведомления о сообщениях. */
  messages: boolean;
  /** Уведомления о задачах. */
  tasks: boolean;
  /** Показывать текст сообщения (иначе — «Новое сообщение»). */
  preview: boolean;
  /** Всплывающие баннеры, когда приложение открыто. */
  inApp: boolean;
}

export const DEFAULT_SETTINGS: NotifySettings = { messages: true, tasks: true, preview: true, inApp: true };
const KEY = '@offix/notify/settings';

let cache: NotifySettings | null = null;
const listeners = new Set<(s: NotifySettings) => void>();

export async function getNotifySettings(): Promise<NotifySettings> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache!;
}

export async function setNotifySettings(patch: Partial<NotifySettings>): Promise<NotifySettings> {
  const next = { ...(await getNotifySettings()), ...patch };
  cache = next;
  listeners.forEach((l) => l(next));
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
  return next;
}

export function onNotifySettings(l: (s: NotifySettings) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ---------- Подписи ----------

export const IMPORTANCE: Record<TaskPush['importance'], { label: string; color: string }> = {
  red: { label: 'Высокий приоритет', color: '#DC2626' },
  yellow: { label: 'Средний приоритет', color: '#D97706' },
  green: { label: 'Низкий приоритет', color: '#16A34A' },
};

export const TASK_KIND_TITLE: Record<TaskKind, string> = {
  assigned: 'Новая задача',
  review: 'Задача на проверке',
  rejected: 'Задачу вернули на доработку',
  done: 'Задача принята',
  returned: 'Задачу снова открыли',
};

/** «12 окт, 18:00» для срока задачи. */
export function shortDeadline(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Строка «кто и что» для задачи. */
export function taskActorLine(t: TaskPush): string {
  const who = t.actorName;
  switch (t.kind) {
    case 'assigned':
      return who ? `Поставил(а): ${who}` : '';
    case 'review':
      return who ? `Сдал(а) на проверку: ${who}` : 'Работа сдана на проверку';
    case 'rejected':
      return who ? `Вернул(а): ${who}` : '';
    case 'done':
      return who ? `Принял(а): ${who}` : '';
    case 'returned':
      return who ? `Открыл(а) снова: ${who}` : '';
  }
}
