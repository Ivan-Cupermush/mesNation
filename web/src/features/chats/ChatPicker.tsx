import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { fuzzyMatch } from '../../lib/fuzzy';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { SearchField } from '../../ui/Field';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import { useChats, useTopics } from './queries';
import { TopicIcon } from './topicIcons';
import { MAX_TEXT } from './Composer';
import s from './ChatPicker.module.css';

interface Props {
  open: boolean;
  title: string;
  /** Подпись кнопки отправки. */
  action?: string;
  onClose: () => void;
  /** topicId: тема супергруппы (null — «Общий»). */
  onSend: (chatId: number, topicId: number | null, comment: string) => Promise<void>;
}

/** Выбор чата (и темы супергруппы) с необязательным комментарием — пересылка, отправка заметки. */
export default function ChatPicker({ open, title, action = 'Отправить', onClose, onSend }: Props) {
  const { toast } = useFeedback();
  const { data: chats, isLoading } = useChats();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [topicId, setTopicId] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
    setTopicId(null);
    setComment('');
  }, [open]);

  const chat = chats?.find((c) => c.id === selected) || null;
  const { data: topics } = useTopics(selected ?? 0, { enabled: !!chat?.is_supergroup });

  const filtered = useMemo(() => {
    const list = chats || [];
    if (!query.trim()) return list;
    return list
      .map((c) => ({ c, r: fuzzyMatch(c.name || '', query) }))
      .filter((x) => x.r.match)
      .sort((a, b) => a.r.rank - b.r.rank)
      .map((x) => x.c);
  }, [chats, query]);

  const send = async () => {
    if (!selected) return;
    setSending(true);
    try {
      await onSend(selected, chat?.is_supergroup ? topicId : null, comment.trim());
      onClose();
    } catch (e) {
      toast.error(e, 'Не удалось отправить');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      persistent={sending}
      title={title}
      size="md"
      flush
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={sending}>
            Отмена
          </Button>
          <Button onClick={send} loading={sending} disabled={!selected}>
            {action}
          </Button>
        </>
      }
    >
      <div className={s.search}>
        <SearchField value={query} onChange={setQuery} placeholder="Поиск чата" autoFocus />
      </div>
      <div className={s.list}>
        {isLoading ? (
          <div className={s.center}>
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <div className={s.empty}>Чаты не найдены</div>
        ) : (
          filtered.map((c) => (
            <button
              key={c.id}
              type="button"
              className={[s.row, selected === c.id && s.rowOn].filter(Boolean).join(' ')}
              onClick={() => {
                setSelected(c.id);
                setTopicId(null);
              }}
            >
              <Avatar name={c.name} src={c.avatar_url} size={42} />
              <span className={s.name}>{c.name || 'Чат'}</span>
              {selected === c.id && <Check size={20} className={s.check} />}
            </button>
          ))
        )}
      </div>
      {chat?.is_supergroup && (
        <div className={s.topics}>
          <div className={s.label}>Тема</div>
          <div className={s.topicRow}>
            {[null, ...(topics || [])].map((t) => (
              <button
                key={t?.id ?? 0}
                type="button"
                className={[s.topic, (t?.id ?? null) === topicId && s.topicOn].filter(Boolean).join(' ')}
                onClick={() => setTopicId(t?.id ?? null)}
              >
                <TopicIcon topic={t} size={22} />
                {t?.title || 'Общий'}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className={s.comment}>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Комментарий (необязательно)" rows={2} maxLength={MAX_TEXT} />
      </div>
    </Modal>
  );
}
