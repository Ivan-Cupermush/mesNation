import QRCode from 'qrcode';

/**
 * QR-код в стиле Telegram (тот же рисунок, что в приложении:
 * mobile/src/components/qr/QrCode.tsx) и ссылки Offix
 * (mobile/src/services/links.ts).
 */

export interface QrMatrix {
  size: number;
  dark: (r: number, c: number) => boolean;
}

export function qrMatrix(text: string): QrMatrix {
  const m = QRCode.create(text, { errorCorrectionLevel: 'H' }).modules;
  return { size: m.size, dark: (r, c) => !!m.get(r, c) };
}

const inFinder = (r: number, c: number, n: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

function roundRect(x: number, y: number, w: number, h: number, rad: number, reverse = false) {
  const r = Math.min(rad, w / 2, h / 2);
  const f = (v: number) => v.toFixed(2);
  if (!reverse) {
    return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
  }
  return `M${f(x + r)} ${f(y)}A${f(r)} ${f(r)} 0 0 0 ${f(x)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 0 ${f(x + r)} ${f(y + h)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 0 ${f(x + w)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 0 ${f(x + w - r)} ${f(y)}Z`;
}

/** Пути точек и «глазков»; середина (holeModules×holeModules) остаётся под значок. */
export function qrPaths(m: QrMatrix, cell: number, holeModules: number) {
  const n = m.size;
  const lo = Math.floor((n - holeModules) / 2);
  const hi = lo + holeModules;
  const r = cell * 0.43;
  const parts: string[] = [];
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!m.dark(row, col) || inFinder(row, col, n)) continue;
      if (row >= lo && row < hi && col >= lo && col < hi) continue;
      const cx = (col + 0.5) * cell;
      const cy = (row + 0.5) * cell;
      parts.push(`M${(cx - r).toFixed(2)} ${cy.toFixed(2)}a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(2 * r).toFixed(2)} 0a${r.toFixed(2)} ${r.toFixed(2)} 0 1 0 ${(-2 * r).toFixed(2)} 0Z`);
    }
  }
  const eye = (x: number, y: number) => {
    const s = 7 * cell;
    const outerR = cell * 2.2;
    const t = cell;
    return (
      roundRect(x, y, s, s, outerR) +
      roundRect(x + t, y + t, s - 2 * t, s - 2 * t, Math.max(0, outerR - t * 0.9), true) +
      roundRect(x + 2 * cell, y + 2 * cell, 3 * cell, 3 * cell, cell * 1.35 * 0.75)
    );
  };
  return {
    dots: parts.join(''),
    eyes: eye(0, 0) + eye((n - 7) * cell, 0) + eye(0, (n - 7) * cell),
    holeSize: holeModules * cell,
  };
}

/** Размер выреза под значок: ~22% стороны, той же чётности, что и сторона. */
export function holeFor(n: number) {
  let h = Math.round(n * 0.22);
  if (h % 2 !== n % 2) h += 1;
  return h;
}

// ---------- Темы ----------

export interface QrTheme {
  id: string;
  name: string;
  bg: [string, string, string];
  dots: [string, string];
}

export const QR_THEMES: QrTheme[] = [
  { id: 'emerald', name: 'Изумруд', bg: ['#0E5A3B', '#1F9A65', '#7FD8A6'], dots: ['#14714A', '#2BAE73'] },
  { id: 'sky', name: 'Небо', bg: ['#1A4FB5', '#2F80ED', '#7CC4FA'], dots: ['#1F5FCC', '#3B9BF2'] },
  { id: 'amethyst', name: 'Аметист', bg: ['#3F2A9E', '#7357E8', '#C7A8FF'], dots: ['#5536D4', '#9B6BF0'] },
  { id: 'lagoon', name: 'Лагуна', bg: ['#075E66', '#0F8C96', '#69D7D3'], dots: ['#0A6F78', '#17A6A8'] },
  { id: 'sunset', name: 'Закат', bg: ['#A33A12', '#E46A2B', '#FFC27A'], dots: ['#C2501C', '#EC8A3A'] },
  { id: 'garnet', name: 'Гранат', bg: ['#7E1740', '#C9346C', '#F7A1C0'], dots: ['#A3245A', '#D9467E'] },
  { id: 'night', name: 'Ночь', bg: ['#10141B', '#263140', '#4B5D73'], dots: ['#1E2733', '#3E4F63'] },
];

export const BY_PALETTE: Record<string, string> = {
  emerald: 'emerald',
  blue: 'sky',
  violet: 'amethyst',
  teal: 'lagoon',
  orange: 'sunset',
  pink: 'garnet',
  graphite: 'night',
};

// ---------- Ссылки ----------

export type OffixLink =
  | { kind: 'user'; username: string }
  | { kind: 'user_id'; id: number }
  | { kind: 'chat'; id: number }
  | { kind: 'task'; id: number }
  | { kind: 'qr_login'; token: string }
  | { kind: 'url'; url: string }
  | { kind: 'text'; text: string };

/** Ссылка на профиль — на текущий адрес сайта (его же откроет и приложение). */
export const profileLink = (username: string) => `${window.location.origin}/u/${encodeURIComponent(username)}`;

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

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export function parseOffixLink(raw: string): OffixLink {
  const text = (raw || '').trim();
  const custom = /^offix:\/\/(.+)$/i.exec(text);
  if (custom) return fromPath(custom[1].split(/[?#]/)[0].split('/').filter(Boolean).map(decode)) || { kind: 'text', text };
  const web = /^https?:\/\/([^/\s?#]+)(\/[^\s?#]*)?/i.exec(text);
  if (web) {
    const parsed = fromPath((web[2] || '').split('/').filter(Boolean).map(decode));
    const host = web[1].toLowerCase().replace(/:\d+$/, '');
    const ours = host === window.location.hostname || host === 'offixcrm.ru' || host === 'www.offixcrm.ru' || /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host === 'localhost';
    if (parsed && (ours || parsed.kind === 'qr_login')) return parsed;
    return { kind: 'url', url: text };
  }
  return { kind: 'text', text };
}

/** Путь внутри сайта для ссылки Offix (null — не наша). */
export function internalPath(link: OffixLink): string | null {
  switch (link.kind) {
    case 'user':
      return `/u/${encodeURIComponent(link.username)}`;
    case 'user_id':
      return `/users/${link.id}`;
    case 'chat':
      return `/chats/${link.id}`;
    case 'task':
      return `/tasks/${link.id}`;
    case 'qr_login':
      return `/qr/${link.token}`;
    default:
      return null;
  }
}

/** Android-браузер: ссылка «Открыть в приложении Offix» (intent:// с запасным адресом сайта). */
export function appIntentUrl(path: string): string | null {
  if (!/Android/i.test(navigator.userAgent)) return null;
  const clean = path.replace(/^\/+/, '');
  return `intent://${clean}#Intent;scheme=offix;package=com.mesnation;S.browser_fallback_url=${encodeURIComponent(window.location.href)};end`;
}
