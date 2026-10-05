import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidStyle,
  AndroidVisibility,
  AndroidAction,
  AndroidGroupAlertBehavior,
} from '@notifee/react-native';
import { SERVER_URL } from '../config';
import { IMPORTANCE, MessagePush, TASK_KIND_TITLE, TaskPush, getNotifySettings, shortDeadline, taskActorLine } from './model';

/**
 * Системные уведомления (шторка).
 *
 * Сообщения — как в Telegram: стиль «переписка» с аватаром отправителя,
 * последние сообщения чата в одном уведомлении, для групп — название группы,
 * кнопки «Ответить» (прямо из шторки) и «Прочитано». Уведомления чатов
 * собираются в одну группу Offix.
 *
 * Задачи — отдельный канал и заметно другой вид: значок-планшет, цвет по
 * приоритету, заголовок «Новая задача», развёрнутый текст со сроком и автором,
 * своя вибрация и кнопки «Взять в работу» / «Принять» / «Вернуть».
 */

export const CHANNEL_MESSAGES = 'messages';
export const CHANNEL_TASKS = 'tasks';
const GROUP_MESSAGES = 'offix.messages';
const GROUP_TASKS = 'offix.tasks';
const ACCENT = '#1F7A52';

const avatarUrl = (path?: string | null) => (path ? (path.startsWith('http') ? path : `${SERVER_URL}${path}`) : undefined);
export const chatNotificationId = (chatId: string | number) => `chat-${chatId}`;
export const taskNotificationId = (taskId: number) => `task-${taskId}`;

let channelsReady: Promise<void> | null = null;

/** Каналы Android: пользователь может настроить звук каждого отдельно в системе. */
export function ensureChannels(): Promise<void> {
  if (!channelsReady) {
    channelsReady = (async () => {
      await notifee.createChannel({
        id: CHANNEL_MESSAGES,
        name: 'Сообщения',
        description: 'Новые сообщения в личных чатах и группах',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PRIVATE,
        sound: 'default',
        vibration: true,
        vibrationPattern: [80, 160],
        lights: true,
        lightColor: ACCENT,
        badge: true,
      });
      await notifee.createChannel({
        id: CHANNEL_TASKS,
        name: 'Задачи',
        description: 'Новые задачи, проверка и её итоги',
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PRIVATE,
        sound: 'default',
        vibration: true,
        // Длиннее и «двойная» — задачу легко отличить от сообщения по вибрации.
        vibrationPattern: [100, 450, 200, 450],
        lights: true,
        lightColor: '#F59E0B',
        badge: true,
      });
    })().catch((e) => {
      channelsReady = null;
      throw e;
    });
  }
  return channelsReady;
}

// ---------- Сообщения ----------

interface HistoryItem {
  id: number;
  text: string;
  ts: number;
  sender: string;
  avatar?: string;
}

function readHistory(raw: unknown): HistoryItem[] {
  try {
    const list = JSON.parse(String(raw || '[]'));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function showMessageNotification(m: MessagePush): Promise<void> {
  const settings = await getNotifySettings();
  if (!settings.messages) return;
  await ensureChannels();
  const id = chatNotificationId(m.chatId);
  const shown = (await notifee.getDisplayedNotifications()).find((n) => n.id === id);
  const history = readHistory(shown?.notification?.data?.history);
  if (history.some((h) => h.id === m.messageId)) return;
  const text = settings.preview ? m.text : 'Новое сообщение';
  const next = [...history, { id: m.messageId, text, ts: m.sentAt, sender: m.senderName, avatar: avatarUrl(m.senderAvatar) }].slice(-7);
  const conversation = m.isGroup ? (m.topicName ? `${m.chatName} › ${m.topicName}` : m.chatName) : m.chatName;

  await notifee.displayNotification({
    id,
    title: m.isGroup ? conversation : m.senderName,
    body: m.isGroup ? `${m.senderName}: ${text}` : text,
    data: {
      type: 'message',
      chat_id: m.chatId,
      chat_name: m.chatName,
      topic_id: m.topicId ? String(m.topicId) : '',
      last_message_id: String(m.messageId),
      history: JSON.stringify(next),
    },
    android: {
      channelId: CHANNEL_MESSAGES,
      smallIcon: 'ic_stat_offix',
      color: ACCENT,
      category: AndroidCategory.MESSAGE,
      groupId: GROUP_MESSAGES,
      timestamp: m.sentAt,
      showTimestamp: true,
      autoCancel: true,
      largeIcon: !m.isGroup ? avatarUrl(m.senderAvatar) : avatarUrl(m.chatAvatar),
      circularLargeIcon: true,
      style: {
        type: AndroidStyle.MESSAGING,
        person: { name: 'Вы' },
        title: m.isGroup ? conversation : undefined,
        group: m.isGroup,
        messages: next.map((h) => ({ text: h.text, timestamp: h.ts, person: { name: h.sender, icon: h.avatar } })),
      },
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: [
        { title: 'Ответить', pressAction: { id: 'reply' }, input: { placeholder: 'Сообщение…', allowFreeFormInput: true } },
        { title: 'Прочитано', pressAction: { id: 'read' } },
      ],
    },
  });
  await showGroupSummary(GROUP_MESSAGES, CHANNEL_MESSAGES, 'ic_stat_offix', ACCENT, 'Новые сообщения');
}

/** Убрать уведомление чата (прочитали здесь или на другом устройстве). */
export async function clearChatNotification(chatId: string | number): Promise<void> {
  await notifee.cancelNotification(chatNotificationId(chatId)).catch(() => undefined);
  await cleanupSummary(GROUP_MESSAGES);
}

// ---------- Задачи ----------

function taskActions(t: TaskPush): AndroidAction[] {
  const open: AndroidAction = { title: 'Открыть', pressAction: { id: 'default', launchActivity: 'default' } };
  switch (t.kind) {
    case 'assigned':
      return [{ title: 'Взять в работу', pressAction: { id: 'task_take' } }, open];
    case 'review':
      return [
        { title: 'Принять', pressAction: { id: 'task_accept' } },
        { title: 'Вернуть', pressAction: { id: 'task_reject' }, input: { placeholder: 'Что нужно исправить?', allowFreeFormInput: true } },
      ];
    case 'rejected':
    case 'returned':
      return [{ title: 'Взять в работу', pressAction: { id: 'task_take' } }, open];
    default:
      return [open];
  }
}

export async function showTaskNotification(t: TaskPush): Promise<void> {
  const settings = await getNotifySettings();
  if (!settings.tasks) return;
  await ensureChannels();
  const imp = IMPORTANCE[t.importance];
  const deadline = shortDeadline(t.deadline);
  const review = shortDeadline(t.reviewDeadline);
  const lines = [
    `<b>${escapeHtml(t.title)}</b>`,
    taskActorLine(t),
    deadline ? `Срок: ${deadline}` : '',
    review && (t.kind === 'assigned' || t.kind === 'review') ? `Проверка до: ${review}` : '',
    t.comment ? `«${escapeHtml(t.comment)}»` : '',
    t.kind === 'assigned' && t.description ? escapeHtml(t.description) : '',
  ].filter(Boolean);

  await notifee.displayNotification({
    id: taskNotificationId(t.taskId),
    title: `${TASK_KIND_TITLE[t.kind]}`,
    subtitle: imp.label,
    body: t.title,
    data: { type: 'task', task_id: String(t.taskId), kind: t.kind },
    android: {
      channelId: CHANNEL_TASKS,
      smallIcon: 'ic_stat_task',
      color: imp.color,
      category: AndroidCategory.REMINDER,
      groupId: GROUP_TASKS,
      timestamp: Date.now(),
      showTimestamp: true,
      autoCancel: true,
      largeIcon: avatarUrl(t.actorAvatar),
      circularLargeIcon: true,
      style: { type: AndroidStyle.BIGTEXT, text: lines.join('<br>') },
      pressAction: { id: 'default', launchActivity: 'default' },
      actions: taskActions(t),
    },
  });
  await showGroupSummary(GROUP_TASKS, CHANNEL_TASKS, 'ic_stat_task', '#D97706', 'Задачи');
}

export async function clearTaskNotification(taskId: number): Promise<void> {
  await notifee.cancelNotification(taskNotificationId(taskId)).catch(() => undefined);
  await cleanupSummary(GROUP_TASKS);
}

// ---------- Группы ----------

const summaryId = (groupId: string) => `${groupId}.summary`;

async function showGroupSummary(groupId: string, channelId: string, smallIcon: string, color: string, title: string) {
  await notifee.displayNotification({
    id: summaryId(groupId),
    title,
    android: {
      channelId,
      smallIcon,
      color,
      groupId,
      groupSummary: true,
      // Звук и вибрация — только у самих уведомлений, сводка молчит.
      groupAlertBehavior: AndroidGroupAlertBehavior.CHILDREN,
      onlyAlertOnce: true,
      autoCancel: true,
      pressAction: { id: 'default', launchActivity: 'default' },
    },
  });
}

async function cleanupSummary(groupId: string) {
  const left = (await notifee.getDisplayedNotifications()).filter(
    (n) => n.notification?.android?.groupId === groupId && n.id !== summaryId(groupId),
  );
  if (!left.length) await notifee.cancelNotification(summaryId(groupId)).catch(() => undefined);
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
