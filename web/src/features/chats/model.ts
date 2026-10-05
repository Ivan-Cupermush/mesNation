import { dayLabel } from '../../lib/format';
import type { LastMessage, Message } from './types';

/**
 * Модель ленты сообщений — та же логика, что в приложении (ChatScreen):
 * альбомы из фото/видео или документов, отправленных вместе;
 * разделители дней; «Непрочитанные сообщения»; серии одного отправителя
 * (имя у первого, аватар и «хвостик» — у последнего).
 */

export type Row = { type: 'message'; key: string; msg: Message } | { type: 'album'; key: string; msgs: Message[] };

export type FeedItem =
  | { type: 'divider'; key: string; label: string }
  | { type: 'unread'; key: string }
  | { type: 'service'; key: string; msg: Message }
  | { type: 'row'; key: string; row: Row; mine: boolean; firstInSeries: boolean; lastInSeries: boolean };

const SERIES_GAP_MS = 10 * 60 * 1000;

export const isVisualMedia = (m: Pick<Message, 'deleted_for_all' | 'media_kind' | 'thumb_url'>) =>
  !m.deleted_for_all && (m.media_kind === 'photo' || m.media_kind === 'video' || (!m.media_kind && !!m.thumb_url));

export const isDocument = (m: Message) => !m.deleted_for_all && !m.poll_id && !!m.file_url && m.media_kind === 'file';

export const rowMessages = (row: Row): Message[] => (row.type === 'album' ? row.msgs : [row.msg]);

/** Главное сообщение строки: в альбоме — то, что с подписью. */
export const rowMain = (row: Row): Message => (row.type === 'album' ? row.msgs.find((m) => m.text) || row.msgs[0] : row.msg);

export const isLocal = (m: Message) => !!m.pending || m.id < 0;

/** Короткое описание сообщения для цитат, закрепа и списка чатов. */
export function messagePreview(m: (Partial<Message> & Partial<LastMessage>) | null | undefined): string {
  if (!m) return '';
  if (m.content_type === 'service') return m.text || '';
  if (m.poll_id || m.content_type === 'poll') return `📊 ${m.poll?.question || m.poll_question || 'Опрос'}`;
  if (m.note_share_id || m.content_type === 'note') return m.text || '📝 Заметка';
  const caption = m.text ? ` ${m.text}` : '';
  if (m.media_kind === 'video') return `🎬 Видео${caption}`;
  if (m.media_kind === 'photo' || (!m.media_kind && m.thumb_url)) return `🖼 Фото${caption}`;
  if (m.file_url) return `📎 ${m.file_name || 'Файл'}${caption}`;
  return m.text || '';
}

export function buildFeed(messages: Message[], meId: number, unreadAnchor: number | null): FeedItem[] {
  // 1) альбомы
  const rows: (Row | { type: 'service'; key: string; msg: Message })[] = [];
  for (const m of messages) {
    if (m.content_type === 'service') {
      rows.push({ type: 'service', key: `s-${m.id}`, msg: m });
      continue;
    }
    const last = rows[rows.length - 1];
    const groupable = isVisualMedia(m) || isDocument(m);
    if (m.media_group_id && groupable && last && last.type !== 'service') {
      const lastMsg = last.type === 'album' ? last.msgs[0] : last.msg;
      const sameKind = isDocument(m) === isDocument(lastMsg);
      if (lastMsg.media_group_id === m.media_group_id && lastMsg.sender_id === m.sender_id && sameKind) {
        const msgs = last.type === 'album' ? [...last.msgs, m] : [last.msg, m];
        rows[rows.length - 1] = { type: 'album', key: `a-${m.media_group_id}`, msgs };
        continue;
      }
    }
    rows.push({ type: 'message', key: `m-${m.client_id || m.id}`, msg: m });
  }

  // 2) разделители, «Непрочитанные», серии
  const out: FeedItem[] = [];
  let lastDay = '';
  let unreadPlaced = false;
  const first = (r: Row | { type: 'service'; msg: Message }) => (r.type === 'album' ? r.msgs[0] : r.msg);
  const sameSeries = (a: (typeof rows)[number] | undefined, m: Message) => {
    if (!a || a.type === 'service') return false;
    const x = first(a);
    const d1 = new Date(x.created_at);
    const d2 = new Date(m.created_at);
    return x.sender_id === m.sender_id && Math.abs(d1.getTime() - d2.getTime()) < SERIES_GAP_MS && d1.toDateString() === d2.toDateString();
  };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const m = first(r);
    const d = new Date(m.created_at);
    if (d.toDateString() !== lastDay) {
      lastDay = d.toDateString();
      out.push({ type: 'divider', key: `d-${lastDay}`, label: dayLabel(d) });
    }
    if (!unreadPlaced && unreadAnchor !== null && m.id > unreadAnchor && m.sender_id !== meId && !isLocal(m)) {
      unreadPlaced = true;
      out.push({ type: 'unread', key: 'unread' });
    }
    if (r.type === 'service') {
      out.push(r);
      continue;
    }
    out.push({
      type: 'row',
      key: r.key,
      row: r,
      mine: m.sender_id === meId,
      firstInSeries: !sameSeries(rows[i - 1], m),
      lastInSeries: !sameSeries(rows[i + 1], m),
    });
  }
  return out;
}

/** Ссылки в тексте сообщения → кликабельные куски. */
export function linkify(text: string): (string | { url: string })[] {
  const parts: (string | { url: string })[] = [];
  const re = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ url: m[0] });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
