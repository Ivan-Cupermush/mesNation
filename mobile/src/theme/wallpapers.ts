import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RNFS from 'react-native-fs';
import { useEffect, useState } from 'react';

/**
 * Фоны чатов (как обои в Telegram): общий для всех чатов и свой для
 * отдельного чата. Встроенные — градиенты и узоры (рисуются векторно,
 * не занимают места), плюс своё фото из галереи (копируется в папку
 * приложения, чтобы не пропало, если удалить его из галереи).
 */

export type Wallpaper =
  | { type: 'none' }
  | { type: 'gradient'; id: string }
  | { type: 'pattern'; id: string; intensity?: number }
  | { type: 'image'; uri: string; dim?: number; blur?: boolean };

/** Насыщенность узора по умолчанию и пределы (доля непрозрачности рисунка). */
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

const KEY_GLOBAL = '@offix/wallpaper/global';
const keyChat = (chatId: string | number) => `@offix/wallpaper/chat/${chatId}`;
const DIR = `${RNFS.DocumentDirectoryPath}/wallpapers`;
const DEFAULT: Wallpaper = { type: 'pattern', id: 'doodles' };

// Подписки: экран чата перерисовывается, когда фон поменяли в настройках.
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function read(key: string): Promise<Wallpaper | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Wallpaper) : null;
  } catch {
    return null;
  }
}

export async function getGlobalWallpaper(): Promise<Wallpaper> {
  return (await read(KEY_GLOBAL)) || DEFAULT;
}

export async function getChatWallpaper(chatId: string | number): Promise<Wallpaper | null> {
  return read(keyChat(chatId));
}

/** Копирует выбранное фото в папку приложения и возвращает постоянный путь. */
export async function persistImage(uri: string): Promise<string> {
  await RNFS.mkdir(DIR).catch(() => undefined);
  const dest = `${DIR}/wp_${Date.now()}.jpg`;
  await RNFS.copyFile(uri, dest);
  return `file://${dest}`;
}

async function cleanupImage(prev: Wallpaper | null, next: Wallpaper | null) {
  if (prev?.type === 'image' && prev.uri !== (next as any)?.uri && prev.uri.includes('/wallpapers/')) {
    RNFS.unlink(prev.uri.replace('file://', '')).catch(() => undefined);
  }
}

export async function setGlobalWallpaper(wp: Wallpaper) {
  const prev = await read(KEY_GLOBAL);
  await AsyncStorage.setItem(KEY_GLOBAL, JSON.stringify(wp));
  await cleanupImage(prev, wp);
  notify();
}

/** null — вернуть общий фон. */
export async function setChatWallpaper(chatId: string | number, wp: Wallpaper | null) {
  const prev = await read(keyChat(chatId));
  if (wp) await AsyncStorage.setItem(keyChat(chatId), JSON.stringify(wp));
  else await AsyncStorage.removeItem(keyChat(chatId));
  await cleanupImage(prev, wp);
  notify();
}

/** Фон для чата: свой, если задан, иначе общий. */
export function useChatWallpaper(chatId?: string | number | null): { wallpaper: Wallpaper; custom: boolean } {
  const [state, setState] = useState<{ wallpaper: Wallpaper; custom: boolean }>({ wallpaper: DEFAULT, custom: false });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const own = chatId != null ? await getChatWallpaper(chatId) : null;
      const wp = own || (await getGlobalWallpaper());
      if (alive) setState({ wallpaper: wp, custom: !!own });
    };
    load();
    listeners.add(load);
    return () => {
      alive = false;
      listeners.delete(load);
    };
  }, [chatId]);
  return state;
}
