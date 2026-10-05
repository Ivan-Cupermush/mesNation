import { api } from '../../lib/http';
import { isMuted } from './queries';

/** «Без звука» — те же варианты, что в приложении. */
export const MUTE_OPTIONS: { key: string; label: string; ms: number | null }[] = [
  { key: '1h', label: 'Без звука на 1 час', ms: 60 * 60 * 1000 },
  { key: '8h', label: 'Без звука на 8 часов', ms: 8 * 60 * 60 * 1000 },
  { key: '2d', label: 'Без звука на 2 дня', ms: 2 * 24 * 60 * 60 * 1000 },
  { key: 'forever', label: 'Отключить навсегда', ms: null },
];

const FOREVER = '2100-01-01T00:00:00.000Z';

export function muteLabel(mutedUntil?: string | null): string {
  if (!isMuted(mutedUntil)) return 'Включены';
  const d = new Date(mutedUntil!);
  if (d.getFullYear() >= 2099) return 'Выключены';
  const sameDay = d.toDateString() === new Date().toDateString();
  return `Выкл. до ${sameDay ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' '}${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

/** ms: длительность; null — навсегда; 0 — включить уведомления. */
export function setChatMute(chatId: number | string, ms: number | null | 0) {
  const until = ms === 0 ? null : ms === null ? FOREVER : new Date(Date.now() + ms).toISOString();
  return api.patch(`/api/chats/${chatId}/membership`, { muted_until: until });
}

export const setChatPinned = (chatId: number | string, pinned: boolean) => api.patch(`/api/chats/${chatId}/membership`, { pinned });

export const markChatRead = (chatId: number | string, messageId: number) => api.post(`/api/chats/${chatId}/read`, { message_id: messageId });

/** Личный чат — скрыть у себя; группа — удалить (владелец) или покинуть. */
export const removeChat = (chatId: number | string, leave = false) => api.delete(`/api/chats/${chatId}`, leave ? { leave: 'true' } : undefined);
