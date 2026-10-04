import { T } from '../../theme/runtime';
import type { PaletteColors } from '../../theme/palettes';
import { PermissionsAndroid, Platform } from 'react-native';

/**
 * Палитра мессенджера — берётся из текущей темы (светлая/тёмная,
 * цвет акцента), поэтому чат перекрашивается вместе с приложением.
 */
const MAP: Record<string, keyof PaletteColors> = {
  accent: 'accent',
  accentSoft: 'accentMuted',
  accentText: 'onAccent',
  bg: 'chatBg',
  bubbleIn: 'otherMessageBubble',
  bubbleOut: 'myMessageBubble',
  text: 'textPrimary',
  textMuted: 'textSecondary',
  textOutMuted: 'myMessageMuted',
  border: 'border',
  danger: 'danger',
  overlay: 'overlay',
  readTick: 'readTick',
  card: 'card',
  inputBg: 'inputBg',
  background: 'background',
};
export const C = new Proxy({} as Record<keyof typeof MAP, string>, {
  get: (_t, key: string) => (T as any)[MAP[key] ?? key],
});

const AVATAR_COLORS = ['#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#0EA5E9', '#14B8A6', '#EF4444'];

export const hashColor = (s: string) => {
  const sum = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

export const initials = (name: string) =>
  (name || '?')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

export const formatTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
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

/** Склонение: plural(5, ['голос', 'голоса', 'голосов']). */
export const plural = (n: number, forms: [string, string, string]) => {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
};

/** «был(а) 5 минут назад» — как в Telegram. */
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

export const isVisualMedia = (m: any) => m && !m.deleted_for_all && (m.media_kind === 'photo' || m.media_kind === 'video' || (!m.media_kind && !!m.thumb_url));

/** Короткое описание сообщения для цитат, закрепа и списка чатов. */
export const messagePreview = (m: any): string => {
  if (!m) return '';
  if (m.content_type === 'service') return m.text || '';
  if (m.poll_id || m.content_type === 'poll') return `📊 ${m.poll?.question || 'Опрос'}`;
  if (m.note_share_id || m.content_type === 'note') return m.text || '📝 Заметка';
  const caption = m.text ? ` ${m.text}` : '';
  if (m.media_kind === 'video') return `🎬 Видео${caption}`;
  if (m.media_kind === 'photo' || (!m.media_kind && m.thumb_url)) return `🖼 Фото${caption}`;
  if (m.file_url) return `📎 ${m.file_name || 'Файл'}${caption}`;
  return m.text || '';
};

/**
 * Права на чтение галереи. На Android 14+ пользователь может дать доступ
 * только к выбранным фото — это тоже считается успехом.
 */
export async function requestGalleryPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const api = Number(Platform.Version);
  if (api >= 33) {
    const perms = [PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES, PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO];
    if (api >= 34) perms.push('android.permission.READ_MEDIA_VISUAL_USER_SELECTED' as any);
    const res = await PermissionsAndroid.requestMultiple(perms);
    return Object.values(res).some((v) => v === PermissionsAndroid.RESULTS.GRANTED);
  }
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

export async function requestCameraPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

export async function requestSavePermission(): Promise<boolean> {
  if (Platform.OS !== 'android' || Number(Platform.Version) >= 29) return true;
  const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE);
  return res === PermissionsAndroid.RESULTS.GRANTED;
}

// ---------- Раскладка альбома ----------

export interface AlbumCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Раскладка альбома (упрощённая мозаика Telegram): одна картинка — по её
 * пропорциям; 2 — рядом (или друг под другом, если обе широкие); 3 — большая
 * слева + две справа; 4 — сетка 2×2; больше — строками по 2–3.
 */
export function albumLayout(ratios: number[], maxW: number, maxH: number, gap = 2): { cells: AlbumCell[]; width: number; height: number } {
  const n = ratios.length;
  const r = ratios.map((x) => (x > 0 && Number.isFinite(x) ? Math.min(Math.max(x, 0.4), 2.6) : 1));
  if (n === 1) {
    let w = maxW;
    let h = w / r[0];
    if (h > maxH) {
      h = maxH;
      w = Math.max(h * r[0], maxW * 0.55);
    }
    return { cells: [{ x: 0, y: 0, w, h }], width: w, height: h };
  }
  const W = maxW;
  if (n === 2) {
    if (r[0] > 1.2 && r[1] > 1.2) {
      const h0 = W / r[0];
      const h1 = W / r[1];
      return { cells: [{ x: 0, y: 0, w: W, h: h0 }, { x: 0, y: h0 + gap, w: W, h: h1 }], width: W, height: h0 + h1 + gap };
    }
    const h = Math.min(maxH, (W - gap) / (r[0] + r[1]));
    const w0 = h * r[0];
    return { cells: [{ x: 0, y: 0, w: w0, h }, { x: w0 + gap, y: 0, w: W - w0 - gap, h }], width: W, height: h };
  }
  if (n === 3) {
    const H = Math.min(maxH, W * 0.75);
    const leftW = Math.round(W * 0.62);
    const rightW = W - leftW - gap;
    const half = (H - gap) / 2;
    return {
      cells: [
        { x: 0, y: 0, w: leftW, h: H },
        { x: leftW + gap, y: 0, w: rightW, h: half },
        { x: leftW + gap, y: half + gap, w: rightW, h: half },
      ],
      width: W,
      height: H,
    };
  }
  // 4 и больше: строки по 2 (для 4) или по 3 с остатком из 2.
  const rows: number[] = [];
  if (n === 4) rows.push(2, 2);
  else {
    let left = n;
    while (left > 0) {
      if (left === 4) {
        rows.push(2, 2);
        left = 0;
      } else if (left === 2) {
        rows.push(2);
        left = 0;
      } else {
        rows.push(Math.min(3, left));
        left -= Math.min(3, left);
      }
    }
  }
  const cells: AlbumCell[] = [];
  let y = 0;
  for (const count of rows) {
    const rowH = Math.min(W / 2, (W - gap * (count - 1)) / count);
    const w = (W - gap * (count - 1)) / count;
    for (let k = 0; k < count; k++) {
      cells.push({ x: k * (w + gap), y, w, h: rowH });
    }
    y += rowH + gap;
  }
  return { cells, width: W, height: y - gap };
}
