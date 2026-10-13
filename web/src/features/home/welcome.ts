import { useSyncExternalStore } from 'react';

/**
 * Приветственная страница — не раздел меню: она встречает при входе на сайт,
 * а как только человек перешёл в любой раздел, исчезает до следующего входа
 * (адрес «/» дальше ведёт в задачи).
 */
let shown = true;
const listeners = new Set<() => void>();

export function dismissWelcome() {
  if (!shown) return;
  shown = false;
  listeners.forEach((l) => l());
}

export function useWelcomeShown(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => shown,
  );
}

/** Куда ведёт «/», когда приветствие уже показано. */
export const AFTER_WELCOME = '/tasks';
