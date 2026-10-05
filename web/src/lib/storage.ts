/**
 * localStorage, который не роняет сайт: в приватном режиме Safari, при
 * запрете cookies или переполнении хранилище бросает исключения.
 */
export const storage = {
  get(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // хранилище недоступно — настройка проживёт до перезагрузки страницы
    }
  },
  remove(key: string) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      // нечего удалять
    }
  },
  getJSON<T>(key: string): T | null {
    const raw = storage.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },
  setJSON(key: string, value: unknown) {
    storage.set(key, JSON.stringify(value));
  },
};
