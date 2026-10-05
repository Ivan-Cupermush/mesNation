import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { BUBBLE_RADIUS_RANGE, FONT_RANGE, PALETTES, buildColors, cssVarName, type PaletteColors, type PaletteId, type ThemeMode, type ThemePreference } from './palettes';
import { storage } from '../lib/storage';

/**
 * Оформление сайта — как «Оформление» в приложении: светлая / тёмная / как в системе,
 * цвет акцента, размер текста и скругление сообщений, Enter для отправки.
 * Цвета попадают в CSS-переменные --c-* на <html>, поэтому смена темы
 * перекрашивает весь сайт без перерисовки компонентов.
 */

interface ThemeSettings {
  preference: ThemePreference;
  paletteId: PaletteId;
  messageFontSize: number;
  bubbleRadius: number;
  sendByEnter: boolean;
}

interface ThemeContextValue extends ThemeSettings {
  mode: ThemeMode;
  isDark: boolean;
  colors: PaletteColors;
  setPreference: (p: ThemePreference) => void;
  setPalette: (id: PaletteId) => void;
  setMessageFontSize: (size: number) => void;
  setBubbleRadius: (r: number) => void;
  setSendByEnter: (v: boolean) => void;
}

const KEY = 'offix.theme';
const DEFAULTS: ThemeSettings = {
  preference: 'system',
  paletteId: 'emerald',
  messageFontSize: FONT_RANGE.default,
  bubbleRadius: BUBBLE_RADIUS_RANGE.default,
  // На компьютере привычно: Enter — отправить, Shift+Enter — новая строка.
  sendByEnter: true,
};

function loadSettings(): ThemeSettings {
  const raw = storage.getJSON<Partial<ThemeSettings>>(KEY) || {};
  const clamp = (v: unknown, r: { min: number; max: number; default: number }) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= r.min && n <= r.max ? n : r.default;
  };
  return {
    preference: raw.preference === 'light' || raw.preference === 'dark' ? raw.preference : 'system',
    paletteId: PALETTES.some((p) => p.id === raw.paletteId) ? (raw.paletteId as PaletteId) : DEFAULTS.paletteId,
    messageFontSize: clamp(raw.messageFontSize, FONT_RANGE),
    bubbleRadius: clamp(raw.bubbleRadius, BUBBLE_RADIUS_RANGE),
    sendByEnter: typeof raw.sendByEnter === 'boolean' ? raw.sendByEnter : DEFAULTS.sendByEnter,
  };
}

function useSystemDark(): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mql = window.matchMedia?.(query);
    if (!mql) return;
    const onChange = () => setDark(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return dark;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ThemeSettings>(loadSettings);
  const systemDark = useSystemDark();
  const mode: ThemeMode = settings.preference === 'system' ? (systemDark ? 'dark' : 'light') : settings.preference;
  const colors = useMemo(() => buildColors(settings.paletteId, mode), [settings.paletteId, mode]);

  // До отрисовки кадра, чтобы не мигала светлая тема у тех, кто выбрал тёмную.
  useLayoutEffect(() => {
    const root = document.documentElement;
    for (const [key, value] of Object.entries(colors)) root.style.setProperty(cssVarName(key), value);
    root.style.setProperty('--msg-font-size', `${settings.messageFontSize}px`);
    root.style.setProperty('--bubble-radius', `${settings.bubbleRadius}px`);
    root.style.colorScheme = mode;
    root.dataset.theme = mode;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', colors.card);
  }, [colors, mode, settings.messageFontSize, settings.bubbleRadius]);

  const update = useCallback((patch: Partial<ThemeSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      storage.setJSON(KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      ...settings,
      mode,
      isDark: mode === 'dark',
      colors,
      setPreference: (preference) => update({ preference }),
      setPalette: (paletteId) => update({ paletteId }),
      setMessageFontSize: (messageFontSize) => update({ messageFontSize }),
      setBubbleRadius: (bubbleRadius) => update({ bubbleRadius }),
      setSendByEnter: (sendByEnter) => update({ sendByEnter }),
    }),
    [settings, mode, colors, update],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme вне ThemeProvider');
  return ctx;
}
