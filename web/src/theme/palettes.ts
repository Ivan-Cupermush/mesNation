/**
 * Палитры — те же, что в мобильном приложении (mobile/src/theme/palettes.ts):
 * итоговые цвета = режим (светлая / тёмная) × цвет акцента.
 * На сайте они превращаются в CSS-переменные --c-* (см. ThemeProvider).
 */

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';
export type PaletteId = 'emerald' | 'blue' | 'violet' | 'teal' | 'orange' | 'pink' | 'graphite';

export interface PaletteColors {
  background: string;
  card: string;
  surfaceActive: string;
  elevated: string;
  inputBg: string;
  disabled: string;
  border: string;
  overlay: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  accent: string;
  accentHover: string;
  accentMuted: string;
  onAccent: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;
  violet: string;
  violetSoft: string;
  chatBg: string;
  myMessageBubble: string;
  otherMessageBubble: string;
  myMessageText: string;
  otherMessageText: string;
  myMessageMuted: string;
  readTick: string;
  tabBar: string;
}

export interface Palette {
  id: PaletteId;
  name: string;
  light: string;
  dark: string;
}

export const PALETTES: Palette[] = [
  { id: 'emerald', name: 'Изумруд', light: '#1F7A52', dark: '#3DBB7E' },
  { id: 'blue', name: 'Небо', light: '#2F80ED', dark: '#5AA6F5' },
  { id: 'violet', name: 'Аметист', light: '#7357E8', dark: '#A48CFA' },
  { id: 'teal', name: 'Лагуна', light: '#0F8C96', dark: '#3CC6CF' },
  { id: 'orange', name: 'Закат', light: '#D9661E', dark: '#F49A55' },
  { id: 'pink', name: 'Гранат', light: '#C9346C', dark: '#F07AA5' },
  { id: 'graphite', name: 'Графит', light: '#3E4A57', dark: '#AAB6C3' },
];

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/** Смешивает два цвета: t = 0 → a, t = 1 → b. */
export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const getPalette = (id: PaletteId): Palette => PALETTES.find((p) => p.id === id) || PALETTES[0];

export function buildColors(paletteId: PaletteId, mode: ThemeMode): PaletteColors {
  const p = getPalette(paletteId);
  const accent = mode === 'dark' ? p.dark : p.light;
  if (mode === 'light') {
    return {
      background: '#F6F6F3',
      card: '#FFFFFF',
      surfaceActive: '#E7E8E4',
      elevated: '#FFFFFF',
      inputBg: '#F1F2EF',
      disabled: '#C9CCD1',
      border: '#E6E6E1',
      overlay: 'rgba(0,0,0,0.42)',
      textPrimary: '#141414',
      textSecondary: '#62656B',
      textMuted: '#9EA1A8',
      textInverse: '#FFFFFF',
      accent,
      accentHover: mix(accent, '#000000', 0.15),
      accentMuted: mix(accent, '#FFFFFF', 0.88),
      onAccent: '#FFFFFF',
      success: '#16A34A',
      successSoft: '#DCFCE7',
      warning: '#D97706',
      warningSoft: '#FEF3C7',
      danger: '#DC2626',
      dangerSoft: '#FEE2E2',
      info: '#2563EB',
      infoSoft: '#DBEAFE',
      violet: '#7C3AED',
      violetSoft: '#EDE9FE',
      chatBg: mix('#ECEFEA', accent, 0.06),
      myMessageBubble: accent,
      otherMessageBubble: '#FFFFFF',
      myMessageText: '#FFFFFF',
      otherMessageText: '#141414',
      myMessageMuted: 'rgba(255,255,255,0.75)',
      readTick: mix(accent, '#FFFFFF', 0.6),
      tabBar: '#FFFFFF',
    };
  }
  const card = '#1A1D21';
  return {
    background: '#0F1114',
    card,
    surfaceActive: '#2E3339',
    elevated: '#202429',
    inputBg: '#24282D',
    disabled: '#3A3F46',
    border: '#2C3036',
    overlay: 'rgba(0,0,0,0.6)',
    textPrimary: '#ECEEF1',
    textSecondary: '#A4AAB2',
    textMuted: '#6D747D',
    textInverse: '#0F1114',
    accent,
    accentHover: mix(accent, '#FFFFFF', 0.15),
    accentMuted: mix(accent, card, 0.78),
    onAccent: '#FFFFFF',
    success: '#3FCF7A',
    successSoft: '#163323',
    warning: '#F5B544',
    warningSoft: '#3A2D12',
    danger: '#F2706D',
    dangerSoft: '#3B1D1D',
    info: '#62A3F7',
    infoSoft: '#1A2B45',
    violet: '#B19BFB',
    violetSoft: '#2A2245',
    chatBg: mix('#0B0D10', accent, 0.05),
    myMessageBubble: mix(accent, '#000000', 0.32),
    otherMessageBubble: card,
    myMessageText: '#FFFFFF',
    otherMessageText: '#ECEEF1',
    myMessageMuted: 'rgba(255,255,255,0.7)',
    readTick: mix(accent, '#FFFFFF', 0.45),
    tabBar: '#15181B',
  };
}

/** accentMuted → --c-accent-muted */
export const cssVarName = (key: string) => `--c-${key.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}`;

/** Настройки «Оформления»: размер текста и скругление сообщений. */
export const BUBBLE_RADIUS_RANGE = { min: 4, max: 22, default: 18 };
export const FONT_RANGE = { min: 13, max: 22, default: 15 };
