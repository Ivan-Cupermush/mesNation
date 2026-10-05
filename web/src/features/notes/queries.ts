import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/http';

export interface NoteFile {
  id: number;
  note_id: number;
  file_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_at?: string;
}

export interface Note {
  id: number;
  user_id: number;
  title: string;
  content: string;
  is_favorite: boolean;
  note_date: string;
  created_at: string;
  updated_at: string;
  files_count: number;
  files?: NoteFile[];
}

export const noteKeys = {
  all: ['notes'] as const,
  days: (month: string) => ['notes', 'days', month] as const,
  byDate: (date: string) => ['notes', 'date', date] as const,
  favorites: ['notes', 'favorites'] as const,
  every: ['notes', 'all'] as const,
  one: (id: number) => ['notes', 'one', id] as const,
};

export function useNoteDays(month: string) {
  return useQuery({
    queryKey: noteKeys.days(month),
    queryFn: () => api.get<{ note_date: string; note_count: number }[]>('/api/notes/days', { month }),
    select: (rows) => Object.fromEntries(rows.map((r) => [r.note_date, r.note_count])),
  });
}

export function useNotesByDate(date: string, enabled = true) {
  return useQuery({ queryKey: noteKeys.byDate(date), queryFn: () => api.get<Note[]>('/api/notes', { date }), enabled });
}

export function useFavoriteNotes(enabled = true) {
  return useQuery({ queryKey: noteKeys.favorites, queryFn: () => api.get<Note[]>('/api/notes/favorites'), enabled });
}

/** Все мои заметки — для поиска. Тот же ключ использует выбор заметки в чате. */
export function useAllNotes(enabled = true) {
  return useQuery({ queryKey: noteKeys.every, queryFn: () => api.get<Note[]>('/api/notes'), enabled, staleTime: 15_000 });
}

export function useNote(id: number) {
  return useQuery({ queryKey: noteKeys.one(id), queryFn: () => api.get<Note>(`/api/notes/${id}`), enabled: id > 0, refetchOnWindowFocus: false });
}

export const noteText = (n: Pick<Note, 'title' | 'content'>) => [n.title.trim(), n.content.trim()].filter(Boolean).join('\n\n');
