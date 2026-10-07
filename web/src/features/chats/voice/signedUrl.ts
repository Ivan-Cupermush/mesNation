import { signedFileUrl } from '../../../lib/http';

/** Подписанная ссылка живёт 10 минут — держим её 8, чтобы не просить заново на каждое нажатие. */
const TTL_MS = 8 * 60 * 1000;
const cache = new Map<string, { url: Promise<string>; at: number }>();

export function cachedSignedUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.url;
  const url = signedFileUrl(path);
  cache.set(path, { url, at: Date.now() });
  url.catch(() => cache.delete(path));
  return url;
}
