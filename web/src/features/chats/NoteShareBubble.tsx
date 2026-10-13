import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { BookOpenCheck, Check, Clock3, FileText, Info, MoreHorizontal, NotebookPen, Paperclip, Plus, RefreshCw } from 'lucide-react';
import { api, openFile } from '../../lib/http';
import { fileBadge, formatSize, plural } from '../../lib/format';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Spinner } from '../../ui/Spinner';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { useFeedback } from '../../ui/feedback';
import type { NoteShareInfo } from './types';
import s from './NoteShareBubble.module.css';

interface VersionRequestBrief {
  id: number;
  status: 'pending' | 'approved' | 'declined';
  result_note_id: number | null;
  already?: boolean;
}

interface SharedNote {
  id: number;
  title: string;
  content: string;
  files: { file_url: string; file_name: string; file_size: number | null; mime_type: string | null }[];
  sender_id: number;
  sender_name: string;
  sender_avatar_url?: string | null;
  created_at: string;
  accepted_note_id: number | null;
  is_accepted: boolean;
  is_owner?: boolean;
  original_note_id?: number | null;
  original_exists?: boolean;
  my_request?: VersionRequestBrief | null;
}

const stop = (e: SyntheticEvent) => e.stopPropagation();
const shortDate = (iso?: string | null) =>
  iso ? `${new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}, ${new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : '';
const filesLabel = (n: number) => `${n} ${plural(n, ['вложение', 'вложения', 'вложений'])}`;

/** Попросить у автора текущую версию; возвращает текст для подсказки. */
export async function requestNoteVersion(shareId: number, ownerName?: string | null): Promise<string> {
  const r = await api.post<VersionRequestBrief>(`/api/notes/shared/${shareId}/request`, {});
  if (r.already) return 'Запрос уже отправлен — ждём ответа автора';
  return ownerName ? `Запрос отправлен. ${ownerName} получит уведомление` : 'Запрос отправлен';
}

/** Карточка-«страница» заметки — в сообщении и в предпросмотре перед отправкой. */
export function NoteCard({
  title,
  preview,
  filesCount,
  ownerName,
  ownerAvatar,
  ownerLine,
  mine,
  right,
}: {
  title: string;
  preview?: string | null;
  filesCount: number;
  ownerName?: string | null;
  ownerAvatar?: string | null;
  ownerLine: string;
  mine: boolean;
  right?: ReactNode;
}) {
  return (
    <span className={[s.card, mine && s.cardMine].filter(Boolean).join(' ')}>
      <span className={s.head}>
        <span className={s.tile}>
          <NotebookPen size={19} strokeWidth={2.1} />
        </span>
        <span className={s.headText}>
          <span className={s.title}>{title || 'Без названия'}</span>
          <span className={s.kind}>
            Заметка
            {filesCount > 0 && (
              <>
                {' · '}
                <Paperclip size={11} strokeWidth={2.4} /> {filesLabel(filesCount)}
              </>
            )}
          </span>
        </span>
      </span>
      {preview ? (
        <span className={s.page}>
          <span className={s.pageText}>{preview}</span>
        </span>
      ) : null}
      <span className={s.foot}>
        <Avatar name={ownerName} src={ownerAvatar} size={20} />
        <span className={s.footText}>{ownerLine}</span>
        {right}
      </span>
    </span>
  );
}

interface Props {
  share: NoteShareInfo;
  meId: number;
  mine: boolean;
  /** Получатель добавил заметку к себе. */
  onAccepted: (noteId: number) => void;
  /** Открыть заметку из своих (оригинал или полученную версию). */
  onOpenNote?: (noteId: number) => void;
}

/**
 * Заметка в чате — как файл в Telegram: карточка с началом текста и
 * автором, подпись — обычным текстом под ней. Отправляется копия на момент
 * отправки; получатель добавляет её себе или запрашивает текущую версию.
 */
export default function NoteShareBubble({ share, meId, mine, onAccepted, onOpenNote }: Props) {
  const { toast } = useFeedback();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const accepted = share.accepted_user_ids.includes(meId);
  const isOwner = share.sender_id === meId;

  const acceptNow = async () => {
    if (accepted) return setOpen(true);
    setBusy(true);
    try {
      const created = await api.post<{ id: number }>(`/api/notes/shared/${share.id}/accept`, {});
      onAccepted(created.id);
    } catch (e) {
      toast.error(e, 'Не удалось добавить заметку');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={s.cardBtn}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={`Заметка «${share.title || 'Без названия'}»`}
      >
        <NoteCard
          title={share.title}
          preview={share.preview}
          filesCount={share.files_count}
          ownerName={share.sender_name}
          ownerAvatar={share.sender_avatar_url}
          ownerLine={isOwner ? `Ваша копия${share.created_at ? ` · ${shortDate(share.created_at)}` : ''}` : share.sender_name || 'Автор заметки'}
          mine={mine}
          right={
            isOwner ? null : (
              <span
                role="button"
                tabIndex={0}
                className={[s.cta, accepted && s.ctaDone].filter(Boolean).join(' ')}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!busy) acceptNow();
                }}
                onKeyDown={(e) => e.key === 'Enter' && (e.stopPropagation(), acceptNow())}
                aria-label={accepted ? 'Уже в ваших заметках' : 'Добавить в мои заметки'}
              >
                {busy ? <Spinner size={12} inherit /> : accepted ? <Check size={13} strokeWidth={2.8} /> : <Plus size={14} strokeWidth={2.8} />}
                {accepted ? 'В заметках' : 'В заметки'}
              </span>
            )
          }
        />
      </button>

      {/* Окно — в портале, но события React всплывают к пузырю: гасим их здесь. */}
      <span className={s.isolate} onClick={stop} onContextMenu={stop} onTouchStart={stop}>
        {open && (
          <Viewer
            shareId={share.id}
            onClose={() => setOpen(false)}
            onAccepted={(id) => {
              setOpen(false);
              onAccepted(id);
            }}
            onOpenNote={(id) => {
              setOpen(false);
              onOpenNote?.(id);
            }}
          />
        )}
      </span>
    </>
  );
}

function Viewer({ shareId, onClose, onAccepted, onOpenNote }: { shareId: number; onClose: () => void; onAccepted: (id: number) => void; onOpenNote: (id: number) => void }) {
  const { toast } = useFeedback();
  const [note, setNote] = useState<SharedNote | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    let alive = true;
    api
      .get<SharedNote>(`/api/notes/shared/${shareId}`)
      .then((n) => alive && setNote(n))
      .catch((e) => {
        if (!alive) return;
        closeRef.current();
        toast.error(e, 'Не удалось открыть заметку');
      });
    return () => {
      alive = false;
    };
  }, [shareId, toast]);

  const accept = async () => {
    if (!note) return;
    if (note.is_accepted && note.accepted_note_id) return onOpenNote(note.accepted_note_id);
    setAccepting(true);
    try {
      const created = await api.post<{ id: number }>(`/api/notes/shared/${note.id}/accept`, {});
      onAccepted(created.id);
    } catch (e) {
      toast.error(e, 'Не удалось добавить заметку');
    } finally {
      setAccepting(false);
    }
  };

  const ask = async () => {
    if (!note) return;
    setRequesting(true);
    try {
      toast.success(await requestNoteVersion(note.id, note.sender_name));
      const fresh = await api.get<SharedNote>(`/api/notes/shared/${note.id}`).catch(() => null);
      if (fresh) setNote(fresh);
    } catch (e) {
      toast.error(e, 'Не удалось отправить запрос');
    } finally {
      setRequesting(false);
    }
  };

  const req = note?.my_request || null;
  const pending = req?.status === 'pending';
  const received = req?.status === 'approved' && req.result_note_id ? req.result_note_id : null;
  const canRequest = !!note && !note.is_owner && note.original_exists !== false;

  const items: MenuItem[] = [];
  if (note && canRequest) {
    items.push({
      key: 'request',
      label: pending ? 'Запрос уже отправлен' : 'Запросить текущую версию',
      icon: pending ? <Clock3 size={18} /> : <RefreshCw size={18} />,
      onSelect: () => (pending ? toast('Запрос уже отправлен — ждём ответа автора') : ask()),
    });
  }
  if (received) items.push({ key: 'received', label: 'Открыть полученную версию', icon: <BookOpenCheck size={18} />, onSelect: () => onOpenNote(received) });
  if (note && !note.is_owner) {
    items.push({
      key: 'accept',
      label: note.is_accepted ? 'Открыть в моих заметках' : 'Добавить в мои заметки',
      icon: note.is_accepted ? <Check size={18} /> : <Plus size={18} />,
      onSelect: accept,
    });
  }
  if (note?.is_owner && note.original_note_id) {
    items.push({ key: 'original', label: 'Открыть оригинал', icon: <NotebookPen size={18} />, onSelect: () => onOpenNote(note.original_note_id!) });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={
        <span className={s.viewerTitle}>
          Заметка
          {note && (
            <IconButton label="Ещё" size={34} onClick={(e) => setMenu(anchorFrom(e.currentTarget))}>
              <MoreHorizontal size={19} />
            </IconButton>
          )}
        </span>
      }
      footer={
        note && !note.is_owner ? (
          <Button variant={note.is_accepted ? 'soft' : 'primary'} icon={note.is_accepted ? <Check size={18} /> : <Plus size={18} />} loading={accepting} onClick={accept}>
            {note.is_accepted ? 'Открыть в моих заметках' : 'Добавить в мои заметки'}
          </Button>
        ) : undefined
      }
    >
      {!note ? (
        <div className={s.center}>
          <Spinner />
        </div>
      ) : (
        <>
          <div className={s.owner}>
            <div className={s.ownerRow}>
              <Avatar name={note.sender_name} src={note.sender_avatar_url} size={44} />
              <div className={s.ownerText}>
                <div className={s.ownerName}>{note.is_owner ? 'Вы' : note.sender_name || 'Автор'}</div>
                <div className={s.ownerSub}>
                  {note.is_owner ? 'Вы поделились копией' : 'Автор заметки · поделился копией'} {shortDate(note.created_at)}
                </div>
              </div>
            </div>
            {note.is_owner ? (
              note.original_note_id ? (
                <button type="button" className={s.ownerBtn} onClick={() => onOpenNote(note.original_note_id!)}>
                  <NotebookPen size={17} /> Открыть оригинал
                </button>
              ) : null
            ) : !canRequest ? (
              <div className={s.ownerHint}>
                <Info size={14} /> Автор удалил оригинал — осталась только эта копия
              </div>
            ) : (
              <>
                {received ? (
                  <button type="button" className={[s.ownerBtn, s.ownerBtnFilled].join(' ')} onClick={() => onOpenNote(received)}>
                    <BookOpenCheck size={17} /> Открыть полученную версию
                  </button>
                ) : null}
                <button
                  type="button"
                  className={[s.ownerBtn, pending && s.ownerBtnWaiting].filter(Boolean).join(' ')}
                  onClick={pending ? () => toast('Запрос уже отправлен — ждём ответа автора') : ask}
                  disabled={requesting}
                >
                  {requesting ? <Spinner size={16} inherit /> : pending ? <Clock3 size={17} /> : <RefreshCw size={17} />}
                  {pending ? 'Запрос отправлен · ждём ответа' : received ? 'Запросить ещё раз' : 'Запросить текущую версию'}
                </button>
                {req?.status === 'declined' ? (
                  <div className={s.ownerFine}>Прошлый запрос автор отклонил — можно попросить снова.</div>
                ) : !pending && !received ? (
                  <div className={s.ownerFine}>Это копия на момент отправки. Если автор что-то поменял, он сможет поделиться новой версией — она придёт отдельной заметкой.</div>
                ) : null}
              </>
            )}
          </div>

          <h3 className={s.noteTitle}>{note.title || 'Без названия'}</h3>
          <div className={s.noteContent}>{note.content || 'Текста нет'}</div>
          {note.files.length > 0 && (
            <div className={s.attachments}>
              <div className={s.section}>{filesLabel(note.files.length)}</div>
              {note.files.map((f) => {
                const b = fileBadge(f.file_name);
                return (
                  <button
                    key={f.file_url}
                    type="button"
                    className={s.fileRow}
                    onClick={() => openFile(f.file_url).catch((e) => toast.error(e, 'Не удалось открыть файл'))}
                  >
                    <span className={s.fileIcon} style={{ background: b.color }}>
                      {b.ext || <FileText size={18} />}
                    </span>
                    <span className={s.fileName}>{f.file_name}</span>
                    {f.file_size ? <span className={s.fileSize}>{formatSize(f.file_size)}</span> : null}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
      <ActionMenu
        open={!!menu}
        anchor={menu}
        items={items}
        title={note ? (note.is_owner ? 'Ваша заметка' : `Автор: ${note.sender_name || 'неизвестен'}`) : undefined}
        header={
          note ? (
            <div className={s.menuHint}>{note.is_owner ? 'Вы поделились копией этой заметки' : 'Эту заметку вам отправили — это копия на момент отправки'}</div>
          ) : undefined
        }
        onClose={() => setMenu(null)}
      />
    </Modal>
  );
}
