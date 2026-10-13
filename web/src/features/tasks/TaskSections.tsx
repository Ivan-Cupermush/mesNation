import { useEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Download,
  File,
  FileArchive,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Flag,
  Forward,
  ListChecks,
  Share2,
  History as HistoryIcon,
  Image as ImageIcon,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  SendHorizonal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { api, downloadFile, openFile, signedFileUrl, upload } from '../../lib/http';
import ChatPicker from '../chats/ChatPicker';
import { displayName, formatDate, formatSize, plural } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { Spinner } from '../../ui/Spinner';
import { DateTimeDialog } from '../../ui/DateTimeDialog';
import { useFeedback } from '../../ui/feedback';
import { linkify } from '../chats/model';
import { taskKeys, useTaskComments, useTaskHistory } from './queries';
import { DEADLINE_PRESETS, shortDate, statusMeta } from './status';
import type { TaskComment, TaskDetail } from './types';
import s from './TaskSections.module.css';

const MAX_TASK_FILE = 50 * 1024 * 1024;

function Section({ icon, title, count, children, action }: { icon: ReactNode; title: string; count?: number | string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className={s.section}>
      <header className={s.head}>
        <span className={s.headIcon}>{icon}</span>
        <h2 className={s.headTitle}>{title}</h2>
        {count !== undefined && <span className={s.headCount}>{count}</span>}
        {action && <span className={s.headAction}>{action}</span>}
      </header>
      {children}
    </section>
  );
}

function Linkified({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((p, i) =>
        typeof p === 'string' ? (
          p
        ) : (
          <a key={i} href={p.url} target="_blank" rel="noopener noreferrer nofollow">
            {p.url}
          </a>
        ),
      )}
    </>
  );
}

// ===== Контрольные точки =====

export function Checkpoints({ task, isCreator, isWatcher, onChanged }: { task: TaskDetail; isCreator: boolean; isWatcher: boolean; onChanged: () => void }) {
  const { toast, confirm } = useFeedback();
  const [title, setTitle] = useState('');
  const [picking, setPicking] = useState(false);
  const archived = task.status_new === 'archived';
  const canMark = (isCreator || isWatcher) && !archived;
  const canEdit = isCreator && !archived;
  if (!task.checkpoints.length && !canEdit) return null;

  const act = async (fn: () => Promise<unknown>, fail: string) => {
    try {
      await fn();
      onChanged();
    } catch (e) {
      toast.error(e, fail);
      throw e;
    }
  };

  const add = async (deadline: Date) => {
    await act(() => api.post(`/api/tasks/${task.id}/checkpoints`, { title: title.trim(), deadline: deadline.toISOString() }), 'Не удалось добавить');
    setTitle('');
  };

  return (
    <Section icon={<Flag size={17} />} title="Контрольные точки" count={task.checkpoints.length}>
      {task.checkpoints.map((cp) => {
        const done = cp.status === 'completed';
        const missed = cp.status === 'missed';
        const late = !done && !missed && new Date(cp.deadline) < new Date();
        return (
          <div key={cp.id} className={s.cp}>
            <button
              type="button"
              className={[s.cpBox, done && s.cpDone, missed && s.cpMissed].filter(Boolean).join(' ')}
              disabled={!canMark}
              onClick={() => act(() => api.patch(`/api/tasks/${task.id}/checkpoints/${cp.id}`, { status: done || missed ? 'pending' : 'completed' }), 'Не удалось изменить').catch(() => undefined)}
              aria-label={done || missed ? 'Снять отметку' : 'Отметить выполненной'}
              title={done || missed ? 'Снять отметку' : 'Отметить выполненной'}
            >
              {done && <Check size={15} strokeWidth={3} />}
              {missed && <X size={15} strokeWidth={3} />}
            </button>
            <span className={s.cpBody}>
              <span className={[s.cpTitle, done && s.cpTitleDone].filter(Boolean).join(' ')}>{cp.title}</span>
              <span className={[s.cpDate, (late || missed) && s.late].filter(Boolean).join(' ')}>
                {shortDate(cp.deadline, true)}
                {done && cp.completed_by_name ? ` · отметил ${cp.completed_by_name}` : ''}
                {missed ? ' · не выполнена' : late ? ' · срок прошёл' : ''}
              </span>
            </span>
            {canMark && !done && !missed && (
              <button type="button" className={s.cpMiss} onClick={() => act(() => api.patch(`/api/tasks/${task.id}/checkpoints/${cp.id}`, { status: 'missed' }), 'Не удалось изменить').catch(() => undefined)}>
                Не выполнена
              </button>
            )}
            {canEdit && (
              <IconButton
                label="Удалить контрольную точку"
                size={32}
                onClick={async () => {
                  if (await confirm({ title: 'Удалить контрольную точку?', text: cp.title, confirmText: 'Удалить', danger: true })) {
                    act(() => api.delete(`/api/tasks/${task.id}/checkpoints/${cp.id}`), 'Не удалось удалить').catch(() => undefined);
                  }
                }}
              >
                <Trash2 size={16} />
              </IconButton>
            )}
          </div>
        );
      })}
      {canEdit && (
        <form
          className={s.cpAdd}
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) setPicking(true);
            else toast('Введите название контрольной точки');
          }}
        >
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Новая контрольная точка" maxLength={255} />
          <Button type="submit" size="sm" icon={<CalendarDays size={16} />} disabled={!title.trim()}>
            Выбрать срок
          </Button>
        </form>
      )}
      <DateTimeDialog
        open={picking}
        title={`Срок: ${title.trim()}`}
        min={new Date()}
        presets={DEADLINE_PRESETS}
        saveText="Добавить"
        onClose={() => setPicking(false)}
        onSave={add}
      />
    </Section>
  );
}

// ===== Комментарии исполнителя и наблюдателя =====

export function RoleComments({
  task,
  isCreator,
  isAssignee,
  isWatcher,
  onChanged,
}: {
  task: TaskDetail;
  isCreator: boolean;
  isAssignee: boolean;
  isWatcher: boolean;
  onChanged: () => void;
}) {
  const { toast } = useFeedback();
  const [editing, setEditing] = useState<'executor_comment' | 'watcher_comment' | null>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const archived = task.status_new === 'archived';

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.patch(`/api/tasks/${task.id}`, { [editing]: text.trim() || null });
      setEditing(null);
      onChanged();
    } catch (e) {
      toast.error(e, 'Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {(task.kind === 'request' ? (['executor_comment'] as const) : (['executor_comment', 'watcher_comment'] as const)).map((field) => {
        const canEdit = !archived && (isCreator || (field === 'executor_comment' ? isAssignee : isWatcher));
        const value = task[field];
        if (!value && !canEdit) return null;
        return (
          <Section
            key={field}
            icon={<MessageCircle size={17} />}
            title={field === 'executor_comment' ? (task.kind === 'request' ? 'Ответ коллеги' : 'Комментарий исполнителя') : 'Комментарий наблюдателя'}
          >
            {editing === field ? (
              <div className={s.roleEdit}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={field === 'executor_comment' ? 'Что сделано, результат, проблемы…' : 'Замечания по выполнению…'}
                  rows={4}
                  maxLength={10000}
                  autoFocus
                />
                <div className={s.roleActions}>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(null)} disabled={saving}>
                    Отмена
                  </Button>
                  <Button size="sm" onClick={save} loading={saving}>
                    Сохранить
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className={s.roleView}
                disabled={!canEdit}
                onClick={() => {
                  setEditing(field);
                  setText(value || '');
                }}
              >
                <span className={value ? s.roleText : s.rolePlaceholder}>{value ? <Linkified text={value} /> : 'Нажмите, чтобы написать'}</span>
                {canEdit && <Pencil size={14} className={s.muted} />}
              </button>
            )}
          </Section>
        );
      })}
    </>
  );
}

// ===== Файлы =====

function fileIcon(mime: string | null, name: string): { icon: typeof File; color: string; bg: string } {
  const m = mime || '';
  const n = name.toLowerCase();
  if (m.startsWith('image/')) return { icon: ImageIcon, color: 'var(--c-violet)', bg: 'var(--c-violet-soft)' };
  if (m.startsWith('video/')) return { icon: FileVideo, color: 'var(--c-danger)', bg: 'var(--c-danger-soft)' };
  if (m.startsWith('audio/')) return { icon: FileAudio, color: 'var(--c-info)', bg: 'var(--c-info-soft)' };
  if (m.includes('pdf')) return { icon: FileText, color: 'var(--c-danger)', bg: 'var(--c-danger-soft)' };
  if (m.includes('word') || n.endsWith('.docx') || n.endsWith('.doc')) return { icon: FileText, color: 'var(--c-info)', bg: 'var(--c-info-soft)' };
  if (m.includes('sheet') || n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv')) return { icon: FileSpreadsheet, color: 'var(--c-success)', bg: 'var(--c-success-soft)' };
  if (m.includes('zip') || m.includes('rar') || m.includes('archive')) return { icon: FileArchive, color: 'var(--c-warning)', bg: 'var(--c-warning-soft)' };
  return { icon: File, color: 'var(--c-text-secondary)', bg: 'var(--c-input-bg)' };
}

/** Миниатюра фото (по подписанной ссылке) или значок типа файла. */
function FileThumb({ f }: { f: TaskDetail['files'][number] }) {
  const isImage = (f.mime_type || '').startsWith('image/');
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    let alive = true;
    signedFileUrl(f.file_url)
      .then((u) => alive && setSrc(u))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [f.file_url, isImage]);
  const ic = fileIcon(f.mime_type, f.file_name);
  const Icon = ic.icon;
  if (src) return <img className={s.fileThumb} src={src} alt="" loading="lazy" />;
  return (
    <span className={s.fileIcon} style={{ color: ic.color, background: ic.bg }}>
      <Icon size={22} />
    </span>
  );
}

export function Files({ task, meId, isCreator, canUpload, onChanged }: { task: TaskDetail; meId: number; isCreator: boolean; canUpload: boolean; onChanged: () => void }) {
  const { toast, confirm } = useFeedback();
  const navigate = useNavigate();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [drag, setDrag] = useState(false);
  // Выделение, как в чате: null — обычный режим.
  const [sel, setSel] = useState<number[] | null>(null);
  const [forward, setForward] = useState(false);
  const [busy, setBusy] = useState(false);
  const archived = task.status_new === 'archived';
  const allowUpload = canUpload && !archived;
  const chosen = task.files.filter((f) => sel?.includes(f.id));
  const deletable = chosen.filter((f) => (f.uploaded_by === meId || isCreator) && !archived);
  const word = (n: number) => plural(n, ['файл', 'файла', 'файлов']);

  useEffect(() => {
    if (!sel) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSel(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sel]);

  const toggle = (id: number) => setSel((prev) => ((prev || []).includes(id) ? (prev || []).filter((x) => x !== id) : [...(prev || []), id]));

  const send = async (files: File[]) => {
    for (const f of files) {
      if (f.size > MAX_TASK_FILE) {
        toast.error(`«${f.name}» больше 50 МБ`);
        continue;
      }
      setUploading({ name: f.name, progress: 0 });
      try {
        await upload(`/api/tasks/${task.id}/files`, 'file', f, f.name, {}, (p) => setUploading({ name: f.name, progress: p })).promise;
      } catch (e) {
        toast.error(e, `Не удалось загрузить «${f.name}»`);
      }
    }
    setUploading(null);
    onChanged();
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (allowUpload) send(Array.from(e.dataTransfer.files));
  };

  const removeSelected = async () => {
    if (!deletable.length) return toast('Удалить файл может его автор или создатель задачи');
    const partial = deletable.length < chosen.length;
    const ok = await confirm({
      title: `Удалить ${deletable.length} ${word(deletable.length)}?`,
      text: partial
        ? `Удалятся только ваши файлы (${deletable.length} из ${chosen.length}).`
        : 'Файлы пропадут из задачи у всех участников. Копии, пересланные в чаты, останутся.',
      confirmText: 'Удалить',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/api/tasks/${task.id}/files/bulk-delete`, { file_ids: deletable.map((f) => f.id) });
      toast.success(deletable.length === 1 ? 'Файл удалён' : `Удалено: ${deletable.length}`);
      setSel(null);
      onChanged();
    } catch (e) {
      toast.error(e, 'Не удалось удалить');
    }
  };

  const downloadSelected = async () => {
    setBusy(true);
    try {
      for (const f of chosen) await downloadFile(f.file_url, f.file_name);
    } catch (e) {
      toast.error(e, 'Не удалось скачать');
    } finally {
      setBusy(false);
    }
  };

  // «Отправить» в другие приложения — системное «Поделиться» (телефон, Edge, Safari).
  const canShare = typeof navigator.share === 'function';
  const shareSelected = async () => {
    setBusy(true);
    try {
      const files = await Promise.all(
        chosen.map(async (f) => {
          const blob = await (await fetch(await signedFileUrl(f.file_url))).blob();
          return new window.File([blob], f.file_name || `file-${f.id}`, { type: f.mime_type || blob.type });
        }),
      );
      const data: ShareData = { files, title: task.title };
      if (navigator.canShare?.(data)) await navigator.share(data);
      else {
        toast('Этот браузер не умеет отправлять файлы — скачиваем их');
        await downloadSelected();
      }
      setSel(null);
    } catch (e: any) {
      if (e?.name !== 'AbortError') toast.error(e, 'Не удалось отправить');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      icon={<Paperclip size={17} />}
      title="Файлы"
      count={sel ? `${sel.length} из ${task.files.length}` : task.files.length}
      action={
        sel ? (
          <span className={s.selActions}>
            <Button size="sm" variant="ghost" onClick={() => setSel(sel.length === task.files.length ? [] : task.files.map((f) => f.id))}>
              {sel.length === task.files.length ? 'Снять все' : 'Все'}
            </Button>
            <Button size="sm" variant="soft" onClick={() => setSel(null)}>
              Готово
            </Button>
          </span>
        ) : (
          <span className={s.selActions}>
            {task.files.length > 0 && (
              <Button size="sm" variant="ghost" icon={<ListChecks size={16} />} onClick={() => setSel([])}>
                Выбрать
              </Button>
            )}
            {allowUpload && (
              <Button size="sm" variant="soft" icon={<Plus size={16} />} onClick={() => input.current?.click()} disabled={!!uploading}>
                Добавить
              </Button>
            )}
          </span>
        )
      }
    >
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files || []);
          e.currentTarget.value = '';
          if (files.length) send(files);
        }}
      />
      <div
        className={[s.files, drag && s.filesDrag].filter(Boolean).join(' ')}
        onDragOver={(e) => {
          if (!allowUpload) return;
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
      >
        {task.files.length === 0 && !uploading ? (
          <div className={s.empty}>
            <Paperclip size={26} strokeWidth={1.5} />
            {allowUpload ? 'Добавьте документы, изображения или отчёты — кнопкой или перетащите сюда' : 'Файлов нет'}
          </div>
        ) : (
          task.files.map((f) => {
            const checked = !!sel?.includes(f.id);
            return (
              <div key={f.id} className={[s.file, checked && s.fileChecked].filter(Boolean).join(' ')}>
                <button
                  type="button"
                  className={s.fileMain}
                  onClick={(e) => {
                    if (sel || e.ctrlKey || e.metaKey) return toggle(f.id);
                    openFile(f.file_url).catch((err) => toast.error(err, 'Не удалось открыть файл'));
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    toggle(f.id);
                  }}
                  aria-pressed={sel ? checked : undefined}
                >
                  {sel && (
                    <span className={[s.check, checked && s.checkOn].filter(Boolean).join(' ')} aria-hidden>
                      {checked && <Check size={14} strokeWidth={3} />}
                    </span>
                  )}
                  <FileThumb f={f} />
                  <span className={s.fileBody}>
                    <span className={s.fileName}>{f.file_name || 'Без имени'}</span>
                    <span className={s.fileMeta}>
                      {[formatSize(f.file_size), f.uploaded_by_name, formatDate(f.uploaded_at)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </button>
                {!sel && (
                  <IconButton label="Скачать" size={34} onClick={() => downloadFile(f.file_url, f.file_name).catch((e) => toast.error(e))}>
                    <Download size={17} />
                  </IconButton>
                )}
              </div>
            );
          })
        )}
        {uploading && (
          <div className={s.uploading}>
            <Spinner size={18} />
            <span className={s.fileName}>{uploading.name}</span>
            <span className={s.fileMeta}>{Math.round(uploading.progress * 100)}%</span>
          </div>
        )}
        {drag && (
          <div className={s.dropHint}>
            <Upload size={22} /> Отпустите, чтобы прикрепить
          </div>
        )}
      </div>
      {sel && (
        <div className={s.selBar} role="toolbar" aria-label="Действия с выбранными файлами">
          <span className={s.selCount}>{sel.length ? `Выбрано: ${sel.length}` : 'Отметьте файлы'}</span>
          <Button size="sm" variant="ghost" icon={<Download size={16} />} disabled={!sel.length || busy} onClick={downloadSelected}>
            Скачать
          </Button>
          {canShare && (
            <Button size="sm" variant="ghost" icon={<Share2 size={16} />} disabled={!sel.length || busy} onClick={shareSelected}>
              Отправить
            </Button>
          )}
          <Button size="sm" variant="ghost" icon={<Forward size={16} />} disabled={!sel.length || busy} onClick={() => setForward(true)}>
            Переслать
          </Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={16} />} disabled={!sel.length || busy} onClick={removeSelected}>
            Удалить
          </Button>
        </div>
      )}
      <ChatPicker
        open={forward}
        title={`Переслать ${chosen.length} ${word(chosen.length)}`}
        commentPlaceholder="Подпись (необязательно)"
        onClose={() => setForward(false)}
        preview={
          <span className={s.fwdPreview}>
            {chosen.slice(0, 4).map((f) => (
              <span key={f.id} className={s.fwdItem}>
                <FileThumb f={f} />
                <span className={s.fileName}>{f.file_name}</span>
              </span>
            ))}
            {chosen.length > 4 && <span className={s.fileMeta}>и ещё {chosen.length - 4}</span>}
          </span>
        }
        onSend={async (chatId, topicId, comment) => {
          await api.post(`/api/tasks/${task.id}/files/forward`, {
            file_ids: chosen.map((f) => f.id),
            targets: [{ chat_id: chatId, topic_id: topicId ?? undefined }],
            comment: comment || undefined,
          });
          setSel(null);
          toast.success('Файлы пересланы');
          navigate(topicId ? `/chats/${chatId}/topic/${topicId}` : `/chats/${chatId}`);
        }}
      />
    </Section>
  );
}

// ===== История =====

export function History({ taskId }: { taskId: number }) {
  const { data: history, isLoading } = useTaskHistory(taskId);
  return (
    <Section icon={<HistoryIcon size={17} />} title="История" count={history?.length}>
      {isLoading ? (
        <div className={s.center}>
          <Spinner />
        </div>
      ) : !history?.length ? (
        <div className={s.empty}>
          <HistoryIcon size={26} strokeWidth={1.5} /> История пуста
        </div>
      ) : (
        <ol className={s.timeline}>
          {history.map((h) => {
            const from = h.from_status ? statusMeta(h.from_status) : null;
            const to = statusMeta(h.to_status);
            const ToIcon = to.icon;
            const name = h.changed_by_name || h.changed_by_username || 'Пользователь';
            return (
              <li key={h.id} className={s.event}>
                <span className={s.eventDot} style={{ background: to.soft, color: to.color }}>
                  <ToIcon size={12} strokeWidth={2.5} />
                </span>
                <div className={s.eventBody}>
                  <div className={s.eventHead}>
                    <Avatar name={name} src={h.avatar_url} size={22} />
                    <b>{name}</b>
                    <span className={s.eventTime}>{shortDate(h.created_at, true)}</span>
                  </div>
                  {h.from_status !== h.to_status && (
                    <div className={s.eventStatuses}>
                      {from ? (
                        <span className={s.statusChip} style={{ background: from.soft, color: from.color }}>
                          {from.label}
                        </span>
                      ) : (
                        <span className={s.statusChip} style={{ background: 'var(--c-accent-muted)', color: 'var(--c-accent)' }}>
                          <Sparkles size={11} /> Создана
                        </span>
                      )}
                      <ArrowRight size={14} className={s.muted} />
                      <span className={s.statusChip} style={{ background: to.soft, color: to.color }}>
                        {to.label}
                      </span>
                    </div>
                  )}
                  {h.comment && (
                    <div className={s.eventComment}>
                      <MessageCircle size={12} /> {humanizeHistoryComment(h.comment)}
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Section>
  );
}

/** Сервер пишет «Дедлайн перенесён на 2026-10-05T15:00:00.000Z» — показываем дату по-человечески. */
function humanizeHistoryComment(c: string): string {
  const m = c.match(/^(Дедлайн перенесён на )(\d{4}-\d{2}-\d{2}T[\d:.]+Z)$/);
  return m ? `${m[1]}${formatDate(m[2], true)}` : c;
}

// ===== Обсуждение =====

export function Comments({ task, meId }: { task: TaskDetail; meId: number }) {
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const { data: comments, isLoading } = useTaskComments(task.id);
  const [editing, setEditing] = useState<TaskComment | null>(null);
  const [text, setText] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: taskKeys.comments(task.id) });

  const role = (authorId: number) =>
    authorId === task.creator_id
      ? { label: 'Создатель', color: 'var(--c-accent)', bg: 'var(--c-accent-muted)' }
      : task.assignees.some((a) => a.id === authorId)
        ? { label: 'Исполнитель', color: 'var(--c-info)', bg: 'var(--c-info-soft)' }
        : task.watchers.some((w) => w.id === authorId)
          ? { label: 'Наблюдатель', color: 'var(--c-violet)', bg: 'var(--c-violet-soft)' }
          : null;

  const save = async () => {
    if (!editing || !text.trim()) return;
    try {
      await api.patch(`/api/tasks/${task.id}/comments/${editing.id}`, { content: text.trim() });
      setEditing(null);
      refresh();
    } catch (e) {
      toast.error(e, 'Не удалось обновить комментарий');
    }
  };

  return (
    <Section icon={<MessageCircle size={17} />} title="Обсуждение" count={comments?.length}>
      {isLoading ? (
        <div className={s.center}>
          <Spinner />
        </div>
      ) : !comments?.length ? (
        <div className={s.empty}>
          <MessageCircle size={26} strokeWidth={1.5} /> Начните обсуждение задачи
        </div>
      ) : (
        <div className={s.comments}>
          {comments.map((c) => {
            const r = role(c.author_id);
            const own = c.author_id === meId;
            return (
              <article key={c.id} className={s.comment}>
                <Avatar name={displayName(c)} src={c.avatar_url} size={36} />
                <div className={s.commentBody}>
                  <div className={s.commentHead}>
                    <b>{displayName(c)}</b>
                    {r && (
                      <span className={s.roleBadge} style={{ color: r.color, background: r.bg }}>
                        {r.label}
                      </span>
                    )}
                    <span className={s.eventTime}>
                      {formatDate(c.created_at, true)}
                      {c.is_edited ? ' · изм.' : ''}
                    </span>
                    {own && editing?.id !== c.id && (
                      <span className={s.commentActions}>
                        <IconButton
                          label="Изменить"
                          size={28}
                          onClick={() => {
                            setEditing(c);
                            setText(c.content);
                          }}
                        >
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton
                          label="Удалить"
                          size={28}
                          tone="danger"
                          onClick={async () => {
                            if (!(await confirm({ title: 'Удалить комментарий?', text: 'Это действие нельзя отменить.', confirmText: 'Удалить', danger: true }))) return;
                            try {
                              await api.delete(`/api/tasks/${task.id}/comments/${c.id}`);
                              refresh();
                            } catch (e) {
                              toast.error(e, 'Не удалось удалить комментарий');
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </IconButton>
                      </span>
                    )}
                  </div>
                  {editing?.id === c.id ? (
                    <div className={s.roleEdit}>
                      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={10000} autoFocus />
                      <div className={s.roleActions}>
                        <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
                          Отмена
                        </Button>
                        <Button size="sm" onClick={save} disabled={!text.trim()}>
                          Сохранить
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className={s.commentText}>
                      <Linkified text={c.content} />
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Section>
  );
}

/** Поле нового комментария внизу карточки (Enter — отправить, Shift+Enter — новая строка). */
export function CommentComposer({ taskId }: { taskId: number }) {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      await api.post(`/api/tasks/${taskId}/comments`, { content: t });
      setText('');
      if (area.current) area.current.style.height = 'auto';
      qc.invalidateQueries({ queryKey: taskKeys.comments(taskId) });
      qc.invalidateQueries({ queryKey: ['tasks', 'list'] });
    } catch (e) {
      toast.error(e, 'Не удалось отправить комментарий');
    } finally {
      setSending(false);
    }
  };
  return (
    <div className={s.composer}>
      <textarea
        ref={area}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          // Поле растёт вместе с текстом (до ~6 строк).
          e.target.style.height = 'auto';
          e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia('(pointer: coarse)').matches) {
            e.preventDefault();
            send();
          }
        }}
        placeholder="Напишите комментарий…"
        rows={1}
        maxLength={10000}
        aria-label="Комментарий к задаче"
      />
      <button type="button" className={[s.send, text.trim() && s.sendOn].filter(Boolean).join(' ')} onClick={send} disabled={!text.trim() || sending} aria-label="Отправить комментарий">
        {sending ? <Spinner size={16} inherit /> : <SendHorizonal size={18} />}
      </button>
    </div>
  );
}

