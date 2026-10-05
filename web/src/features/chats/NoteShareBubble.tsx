import { useState, type SyntheticEvent } from 'react';
import { Check, Download, FileText, NotebookPen, Paperclip } from 'lucide-react';
import { api, openFile } from '../../lib/http';
import { formatSize } from '../../lib/format';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Spinner } from '../../ui/Spinner';
import { useFeedback } from '../../ui/feedback';
import type { NoteShareInfo } from './types';
import s from './NoteShareBubble.module.css';

interface SharedNote {
  id: number;
  title: string;
  content: string;
  files: { file_url: string; file_name: string; file_size: number | null; mime_type: string | null }[];
  sender_id: number;
  sender_name: string;
  created_at: string;
  accepted_note_id: number | null;
  is_accepted: boolean;
}

interface Props {
  share: NoteShareInfo;
  meId: number;
  mine: boolean;
  /** Получатель принял заметку (или открывает уже принятую). */
  onAccepted: (noteId: number) => void;
}

const stop = (e: SyntheticEvent) => e.stopPropagation();

/**
 * Заметка, отправленная в чат: карточка в ленте и окно просмотра с кнопкой
 * «Принять в мои заметки» — копия попадает в заметки получателя на сегодня.
 */
export default function NoteShareBubble({ share, meId, mine, onAccepted }: Props) {
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<SharedNote | null>(null);
  const [accepting, setAccepting] = useState(false);

  const accepted = share.accepted_user_ids.includes(meId);
  const isSender = share.sender_id === meId;

  const openNote = async () => {
    setOpen(true);
    setNote(null);
    try {
      setNote(await api.get<SharedNote>(`/api/notes/shared/${share.id}`));
    } catch (e) {
      setOpen(false);
      toast.error(e, 'Не удалось открыть заметку');
    }
  };

  const accept = async () => {
    setAccepting(true);
    try {
      const created = await api.post<{ id: number }>(`/api/notes/shared/${share.id}/accept`, {});
      setOpen(false);
      onAccepted(created.id);
    } catch (e) {
      toast.error(e, 'Не удалось принять заметку');
    } finally {
      setAccepting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={[s.card, mine && s.cardMine].filter(Boolean).join(' ')}
        onClick={(e) => {
          e.stopPropagation();
          openNote();
        }}
      >
        <span className={s.head}>
          <span className={s.icon}>
            <NotebookPen size={15} strokeWidth={2.2} />
          </span>
          <span className={s.kicker}>Заметка</span>
        </span>
        <span className={s.title}>{share.title || 'Без названия'}</span>
        {share.preview && <span className={s.preview}>{share.preview}</span>}
        {share.files_count > 0 && (
          <span className={s.files}>
            <Paperclip size={13} strokeWidth={2.2} />
            Вложений: {share.files_count}
          </span>
        )}
        {!isSender && (
          <span className={[s.cta, accepted && s.ctaDone].filter(Boolean).join(' ')}>
            {accepted ? <Check size={14} strokeWidth={2.6} /> : <Download size={14} strokeWidth={2.4} />}
            {accepted ? 'В ваших заметках' : 'Открыть и принять'}
          </span>
        )}
      </button>

      {/* Окно — в портале, но события React всплывают к пузырю: гасим их здесь. */}
      <span className={s.isolate} onClick={stop} onContextMenu={stop} onTouchStart={stop}>
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title={`Заметка${note?.sender_name ? ` от ${note.sender_name}` : ''}`}
          size="lg"
          footer={
            note && !isSender ? (
              note.is_accepted ? (
                <Button
                  variant="soft"
                  icon={<Check size={18} />}
                  onClick={() => {
                    setOpen(false);
                    if (note.accepted_note_id) onAccepted(note.accepted_note_id);
                  }}
                >
                  Уже в ваших заметках — открыть
                </Button>
              ) : (
                <Button icon={<Download size={18} />} loading={accepting} onClick={accept}>
                  Принять в мои заметки
                </Button>
              )
            ) : undefined
          }
        >
          {!note ? (
            <div className={s.center}>
              <Spinner />
            </div>
          ) : (
            <>
              <h3 className={s.noteTitle}>{note.title || 'Без названия'}</h3>
              <div className={s.noteContent}>{note.content || 'Текста нет'}</div>
              {note.files.length > 0 && (
                <div className={s.attachments}>
                  <div className={s.section}>Вложения</div>
                  {note.files.map((f) => (
                    <button
                      key={f.file_url}
                      type="button"
                      className={s.fileRow}
                      onClick={() => openFile(f.file_url).catch((e) => toast.error(e, 'Не удалось открыть файл'))}
                    >
                      <FileText size={18} />
                      <span className={s.fileName}>{f.file_name}</span>
                      {f.file_size ? <span className={s.fileSize}>{formatSize(f.file_size)}</span> : null}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </Modal>
      </span>
    </>
  );
}
