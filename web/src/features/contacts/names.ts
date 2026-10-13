import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/http';

/**
 * Свои имена для коллег («Изменить контакт», как в Telegram). Видны только
 * мне — в списке чатов, шапке чата и подписях сообщений; в профиле
 * сотрудника остаются его настоящие данные.
 */
export interface ContactName {
  user_id: number;
  first_name: string;
  last_name: string;
}

export const contactKeys = { names: ['contacts', 'names'] as const };

export function useContactNames() {
  const { data } = useQuery({
    queryKey: contactKeys.names,
    queryFn: () => api.get<ContactName[]>('/api/contacts/names'),
    staleTime: 5 * 60_000,
  });
  const map = new Map((data || []).map((c) => [c.user_id, c]));
  /** Своё имя для сотрудника или undefined. */
  const nameOf = (userId?: number | null) => {
    if (!userId) return undefined;
    const c = map.get(userId);
    const full = c ? `${c.first_name} ${c.last_name}`.trim() : '';
    return full || undefined;
  };
  return { map, nameOf, version: data };
}

export function useSaveContactName() {
  const qc = useQueryClient();
  return useCallback(
    async (userId: number, first: string, last: string) => {
      await api.put(`/api/contacts/${userId}/name`, { first_name: first, last_name: last });
      await qc.invalidateQueries({ queryKey: contactKeys.names });
      qc.invalidateQueries({ queryKey: ['chats'] });
      qc.invalidateQueries({ queryKey: ['chat'] });
    },
    [qc],
  );
}
