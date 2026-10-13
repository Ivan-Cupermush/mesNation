import { Linking } from 'react-native';
import { request } from './http';
import { OffixLink, parseOffixLink } from './links';
import { openChat, openQrLogin, openTask, openUserProfile } from '../navigation/ref';

export interface ResolvedUser {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role_name?: string | null;
  is_active?: boolean;
}

/** Сотрудник по логину из ссылки или QR-кода (null — такого нет в компании). */
export async function resolveUsername(username: string): Promise<ResolvedUser | null> {
  try {
    return await request<ResolvedUser>(`/api/users/by-username/${encodeURIComponent(username)}`);
  } catch (e: any) {
    if (e?.status === 404) return null;
    throw e;
  }
}

/**
 * Открывает ссылку Offix внутри приложения: профиль, чат, задачу, вход по QR.
 * Возвращает false, если это не наша ссылка (её открывают как обычно) —
 * или если сотрудника по ссылке нет.
 */
export async function openOffixLink(link: OffixLink | string): Promise<'opened' | 'not_found' | 'external'> {
  const l = typeof link === 'string' ? parseOffixLink(link) : link;
  switch (l.kind) {
    case 'user': {
      const u = await resolveUsername(l.username);
      if (!u) return 'not_found';
      openUserProfile(u.id);
      return 'opened';
    }
    case 'user_id':
      openUserProfile(l.id);
      return 'opened';
    case 'chat':
      openChat({ chatId: String(l.id) });
      return 'opened';
    case 'task':
      openTask(l.id);
      return 'opened';
    case 'qr_login':
      openQrLogin(l.token);
      return 'opened';
    default:
      return 'external';
  }
}

/** Ссылка из сообщения: наши — внутри приложения, остальные — в браузере. */
export async function openAnyLink(url: string) {
  const res = await openOffixLink(url).catch(() => 'external' as const);
  if (res === 'external' || res === 'not_found') Linking.openURL(url).catch(() => undefined);
}
