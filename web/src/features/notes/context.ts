import { createContext, useContext } from 'react';

export interface NotesState {
  /** Выбранный день YYYY-MM-DD. */
  date: string;
  /** Показываемый месяц календаря. */
  month: Date;
  favorites: boolean;
  query: string;
}

interface NotesContextValue {
  state: NotesState;
  update: (patch: Partial<NotesState>) => void;
  /** Список и редактор видны рядом. */
  split: boolean;
}

export const NotesContext = createContext<NotesContextValue | null>(null);

export function useNotesContext(): NotesContextValue {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error('useNotesContext вне раздела «Заметки»');
  return ctx;
}
