import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/http';
import { subscribe } from '../../lib/socket';
import { getNotifySettings } from '../account/notifySettings';
import { notificationsSupported } from '../chats/notifications';
import { useFeedback } from '../../ui/feedback';

/** Колокольчик: события пользователя (новые задачи, запросы заметок и ответы на них). */
export interface AppNotification {
  id: number;
  kind: 'task' | 'note_request' | 'note_request_approved' | 'note_request_declined';
  title: string;
  body: string | null;
  data: Record<string, any>;
  read_at: string | null;
  created_at: string;
  actor_id: number | null;
  actor_name: string | null;
  actor_avatar_url: string | null;
  request_status: 'pending' | 'approved' | 'declined' | null;
}

/** Запрос текущей версии заметки — экран подтверждения у автора. */
export interface NoteVersionRequest {
  id: number;
  status: 'pending' | 'approved' | 'declined';
  created_at: string;
  resolved_at: string | null;
  is_owner: boolean;
  requester: { id: number; name: string; avatar_url: string | null };
  owner: { id: number; name: string; avatar_url: string | null };
  shared: { id: number; title: string; created_at: string };
  note: {
    id: number | null;
    title: string;
    preview: string | null;
    files_count: number | null;
    updated_at: string;
    changed_since_share: boolean;
  } | null;
  result_note_id: number | null;
}

/** Фиолетовый — цвет «заметок» в уведомлениях, как в приложении. */
export const NOTE_COLOR = '#7C5CFA';

export const UNREAD_KEY = ['notifications', 'unread'] as const;

export function useUnreadNotifications(): number {
  const { data } = useQuery({
    queryKey: UNREAD_KEY,
    queryFn: () => api.get<{ count: number }>('/api/notifications/unread-count'),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
  return data?.count ?? 0;
}

/** Текст уведомления о запросе заметки — для тоста и уведомления браузера. */
export function noteRequestText(n: AppNotification): { title: string; body: string } {
  const who = n.actor_name || 'Коллега';
  const note = `«${n.data?.note_title || n.body || 'Без названия'}»`;
  if (n.kind === 'note_request') return { title: who, body: `Просит текущую версию заметки ${note}` };
  if (n.kind === 'note_request_approved') return { title: `${who} поделился(ась) версией`, body: `${note} — уже в ваших заметках` };
  return { title: `${who} не стал(а) делиться версией`, body: `Запрос по заметке ${note} отклонён` };
}

export function linkFor(n: AppNotification): string | null {
  if (n.kind === 'task' && n.data?.task_id) return `/tasks/${n.data.task_id}`;
  if (n.kind === 'note_request_approved' && n.data?.note_id) return `/notes/${n.data.note_id}`;
  if (n.data?.request_id) return `/notifications/requests/${n.data.request_id}`;
  return null;
}

/**
 * Реальное время: счётчик колокольчика, тост на открытой вкладке и
 * уведомление браузера, если вкладка в фоне (запросы заметок; о задачах
 * браузер уже уведомляет отдельно).
 */
export function useInboxRealtime() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { toast } = useFeedback();
  const nav = useRef(navigate);
  nav.current = navigate;

  useEffect(
    () =>
      subscribe<AppNotification>('notification', (n) => {
        qc.setQueryData<{ count: number }>(UNREAD_KEY, (d) => ({ count: (d?.count ?? 0) + 1 }));
        qc.invalidateQueries({ queryKey: ['notifications', 'list'] });
        if (n.kind === 'task') return;
        const { title, body } = noteRequestText(n);
        const link = linkFor(n);
        if (document.visibilityState === 'visible') {
          toast(`${title}: ${body}`);
          return;
        }
        if (!notificationsSupported() || Notification.permission !== 'granted' || getNotifySettings().notes === false) return;
        try {
          const sys = new Notification(title, {
            body,
            icon: n.actor_avatar_url || '/favicon.svg',
            tag: `note-request-${n.data?.request_id}-${n.kind}`,
          });
          sys.onclick = () => {
            window.focus();
            if (link) nav.current(link);
            sys.close();
          };
        } catch {
          // браузер не дал показать — счётчик и лента всё равно обновились
        }
      }),
    [qc, toast],
  );
}
