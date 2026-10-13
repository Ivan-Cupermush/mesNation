/**
 * Текст уведомления о сообщении — те же правила, что у push с сервера
 * (server/src/services/push.ts): значок типа, длительность голосового
 * и видео, подпись. Нужен, когда push нет и уведомление строится по сокету.
 */

function duration(sec: unknown): string {
  const t = Math.round(Number(sec) || 0);
  if (!t) return '';
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = String(t % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

const clip = (s: string, n = 300) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function notificationPreview(m: any): string {
  const caption = (m?.text || '').trim();
  const withCaption = (label: string) => clip(caption ? `${label}, ${caption}` : label);
  if (!m) return 'Сообщение';
  if (m.poll_id) return clip(`📊 Опрос: ${m.poll_question || m.poll?.question || ''}`.trim());
  if (m.contact_user_id) return withCaption(`👤 Контакт: ${m.contact?.display_name || m.contact?.username || ''}`.trim());
  if (m.note_share_id) return withCaption(`📝 Заметка «${m.note_share?.title || 'Без названия'}»`);
  const kind = m.media_kind || (m.thumb_url ? 'photo' : m.file_url ? 'file' : null);
  const d = duration(m.media_duration);
  switch (kind) {
    case 'photo':
      return withCaption('🖼 Фото');
    case 'video':
      return withCaption(d ? `🎬 Видео (${d})` : '🎬 Видео');
    case 'voice':
      return withCaption(d ? `🎤 Голосовое сообщение (${d})` : '🎤 Голосовое сообщение');
    case 'video_note':
      return withCaption(d ? `📹 Видеосообщение (${d})` : '📹 Видеосообщение');
    case 'file':
      return withCaption(`📎 ${m.file_name || 'Файл'}`);
  }
  return clip(caption || 'Сообщение');
}

/** Превью фото, видео или кружочка для развёрнутого уведомления. */
export function notificationImage(m: any): string {
  return m?.thumb_url && ['photo', 'video', 'video_note'].includes(m.media_kind) ? m.thumb_url : '';
}
