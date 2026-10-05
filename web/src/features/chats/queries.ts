import { useEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/http';
import { onConnectionChange, subscribe } from '../../lib/socket';
import type { Chat, ChatDetail, Topic } from './types';

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
    // После обрыва связи список мог устареть.
    let wasDown = false;
    offs.push(
      onConnectionChange((connected) => {
        if (!connected) wasDown = true;
        else if (wasDown) {
          wasDown = false;
          refresh();
        }
      }),
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

/** Карточка чата: участники, мои права, отметки прочтения. Обновляется по событиям чата. */
export function useChatDetail(chatId: string | number, { fresh = false }: { fresh?: boolean } = {}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: chatKeys.detail(chatId),
    queryFn: () => api.get<ChatDetail>(`/api/chats/${chatId}`),
    staleTime: 30_000,
    // Экрану переписки нужны свежие отметки прочтения, а не данные из кеша.
    refetchOnMount: fresh ? 'always' : true,
  });
  useEffect(() => {
    const same = (id: unknown) => String(id) === String(chatId);
    const refresh = () => qc.invalidateQueries({ queryKey: chatKeys.detail(chatId) });
    const offs = [
      subscribe<{ id: number }>('chat_updated', (c) => same(c.id) && refresh()),
      subscribe<{ chatId: number | string }>('members_changed', (e) => same(e.chatId) && refresh()),
    ];
    return () => offs.forEach((off) => off());
  }, [chatId, qc]);
  return query;
}

/** Темы супергруппы (как форумы Telegram). live — обновлять превью последних сообщений. */
export function useTopics(chatId: string | number, { enabled = true, live = false }: { enabled?: boolean; live?: boolean } = {}) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: chatKeys.topics(chatId),
    queryFn: () => api.get<Topic[]>(`/api/chats/${chatId}/topics`),
    // Список тем показывает последние сообщения — при открытии всегда свежий.
    staleTime: live ? 0 : 30_000,
    enabled,
  });
  useEffect(() => {
    if (!enabled) return;
    const same = (id: unknown) => String(id) === String(chatId);
    const refresh = () => qc.invalidateQueries({ queryKey: chatKeys.topics(chatId) });
    const offs = [
      subscribe<{ chat_id: number }>('topic_created', (t) => same(t.chat_id) && refresh()),
      subscribe<{ chat_id: number }>('topic_updated', (t) => same(t.chat_id) && refresh()),
      subscribe('topic_deleted', refresh),
    ];
    if (live) offs.push(subscribe<{ chat_id: number | string }>('chat_activity', (e) => same(e.chat_id) && refresh()));
    return () => offs.forEach((off) => off());
  }, [chatId, enabled, live, qc]);
  return query;
}
