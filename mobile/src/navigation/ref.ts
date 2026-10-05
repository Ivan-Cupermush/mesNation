import { createNavigationContainerRef } from '@react-navigation/native';

/**
 * Навигация вне экранов: переход из уведомления в чат или задачу.
 * Пока навигатор не готов (холодный старт по нажатию на уведомление),
 * переход откладывается и выполняется, как только он появится.
 */
export const navigationRef = createNavigationContainerRef<any>();

let pending: (() => void) | null = null;

export function navigateWhenReady(go: () => void) {
  if (navigationRef.isReady()) go();
  else pending = go;
}

/** Вызывается из NavigationContainer.onReady. */
export function flushPendingNavigation() {
  const go = pending;
  pending = null;
  go?.();
}

export function openChat(params: { chatId: string; chatName?: string; topicId?: number | null }) {
  navigateWhenReady(() =>
    navigationRef.navigate('ChatTab', {
      screen: 'Chat',
      initial: false,
      params: { chatId: String(params.chatId), chatName: params.chatName, ...(params.topicId ? { topicId: params.topicId } : {}) },
    }),
  );
}

export function openTask(taskId: number) {
  navigateWhenReady(() => navigationRef.navigate('TasksTab', { screen: 'TaskDetail', initial: false, params: { taskId } }));
}
