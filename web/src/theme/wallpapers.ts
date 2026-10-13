import { useSyncExternalStore, type CSSProperties } from 'react';
import { storage } from '../lib/storage';

/**
 * Фоны чатов, как в приложении (mobile/src/theme/wallpapers.ts): общий для
 * всех чатов и свой для отдельного чата. Градиенты и узоры те же; своё фото
 * хранится в браузере уменьшенным.
 */

export type Wallpaper =
  | { type: 'none' }
  | { type: 'gradient'; id: string }
  | { type: 'pattern'; id: string; intensity?: number }
  | { type: 'image'; uri: string; dim?: number; blur?: boolean };

export const PATTERN_INTENSITY = { min: 0.03, max: 0.18, default: 0.07 };

export interface GradientDef {
  id: string;
  name: string;
  light: [string, string, string];
  dark: [string, string, string];
}

export const GRADIENTS: GradientDef[] = [
  { id: 'mint', name: 'Мята', light: ['#DDF3E4', '#C6E8D4', '#E8F4D9'], dark: ['#0F2A1F', '#14382A', '#1B2E1A'] },
  { id: 'sky', name: 'Небо', light: ['#DCEBFB', '#C9DFF7', '#E7E2FA'], dark: ['#0E1D33', '#152A47', '#1E1B3A'] },
  { id: 'peach', name: 'Персик', light: ['#FCE6D6', '#F9D7C6', '#FBE9C9'], dark: ['#33200F', '#3B2416', '#2E2410'] },
  { id: 'lavender', name: 'Лаванда', light: ['#EAE2FB', '#DCD3F7', '#F6DDEB'], dark: ['#211A38', '#2A1F45', '#33192C'] },
  { id: 'sand', name: 'Песок', light: ['#F3EDE1', '#ECE3D1', '#F4EFE6'], dark: ['#26221B', '#2D271E', '#221F1A'] },
  { id: 'aurora', name: 'Сияние', light: ['#D7F2EE', '#DDE7FA', '#EEDDF6'], dark: ['#0C2B2A', '#13203D', '#2A1638'] },
];

export const PATTERNS: { id: string; name: string; gradient: string }[] = [
  { id: 'doodles', name: 'Узор', gradient: 'mint' },
  { id: 'dots', name: 'Точки', gradient: 'sky' },
  { id: 'waves', name: 'Волны', gradient: 'lavender' },
  { id: 'grid', name: 'Сетка', gradient: 'sand' },
];

const KEY_GLOBAL = 'offix.wallpaper.global';
const keyChat = (chatId: string | number) => `offix.wallpaper.chat.${chatId}`;
const DEFAULT: Wallpaper = { type: 'pattern', id: 'doodles' };

const listeners = new Set<() => void>();
let version = 0;
const notify = () => {
  version++;
  listeners.forEach((l) => l());
};

export const getGlobalWallpaper = (): Wallpaper => storage.getJSON<Wallpaper>(KEY_GLOBAL) || DEFAULT;
export const getChatWallpaper = (chatId: string | number): Wallpaper | null => storage.getJSON<Wallpaper>(keyChat(chatId));

export function setGlobalWallpaper(wp: Wallpaper) {
  storage.set(KEY_GLOBAL, JSON.stringify(wp));
  notify();
}

/** null — вернуть общий фон. */
export function setChatWallpaper(chatId: string | number, wp: Wallpaper | null) {
  if (wp) storage.set(keyChat(chatId), JSON.stringify(wp));
  else storage.remove(keyChat(chatId));
  notify();
}

/** Фон для чата: свой, если задан, иначе общий. */
export function useChatWallpaper(chatId?: string | number | null): { wallpaper: Wallpaper; custom: boolean } {
  useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
  const own = chatId != null ? getChatWallpaper(chatId) : null;
  return { wallpaper: own || getGlobalWallpaper(), custom: !!own };
}

/** Своё фото: уменьшаем до 1600 px и храним как JPEG (в браузере мало места). */
export async function imageToWallpaper(file: File): Promise<Wallpaper> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    return { type: 'image', uri: c.toDataURL('image/jpeg', 0.82) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Отрисовка ----------

function patternSvg(id: string, color: string): string {
  const shapes =
    id === 'dots'
      ? `<g fill="${color}"><circle cx="8" cy="8" r="2.2"/><circle cx="38" cy="24" r="1.6"/><circle cx="20" cy="42" r="2"/><circle cx="52" cy="52" r="1.4"/></g>`
      : id === 'waves'
        ? `<g stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M0 16 Q 15 6 30 16 T 60 16"/><path d="M0 46 Q 15 36 30 46 T 60 46"/></g>`
        : id === 'grid'
          ? `<g stroke="${color}" stroke-width="1"><path d="M0 0 H60 M0 30 H60 M0 0 V60 M30 0 V60"/></g>`
          : `<g stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M6 10 h14 a4 4 0 0 1 4 4 v6 a4 4 0 0 1 -4 4 h-8 l-5 4 v-4 h-1 a4 4 0 0 1 -4 -4 v-6 a4 4 0 0 1 4 -4 z"/><path d="M44 8 l2.5 5 5.5 .8 -4 3.9 .9 5.5 -4.9 -2.6 -4.9 2.6 .9 -5.5 -4 -3.9 5.5 -.8 z"/><path d="M10 46 l5 5 10 -10"/><circle cx="48" cy="46" r="6"/><path d="M30 30 h6 M33 27 v6"/></g>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">${shapes}</svg>`)}")`;
}

/** CSS фона: градиент, узор поверх градиента или своё фото с затемнением. */
export function wallpaperStyle(wp: Wallpaper, isDark: boolean): CSSProperties {
  if (wp.type === 'none') return { background: 'var(--c-chat-bg)' };
  if (wp.type === 'image') {
    const dim = wp.dim ?? (isDark ? 0.4 : 0);
    return {
      backgroundImage: `linear-gradient(rgba(0,0,0,${dim}), rgba(0,0,0,${dim})), url("${wp.uri}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  const patternId = wp.type === 'pattern' ? wp.id : null;
  const gradId = wp.type === 'gradient' ? wp.id : PATTERNS.find((p) => p.id === patternId)?.gradient || 'mint';
  const g = GRADIENTS.find((x) => x.id === gradId) || GRADIENTS[0];
  const [a, b, c] = isDark ? g.dark : g.light;
  const gradient = `linear-gradient(135deg, ${a} 0%, ${b} 55%, ${c} 100%)`;
  if (!patternId) return { backgroundImage: gradient };
  const intensity = wp.type === 'pattern' ? wp.intensity ?? PATTERN_INTENSITY.default : PATTERN_INTENSITY.default;
  const ink = isDark ? `rgba(255,255,255,${intensity})` : `rgba(0,0,0,${intensity})`;
  return { backgroundImage: `${patternSvg(patternId, ink)}, ${gradient}`, backgroundSize: '60px 60px, cover' };
}
