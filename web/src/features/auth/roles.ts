import type { PermissionKey, Profile } from '../../lib/types';

/** Директор или руководитель (у кого есть подчинённые) — видит «Настройки» и управление. */
export const isManager = (u: Pick<Profile, 'is_director' | 'has_subordinates'> | null | undefined) => !!u && (u.is_director || u.has_subordinates);

/** Включена ли функция (сервер без поля permissions — по должности, как раньше). */
export const can = (u: Pick<Profile, 'is_director' | 'has_subordinates' | 'permissions'> | null | undefined, key: PermissionKey) =>
  !!u && (u.is_director || (u.permissions?.[key] ?? u.has_subordinates));
