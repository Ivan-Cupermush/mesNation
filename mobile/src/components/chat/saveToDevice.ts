import * as RNFS from 'react-native-fs';
import { CameraRoll } from '@react-native-camera-roll/camera-roll';
import { saveDocuments, isErrorWithCode, errorCodes } from '@react-native-documents/picker';
import { cachedSignedUrl } from '../../services/http';
import { requestSavePermission } from './chatUtils';

/**
 * «Сохранить» из выделения сообщений:
 * - фото, видео и кружочки — в галерею (альбом Offix);
 * - голосовые и файлы — через системное «Сохранить как» (Загрузки, Диск…);
 * - текст — одним .txt файлом.
 */

const MIME: Record<string, string> = {
  voice: 'audio/mp4',
  video_note: 'video/mp4',
  video: 'video/mp4',
  photo: 'image/jpeg',
};

const safeName = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80);

const stamp = (iso?: string) => {
  const d = iso ? new Date(iso) : new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}`;
};

function extOf(m: any): string {
  const fromName = (m.file_name || '').split('.').pop();
  if (fromName && fromName.length <= 5 && fromName !== m.file_name) return fromName.toLowerCase();
  if (m.media_kind === 'voice') return 'm4a';
  if (m.media_kind === 'video' || m.media_kind === 'video_note') return 'mp4';
  if (m.media_kind === 'photo') return 'jpg';
  return 'bin';
}

async function download(m: any): Promise<string> {
  const path = `${RNFS.CachesDirectoryPath}/offix_save_${m.id}.${extOf(m)}`;
  const { promise } = RNFS.downloadFile({ fromUrl: await cachedSignedUrl(m.file_url), toFile: path });
  const res = await promise;
  if (res.statusCode && res.statusCode >= 400) throw new Error('Файл недоступен');
  return path;
}

/** Системный диалог «Сохранить как». false — пользователь передумал. */
async function saveAs(path: string, fileName: string, mimeType: string): Promise<boolean> {
  try {
    const [r] = await saveDocuments({ sourceUris: [`file://${path}`], fileName, mimeType, copy: true });
    if (r?.error) throw new Error(r.error);
    return true;
  } catch (e: any) {
    if (isErrorWithCode(e) && e.code === errorCodes.OPERATION_CANCELED) return false;
    throw e;
  }
}

export interface SaveResult {
  gallery: number;
  files: number;
  text: boolean;
}

export async function saveMessagesToDevice(msgs: any[], nameOf: (m: any) => string): Promise<SaveResult> {
  const result: SaveResult = { gallery: 0, files: 0, text: false };
  const list = msgs.filter((m) => !m.local && !m.deleted_for_all);
  const gallery = list.filter((m) => m.file_url && (m.media_kind === 'photo' || m.media_kind === 'video' || m.media_kind === 'video_note' || (!m.media_kind && m.thumb_url)));
  const docs = list.filter((m) => m.file_url && !gallery.includes(m));
  const texts = list.filter((m) => !m.file_url && m.text);

  if (gallery.length) {
    if (!(await requestSavePermission())) throw new Error('Нет разрешения на сохранение');
    for (const m of gallery) {
      const path = await download(m);
      const isVideo = m.media_kind === 'video' || m.media_kind === 'video_note';
      await CameraRoll.saveAsset(`file://${path}`, { type: isVideo ? 'video' : 'photo', album: 'Offix' });
      RNFS.unlink(path).catch(() => undefined);
      result.gallery++;
    }
  }

  for (const m of docs) {
    const path = await download(m);
    const name = m.media_kind === 'voice' ? `Голосовое ${safeName(nameOf(m))} ${stamp(m.created_at)}.m4a` : m.file_name || `Файл ${stamp(m.created_at)}.${extOf(m)}`;
    const ok = await saveAs(path, name, m.mime_type || MIME[m.media_kind] || 'application/octet-stream');
    RNFS.unlink(path).catch(() => undefined);
    if (ok) result.files++;
  }

  if (texts.length) {
    // Как «Копировать» в Telegram: при нескольких — с автором и временем.
    const body =
      texts.length === 1
        ? texts[0].text
        : texts
            .map((m) => `${nameOf(m)}, [${new Date(m.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}]\n${m.text}`)
            .join('\n\n');
    const path = `${RNFS.CachesDirectoryPath}/offix_text_${Date.now()}.txt`;
    await RNFS.writeFile(path, body, 'utf8');
    const name = texts.length === 1 ? `Сообщение ${safeName(nameOf(texts[0]))} ${stamp(texts[0].created_at)}.txt` : `Сообщения ${stamp()}.txt`;
    result.text = await saveAs(path, name, 'text/plain');
    RNFS.unlink(path).catch(() => undefined);
  }
  return result;
}

/** Текст для «Копировать» из выделения. */
export function copyText(msgs: any[], nameOf: (m: any) => string): string {
  const withText = msgs.filter((m) => m.text);
  if (withText.length === 1) return withText[0].text;
  return withText
    .map((m) => `${nameOf(m)}, [${new Date(m.created_at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}]\n${m.text}`)
    .join('\n\n');
}
