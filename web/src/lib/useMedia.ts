import { useSyncExternalStore } from 'react';

/** Состояние медиа-запроса CSS, обновляется при изменении размера окна. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Телефон: нижние вкладки, экраны во весь размер, шторки вместо окон. */
export const MOBILE_QUERY = '(max-width: 768px)';
export const useIsMobile = () => useMedia(MOBILE_QUERY);

/** Широкий экран: список и открытый элемент рядом (чаты, задачи). */
export const useIsWide = () => useMedia('(min-width: 1100px)');
