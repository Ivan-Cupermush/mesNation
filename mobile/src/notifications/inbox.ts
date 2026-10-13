import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { api, AppNotification } from '../services/api';
import { subscribe } from '../services/socket';
import { handleIncoming } from './handlers';

/**
 * Колокольчик: число непрочитанных и новые события в реальном времени.
 * Сервер шлёт событие «notification» по сокету; при возвращении в
 * приложение счётчик сверяется с сервером.
 */

let unread = 0;
const countListeners = new Set<(n: number) => void>();
const itemListeners = new Set<(n: AppNotification) => void>();

export function setUnread(n: number) {
  unread = Math.max(0, n);
  countListeners.forEach((l) => l(unread));
}

export async function refreshUnread(): Promise<void> {
  try {
    setUnread((await api.getUnreadNotificationsCount()).count);
  } catch {
    // нет сети — оставляем как есть
  }
}

/** Новое событие пришло, пока открыт список уведомлений. */
export function onNotificationItem(l: (n: AppNotification) => void): () => void {
  itemListeners.add(l);
  return () => itemListeners.delete(l);
}

export function useUnreadNotifications(): number {
  const [n, setN] = useState(unread);
  useEffect(() => {
    setN(unread);
    countListeners.add(setN);
    return () => {
      countListeners.delete(setN);
    };
  }, []);
  return n;
}

/** Запрос заметки по сокету → баннер или шторка (дубликат с push отсеется). */
function forward(n: AppNotification) {
  if (!n.kind.startsWith('note_request')) return;
  const requestId = Number(n.data?.request_id) || 0;
  if (!requestId) return;
  handleIncoming({
    type: 'note_request',
    kind: n.kind === 'note_request' ? 'request' : n.kind === 'note_request_approved' ? 'approved' : 'declined',
    requestId,
    noteTitle: n.data?.note_title || n.body || 'Без названия',
    preview: '',
    noteId: Number(n.data?.note_id) || 0,
    actorName: n.actor_name || '',
    actorAvatar: n.actor_avatar_url || '',
  }).catch(() => undefined);
}

export function startInbox(): () => void {
  refreshUnread();
  const off = subscribe<AppNotification>('notification', (n) => {
    setUnread(unread + 1);
    itemListeners.forEach((l) => l(n));
    forward(n);
  });
  const sub = AppState.addEventListener('change', (st) => {
    if (st === 'active') refreshUnread();
  });
  return () => {
    off();
    sub.remove();
    setUnread(0);
  };
}
