import { io, Socket } from 'socket.io-client';
import { SERVER_URL } from '../config';
import { getToken } from './http';

/**
 * Одно соединение реального времени на всё приложение.
 * - авторизация токеном при подключении;
 * - после переподключения автоматически заходит обратно в открытые чаты;
 * - отправка сообщений с подтверждением от сервера (ack) и таймаутом.
 */

let socket: Socket | null = null;
const joinedChats = new Map<string, number>(); // chatId -> сколько экранов его держат

export async function connectSocket(): Promise<Socket | null> {
  if (socket) return socket;
  const token = await getToken();
  if (!token) return null;
  socket = io(SERVER_URL, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });
  socket.on('connect', () => {
    for (const chatId of joinedChats.keys()) socket?.emit('join_chat', chatId);
  });
  return socket;
}

export function disconnectSocket() {
  joinedChats.clear();
  socket?.removeAllListeners();
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}

/** Подписка экрана на чат. Возвращает функцию отписки. */
export async function joinChat(chatId: string | number): Promise<() => void> {
  const id = String(chatId);
  const s = await connectSocket();
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

export interface SendMessageInput {
  chatId: string | number;
  text: string;
  reply_to_message_id?: number | null;
  topic_id?: number | null;
  /** Уникальный id отправки: повтор после обрыва связи не создаст дубль. */
  client_id: string;
}

/** Отправляет сообщение и ждёт подтверждения сервера. Бросает Error с понятным текстом. */
export async function sendMessage(input: SendMessageInput, timeoutMs = 15_000): Promise<any> {
  const s = await connectSocket();
  if (!s) throw new Error('Нет авторизации');
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Нет связи с сервером')), timeoutMs);
    s.emit('send_message', { ...input, chatId: Number(input.chatId) }, (res: any) => {
      clearTimeout(timer);
      if (res?.ok) resolve(res.message);
      else reject(new Error(res?.error || 'Не удалось отправить'));
    });
  });
}

/** Подписка на событие сокета с автоматической отпиской. */
export function subscribe<T = any>(event: string, handler: (payload: T) => void): () => void {
  let active = true;
  let target: Socket | null = null;
  connectSocket().then((s) => {
    if (!active || !s) return;
    target = s;
    s.on(event, handler);
  });
  return () => {
    active = false;
    target?.off(event, handler);
  };
}

/** Короткий уникальный id без зависимостей. */
export function makeClientId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Отправить событие без ответа (например, «печатает…»). */
export function emitEvent(event: string, payload: unknown) {
  const s = getSocket();
  if (s?.connected) s.emit(event, payload);
}
