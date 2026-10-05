import notifee, { Event, EventType } from '@notifee/react-native';
import { request } from '../services/http';
import { navigationRef, openChat, openTask } from '../navigation/ref';
import { PushPayload, getNotifySettings } from './model';
import { clearChatNotification, clearTaskNotification, showMessageNotification, showTaskNotification, taskNotificationId } from './display';
import { firstTime, isAppActive, isChatOpen, showBanner } from './state';

/**
 * Что делать с пришедшим событием (push с сервера или сокет).
 * - приложение открыто: баннер сверху (кроме сообщений открытого чата);
 * - свёрнуто или закрыто: системное уведомление в шторке.
 */
export async function handleIncoming(p: PushPayload | null): Promise<void> {
  if (!p) return;
  if (p.type === 'read') {
    await clearChatNotification(p.chatId);
    return;
  }
  if (p.type === 'message') {
    if (!firstTime(`m:${p.messageId}`)) return;
    if (isAppActive()) {
      if (isChatOpen(p.chatId, p.topicId)) return;
      // В списке чатов новое сообщение и так видно — баннер не нужен.
      if (navigationRef.isReady() && navigationRef.getCurrentRoute()?.name === 'ChatList') return;
      const s = await getNotifySettings();
      if (s.messages && s.inApp) showBanner({ kind: 'message', data: p });
      return;
    }
    await showMessageNotification(p);
    return;
  }
  if (!firstTime(`t:${p.taskId}:${p.kind}:${p.comment}`)) return;
  if (isAppActive()) {
    const s = await getNotifySettings();
    if (s.tasks && s.inApp) showBanner({ kind: 'task', data: p });
    return;
  }
  await showTaskNotification(p);
}

/** Нажатия на уведомления и кнопки в них — и при открытом, и при закрытом приложении. */
export async function handleNotificationEvent({ type, detail }: Event): Promise<void> {
  const n = detail.notification;
  const data = (n?.data || {}) as Record<string, string>;
  // Пробные уведомления из настроек никуда не ведут.
  if (data.chat_id === 'preview' || data.task_id === '0') {
    if (type === EventType.PRESS || type === EventType.ACTION_PRESS) {
      if (n?.id) await notifee.cancelNotification(n.id).catch(() => undefined);
    }
    return;
  }
  if (type === EventType.PRESS) {
    openFromData(data);
    return;
  }
  if (type !== EventType.ACTION_PRESS) return;
  const action = detail.pressAction?.id;
  const input = (detail.input || '').trim();
  try {
    if (data.type === 'message') {
      const chatId = data.chat_id;
      if (action === 'default') return openFromData(data);
      if (action === 'reply' && input) {
        await request(`/api/chats/${chatId}/messages`, {
          method: 'POST',
          body: { text: input, topic_id: data.topic_id ? Number(data.topic_id) : null, client_id: `n-${Date.now()}` },
        });
      }
      // Ответили или нажали «Прочитано» — чат прочитан, уведомление убираем.
      if (action === 'reply' || action === 'read') {
        if (data.last_message_id) {
          await request(`/api/chats/${chatId}/read`, { method: 'POST', body: { message_id: Number(data.last_message_id) } }).catch(() => undefined);
        }
        await clearChatNotification(chatId);
      }
      return;
    }
    if (data.type === 'task') {
      const taskId = Number(data.task_id);
      if (action === 'default') return openFromData(data);
      const to = action === 'task_take' ? 'in_progress' : action === 'task_accept' ? 'done' : action === 'task_reject' ? 'rejected' : null;
      if (!to) return;
      if (to === 'rejected' && !input) {
        // Без причины вернуть нельзя — открываем задачу.
        openTask(taskId);
        return;
      }
      await request(`/api/tasks/${taskId}/transition`, { method: 'POST', body: { to_status: to, comment: input || undefined } });
      await clearTaskNotification(taskId);
    }
  } catch (e: any) {
    // Не получилось из шторки (нет сети, задачу уже взяли) — сообщаем там же.
    await notifee
      .displayNotification({
        id: data.type === 'task' ? taskNotificationId(Number(data.task_id)) : `error-${data.chat_id}`,
        title: 'Не удалось выполнить действие',
        body: e?.message || 'Откройте приложение и попробуйте ещё раз',
        data,
        android: { channelId: data.type === 'task' ? 'tasks' : 'messages', smallIcon: 'ic_stat_offix', pressAction: { id: 'default', launchActivity: 'default' } },
      })
      .catch(() => undefined);
  }
}

/** Переход к чату или задаче из уведомления. */
export function openFromData(data: Record<string, any>) {
  if (data.type === 'message' && data.chat_id) {
    clearChatNotification(data.chat_id);
    openChat({ chatId: data.chat_id, chatName: data.chat_name, topicId: data.topic_id ? Number(data.topic_id) : null });
  } else if (data.type === 'task' && data.task_id) {
    clearTaskNotification(Number(data.task_id));
    openTask(Number(data.task_id));
  }
}
