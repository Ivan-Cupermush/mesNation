import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Info, NotebookPen, Paperclip, SendHorizonal, Star } from 'lucide-react';
import { NoteCard } from './NoteShareBubble';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../../lib/http';
import { fuzzyMatch } from '../../lib/fuzzy';
import { displayName, formatDate } from '../../lib/format';
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
  onPick: (noteId: number, caption: string) => void;
}

/**
 * Выбор своей заметки для отправки в чат. Как с файлом в Telegram:
 * выбрали — видно, как она будет выглядеть в чате, можно дописать подпись.
 */
export default function NotePicker({ open, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const { user } = useAuth();
  const [picked, setPicked] = useState<NoteRow | null>(null);
  const [caption, setCaption] = useState('');

  useEffect(() => {
    if (!open) {
      setPicked(null);
      setCaption('');
    }
  }, [open]);

  const send = () => {
    if (!picked) return;
    onClose();
    onPick(picked.id, caption.trim());
  };
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
    <Modal
      open={open}
      onClose={onClose}
      title={
        picked ? (
          <span className={s.backTitle}>
            <button type="button" className={s.back} onClick={() => setPicked(null)} aria-label="Выбрать другую">
              <ChevronLeft size={22} />
            </button>
            Отправить заметку
          </span>
        ) : (
          'Отправить заметку'
        )
      }
      size="md"
      flush
    >
      {picked ? (
        <div className={s.sendStep}>
          <div className={s.previewChat}>
            <div className={s.previewBubble}>
              <NoteCard
                title={picked.title || ''}
                preview={(picked.content || '').slice(0, 400)}
                filesCount={picked.files_count}
                ownerName={displayName(user)}
                ownerAvatar={user?.avatar_url}
                ownerLine="Копия на момент отправки"
                mine
              />
              {caption.trim() && <div className={s.previewCaption}>{caption.trim()}</div>}
            </div>
          </div>
          <div className={s.hint}>
            <Info size={14} />
            Уйдёт копия на этот момент. Ваши дальнейшие правки получатели не увидят, но смогут запросить текущую версию.
          </div>
          <div className={s.composer}>
            <textarea
              className={s.captionInput}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder="Добавить подпись…"
              maxLength={4000}
              rows={1}
              autoFocus
            />
            <button type="button" className={s.sendBtn} onClick={send} aria-label="Отправить заметку" title="Отправить">
              <SendHorizonal size={20} />
            </button>
          </div>
        </div>
      ) : (
      <>
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
              onClick={() => setPicked(n)}
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
      </>
      )}
    </Modal>
  );
}
