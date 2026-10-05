import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Check, ChevronLeft, Cloud, CloudOff, Copy, CopyPlus, Download, FileDown, FileText, MoreVertical, Paperclip, Send, Star, Trash2, X } from 'lucide-react';
import { api, ApiError, downloadFile, openFile, upload } from '../../lib/http';
import { formatDate, formatSize, toDateKey } from '../../lib/format';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { PageLoader, Spinner } from '../../ui/Spinner';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { useFeedback } from '../../ui/feedback';
import ChatPicker from '../chats/ChatPicker';
import { useNotesContext } from './context';
import { noteKeys, noteText, useNote, type Note, type NoteFile } from './queries';
import s from './NoteEditor.module.css';

const AUTOSAVE_MS = 1200;
const MAX_NOTE_FILE = 50 * 1024 * 1024;

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

/** Сеанс редактирования: не меняется, когда новая заметка получает адрес /notes/:id после первого сохранения. */
const editorSession = (loc: { pathname: string; search: string; state: unknown }) =>
  (loc.state as { session?: string } | null)?.session ?? loc.pathname + loc.search;

export default function NoteEditor() {
  const { id } = useParams();
  const noteId = id ? Number(id) : 0;
  const [params] = useSearchParams();
  const location = useLocation();
  const { data, isLoading, error } = useNote(noteId);
  if (noteId && isLoading) return <PageLoader />;
  if (noteId && (error || !data)) {
    const missing = error instanceof ApiError && error.status === 404;
    return <EmptyState title={missing ? 'Заметка не найдена' : 'Не удалось открыть заметку'} text={missing ? 'Возможно, её удалили.' : error instanceof Error ? error.message : undefined} />;
  }
  return <Editor key={editorSession(location)} initial={noteId ? data! : null} initialDate={params.get('date') || toDateKey(new Date())} session={editorSession(location)} />;
}

function Editor({ initial, initialDate, session }: { initial: Note | null; initialDate: string; session: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const { split, update: updateList } = useNotesContext();
  const [note, setNote] = useState<Note | null>(initial);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [favorite, setFavorite] = useState(initial?.is_favorite ?? false);
  const [date, setDate] = useState(initial?.note_date ?? initialDate);
  const [files, setFiles] = useState<NoteFile[]>(initial?.files ?? []);
  const [status, setStatus] = useState<SaveState>('saved');
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [sharing, setSharing] = useState(false);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Последняя сохранённая версия и актуальные значения — для автосохранения и выхода.
  const saved = useRef({ title: initial?.title ?? '', content: initial?.content ?? '', favorite: initial?.is_favorite ?? false, date: initial?.note_date ?? initialDate });
  const current = useRef({ title, content, favorite, date });
  current.current = { title, content, favorite, date };
  const noteRef = useRef(note);
  noteRef.current = note;
  const inflight = useRef<Promise<Note | null> | null>(null);

  const isDirty = () => {
    const c = current.current;
    const v = saved.current;
    return c.title !== v.title || c.content !== v.content || c.favorite !== v.favorite || c.date !== v.date;
  };
  const dirty = title !== saved.current.title || content !== saved.current.content || favorite !== saved.current.favorite || date !== saved.current.date;

  const invalidateLists = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['notes', 'days'] });
    qc.invalidateQueries({ queryKey: ['notes', 'date'] });
    qc.invalidateQueries({ queryKey: noteKeys.favorites });
    qc.invalidateQueries({ queryKey: noteKeys.every });
  }, [qc]);

  /** Сохранить сейчас. Новая пустая заметка не создаётся. Возвращает сохранённую заметку. */
  const saveNow = useCallback(async (): Promise<Note | null> => {
    if (inflight.current) await inflight.current.catch(() => null);
    const c = { ...current.current };
    const existing = noteRef.current;
    if (existing && !isDirty()) return existing;
    if (!existing && !c.title.trim() && !c.content.trim()) return null;
    setStatus('saving');
    const run = (async () => {
      const body = { title: c.title, content: c.content, is_favorite: c.favorite, note_date: c.date };
      const result = existing ? await api.patch<Note>(`/api/notes/${existing.id}`, body) : await api.post<Note>('/api/notes', body);
      saved.current = { title: c.title, content: c.content, favorite: c.favorite, date: c.date };
      noteRef.current = result;
      setNote(result);
      qc.setQueryData(noteKeys.one(result.id), result);
      invalidateLists();
      if (!existing) {
        // Новая заметка получает свой адрес; сеанс тот же — редактор не перезапускается.
        navigate(`/notes/${result.id}`, { replace: true, state: { session } });
      }
      return result;
    })();
    inflight.current = run;
    try {
      const result = await run;
      setStatus(isDirty() ? 'dirty' : 'saved');
      return result;
    } catch (e) {
      setStatus('error');
      throw e;
    } finally {
      if (inflight.current === run) inflight.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalidateLists, navigate, qc, session]);

  // Автосохранение после паузы в наборе.
  useEffect(() => {
    if (!dirty) return;
    setStatus((st) => (st === 'saving' ? st : 'dirty'));
    const t = setTimeout(() => {
      saveNow().catch(() => undefined);
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [dirty, title, content, favorite, date, saveNow]);

  // Уход со страницы: несохранённое дописываем, вкладку без сохранения не закрываем молча.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty() || inflight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (isDirty()) saveNow().catch(() => toast.error('Последние изменения заметки не сохранились'));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!initial) setTimeout(() => titleRef.current?.focus(), 50);
  }, [initial]);

  // Поле текста растёт вместе с содержимым.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(el.scrollHeight, 240)}px`;
  }, [content]);

  const saveWithFeedback = async () => {
    try {
      const r = await saveNow();
      if (!r) toast('Добавьте заголовок или текст');
    } catch (e) {
      toast.error(e, 'Не удалось сохранить заметку');
    }
  };

  /** Для действий на сервере заметка должна быть сохранена. */
  const ensureSaved = async (): Promise<Note | null> => {
    try {
      const r = await saveNow();
      if (!r) toast('Сначала добавьте заголовок или текст');
      return r;
    } catch (e) {
      toast.error(e, 'Не удалось сохранить заметку');
      return null;
    }
  };

  const addFiles = async (list: File[]) => {
    if (!list.length) return;
    const n = await ensureSaved();
    if (!n) return;
    for (const f of list) {
      if (f.size > MAX_NOTE_FILE) {
        toast.error(`«${f.name}» больше 50 МБ`);
        continue;
      }
      setUploading({ name: f.name, progress: 0 });
      try {
        const added = await upload<NoteFile>(`/api/notes/${n.id}/files`, 'file', f, f.name, {}, (p) => setUploading({ name: f.name, progress: p })).promise;
        setFiles((prev) => [...prev, added]);
      } catch (e) {
        toast.error(e, `Не удалось прикрепить «${f.name}»`);
      }
    }
    setUploading(null);
    invalidateLists();
  };

  const removeFile = async (f: NoteFile) => {
    if (!note || !(await confirm({ title: 'Удалить вложение?', text: f.file_name, confirmText: 'Удалить', danger: true }))) return;
    try {
      await api.delete(`/api/notes/${note.id}/files/${f.id}`);
      setFiles((prev) => prev.filter((x) => x.id !== f.id));
      invalidateLists();
    } catch (e) {
      toast.error(e, 'Не удалось удалить файл');
    }
  };

  const exportPdf = async () => {
    // Окно открываем сразу — иначе браузер заблокирует его как всплывающее.
    const win = window.open('', '_blank');
    const n = await ensureSaved();
    if (!n) {
      win?.close();
      return;
    }
    try {
      const { url } = await api.get<{ url: string }>(`/api/notes/${n.id}/pdf-link`);
      if (win) win.location.href = url;
      else window.location.href = url;
    } catch (e) {
      win?.close();
      toast.error(e, 'Не удалось подготовить PDF');
    }
  };

  const duplicate = async () => {
    const n = await ensureSaved();
    if (!n) return;
    try {
      const copy = await api.post<Note>(`/api/notes/${n.id}/duplicate`, {});
      invalidateLists();
      navigate(`/notes/${copy.id}`);
    } catch (e) {
      toast.error(e, 'Не удалось скопировать заметку');
    }
  };

  const remove = async () => {
    if (!note) {
      // Несохранённая новая заметка — просто закрываем без сохранения.
      saved.current = { ...current.current };
      navigate('/notes');
      return;
    }
    if (!(await confirm({ title: 'Удалить заметку?', text: 'Заметка и её вложения будут удалены без возможности восстановления.', confirmText: 'Удалить', danger: true }))) return;
    try {
      await api.delete(`/api/notes/${note.id}`);
      saved.current = { ...current.current };
      invalidateLists();
      qc.removeQueries({ queryKey: noteKeys.one(note.id) });
      navigate('/notes', { replace: true });
    } catch (e) {
      toast.error(e, 'Не удалось удалить заметку');
    }
  };

  const copyText = async () => {
    const text = noteText({ title, content });
    if (!text) {
      toast('Заметка пустая');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Текст заметки скопирован');
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  const items: MenuItem[] = [
    { key: 'copy', label: 'Скопировать текст', icon: <Copy size={19} />, onSelect: copyText },
    { key: 'duplicate', label: 'Создать копию', icon: <CopyPlus size={19} />, onSelect: duplicate },
    { key: 'pdf', label: 'Скачать PDF', icon: <FileDown size={19} />, onSelect: exportPdf },
    {
      key: 'share',
      label: 'Отправить в чат',
      icon: <Send size={19} />,
      onSelect: async () => {
        if (await ensureSaved()) setSharing(true);
      },
    },
    { key: 'delete', label: note ? 'Удалить' : 'Не сохранять', danger: true, icon: <Trash2 size={19} />, onSelect: remove },
  ];

  const statusView =
    status === 'saving' ? (
      <span className={s.status}>
        <Spinner size={13} inherit /> Сохранение…
      </span>
    ) : status === 'error' ? (
      <button type="button" className={[s.status, s.statusError].join(' ')} onClick={saveWithFeedback}>
        <CloudOff size={14} /> Не сохранено — повторить
      </button>
    ) : status === 'dirty' ? (
      <span className={s.status}>
        <Cloud size={14} /> Изменения…
      </span>
    ) : note ? (
      <span className={s.status}>
        <Check size={14} /> Сохранено
      </span>
    ) : null;

  return (
    <div
      className={s.page}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          saveWithFeedback();
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <header className={s.header}>
        {!split && (
          <IconButton label="Назад" onClick={() => navigate('/notes')}>
            <ChevronLeft size={26} />
          </IconButton>
        )}
        <div className={s.headerMain}>
          <span className={s.kicker}>{note ? 'Редактирование' : 'Новая заметка'}</span>
          {statusView}
        </div>
        <IconButton label={favorite ? 'Убрать из избранного' : 'В избранное'} active={favorite} onClick={() => setFavorite((f) => !f)}>
          <Star size={20} className={favorite ? s.starOn : s.starOff} fill={favorite ? 'currentColor' : 'none'} />
        </IconButton>
        <IconButton label="Действия с заметкой" onClick={(e) => setMenu(anchorFrom(e.currentTarget))}>
          <MoreVertical size={20} />
        </IconButton>
        <Button size="sm" onClick={saveWithFeedback} disabled={status === 'saving' || (!dirty && !!note)}>
          Сохранить
        </Button>
      </header>

      <div className={s.scroll}>
        <div className={s.inner}>
          <label className={s.date}>
            <CalendarDays size={15} />
            <span>{formatDate(date + 'T00:00:00')}</span>
            <input
              type="date"
              value={date}
              onChange={(e) => {
                if (!e.target.value) return;
                setDate(e.target.value);
                updateList({ date: e.target.value, month: new Date(e.target.value + 'T00:00:00'), favorites: false });
              }}
              aria-label="Дата заметки"
            />
          </label>
          <input ref={titleRef} className={s.title} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Заголовок заметки" maxLength={255} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), contentRef.current?.focus())} />
          <textarea ref={contentRef} className={s.content} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Напишите свои мысли…" maxLength={200000} />

          <section className={s.attachments}>
            <div className={s.attachHead}>
              <span className={s.attachTitle}>
                <Paperclip size={16} /> Вложения
              </span>
              <Button size="sm" variant="soft" onClick={() => fileInput.current?.click()} disabled={!!uploading}>
                Прикрепить
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  const list = Array.from(e.currentTarget.files || []);
                  e.currentTarget.value = '';
                  addFiles(list);
                }}
              />
            </div>
            {files.length === 0 && !uploading && <div className={s.attachEmpty}>Перетащите файлы сюда или нажмите «Прикрепить»</div>}
            {files.map((f) => (
              <div key={f.id} className={s.file}>
                <button type="button" className={s.fileMain} onClick={() => openFile(f.file_url).catch((e) => toast.error(e, 'Не удалось открыть файл'))}>
                  <FileText size={18} className={s.fileIcon} />
                  <span className={s.fileName}>{f.file_name}</span>
                  {f.file_size ? <span className={s.fileSize}>{formatSize(f.file_size)}</span> : null}
                </button>
                <IconButton label="Скачать" size={32} onClick={() => downloadFile(f.file_url, f.file_name).catch((e) => toast.error(e))}>
                  <Download size={16} />
                </IconButton>
                <IconButton label="Удалить вложение" size={32} onClick={() => removeFile(f)}>
                  <X size={16} />
                </IconButton>
              </div>
            ))}
            {uploading && (
              <div className={s.file}>
                <Spinner size={16} />
                <span className={s.fileName}>{uploading.name}</span>
                <span className={s.fileSize}>{Math.round(uploading.progress * 100)}%</span>
              </div>
            )}
          </section>
        </div>
      </div>

      <ActionMenu open={!!menu} anchor={menu} items={items} title={title || 'Заметка'} onClose={() => setMenu(null)} />
      <ChatPicker
        open={sharing}
        title="Отправить заметку в чат"
        onClose={() => setSharing(false)}
        onSend={async (chatId, topicId, comment) => {
          await api.post(`/api/notes/${note!.id}/share`, { chat_id: chatId, topic_id: topicId, comment: comment || undefined });
          toast.success('Отправлено — получатель сможет принять заметку к себе');
        }}
      />
    </div>
  );
}
