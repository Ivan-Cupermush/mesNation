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
  /** Превью фото/видео/кружочка (публичная миниатюра) — для развёрнутого уведомления. */
  image: string;
  /** photo, video, voice, video_note, file, album или пусто. */
  mediaKind: string;
}

export type TaskKind = 'assigned' | 'review' | 'rejected' | 'done' | 'returned' | 'request' | 'request_done' | 'thanks';
const TASK_KINDS: TaskKind[] = ['assigned', 'review', 'rejected', 'done', 'returned', 'request', 'request_done', 'thanks'];

export interface TaskPush {
  type: 'task';
  kind: TaskKind;
  /** Запрос (а не задача): своё оформление — фиолетовое, без важности. */
  isRequest: boolean;
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

export type NoteRequestKind = 'request' | 'approved' | 'declined';

/** Запрос текущей версии заметки и ответ на него. */
export interface NoteRequestPush {
  type: 'note_request';
  kind: NoteRequestKind;
  requestId: number;
  noteTitle: string;
  preview: string;
  /** Для «approved» — новая копия у запросившего. */
  noteId: number;
  actorName: string;
  actorAvatar: string;
}

export type PushPayload = MessagePush | TaskPush | ReadPush | NoteRequestPush;

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
      image: data.image || '',
      mediaKind: data.media_kind || '',
    };
  }
  if (data.type === 'task' && data.task_id) {
    return {
      type: 'task',
      kind: (TASK_KINDS.includes(data.kind) ? data.kind : 'assigned') as TaskKind,
      isRequest: data.task_type === 'request' || ['request', 'request_done', 'thanks'].includes(data.kind),
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
  if (data.type === 'note_request' && data.request_id) {
    return {
      type: 'note_request',
      kind: (['request', 'approved', 'declined'].includes(data.kind) ? data.kind : 'request') as NoteRequestKind,
      requestId: num(data.request_id),
      noteTitle: data.note_title || 'Без названия',
      preview: data.preview || '',
      noteId: num(data.note_id),
      actorName: data.actor_name || '',
      actorAvatar: data.actor_avatar || '',
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
  /** Запросы текущей версии заметок и ответы на них. */
  notes: boolean;
  /** Показывать текст сообщения (иначе — «Новое сообщение»). */
  preview: boolean;
  /** Всплывающие баннеры, когда приложение открыто. */
  inApp: boolean;
}

export const DEFAULT_SETTINGS: NotifySettings = { messages: true, tasks: true, notes: true, preview: true, inApp: true };
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
  request: 'Вас просят помочь',
  request_done: 'Ваш запрос выполнен',
  thanks: 'Вам сказали спасибо',
};

/** Фиолетовый — цвет запросов (как на сайте и в списке задач). */
export const REQUEST_COLOR = '#7C5CFA';

/** Цвет и подпись уведомления: у задачи — важность, у запроса — «Запрос». */
export function taskTone(t: TaskPush): { label: string; color: string } {
  if (t.isRequest) return { label: 'Запрос', color: REQUEST_COLOR };
  return IMPORTANCE[t.importance] || IMPORTANCE.yellow;
}

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
    case 'request':
      return who ? `Просит: ${who}` : '';
    case 'request_done':
      return who ? `Выполнил(а): ${who}` : '';
    case 'thanks':
      return who ? `${who} благодарит за помощь 🙏` : 'Вас благодарят за помощь 🙏';
  }
}

// ---------- Заметки ----------

/** Фиолетовый — цвет «заметок»: не путается ни с сообщениями, ни с задачами. */
export const NOTE_COLOR = '#7C5CFA';

/** Заголовок и текст уведомления о запросе заметки. */
export function noteRequestText(p: NoteRequestPush): { title: string; body: string } {
  const who = p.actorName || 'Коллега';
  const title = `«${p.noteTitle}»`;
  switch (p.kind) {
    case 'request':
      return { title: who, body: `Просит текущую версию заметки ${title}` };
    case 'approved':
      return { title: `${who} поделился(ась) версией`, body: `${title} — уже в ваших заметках` };
    case 'declined':
      return { title: `${who} не стал(а) делиться версией`, body: `Запрос по заметке ${title} отклонён` };
  }
}
