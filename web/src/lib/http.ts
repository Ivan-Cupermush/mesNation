import { storage } from './storage';

/**
 * Единый HTTP-клиент сайта (аналог mobile/src/services/http.ts).
 *
 * - Все адреса относительные: сайт, API и файлы живут на одном домене,
 *   поэтому нет CORS и не важно, по какому адресу открыт сайт.
 * - Таймаут: на плохой сети запрос не висит вечно.
 * - 401 (сессия истекла/отозвана, сотрудник деактивирован) — одно событие,
 *   по которому сайт выходит на экран входа.
 * - Ошибки — ApiError с текстом от сервера и HTTP-статусом.
 */

const TOKEN_KEY = 'offix.token';
const LEGACY_TOKEN_KEY = 'auth_token';
const DEFAULT_TIMEOUT_MS = 20_000;
const UPLOAD_TIMEOUT_MS = 30 * 60_000;

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  /** Нет сети / сервер недоступен / таймаут. */
  get isNetwork() {
    return this.status === 0;
  }
}

// ---------- Токен ----------

let token: string | null = storage.get(TOKEN_KEY) ?? storage.get(LEGACY_TOKEN_KEY);
if (token && !storage.get(TOKEN_KEY)) {
  storage.set(TOKEN_KEY, token);
  storage.remove(LEGACY_TOKEN_KEY);
}

const unauthorizedListeners = new Set<() => void>();
const tokenListeners = new Set<(token: string | null) => void>();

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null) {
  token = value;
  if (value) storage.set(TOKEN_KEY, value);
  else {
    storage.remove(TOKEN_KEY);
    storage.remove(LEGACY_TOKEN_KEY);
    storage.remove('current_user');
  }
  tokenListeners.forEach((l) => l(value));
}

/** «Сессия больше не действительна» — возвращает отписку. */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export function onTokenChange(listener: (token: string | null) => void): () => void {
  tokenListeners.add(listener);
  return () => tokenListeners.delete(listener);
}

function handleUnauthorized() {
  if (!token) return;
  setToken(null);
  unauthorizedListeners.forEach((l) => l());
}

// ---------- Запросы ----------

export type Query = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Query;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Запрос без токена (вход, проверка компании). */
  anonymous?: boolean;
}

export function buildUrl(path: string, query?: Query): string {
  const qs = Object.entries(query || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return qs ? `${path}${path.includes('?') ? '&' : '?'}${qs}` : path;
}

function errorFromResponse(status: number, data: unknown): ApiError {
  const payload = (data && typeof data === 'object' ? data : {}) as { error?: string; details?: unknown };
  const fallback =
    status >= 500
      ? 'Ошибка сервера. Попробуйте позже.'
      : status === 413
        ? 'Файл или запрос слишком большой'
        : status === 429
          ? 'Слишком много запросов. Подождите немного.'
          : `Ошибка запроса (${status})`;
  return new ApiError(payload.error || fallback, status, payload.details);
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (!opts.anonymous) {
    if (!token) {
      unauthorizedListeners.forEach((l) => l());
      throw new ApiError('Требуется вход', 401);
    }
    headers.Authorization = `Bearer ${token}`;
  }
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }

  const controller = new AbortController();
  const onAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onAbort);
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), { method: opts.method || 'GET', headers, body, signal: controller.signal });
  } catch (e) {
    if (opts.signal?.aborted) throw e;
    throw new ApiError(
      (e as Error)?.name === 'AbortError' ? 'Сервер не ответил вовремя. Проверьте подключение.' : 'Нет связи с сервером',
      0,
    );
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onAbort);
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && !opts.anonymous) handleUnauthorized();
    throw errorFromResponse(res.status, data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: Query, opts: Omit<RequestOptions, 'query' | 'method'> = {}) => request<T>(path, { ...opts, query }),
  post: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body' | 'method'> = {}) => request<T>(path, { ...opts, method: 'POST', body: body ?? {} }),
  patch: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body' | 'method'> = {}) => request<T>(path, { ...opts, method: 'PATCH', body: body ?? {} }),
  put: <T>(path: string, body?: unknown, opts: Omit<RequestOptions, 'body' | 'method'> = {}) => request<T>(path, { ...opts, method: 'PUT', body: body ?? {} }),
  delete: <T>(path: string, query?: Query, opts: Omit<RequestOptions, 'query' | 'method'> = {}) => request<T>(path, { ...opts, method: 'DELETE', query }),
};

// ---------- Загрузка файлов с прогрессом и отменой ----------

export class UploadCancelled extends Error {
  constructor() {
    super('Загрузка отменена');
    this.name = 'UploadCancelled';
  }
}

export interface UploadTask<T> {
  promise: Promise<T>;
  abort: () => void;
}

export function upload<T>(
  path: string,
  field: string,
  file: Blob,
  fileName: string,
  fields: Record<string, string | number | boolean | null | undefined> = {},
  onProgress?: (fraction: number) => void,
): UploadTask<T> {
  const xhr = new XMLHttpRequest();
  let cancelled = false;
  const promise = new Promise<T>((resolve, reject) => {
    if (!token) {
      unauthorizedListeners.forEach((l) => l());
      reject(new ApiError('Требуется вход', 401));
      return;
    }
    const form = new FormData();
    // Текстовые поля — до файла: сервер (multer) читает их раньше, чем файл.
    for (const [k, v] of Object.entries(fields)) {
      if (v !== undefined && v !== null) form.append(k, String(v));
    }
    form.append(field, file, fileName);
    xhr.open('POST', path);
    xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress(Math.min(0.99, e.loaded / e.total));
      };
    }
    xhr.onload = () => {
      let data: unknown = null;
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
      if (xhr.status === 401) handleUnauthorized();
      reject(errorFromResponse(xhr.status, data));
    };
    xhr.onerror = () => reject(cancelled ? new UploadCancelled() : new ApiError('Нет связи с сервером', 0));
    xhr.ontimeout = () => reject(new ApiError('Сервер не ответил вовремя. Проверьте подключение.', 0));
    xhr.onabort = () => reject(new UploadCancelled());
    xhr.send(form);
  });
  return {
    promise,
    abort: () => {
      cancelled = true;
      xhr.abort();
    },
  };
}

/** Загрузка без прогресса — для небольших файлов (аватар, вложение заметки). */
export function uploadFile<T>(path: string, field: string, file: File, fields: Record<string, string | number | boolean | null | undefined> = {}): Promise<T> {
  return upload<T>(path, field, file, file.name, fields).promise;
}

// ---------- Файлы ----------

/** Аватары и превью публичны — их можно показывать по прямому адресу. */
export const isPublicUpload = (path: string) => path.startsWith('/uploads/avatars/') || path.startsWith('/uploads/thumbs/');

/** Подписанная ссылка на защищённый файл (живёт 10 минут) — для скачивания, видео, открытия в новой вкладке. */
export async function signedFileUrl(path: string): Promise<string> {
  if (isPublicUpload(path)) return path;
  const { url } = await request<{ url: string }>('/api/files/url', { query: { path } });
  return url;
}

/** Скачать защищённый файл под исходным именем. */
export async function downloadFile(path: string, fileName?: string | null) {
  const url = await signedFileUrl(path);
  const a = document.createElement('a');
  a.href = url;
  if (fileName) a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Открыть файл в новой вкладке (PDF, картинка). */
export async function openFile(path: string) {
  // Окно открываем сразу (иначе браузер заблокирует как всплывающее), адрес подставим после запроса.
  const win = window.open('', '_blank');
  try {
    const url = await signedFileUrl(path);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (e) {
    win?.close();
    throw e;
  }
}

const objectUrlCache = new Map<string, Promise<string>>();

/** Защищённая картинка как blob: URL (заголовок Authorization в <img> не передать). Кешируется. */
export function protectedObjectUrl(path: string): Promise<string> {
  if (isPublicUpload(path)) return Promise.resolve(path);
  let p = objectUrlCache.get(path);
  if (!p) {
    p = (async () => {
      const res = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.status === 401) handleUnauthorized();
      if (!res.ok) throw new ApiError('Не удалось загрузить файл', res.status);
      return URL.createObjectURL(await res.blob());
    })();
    p.catch(() => objectUrlCache.delete(path));
    objectUrlCache.set(path, p);
  }
  return p;
}
