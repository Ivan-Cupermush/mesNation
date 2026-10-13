import { SERVER_URL } from '../config';

/**
 * Ссылки Offix — как t.me в Telegram:
 *  - https://offixcrm.ru/u/логин — профиль сотрудника (в QR-коде профиля);
 *  - https://offixcrm.ru/qr/код — вход на сайт по QR-коду;
 *  - offix://u/логин, offix://chat/12, offix://qr/код — те же действия
 *    из уведомлений, ярлыков на рабочем столе и кнопки «Открыть в приложении».
 * Хост в https-ссылке не проверяем строго: сайт мог быть открыт по IP
 * в локальной сети — код входа всё равно проверяет наш сервер.
 */

export type OffixLink =
  | { kind: 'user'; username: string }
  | { kind: 'user_id'; id: number }
  | { kind: 'chat'; id: number }
  | { kind: 'task'; id: number }
  | { kind: 'qr_login'; token: string }
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string };

export const profileLink = (username: string) => `${SERVER_URL}/u/${encodeURIComponent(username)}`;

const USERNAME = /^(?=.*[A-Za-z0-9])[A-Za-z0-9._-]{1,50}$/;
const TOKEN = /^[A-Za-z0-9_-]{20,64}$/;

function fromPath(segments: string[]): OffixLink | null {
  const [head, value] = segments;
  if (!head || !value) return null;
  if ((head === 'u' || head === 'user') && USERNAME.test(value)) return { kind: 'user', username: value };
  if (head === 'users' && /^\d+$/.test(value)) return { kind: 'user_id', id: Number(value) };
  if (head === 'qr' && TOKEN.test(value)) return { kind: 'qr_login', token: value };
  if ((head === 'chat' || head === 'chats') && /^\d+$/.test(value)) return { kind: 'chat', id: Number(value) };
  if ((head === 'task' || head === 'tasks') && /^\d+$/.test(value)) return { kind: 'task', id: Number(value) };
  return null;
}

/** Что за ссылка или текст: профиль, вход по QR, чат — или просто адрес/текст. */
export function parseOffixLink(raw: string): OffixLink {
  const text = (raw || '').trim();
  const custom = /^offix:\/\/(.+)$/i.exec(text);
  if (custom) {
    const parsed = fromPath(custom[1].split(/[?#]/)[0].split('/').filter(Boolean).map(decodeURIComponent));
    return parsed || { kind: 'text', text };
  }
  const web = /^https?:\/\/[^/\s]+(\/[^\s?#]*)?/i.exec(text);
  if (web) {
    const parsed = fromPath((web[1] || '').split('/').filter(Boolean).map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    }));
    // Чужой сайт с похожим путём (/u/…) не считаем профилем Offix — только наш адрес или IP/локальный хост.
    if (parsed && (isOurHost(text) || parsed.kind === 'qr_login')) return parsed;
    return { kind: 'url', url: text };
  }
  return { kind: 'text', text };
}

function isOurHost(url: string): boolean {
  const host = (/^https?:\/\/([^/:?#\s]+)/i.exec(url)?.[1] || '').toLowerCase();
  const ours = (/^https?:\/\/([^/:?#\s]+)/i.exec(SERVER_URL)?.[1] || '').toLowerCase();
  return host === ours || host === `www.${ours}` || /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost';
}
