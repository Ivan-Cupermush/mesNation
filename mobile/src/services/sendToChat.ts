import { request, uploadWithProgress } from './http';

/**
 * Отправка в чат вне экрана чата: «Поделиться» из других приложений,
 * пересылка вложений задачи. Порядок как в Telegram: фото и видео —
 * альбомами по 10 с подписью у первого, документы — группой с подписью
 * у последнего, просто текст — сообщением.
 */

export interface OutgoingChatFile {
  uri: string;
  name: string;
  type: string;
  size?: number;
}

export const isMedia = (mime: string) => /^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(mime) || /^video\//i.test(mime);

/** Ограничение сервера на один файл в чате. */
export const CHAT_FILE_LIMIT = 200 * 1024 * 1024;

const groupId = () => `g${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
const clientId = () => `s${Date.now()}${Math.random().toString(36).slice(2, 10)}`;

export async function sendText(chatId: number, topicId: number | null, text: string) {
  return request(`/api/chats/${chatId}/messages`, {
    method: 'POST',
    body: { text, topic_id: topicId ?? undefined, client_id: clientId() },
  });
}

export async function sendFiles(
  chatId: number,
  topicId: number | null,
  files: OutgoingChatFile[],
  caption: string,
  opts: { asFiles?: boolean; onFileDone?: () => void; onProgress?: (fraction: number) => void } = {},
) {
  const media = opts.asFiles ? [] : files.filter((f) => isMedia(f.type));
  const docs = opts.asFiles ? files : files.filter((f) => !isMedia(f.type));
  let captionLeft = caption.trim();
  const take = () => {
    const c = captionLeft;
    captionLeft = '';
    return c || undefined;
  };

  const upload = async (f: OutgoingChatFile, fields: Record<string, string | undefined>) => {
    const task = uploadWithProgress<any>(
      '/api/upload',
      'file',
      { uri: f.uri.startsWith('file://') || f.uri.startsWith('content://') ? f.uri : `file://${f.uri}`, name: f.name, type: f.type },
      { chatId: String(chatId), topicId: topicId ? String(topicId) : undefined, client_id: clientId(), ...fields },
      opts.onProgress,
    );
    await task.promise;
    opts.onFileDone?.();
  };

  // Альбомы по 10: подпись — у первого фото.
  for (let i = 0; i < media.length; i += 10) {
    const chunk = media.slice(i, i + 10);
    const gid = chunk.length > 1 ? groupId() : undefined;
    for (let j = 0; j < chunk.length; j++) {
      await upload(chunk[j], { media_group_id: gid, caption: j === 0 ? take() : undefined });
    }
  }
  // Документы группой: подпись — у последнего (если не ушла с фото).
  for (let i = 0; i < docs.length; i += 10) {
    const chunk = docs.slice(i, i + 10);
    const gid = chunk.length > 1 ? groupId() : undefined;
    const last = i + chunk.length >= docs.length;
    for (let j = 0; j < chunk.length; j++) {
      const isLast = last && j === chunk.length - 1;
      await upload(chunk[j], { media_group_id: gid, as_file: 'true', caption: isLast ? take() : undefined });
    }
  }
  // Подпись длиннее, чем помещается, или файлов не было — отдельным сообщением.
  if (captionLeft) await sendText(chatId, topicId, captionLeft);
}
