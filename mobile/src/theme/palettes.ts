/**
 * Палитры приложения. Итоговые цвета = режим (светлая / тёмная) ×
 * цвет акцента (как «Цвет темы» в Telegram). Все экраны берут цвета
 * только отсюда, поэтому смена темы перекрашивает приложение целиком.
 */

export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';
export type PaletteId = 'emerald' | 'blue' | 'violet' | 'teal' | 'orange' | 'pink' | 'graphite';

export interface PaletteColors {
  // Поверхности
  background: string; // фон экранов
  surface: string; // карточки (старое имя)
  card: string; // карточки
  surfaceHover: string;
  surfaceActive: string;
  elevated: string; // модальные окна, шторки
  inputBg: string; // поля ввода, чипы, неактивные кнопки
  disabled: string;
  border: string;
  divider: string;
  overlay: string;
  // Текст
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverse: string;
  // Акцент
  accent: string;
  accentHover: string;
  accentMuted: string;
  onAccent: string;
  // Смысловые цвета
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
  // Мессенджер
  chatBg: string;
  myMessageBubble: string;
  otherMessageBubble: string;
  myMessageText: string;
  otherMessageText: string;
  myMessageMuted: string;
  readTick: string;
  // Навигация
  tabBar: string;
  tabBarIcon: string;
  tabBarIconActive: string;
  header: string;
  shadow: string;
  statusBar: 'light-content' | 'dark-content';
}

export interface Palette {
  id: PaletteId;
  name: string;
  /** Акцент для светлой и тёмной темы (в тёмной — светлее, чтобы читался). */
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

// ---------- Работа с цветом ----------

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
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

// ---------- Сборка палитры ----------

const LIGHT = {
  background: '#F6F6F3',
  card: '#FFFFFF',
  inputBg: '#F1F2EF',
  surfaceActive: '#E7E8E4',
  border: '#E6E6E1',
  textPrimary: '#141414',
  textSecondary: '#62656B',
  textMuted: '#9EA1A8',
};

const DARK = {
  background: '#0F1114',
  card: '#1A1D21',
  inputBg: '#24282D',
  surfaceActive: '#2E3339',
  border: '#2C3036',
  textPrimary: '#ECEEF1',
  textSecondary: '#A4AAB2',
  textMuted: '#6D747D',
};

export function buildColors(paletteId: PaletteId, mode: ThemeMode): PaletteColors {
  const p = getPalette(paletteId);
  const accent = mode === 'dark' ? p.dark : p.light;
  if (mode === 'light') {
    const n = LIGHT;
    return {
      background: n.background,
      surface: n.card,
      card: n.card,
      surfaceHover: n.inputBg,
      surfaceActive: n.surfaceActive,
      elevated: n.card,
      inputBg: n.inputBg,
      disabled: '#C9CCD1',
      border: n.border,
      divider: n.border,
      overlay: 'rgba(0,0,0,0.42)',
      textPrimary: n.textPrimary,
      textSecondary: n.textSecondary,
      textMuted: n.textMuted,
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
      otherMessageText: n.textPrimary,
      myMessageMuted: 'rgba(255,255,255,0.75)',
      readTick: mix(accent, '#FFFFFF', 0.6),
      tabBar: n.card,
      tabBarIcon: n.textMuted,
      tabBarIconActive: accent,
      header: n.card,
      shadow: '#000000',
      statusBar: 'dark-content',
    };
  }
  const n = DARK;
  return {
    background: n.background,
    surface: n.card,
    card: n.card,
    surfaceHover: n.inputBg,
    surfaceActive: n.surfaceActive,
    elevated: '#202429',
    inputBg: n.inputBg,
    disabled: '#3A3F46',
    border: n.border,
    divider: n.border,
    overlay: 'rgba(0,0,0,0.6)',
    textPrimary: n.textPrimary,
    textSecondary: n.textSecondary,
    textMuted: n.textMuted,
    textInverse: '#0F1114',
    accent,
    accentHover: mix(accent, '#FFFFFF', 0.15),
    accentMuted: mix(accent, n.card, 0.78),
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
    otherMessageBubble: n.card,
    myMessageText: '#FFFFFF',
    otherMessageText: n.textPrimary,
    myMessageMuted: 'rgba(255,255,255,0.7)',
    readTick: mix(accent, '#FFFFFF', 0.45),
    tabBar: '#15181B',
    tabBarIcon: n.textMuted,
    tabBarIconActive: accent,
    header: n.card,
    shadow: '#000000',
    statusBar: 'light-content',
  };
}

export const getPalette = (id: PaletteId): Palette => PALETTES.find((p) => p.id === id) || PALETTES[0];
