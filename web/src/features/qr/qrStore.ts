import { useSyncExternalStore } from 'react';

/**
 * QR-окна открываются из любого места (профиль, меню контакта, шапка) и
 * рисуются одним хостом в оболочке приложения — как экраны поверх всего
 * в мобильном приложении.
 */

export type QrState = { kind: 'profile'; userId?: number } | { kind: 'scan' } | null;

let state: QrState = null;
const listeners = new Set<() => void>();

function set(next: QrState) {
  state = next;
  listeners.forEach((l) => l());
}

export const openQr = (userId?: number) => set({ kind: 'profile', userId });
export const openScanner = () => set({ kind: 'scan' });
export const closeQr = () => set(null);

export function useQrState(): QrState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
