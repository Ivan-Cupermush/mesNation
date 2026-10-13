import { ApiError } from '../../services/http';

/**
 * Всплывающие уведомления в стиле приложения (вместо системных ToastAndroid
 * и окон «Ошибка»): тёмная «таблетка» со значком, как в Telegram. Показывает
 * их ToastHost в корне приложения.
 *
 *   showToast('Ссылка скопирована')          — короткое подтверждение
 *   toast.success('Сохранено')
 *   toast.error(e, 'Не удалось сохранить')    — ошибка: заголовок и текст
 *   toast.info('Запрос уже отправлен')
 */

export type ToastKind = 'success' | 'error' | 'info' | 'offline' | 'online';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  title?: string;
  message: string;
  /** Сколько показывать, мс. */
  duration: number;
  action?: { label: string; onPress: () => void };
}

type Listener = (t: ToastItem) => void;
/**
 * Куда показывать: корень приложения и каждое открытое окно (Modal) —
 * «слоты». Уведомление уходит в самый верхний, иначе под окном его не видно.
 */
const slots: { id: number; listener: Listener }[] = [];
let seq = 0;
let slotSeq = 0;

export function onToast(l: Listener): () => void {
  const id = ++slotSeq;
  slots.push({ id, listener: l });
  return () => {
    const i = slots.findIndex((x) => x.id === id);
    if (i >= 0) slots.splice(i, 1);
  };
}

function push(kind: ToastKind, message: string, opts: { title?: string; duration?: number; action?: ToastItem['action'] } = {}) {
  const text = (message || '').trim();
  if (!text && !opts.title) return;
  const item: ToastItem = {
    id: ++seq,
    kind,
    title: opts.title,
    message: text,
    duration: opts.duration ?? (kind === 'error' ? 4500 : Math.min(5000, 2200 + text.length * 25)),
    action: opts.action,
  };
  slots[slots.length - 1]?.listener(item);
}

/** Текст ошибки для человека: сообщение сервера или запасной вариант. */
export function errorMessage(e: unknown, fallback = 'Что-то пошло не так'): string {
  if (e instanceof ApiError) return e.status === 0 ? 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.' : e.message || fallback;
  if (typeof e === 'string') return e || fallback;
  const m = (e as any)?.message;
  return typeof m === 'string' && m ? m : fallback;
}

/** Короткое подтверждение действия. */
export function showToast(message: string) {
  push('success', message);
}

/** Получилось: заголовок и пояснение («Сотрудник добавлен» — «ivan, роль Менеджер»). */
export function showSuccess(message: string, title?: string) {
  push('success', message, { title });
}

/** К сведению: «Чат удалён», «Запрос уже отправлен». */
export function showInfo(message: string, title?: string) {
  push('info', message, { title });
}

export const toast = {
  success: (message: string) => push('success', message),
  info: (message: string, opts?: { title?: string; action?: ToastItem['action'] }) => push('info', message, opts),
  /** Ошибка: заголовок — что не получилось, текст — почему. */
  error: (e: unknown, title?: string) => push('error', errorMessage(e, title || 'Что-то пошло не так'), { title: title && errorMessage(e, '') ? title : undefined }),
  offline: (message: string) => push('offline', message, { duration: 3000 }),
  online: (message: string) => push('online', message, { duration: 2200 }),
};

/**
 * Замена окна Alert.alert('Ошибка', текст) с одной кнопкой «OK»: то же
 * сообщение, но в виде аккуратного уведомления, которое само исчезнет.
 */
export function showError(message: unknown, title?: string) {
  const text = errorMessage(message, '');
  if (!text && title) push('error', title);
  else push('error', text || 'Что-то пошло не так', { title: title && title !== 'Ошибка' ? title : undefined });
}
