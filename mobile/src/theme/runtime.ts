import { StyleSheet } from 'react-native';
import { buildColors, PaletteColors } from './palettes';

/**
 * Текущие цвета темы, доступные из любого места без хуков.
 *
 * - `T.accent` — цвет текущей темы (читается в момент отрисовки);
 * - `themed(() => ({ ... }))` — замена StyleSheet.create: стили создаются
 *   под текущую тему при первом обращении и кешируются для каждой темы.
 *
 * При смене темы ThemeProvider обновляет цвета здесь и перерисовывает
 * интерфейс целиком (с сохранением открытых экранов), поэтому экраны
 * сразу видят новые цвета.
 */

let current: PaletteColors = buildColors('emerald', 'light');

export function setRuntimeColors(colors: PaletteColors) {
  current = colors;
}

export function getRuntimeColors(): PaletteColors {
  return current;
}

export const T: PaletteColors = new Proxy({} as PaletteColors, {
  get: (_target, key) => (current as any)[key],
});

export function themed<S extends StyleSheet.NamedStyles<S> | StyleSheet.NamedStyles<any>>(factory: () => S): S {
  const cache = new Map<PaletteColors, S>();
  const resolve = (): S => {
    let styles = cache.get(current);
    if (!styles) {
      styles = StyleSheet.create(factory() as any) as S;
      cache.set(current, styles);
    }
    return styles;
  };
  return new Proxy({} as S, {
    get: (_target, key) => (resolve() as any)[key],
    ownKeys: () => Reflect.ownKeys(resolve() as object),
    getOwnPropertyDescriptor: (_target, key) => ({ enumerable: true, configurable: true, value: (resolve() as any)[key] }),
  });
}
