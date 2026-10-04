import * as RNFS from 'react-native-fs';
import { SERVER_URL } from '../config';

/**
 * Единый HTTP-клиент приложения. Все запросы к серверу идут через него:
 * - токен берётся из памяти (с диска читается один раз);
 * - таймаут, чтобы экран не висел вечно на плохой сети;
 * - 401 от сервера (истёк/отозван токен, сотрудник деактивирован) —
 *   единое событие, по которому приложение выходит на экран входа;
 * - ошибки приходят как ApiError с понятным текстом и HTTP-статусом.
 */

const TOKEN_PATH = `${RNFS.DocumentDirectoryPath}/token.txt`;
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

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  try {
    cachedToken = (await RNFS.exists(TOKEN_PATH)) ? await RNFS.readFile(TOKEN_PATH, 'utf8') : null;
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  await RNFS.writeFile(TOKEN_PATH, token, 'utf8');
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  try {
    await RNFS.unlink(TOKEN_PATH);
  } catch {
    // файла уже нет
  }
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
