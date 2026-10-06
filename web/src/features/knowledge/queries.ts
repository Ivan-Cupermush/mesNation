import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/http';
import type { KbDocument, KbMessage, KbSession, KbStats, KnowledgeHealth } from './types';

export const kbKeys = {
  health: ['kb', 'health'] as const,
  sessions: ['kb', 'sessions'] as const,
  messages: (id: number) => ['kb', 'messages', id] as const,
  documents: ['kb', 'documents'] as const,
  stats: ['kb', 'stats'] as const,
};

export const useKbHealth = () =>
  useQuery({ queryKey: kbKeys.health, queryFn: () => api.get<KnowledgeHealth>('/api/knowledge/health'), staleTime: 60_000, retry: false });

export const useKbSessions = () => useQuery({ queryKey: kbKeys.sessions, queryFn: () => api.get<KbSession[]>('/api/knowledge/sessions') });

export const useKbMessages = (id: number) =>
  useQuery({ queryKey: kbKeys.messages(id), queryFn: () => api.get<KbMessage[]>(`/api/knowledge/sessions/${id}/messages`), enabled: id > 0 });

/** Пока документы обрабатываются, список обновляется сам. */
export const useKbDocuments = () =>
  useQuery({
    queryKey: kbKeys.documents,
    queryFn: () => api.get<KbDocument[]>('/api/knowledge/documents'),
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'pending' || d.status === 'processing') ? 3000 : false),
  });

export const useKbStats = (enabled: boolean) =>
  useQuery({ queryKey: kbKeys.stats, queryFn: () => api.get<KbStats>('/api/knowledge/stats'), enabled });
