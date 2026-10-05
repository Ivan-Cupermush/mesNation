import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/http';
import { subscribe } from '../../lib/socket';
import type { Chat } from './types';

export const chatKeys = {
  list: ['chats'] as const,
  detail: (id: number | string) => ['chat', String(id)] as const,
  messages: (chatId: number | string, topicId?: number | null) => ['messages', String(chatId), topicId ?? 0] as const,
  pinned: (chatId: number | string, topicId?: number | null) => ['pinned', String(chatId), topicId ?? 0] as const,
  topics: (chatId: number | string) => ['topics', String(chatId)] as const,
};

export const isMuted = (mutedUntil?: string | null) => !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();

export function useChats() {
  return useQuery({
    queryKey: chatKeys.list,
    queryFn: () => api.get<Chat[]>('/api/chats'),
    staleTime: 15_000,
  });
}

/**
 * Список чатов обновляется сам: новое сообщение где угодно, новый чат,
 * исключение из группы — пересчитываются счётчики и порядок.
 */
export function useChatsRealtime() {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const refresh = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => qc.invalidateQueries({ queryKey: chatKeys.list }), 250);
    };
    const offs = ['chat_activity', 'chat_created', 'removed_from_chat', 'chat_deleted', 'chat_updated', 'members_changed', 'messages_read'].map((e) =>
      subscribe(e, refresh),
    );
    return () => {
      offs.forEach((off) => off());
      if (timer.current) clearTimeout(timer.current);
    };
  }, [qc]);
}

/** Сколько чатов с непрочитанными (без звука не считаются) — для значка на вкладке и в заголовке окна. */
export function useUnreadChatsCount(): number {
  useChatsRealtime();
  const { data } = useChats();
  return useMemo(() => (data || []).filter((c) => (c.unread_count || 0) > 0 && !isMuted(c.muted_until)).length, [data]);
}
