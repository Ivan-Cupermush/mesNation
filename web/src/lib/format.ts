/** Форматирование дат, размеров, имён — так же, как в приложении (chatUtils.ts). */

const AVATAR_COLORS = ['#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#0EA5E9', '#14B8A6', '#EF4444'];

export const hashColor = (s: string | null | undefined) => {
  const sum = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

export const initials = (name: string | null | undefined) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const displayName = (u: { display_name?: string | null; username?: string | null } | null | undefined) =>
  (u && (u.display_name || u.username)) || 'Пользователь';

export const formatTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

/** Время в списке чатов: сегодня — часы, на неделе — день недели, иначе дата. */
export const listTime = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return formatTime(iso);
  const diffDays = (now.getTime() - d.getTime()) / 86400000;
  if (diffDays < 6) return d.toLocaleDateString('ru-RU', { weekday: 'short' });
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: d.getFullYear() === now.getFullYear() ? undefined : '2-digit' });
};

export const formatDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const date = d.toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
  return withTime ? `${date}, ${formatTime(iso)}` : date;
};

export const formatDuration = (sec?: number | string | null) => {
  const s = Math.max(0, Math.round(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

export const formatSize = (bytes?: number | string | null) => {
  const b = Number(bytes) || 0;
  if (!b) return '';
  if (b < 1024) return `${b} Б`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} КБ`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} МБ`;
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} ГБ`;
};

/** plural(5, ['голос', 'голоса', 'голосов']) */
export const plural = (n: number, forms: [string, string, string]) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
};

export const lastSeenLabel = (iso?: string | null) => {
  if (!iso) return 'был(а) давно';
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'был(а) только что';
  if (diff < 3600) {
    const m = Math.floor(diff / 60);
    return `был(а) ${m} ${plural(m, ['минуту', 'минуты', 'минут'])} назад`;
  }
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const time = formatTime(iso);
  if (d.toDateString() === today.toDateString()) return `был(а) сегодня в ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `был(а) вчера в ${time}`;
  return `был(а) ${d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;
};

export const dayLabel = (d: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString('ru-RU', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Значок файла по расширению (как в Telegram). */
export function fileBadge(name?: string | null): { ext: string; color: string } {
  const ext = (String(name || '').split('.').pop() || '').toLowerCase();
  const pick = (color: string) => ({ ext: ext.slice(0, 4).toUpperCase(), color });
  if (ext === 'pdf') return pick('#E5484D');
  if (['doc', 'docx', 'rtf', 'odt', 'txt', 'md'].includes(ext)) return pick('#3E7BFA');
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return pick('#2FA36B');
  if (['ppt', 'pptx', 'key', 'odp'].includes(ext)) return pick('#F08C2E');
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return pick('#8E6CEF');
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return pick('#E0559B');
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'mp4', 'mov', 'avi', 'mkv'].includes(ext)) return pick('#1FA3B3');
  return { ext: ext && ext.length <= 4 ? ext.toUpperCase() : '', color: '#7A8591' };
}

/** Локальная дата YYYY-MM-DD (без сдвига часового пояса, в отличие от toISOString). */
export const toDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const toMonthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/** Сообщение об ошибке для пользователя. */
export const errorText = (e: unknown, fallback = 'Что-то пошло не так') =>
  (e instanceof Error && e.message) || (typeof e === 'string' && e) || fallback;
