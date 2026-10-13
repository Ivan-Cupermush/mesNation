import { createNavigationContainerRef, StackActions } from '@react-navigation/native';

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

/**
 * Колокольчик и экран запроса открываются поверх вкладок — перед переходом
 * в чат, задачу или заметку их нужно закрыть, иначе переход случится «под» ними.
 */
export function toMain() {
  const st = navigationRef.getRootState();
  if (st && st.routes.length > 1 && st.routes[st.index]?.name !== 'Main') navigationRef.dispatch(StackActions.popToTop());
}

/** Вызывается из NavigationContainer.onReady. */
export function flushPendingNavigation() {
  const go = pending;
  pending = null;
  go?.();
}

export function openChat(params: { chatId: string; chatName?: string; topicId?: number | null }) {
  navigateWhenReady(() => {
    toMain();
    navigationRef.navigate('ChatTab', {
      screen: 'Chat',
      initial: false,
      params: { chatId: String(params.chatId), chatName: params.chatName, ...(params.topicId ? { topicId: params.topicId } : {}) },
    });
  });
}

export function openTask(taskId: number) {
  navigateWhenReady(() => {
    toMain();
    navigationRef.navigate('TasksTab', { screen: 'TaskDetail', initial: false, params: { taskId } });
  });
}

/** Экран подтверждения «поделиться текущей версией заметки». */
export function openNoteRequest(requestId: number) {
  navigateWhenReady(() => navigationRef.navigate('NoteRequest', { requestId }));
}

/** Заметка из своих заметок (например, полученная новая версия). */
export function openNote(noteId: number) {
  navigateWhenReady(() => {
    toMain();
    navigationRef.navigate('NotesTab', { screen: 'NoteEditor', initial: false, params: { noteId } });
  });
}

export function openNotifications() {
  navigateWhenReady(() => navigationRef.navigate('Notifications'));
}

/** Профиль сотрудника (из QR-кода, ссылки /u/логин, уведомления). */
export function openUserProfile(userId: number) {
  navigateWhenReady(() => {
    toMain();
    navigationRef.navigate('ChatTab', { screen: 'UserProfile', initial: false, params: { userId } });
  });
}

/** QR-код профиля: свой (без userId) или коллеги. */
export function openQrProfile(userId?: number) {
  navigateWhenReady(() => navigationRef.navigate('QrProfile', userId ? { userId } : {}));
}

export function openQrScanner() {
  navigateWhenReady(() => navigationRef.navigate('QrScanner'));
}

/** Подтверждение входа на сайт по QR-коду. */
export function openQrLogin(token: string) {
  navigateWhenReady(() => navigationRef.navigate('QrLogin', { token }));
}

/** «Отправить в…» — с Offix поделились из другого приложения. */
export function openShareTarget(share: unknown) {
  navigateWhenReady(() => navigationRef.navigate('ShareTarget', { share }));
}
