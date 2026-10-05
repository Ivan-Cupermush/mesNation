import * as RNFS from 'react-native-fs';
import * as Keychain from 'react-native-keychain';
import { SERVER_URL } from '../config';

/**
 * Единый HTTP-клиент приложения. Все запросы к серверу идут через него:
 * - токен берётся из памяти (с диска читается один раз);
 * - таймаут, чтобы экран не висел вечно на плохой сети;
 * - 401 от сервера (истёк/отозван токен, сотрудник деактивирован) —
 *   единое событие, по которому приложение выходит на экран входа;
 * - ошибки приходят как ApiError с понятным текстом и HTTP-статусом.
 */

// Раньше токен лежал открытым текстом в файле. Теперь он хранится в
// Android Keystore / iOS Keychain (шифрование AES-GCM ключом устройства),
// а старый файл переносится и удаляется при первом запуске.
const LEGACY_TOKEN_PATH = `${RNFS.DocumentDirectoryPath}/token.txt`;
const KEYCHAIN_SERVICE = 'offix.session';
const KEYCHAIN_OPTIONS = {
  service: KEYCHAIN_SERVICE,
  storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
  accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};
const DEFAULT_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 120_000;

let cachedToken: string | null | undefined;
const unauthorizedListeners = new Set<() => void>();

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Сервер недоступен / нет сети / таймаут. */
  get isNetwork() {
    return this.status === 0;
  }
}

// ---------- Токен ----------

async function readLegacyToken(): Promise<string | null> {
  try {
    if (!(await RNFS.exists(LEGACY_TOKEN_PATH))) return null;
    const token = (await RNFS.readFile(LEGACY_TOKEN_PATH, 'utf8')).trim();
    await RNFS.unlink(LEGACY_TOKEN_PATH).catch(() => undefined);
    return token || null;
  } catch {
    return null;
  }
}

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    const creds = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
    cachedToken = creds ? creds.password : null;
  } catch {
    cachedToken = null;
  }
  if (!cachedToken) {
    const legacy = await readLegacyToken();
    if (legacy) await setToken(legacy);
  }
  return cachedToken ?? null;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  try {
    await Keychain.setGenericPassword('session', token, KEYCHAIN_OPTIONS);
  } catch {
    // Хранилище недоступно (редкие прошивки) — токен живёт до перезапуска приложения.
  }
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE }).catch(() => undefined);
  await RNFS.unlink(LEGACY_TOKEN_PATH).catch(() => undefined);
}

/** Подписка на «сессия больше не действительна». Возвращает функцию отписки. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

// ---------- Запросы ----------

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
  /** Не требовать токен (вход, проверка компании). */
  anonymous?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const qs = Object.entries(query || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${SERVER_URL}${path}${qs ? (path.includes('?') ? '&' : '?') + qs : ''}`;
}

async function send<T>(path: string, init: RequestInit, opts: RequestOptions): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string>) };
  if (!opts.anonymous) {
    const token = await getToken();
    if (!token) {
      unauthorizedListeners.forEach((l) => l());
      throw new ApiError('Требуется вход', 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { ...init, headers, signal: controller.signal });
  } catch (e: any) {
    throw new ApiError(
      e?.name === 'AbortError' ? 'Сервер не ответил вовремя. Проверьте подключение.' : 'Нет связи с сервером',
      0,
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    if (res.status === 401 && !opts.anonymous) {
      await clearToken();
      unauthorizedListeners.forEach((l) => l());
    }
    const fallback = res.status >= 500 ? 'Ошибка сервера. Попробуйте позже.' : `Ошибка запроса (${res.status})`;
    throw new ApiError(data?.error || fallback, res.status, data?.details);
  }
  return data as T;
}

export function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const init: RequestInit = { method: opts.method || 'GET' };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'Content-Type': 'application/json' };
  }
  return send<T>(path, init, opts);
}

export interface UploadFile {
  uri: string;
  name: string;
  type?: string | null;
}

/** Загрузка файла (multipart). Дополнительные поля передаются строками. */
export function upload<T>(
  path: string,
  field: string,
  file: UploadFile,
  fields: Record<string, string | number | null | undefined> = {},
): Promise<T> {
  const form = new FormData();
  form.append(field, { uri: file.uri, name: file.name || 'file', type: file.type || 'application/octet-stream' } as any);
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined && v !== null) form.append(k, String(v));
  }
  return send<T>(path, { method: 'POST', body: form }, { timeoutMs: UPLOAD_TIMEOUT_MS });
}

export interface UploadTask<T> {
  promise: Promise<T>;
  /** Отменить загрузку (крестик на сообщении, как в Telegram). */
  abort: () => void;
}

export class UploadCancelled extends Error {
  constructor() {
    super('Загрузка отменена');
    this.name = 'UploadCancelled';
  }
}

/**
 * Загрузка с прогрессом и отменой. fetch в React Native не сообщает прогресс
 * отправки, поэтому здесь XMLHttpRequest. onProgress получает долю 0…1.
 */
export function uploadWithProgress<T>(
  path: string,
  field: string,
  file: UploadFile,
  fields: Record<string, string | number | null | undefined> = {},
  onProgress?: (fraction: number) => void,
): UploadTask<T> {
  const xhr = new XMLHttpRequest();
  let cancelled = false;
  const promise = (async () => {
    const token = await getToken();
    if (!token) {
      unauthorizedListeners.forEach((l) => l());
      throw new ApiError('Требуется вход', 401);
    }
    if (cancelled) throw new UploadCancelled();
    const form = new FormData();
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) form.append(k, String(v));
    }
    form.append(field, { uri: file.uri, name: file.name || 'file', type: file.type || 'application/octet-stream' } as any);
    return new Promise<T>((resolve, reject) => {
      xhr.open('POST', buildUrl(path));
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      xhr.setRequestHeader('Accept', 'application/json');
      xhr.timeout = UPLOAD_TIMEOUT_MS * 5;
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && e.total > 0) onProgress(Math.min(0.99, e.loaded / e.total));
        };
      }
      xhr.onload = () => {
        let data: any = null;
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch {
          data = null;
        }
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1);
          resolve(data as T);
          return;
        }
        if (xhr.status === 401) {
          clearToken().finally(() => unauthorizedListeners.forEach((l) => l()));
        }
        const fallback = xhr.status >= 500 ? 'Ошибка сервера. Попробуйте позже.' : `Ошибка запроса (${xhr.status})`;
        reject(new ApiError(data?.error || fallback, xhr.status, data?.details));
      };
      xhr.onerror = () => reject(cancelled ? new UploadCancelled() : new ApiError('Нет связи с сервером', 0));
      xhr.ontimeout = () => reject(new ApiError('Сервер не ответил вовремя. Проверьте подключение.', 0));
      xhr.onabort = () => reject(new UploadCancelled());
      xhr.send(form);
    });
  })();
  return {
    promise,
    abort: () => {
      cancelled = true;
      try {
        xhr.abort();
      } catch {
        // запрос ещё не отправлен
      }
    },
  };
}

// ---------- Файлы ----------

/** Абсолютный URL для публичных файлов (аватары, превью). */
export function publicFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  return path.startsWith('http') ? path : `${SERVER_URL}${path}`;
}

/** Заголовки для <Image source={{ uri, headers }}> защищённых файлов. */
export async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Подписанная ссылка на защищённый файл (файлы чатов и задач) — живёт
 * 10 минут, подходит для открытия во внешнем приложении/браузере.
 */
export async function signedFileUrl(path: string): Promise<string> {
  const { url } = await request<{ url: string }>('/api/files/url', { query: { path } });
  return `${SERVER_URL}${url}`;
}
