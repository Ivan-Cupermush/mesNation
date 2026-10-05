import type { Profile } from '../../lib/types';

/** Директор или руководитель (у кого есть подчинённые) — видит «Настройки» и управление. */
export const isManager = (u: Pick<Profile, 'is_director' | 'has_subordinates'> | null | undefined) => !!u && (u.is_director || u.has_subordinates);
