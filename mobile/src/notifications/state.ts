import { AppState } from 'react-native';
import type { MessagePush, TaskPush } from './model';

/**
 * Что сейчас на экране: открытый чат не показывает уведомлений о своих же
 * сообщениях (как в Telegram), а при открытом приложении вместо системного
 * уведомления появляется баннер сверху.
 */

let activeChat: { chatId: string; topicId: number | null } | null = null;

export function setActiveChat(chatId: string | null, topicId: number | null = null) {
  activeChat = chatId ? { chatId: String(chatId), topicId } : null;
}

export function isChatOpen(chatId: string, topicId: number | null): boolean {
  return !!activeChat && activeChat.chatId === String(chatId) && (activeChat.topicId ?? null) === (topicId ?? null);
}

export const isAppActive = () => AppState.currentState === 'active';

// ---------- Баннеры внутри приложения ----------

export type Banner = { kind: 'message'; data: MessagePush } | { kind: 'task'; data: TaskPush };

const bannerListeners = new Set<(b: Banner) => void>();

export function showBanner(b: Banner) {
  bannerListeners.forEach((l) => l(b));
}

export function onBanner(l: (b: Banner) => void): () => void {
  bannerListeners.add(l);
  return () => bannerListeners.delete(l);
}

// ---------- Повторы ----------

/** Одно сообщение может прийти и через push, и через сокет — показываем один раз. */
const seen = new Set<string>();

export function firstTime(key: string): boolean {
  if (seen.has(key)) return false;
  seen.add(key);
  if (seen.size > 500) {
    const first = seen.values().next().value;
    if (first) seen.delete(first);
  }
  return true;
}
