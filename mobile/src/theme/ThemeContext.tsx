import React, { createContext, useState, useContext, useEffect, useMemo, ReactNode, useCallback } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PALETTES, buildColors, ThemeMode, ThemePreference, PaletteId, PaletteColors } from './palettes';
import { setRuntimeColors } from './runtime';

/**
 * Настройки оформления: режим (светлая / тёмная / как в системе), цвет
 * акцента и размер текста сообщений. Сохраняются на устройстве.
 * `version` меняется при каждой смене цветов — по нему корень приложения
 * перерисовывает интерфейс (см. App.tsx).
 */

interface ThemeContextValue {
  preference: ThemePreference;
  mode: ThemeMode;
  paletteId: PaletteId;
  colors: PaletteColors;
  isDark: boolean;
  messageFontSize: number;
  version: string;
  ready: boolean;
  setPreference: (p: ThemePreference) => void;
  /** Совместимость со старым API. */
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setPalette: (id: PaletteId) => void;
  setMessageFontSize: (size: number) => void;
}

const KEY_PREF = '@offix/theme/preference';
const KEY_PALETTE = '@offix/theme/palette';
const KEY_FONT = '@offix/theme/messageFont';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [paletteId, setPaletteState] = useState<PaletteId>('emerald');
  const [messageFontSize, setFontState] = useState(16);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pref, pal, font] = await Promise.all([
          AsyncStorage.getItem(KEY_PREF),
          AsyncStorage.getItem(KEY_PALETTE),
          AsyncStorage.getItem(KEY_FONT),
        ]);
        if (pref === 'light' || pref === 'dark' || pref === 'system') setPreferenceState(pref);
        if (pal && PALETTES.some((p) => p.id === pal)) setPaletteState(pal as PaletteId);
        const f = Number(font);
        if (f >= 13 && f <= 22) setFontState(f);
      } catch {
        // настройки по умолчанию
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const mode: ThemeMode = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
  const colors = useMemo(() => buildColors(paletteId, mode), [paletteId, mode]);
  // Синхронно до отрисовки детей: themed()-стили и T берут цвета отсюда.
  setRuntimeColors(colors);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    AsyncStorage.setItem(KEY_PREF, p).catch(() => undefined);
  }, []);
  const setPalette = useCallback((id: PaletteId) => {
    setPaletteState(id);
    AsyncStorage.setItem(KEY_PALETTE, id).catch(() => undefined);
  }, []);
  const setMessageFontSize = useCallback((size: number) => {
    setFontState(size);
    AsyncStorage.setItem(KEY_FONT, String(size)).catch(() => undefined);
  }, []);

  const value: ThemeContextValue = {
    preference,
    mode,
    paletteId,
    colors,
    isDark: mode === 'dark',
    messageFontSize,
    version: `${paletteId}-${mode}`,
    ready,
    setPreference,
    setMode: setPreference,
    toggleMode: () => setPreference(mode === 'light' ? 'dark' : 'light'),
    setPalette,
    setMessageFontSize,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

export { PALETTES };
