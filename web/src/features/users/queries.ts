import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/http';
import { subscribe } from '../../lib/socket';
import type { Employee, Presence } from '../../lib/types';

export const userKeys = {
  all: ['users'] as const,
  withInactive: ['users', 'all'] as const,
  one: (id: number) => ['user', id] as const,
  assignable: ['users', 'assignable'] as const,
};

/** Активные сотрудники (выбор участников, исполнителей, поиск). */
export function useUsers(enabled = true) {
  return useQuery({ queryKey: userKeys.all, queryFn: () => api.get<Employee[]>('/api/users'), staleTime: 60_000, enabled });
}

/** Кто из сотрудников в сети: начальное состояние + обновления по сокету. */
export function usePresence(ids: number[]): Map<number, Presence> {
  const [map, setMap] = useState<Map<number, Presence>>(new Map());
  const key = Array.from(new Set(ids)).sort((a, b) => a - b).join(',');
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    api
      .get<Presence[]>('/api/users/presence', { ids: key })
      .then((list) => !cancelled && setMap(new Map(list.map((p) => [p.user_id, p]))))
      .catch(() => undefined);
    const wanted = new Set(key.split(',').map(Number));
    const off = subscribe<Presence>('presence', (p) => {
      if (!wanted.has(p.user_id)) return;
      setMap((prev) => new Map(prev).set(p.user_id, { ...prev.get(p.user_id), ...p }));
    });
    return () => {
      cancelled = true;
      off();
    };
  }, [key]);
  return map;
}
