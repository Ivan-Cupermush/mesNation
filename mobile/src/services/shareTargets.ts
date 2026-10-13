import * as RNFS from 'react-native-fs';
import { request } from './http';
import { SERVER_URL } from '../config';
import { clearShareTargets, nativeShareAvailable, setShareTargets } from '../native/share';
import { hashColor, initials } from '../components/chat/chatUtils';

/**
 * Недавние чаты — в системное «Поделиться» и в меню значка приложения,
 * как у Telegram и WhatsApp. Обновляется после входа и при возврате
 * в приложение, но не чаще раза в 10 минут (система ограничивает частоту).
 */

const MAX = 8;
const EVERY_MS = 10 * 60 * 1000;
let lastSync = 0;
let running = false;

async function avatarFile(chatId: number, url: string | null): Promise<string | null> {
  if (!url) return null;
  const path = `${RNFS.CachesDirectoryPath}/share_avatar_${chatId}_${url.split('/').pop()}`;
  try {
    if (await RNFS.exists(path)) return path;
    const res = await RNFS.downloadFile({ fromUrl: url.startsWith('http') ? url : `${SERVER_URL}${url}`, toFile: path }).promise;
    return res.statusCode && res.statusCode < 400 ? path : null;
  } catch {
    return null;
  }
}

export async function syncShareTargets(force = false) {
  if (!nativeShareAvailable() || running) return;
  if (!force && Date.now() - lastSync < EVERY_MS) return;
  running = true;
  try {
    const chats = await request<any[]>('/api/chats');
    const recent = chats
      .filter((c) => c.type !== 'channel')
      .sort((a, b) => time(b) - time(a))
      .slice(0, MAX);
    const targets = await Promise.all(
      recent.map(async (c) => {
        // Имя личного чата сервер уже отдаёт с учётом «Изменить контакт».
        const name = c.name || 'Чат';
        return {
          id: Number(c.id),
          name,
          isGroup: c.type !== 'private',
          color: hashColor(name),
          initials: initials(name),
          avatarPath: await avatarFile(Number(c.id), c.avatar_url),
        };
      }),
    );
    await setShareTargets(targets);
    lastSync = Date.now();
  } catch {
    // Нет сети — попробуем в следующий раз.
  } finally {
    running = false;
  }
}

const time = (c: any) => new Date(c.last_message?.created_at || c.created_at || 0).getTime();

/** Выход из аккаунта — чаты прошлого пользователя не должны остаться в «Поделиться». */
export async function resetShareTargets() {
  lastSync = 0;
  await clearShareTargets();
}
