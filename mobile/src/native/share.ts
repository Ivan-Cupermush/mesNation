import { DeviceEventEmitter, NativeModules, Platform, Share } from 'react-native';

/**
 * Обёртка над нативным модулем OffixShare (android/app/src/main/java/com/mobileapp/OffixShareModule.kt):
 * отправка файлов в системное «Поделиться», приём того, чем поделились с Offix,
 * и недавние чаты в системном окне «Поделиться».
 * В старой сборке без модуля — мягкий запасной вариант (ссылка/текст через Share).
 */

export interface IncomingFile {
  path: string;
  name: string;
  mime: string;
  size: number;
}

export interface IncomingShare {
  id: string;
  text?: string;
  subject?: string;
  files: IncomingFile[];
  /** Чат, выбранный прямо в системном окне «Поделиться». */
  chatId?: number;
  /** Сколько файлов не удалось взять (слишком большие, недоступные). */
  skipped?: number;
}

export interface OutgoingFile {
  path: string;
  mime: string;
  name?: string;
}

export interface ShareTarget {
  id: number;
  name: string;
  isGroup: boolean;
  color: string;
  initials: string;
  avatarPath?: string | null;
}

const Native: any = Platform.OS === 'android' ? NativeModules.OffixShare : null;

export const nativeShareAvailable = () => !!Native;

/** Файлы — в WhatsApp, почту, галерею и т. д. Без модуля — только текст. */
export async function shareFiles(files: OutgoingFile[], opts: { text?: string; title?: string } = {}): Promise<boolean> {
  if (Native?.shareFiles) {
    return Native.shareFiles(
      files.map((f) => ({ path: f.path.replace(/^file:\/\//, ''), mime: f.mime || 'application/octet-stream', name: f.name || '' })),
      opts.text || null,
      opts.title || null,
    );
  }
  if (opts.text) {
    await Share.share({ message: opts.text, title: opts.title });
    return true;
  }
  throw new Error('Обновите приложение, чтобы делиться файлами');
}

export async function getPendingShare(): Promise<IncomingShare | null> {
  if (!Native?.getPendingShare) return null;
  try {
    const res = await Native.getPendingShare();
    if (!res) return null;
    const share: IncomingShare = { ...res, files: res.files || [] };
    return share.files.length || share.text?.trim() ? share : null;
  } catch {
    return null;
  }
}

/** Пока приложение открыто, с ним поделились ещё раз. */
export function onIncomingShare(cb: () => void): () => void {
  if (!Native) return () => undefined;
  const sub = DeviceEventEmitter.addListener('OffixShareIntent', cb);
  return () => sub.remove();
}

export async function setShareTargets(targets: ShareTarget[]): Promise<void> {
  if (!Native?.setShareTargets) return;
  await Native.setShareTargets(targets).catch(() => undefined);
}

export async function clearShareTargets(): Promise<void> {
  if (!Native?.clearShareTargets) return;
  await Native.clearShareTargets().catch(() => undefined);
}
