import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { NotebookPen, Paperclip, Star } from 'lucide-react';
import { api } from '../../lib/http';
import { fuzzyMatch } from '../../lib/fuzzy';
import { formatDate } from '../../lib/format';
import { Modal } from '../../ui/Modal';
import { SearchField } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';
import s from './NotePicker.module.css';

interface NoteRow {
  id: number;
  title: string | null;
  content: string | null;
  is_favorite: boolean;
  note_date: string;
  updated_at: string;
  files_count: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onPick: (noteId: number) => void;
}

/** Выбор своей заметки для отправки в чат. */
export default function NotePicker({ open, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const { data: notes, isLoading } = useQuery({
    queryKey: ['notes', 'all'],
    queryFn: () => api.get<NoteRow[]>('/api/notes'),
    enabled: open,
    staleTime: 15_000,
  });

  const filtered = useMemo(() => {
    const list = notes || [];
    if (!query.trim()) return list;
    return list.filter((n) => fuzzyMatch(`${n.title || ''} ${n.content || ''}`, query).match);
  }, [notes, query]);

  return (
    <Modal open={open} onClose={onClose} title="Отправить заметку" size="md" flush>
      <div className={s.search}>
        <SearchField value={query} onChange={setQuery} placeholder="Поиск по заметкам" autoFocus />
      </div>
      <div className={s.list}>
        {isLoading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className={s.center}>{notes?.length ? 'Ничего не найдено' : 'У вас пока нет заметок'}</div>
        ) : (
          filtered.map((n) => (
            <button
              key={n.id}
              type="button"
              className={s.row}
              onClick={() => {
                onClose();
                onPick(n.id);
              }}
            >
              <span className={s.icon}>
                <NotebookPen size={18} />
              </span>
              <span className={s.body}>
                <span className={s.title}>
                  {n.is_favorite && <Star size={13} className={s.star} fill="currentColor" />}
                  {n.title || 'Без названия'}
                </span>
                {n.content && <span className={s.preview}>{n.content}</span>}
                <span className={s.meta}>
                  {formatDate(n.note_date)}
                  {n.files_count > 0 && (
                    <>
                      {' · '}
                      <Paperclip size={11} /> {n.files_count}
                    </>
                  )}
                </span>
              </span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
