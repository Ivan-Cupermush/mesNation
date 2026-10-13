import AsyncStorage from '@react-native-async-storage/async-storage';
import type { PaletteId } from '../../theme/palettes';

/** Темы QR-кода, как в Telegram: фон-градиент и цвет точек. */
export interface QrTheme {
  id: string;
  name: string;
  /** Фон экрана и карточки-постера: три точки градиента. */
  bg: [string, string, string];
  /** Точки QR-кода. */
  dots: [string, string];
}

export const QR_THEMES: QrTheme[] = [
  { id: 'emerald', name: 'Изумруд', bg: ['#0E5A3B', '#1F9A65', '#7FD8A6'], dots: ['#14714A', '#2BAE73'] },
  { id: 'sky', name: 'Небо', bg: ['#1A4FB5', '#2F80ED', '#7CC4FA'], dots: ['#1F5FCC', '#3B9BF2'] },
  { id: 'amethyst', name: 'Аметист', bg: ['#3F2A9E', '#7357E8', '#C7A8FF'], dots: ['#5536D4', '#9B6BF0'] },
  { id: 'lagoon', name: 'Лагуна', bg: ['#075E66', '#0F8C96', '#69D7D3'], dots: ['#0A6F78', '#17A6A8'] },
  { id: 'sunset', name: 'Закат', bg: ['#A33A12', '#E46A2B', '#FFC27A'], dots: ['#C2501C', '#EC8A3A'] },
  { id: 'garnet', name: 'Гранат', bg: ['#7E1740', '#C9346C', '#F7A1C0'], dots: ['#A3245A', '#D9467E'] },
  { id: 'night', name: 'Ночь', bg: ['#10141B', '#263140', '#4B5D73'], dots: ['#1E2733', '#3E4F63'] },
];

const KEY = '@offix/qr/theme';

const BY_PALETTE: Record<PaletteId, string> = {
  emerald: 'emerald',
  blue: 'sky',
  violet: 'amethyst',
  teal: 'lagoon',
  orange: 'sunset',
  pink: 'garnet',
  graphite: 'night',
};

export const qrTheme = (id: string | null | undefined) => QR_THEMES.find((t) => t.id === id) || QR_THEMES[0];

/** Выбранная тема; по умолчанию — под цвет оформления приложения. */
export async function loadQrTheme(palette: PaletteId): Promise<QrTheme> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) return qrTheme(saved);
  } catch {
    // нет хранилища — тема по оформлению
  }
  return qrTheme(BY_PALETTE[palette]);
}

export function saveQrTheme(id: string) {
  AsyncStorage.setItem(KEY, id).catch(() => undefined);
}
