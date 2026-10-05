import { io, type Socket } from 'socket.io-client';
import { getToken, onTokenChange } from './http';

/**
 * Одно соединение реального времени на вкладку (как mobile/src/services/socket.ts).
 * - Подключение к тому же адресу, что и сайт; авторизация токеном.
 * - Сначала long-polling, затем апгрейд до WebSocket: работает и там, где
 *   прокси/антивирус/корпоративная сеть режет WebSocket.
 * - После переподключения автоматически возвращается в открытые чаты.
 * - Смена/сброс токена (вход, выход) пересоздаёт соединение.
 */

type Handler = (...args: unknown[]) => void;

let socket: Socket | null = null;
const joinedChats = new Map<string, number>();
const statusListeners = new Set<(connected: boolean) => void>();
/** Подписки живут дольше соединения: при пересоздании сокета навешиваются заново. */
const handlers = new Map<string, Set<Handler>>();

function create(token: string): Socket {
  const s = io({
    auth: { token },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    timeout: 20_000,
  });
  for (const [event, set] of handlers) for (const h of set) s.on(event, h);
  s.on('connect', () => {
    for (const chatId of joinedChats.keys()) s.emit('join_chat', chatId);
    statusListeners.forEach((l) => l(true));
  });
  s.on('disconnect', () => statusListeners.forEach((l) => l(false)));
  s.on('connect_error', () => statusListeners.forEach((l) => l(false)));
  return s;
}

export function getSocket(): Socket | null {
  if (socket) return socket;
  const token = getToken();
  if (!token) return null;
  socket = create(token);
  return socket;
}

export function disconnectSocket() {
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
  statusListeners.forEach((l) => l(false));
}

onTokenChange((token) => {
  const hadSocket = !!socket;
  disconnectSocket();
  if (token && hadSocket) getSocket();
});

export function isConnected(): boolean {
  return !!socket?.connected;
}

export function onConnectionChange(listener: (connected: boolean) => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/** Подписка экрана на чат. Возвращает отписку. */
export function joinChat(chatId: string | number): () => void {
  const id = String(chatId);
  const s = getSocket();
  joinedChats.set(id, (joinedChats.get(id) || 0) + 1);
  if (s?.connected) s.emit('join_chat', id);
  return () => {
    const left = (joinedChats.get(id) || 1) - 1;
    if (left <= 0) {
      joinedChats.delete(id);
      socket?.emit('leave_chat', id);
    } else {
      joinedChats.set(id, left);
    }
  };
}

/** Подписка на событие сервера. Возвращает отписку. */
export function subscribe<T = unknown>(event: string, handler: (payload: T) => void): () => void {
  const h = handler as Handler;
  let set = handlers.get(event);
  if (!set) handlers.set(event, (set = new Set()));
  set.add(h);
  getSocket()?.on(event, h);
  return () => {
    handlers.get(event)?.delete(h);
    socket?.off(event, h);
  };
}

export function emitEvent(event: string, payload: unknown) {
  const s = getSocket();
  if (s?.connected) s.emit(event, payload);
}

export interface SendMessageInput {
  chatId: number | string;
  text: string;
  reply_to_message_id?: number | null;
  topic_id?: number | null;
  /** Уникальный id отправки: повтор после обрыва не создаст дубль. */
  client_id: string;
}

/** Отправка через сокет с подтверждением сервера. */
export function sendMessageViaSocket<T>(input: SendMessageInput, timeoutMs = 15_000): Promise<T> {
  const s = getSocket();
  if (!s || !s.connected) return Promise.reject(new Error('offline'));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Нет связи с сервером')), timeoutMs);
    s.emit('send_message', { ...input, chatId: Number(input.chatId) }, (res: { ok: boolean; message?: T; error?: string }) => {
      clearTimeout(timer);
      if (res?.ok) resolve(res.message as T);
      else reject(new Error(res?.error || 'Не удалось отправить'));
    });
  });
}

export function makeClientId(): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return `${Date.now().toString(36)}-${rand}`;
}
