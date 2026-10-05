import { useSyncExternalStore } from 'react';
import { storage } from '../../lib/storage';

/** Что присылать уведомлениями браузера — как «Уведомления» в приложении. Хранится в этом браузере. */
export interface NotifySettings {
  messages: boolean;
  tasks: boolean;
  /** Показывать текст сообщения (иначе — «Новое сообщение»). */
  preview: boolean;
}

const KEY = 'offix.notify';
const DEFAULTS: NotifySettings = { messages: true, tasks: true, preview: true };
const listeners = new Set<() => void>();

let cache: NotifySettings = { ...DEFAULTS, ...(storage.getJSON<Partial<NotifySettings>>(KEY) || {}) };

export function getNotifySettings(): NotifySettings {
  return cache;
}

export function setNotifySettings(patch: Partial<NotifySettings>) {
  cache = { ...cache, ...patch };
  storage.setJSON(KEY, cache);
  listeners.forEach((l) => l());
}

export function useNotifySettings(): NotifySettings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cache,
  );
}
