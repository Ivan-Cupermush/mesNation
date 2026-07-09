import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PALETTES, getPalette, ThemeMode, PaletteId, PaletteColors } from './palettes';

interface ThemeContextValue {
  mode: ThemeMode;
  paletteId: PaletteId;
  colors: PaletteColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
  setPalette: (id: PaletteId) => void;
}

const STORAGE_KEY_MODE = '@mesnation/themeMode';
const STORAGE_KEY_PALETTE = '@mesnation/palette';

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(systemScheme === 'dark' ? 'dark' : 'light');
  const [paletteId, setPaletteState] = useState<PaletteId>('linear');

  useEffect(() => {
    (async () => {
      try {
        const savedMode = await AsyncStorage.getItem(STORAGE_KEY_MODE);
        const savedPalette = await AsyncStorage.getItem(STORAGE_KEY_PALETTE);
        if (savedMode === 'light' || savedMode === 'dark') setModeState(savedMode);
        if (savedPalette && ['linear', 'telegram', 'notion', 'obsidian'].includes(savedPalette)) {
          setPaletteState(savedPalette as PaletteId);
        }
      } catch (e) {}
    })();
  }, []);

  const setMode = (m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(STORAGE_KEY_MODE, m).catch(() => {});
  };
  const toggleMode = () => setMode(mode === 'light' ? 'dark' : 'light');
  const setPalette = (id: PaletteId) => {
    setPaletteState(id);
    AsyncStorage.setItem(STORAGE_KEY_PALETTE, id).catch(() => {});
  };

  const palette = getPalette(paletteId);
  const colors = palette.colors[mode];
  const isDark = mode === 'dark';

  return (
    <ThemeContext.Provider value={{ mode, paletteId, colors, isDark, setMode, toggleMode, setPalette }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};

export { PALETTES };
