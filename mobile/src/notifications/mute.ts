import { request } from '../services/http';
import { setChatMutedLocally } from './index';

/** «Без звука» для чата, как в Telegram. */
export const MUTE_OPTIONS: { key: string; label: string; ms: number | null }[] = [
  { key: '1h', label: 'Без звука на 1 час', ms: 60 * 60 * 1000 },
  { key: '8h', label: 'Без звука на 8 часов', ms: 8 * 60 * 60 * 1000 },
  { key: '2d', label: 'Без звука на 2 дня', ms: 2 * 24 * 60 * 60 * 1000 },
  { key: 'forever', label: 'Отключить навсегда', ms: null },
];

/** «Навсегда» — далёкая дата: сервер хранит просто момент окончания. */
const FOREVER = new Date('2100-01-01T00:00:00Z');

export const isMuted = (mutedUntil?: string | null) => !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();

export function muteLabel(mutedUntil?: string | null): string {
  if (!isMuted(mutedUntil)) return 'Включены';
  const d = new Date(mutedUntil!);
  if (d.getFullYear() >= 2099) return 'Выключены';
  const sameDay = d.toDateString() === new Date().toDateString();
  return `Выкл. до ${sameDay ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' '}${d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
}

/** ms: длительность; null — навсегда; 0 — включить уведомления. */
export async function setChatMute(chatId: string | number, ms: number | null | 0): Promise<string | null> {
  const until = ms === 0 ? null : ms === null ? FOREVER.toISOString() : new Date(Date.now() + ms).toISOString();
  await request(`/api/chats/${chatId}/membership`, { method: 'PATCH', body: { muted_until: until } });
  setChatMutedLocally(String(chatId), !!until);
  return until;
}
