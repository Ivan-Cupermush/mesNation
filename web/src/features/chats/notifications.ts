import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { storage } from '../../lib/storage';
import { isChatVisible } from './activeChat';
import { messagePreview } from './model';
import { isMuted, useChats } from './queries';

const DISMISS_KEY = 'offix.notify.dismissed';

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window && window.isSecureContext;

/** Показать предложение включить уведомления: браузер умеет, разрешение ещё не спрашивали, пользователь не отказался. */
export const shouldOfferNotifications = () =>
  notificationsSupported() && Notification.permission === 'default' && !storage.get(DISMISS_KEY);

export const dismissNotificationsOffer = () => storage.set(DISMISS_KEY, '1');

export async function requestNotifications(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  const result = await Notification.requestPermission();
  if (result !== 'granted') dismissNotificationsOffer();
  return result === 'granted';
}

/**
 * Уведомления о новых сообщениях на компьютере (аналог пушей приложения).
 * Список чатов и так обновляется в реальном времени; когда у чата появляется
 * новое чужое последнее сообщение — показываем системное уведомление, если
 * чат не открыт на экране и не «без звука».
 */
export function useChatNotifications(meId: number) {
  const navigate = useNavigate();
  const { data: chats } = useChats();
  const seen = useRef<Map<number, number> | null>(null);

  useEffect(() => {
    if (!chats) return;
    const prev = seen.current;
    const next = new Map<number, number>();
    for (const c of chats) next.set(c.id, c.last_message?.id ?? 0);
    seen.current = next;
    // Первый снимок — точка отсчёта, по нему не уведомляем.
    if (!prev || !notificationsSupported() || Notification.permission !== 'granted') return;

    for (const c of chats) {
      const lm = c.last_message;
      if (!lm || lm.id <= (prev.get(c.id) ?? 0) || lm.sender_id === meId) continue;
      if (isMuted(c.muted_until) || isChatVisible(c.id)) continue;
      const title = c.type === 'group' ? `${c.name || 'Группа'}${lm.sender_name ? ` · ${lm.sender_name}` : ''}` : c.name || lm.sender_name || 'Новое сообщение';
      try {
        const n = new Notification(title, {
          body: messagePreview(lm) || 'Новое сообщение',
          icon: c.avatar_url || '/favicon.svg',
          tag: `chat-${c.id}`,
        });
        n.onclick = () => {
          window.focus();
          navigate(`/chats/${c.id}`);
          n.close();
        };
      } catch {
        // Некоторые мобильные браузеры не дают создавать уведомления без service worker.
      }
    }
  }, [chats, meId, navigate]);
}
