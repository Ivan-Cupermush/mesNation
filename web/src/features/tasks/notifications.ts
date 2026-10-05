import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNotifySettings } from '../account/notifySettings';
import { notificationsSupported } from '../chats/notifications';
import { useTasks, useTasksRealtime } from './queries';
import type { Task, TaskStatus } from './types';

/** Что сообщить мне о переходе задачи, или null — если меня это не касается. */
function describe(t: Task, from: TaskStatus | undefined): string | null {
  if (from === undefined) return t.is_assignee && !t.is_creator && t.status_new === 'new' ? 'Новая задача' : null;
  if (from === t.status_new) return null;
  const reviewer = (t.is_creator || t.is_watcher) && !t.is_assignee;
  const worker = t.is_assignee && !t.is_creator;
  switch (t.status_new) {
    case 'on_review':
      return reviewer ? 'Задача сдана на проверку' : null;
    case 'rejected':
      return worker ? 'Задачу вернули на доработку' : null;
    case 'done':
      return worker ? 'Задача принята' : null;
    case 'in_progress':
      return worker && from === 'done' ? 'Задачу вернули на доработку' : null;
    default:
      return null;
  }
}

/**
 * Уведомления браузера о задачах (аналог пушей приложения): новая задача
 * мне, сдача на проверку, отклонение и приёмка. Список задач и так
 * обновляется в реальном времени — сравниваем статусы до и после.
 */
export function useTaskNotifications() {
  useTasksRealtime();
  const navigate = useNavigate();
  const { data } = useTasks('mine');
  const seen = useRef<Map<number, TaskStatus> | null>(null);

  useEffect(() => {
    if (!data) return;
    const prev = seen.current;
    seen.current = new Map(data.map((t) => [t.id, t.status_new]));
    // Первый снимок — точка отсчёта.
    if (!prev || !notificationsSupported() || Notification.permission !== 'granted' || !getNotifySettings().tasks) return;
    for (const t of data) {
      const title = describe(t, prev.get(t.id));
      if (!title) continue;
      // Задача уже открыта на экране — уведомление не нужно.
      if (document.visibilityState === 'visible' && window.location.pathname === `/tasks/${t.id}`) continue;
      try {
        const n = new Notification(title, { body: t.title, icon: '/favicon.svg', tag: `task-${t.id}` });
        n.onclick = () => {
          window.focus();
          navigate(`/tasks/${t.id}`);
          n.close();
        };
      } catch {
        // браузер не дал создать уведомление — не мешаем работе
      }
    }
  }, [data, navigate]);
}
