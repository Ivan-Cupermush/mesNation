import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Clock, Eye, Flag, HandHeart, Paperclip, Plus, Users, X } from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { api, upload } from '../../lib/http';
import { displayName, formatDate, formatSize } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { TextArea, TextField } from '../../ui/Field';
import { Modal } from '../../ui/Modal';
import { PageLoader } from '../../ui/Spinner';
import { DateTimeDialog } from '../../ui/DateTimeDialog';
import { useFeedback } from '../../ui/feedback';
import { UserPicker, type PickableUser } from '../users/UserPicker';
import type { AssignableUser } from '../../lib/types';
import { AssigneePicker } from './AssigneePicker';
import { KindIcon } from './kind';
import { useUsers } from '../users/queries';
import { taskKeys, useAssignableUsers, useTask } from './queries';
import { DEADLINE_PRESETS, PRIORITY, timeLeft } from './status';
import type { Importance, Task, TaskKind } from './types';
import s from './TaskForm.module.css';

const MAX_TASK_FILE = 50 * 1024 * 1024;

interface DraftCheckpoint {
  title: string;
  deadline: Date;
}

/**
 * Новая задача или запрос и редактирование — как в приложении: название,
 * описание, приоритет, срок выполнения и проверки, исполнители (кому можно —
 * решает сервер), наблюдатели, файлы и контрольные точки. У запроса нет
 * приоритета, наблюдателей и проверки.
 */
export default function TaskForm() {
  const { id } = useParams();
  const editId = id ? Number(id) : 0;
  const { data: task, isLoading } = useTask(editId);
  if (editId && isLoading) return <PageLoader label="Загрузка задачи…" />;
  if (editId && !task) return <Blocked text="Задача не найдена или у вас нет к ней доступа." />;
  const request = task?.kind === 'request';
  if (editId && task && !task.is_creator) {
    return <Blocked text={request ? 'Менять запрос может только тот, кто его отправил.' : 'Менять параметры задачи может только её создатель.'} />;
  }
  if (editId && task?.status_new === 'archived') {
    return <Blocked text={request ? 'Запрос в архиве. Сначала верните его из архива.' : 'Задача в архиве. Сначала разархивируйте её.'} />;
  }
  return <Form key={editId || 'new'} task={editId ? (task ?? null) : null} />;
}

function Blocked({ text }: { text: string }) {
  const navigate = useNavigate();
  return (
    <div className={s.blocked}>
      <p>{text}</p>
      <Button onClick={() => navigate(-1)}>Назад</Button>
    </div>
  );
}

function Form({ task }: { task: Task | null }) {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm } = useFeedback();
  const isEdit = !!task;
  const assignable = useAssignableUsers();
  const allUsers = useUsers();
  const [params, setParams] = useSearchParams();
  // Задача или запрос: при создании выбрали по «+», у сохранённой — её тип.
  const [kind, setKindState] = useState<TaskKind>(task?.kind ?? (params.get('kind') === 'request' ? 'request' : 'task'));
  const request = kind === 'request';

  // «Создать задачу» из сообщения чата: название и описание уже заполнены.
  const prefill = (useLocation().state as { prefill?: { title?: string; description?: string } } | null)?.prefill;
  const [title, setTitle] = useState(task?.title ?? prefill?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? prefill?.description ?? '');
  const [importance, setImportance] = useState<Importance>(task?.importance ?? 'yellow');
  const initialDeadline = task?.executor_deadline || task?.hard_deadline;
  const [deadline, setDeadline] = useState<Date | null>(initialDeadline ? new Date(initialDeadline) : null);
  const [reviewDeadline, setReviewDeadline] = useState<Date | null>(task?.reviewer_deadline ? new Date(task.reviewer_deadline) : null);
  const [assignees, setAssignees] = useState<PickableUser[]>(task?.assignees ?? []);
  const [watchers, setWatchers] = useState<PickableUser[]>(task?.watchers ?? []);
  const [checkpoints, setCheckpoints] = useState<DraftCheckpoint[]>([]);
  const [cpTitle, setCpTitle] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [picker, setPicker] = useState<'assignees' | 'watchers' | null>(null);
  const [dateFor, setDateFor] = useState<'deadline' | 'review' | 'checkpoint' | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ title?: string; assignees?: string }>({});
  const fileInput = useRef<HTMLInputElement>(null);

  /** Сменить тип при создании: задачу коллегам поставить нельзя — их убираем. */
  const setKind = (next: TaskKind) => {
    if (next === kind || isEdit) return;
    if (next === 'task') {
      const pool = (assignable.data || []) as AssignableUser[];
      const removed = assignees.filter((u) => pool.find((p) => p.id === u.id)?.can_task === false);
      if (removed.length) {
        setAssignees((prev) => prev.filter((u) => !removed.some((r) => r.id === u.id)));
        toast(`Коллегам задачу поставить нельзя — убрали: ${removed.map((u) => displayName(u)).join(', ')}`);
      }
    }
    setKindState(next);
    const p = new URLSearchParams(params);
    if (next === 'request') p.set('kind', 'request');
    else p.delete('kind');
    setParams(p, { replace: true });
  };

  // Несохранённые изменения: предупреждаем при закрытии вкладки и по «Отмена».
  const snapshot = JSON.stringify([title, description, importance, deadline, reviewDeadline, assignees.map((u) => u.id), watchers.map((u) => u.id), checkpoints.length, files.length]);
  const reviewTooLateCheck = !request;
  const initial = useRef(snapshot);
  const dirty = snapshot !== initial.current;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const reviewTooLate = reviewTooLateCheck && !!(deadline && reviewDeadline && reviewDeadline > deadline);
  const selfOnly = assignees.length === 1 && assignees[0].id === me.id;

  const cancel = async () => {
    if (dirty && !(await confirm({ title: isEdit ? 'Отменить изменения?' : request ? 'Не отправлять запрос?' : 'Отменить создание задачи?', text: 'Введённые данные не сохранятся.', confirmText: 'Выйти', cancelText: 'Остаться', danger: true }))) return;
    navigate(isEdit ? `/tasks/${task!.id}` : '/tasks');
  };

  const submit = async () => {
    const errs: typeof errors = {};
    if (!title.trim()) errs.title = request ? 'Напишите, о чём просите' : 'Введите название задачи';
    if (!assignees.length) errs.assignees = request ? 'Выберите, кого попросить' : 'Выберите хотя бы одного исполнителя';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (reviewTooLate) {
      toast.error('Дедлайн проверки должен быть не позже дедлайна выполнения: к общему сроку задача уже проверена и закрыта.');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await api.patch(`/api/tasks/${task!.id}`, {
          title: title.trim(),
          description: description.trim() || null,
          executor_deadline: deadline ? deadline.toISOString() : null,
          assignee_ids: assignees.map((u) => u.id),
          ...(request
            ? {}
            : {
                importance,
                reviewer_deadline: reviewDeadline ? reviewDeadline.toISOString() : null,
                watcher_ids: watchers.map((u) => u.id),
              }),
        });
        initial.current = snapshot;
        qc.invalidateQueries({ queryKey: taskKeys.all });
        toast.success(request ? 'Запрос сохранён' : 'Задача сохранена');
        navigate(`/tasks/${task!.id}`, { replace: true });
        return;
      }
      const created = await api.post<Task>('/api/tasks', {
        kind,
        title: title.trim(),
        description: description.trim() || undefined,
        assignee_ids: assignees.map((u) => u.id),
        executor_deadline: deadline?.toISOString(),
        checkpoints: checkpoints.map((c) => ({ title: c.title, deadline: c.deadline.toISOString() })),
        ...(request
          ? {}
          : {
              importance,
              watcher_ids: watchers.length ? watchers.map((u) => u.id) : undefined,
              reviewer_deadline: reviewDeadline?.toISOString(),
            }),
      });
      initial.current = snapshot;
      // Файлы — после создания: ошибка одного файла не теряет задачу.
      const failed: string[] = [];
      for (const f of files) {
        try {
          await upload(`/api/tasks/${created.id}/files`, 'file', f, f.name).promise;
        } catch {
          failed.push(f.name);
        }
      }
      if (failed.length) toast.error(`${request ? 'Запрос отправлен' : 'Задача создана'}, но не прикрепились: ${failed.join(', ')}. Добавьте их в карточке.`);
      else if (request) toast.success(assignees.length === 1 && assignees[0].id !== me.id ? `Запрос отправлен — ${displayName(assignees[0])} получит уведомление` : 'Запрос отправлен');
      else toast.success('Задача создана');
      qc.invalidateQueries({ queryKey: taskKeys.all });
      navigate(`/tasks/${created.id}`, { replace: true });
    } catch (e) {
      toast.error(e, request ? 'Не удалось отправить запрос' : 'Не удалось сохранить задачу');
    } finally {
      setSaving(false);
    }
  };

  const addFiles = (list: File[]) => {
    const big = list.filter((f) => f.size > MAX_TASK_FILE);
    if (big.length) toast.error(`Больше 50 МБ: ${big.map((f) => f.name).join(', ')}`);
    setFiles((prev) => [...prev, ...list.filter((f) => f.size <= MAX_TASK_FILE)]);
  };

  const pickerUsers = picker === 'assignees' ? assignable.data : allUsers.data;
  const selectedIds = useMemo(() => (picker === 'assignees' ? assignees : watchers).map((u) => u.id), [picker, assignees, watchers]);
  const toggleAssignee = (u: AssignableUser) => {
    setAssignees((prev) => (prev.some((x) => x.id === u.id) ? prev.filter((x) => x.id !== u.id) : [...prev, u]));
    setErrors((e) => ({ ...e, assignees: undefined }));
  };
  const toggle = (uid: number) => {
    const pool = (pickerUsers || []) as PickableUser[];
    const setter = picker === 'assignees' ? setAssignees : setWatchers;
    setter((prev) => (prev.some((u) => u.id === uid) ? prev.filter((u) => u.id !== uid) : [...prev, pool.find((u) => u.id === uid)!].filter(Boolean)));
    if (picker === 'assignees') setErrors((e) => ({ ...e, assignees: undefined }));
  };

  return (
    <div className={[s.page, request && s.requestPage].filter(Boolean).join(' ')}>
      <header className={s.header}>
        <IconButton label="Назад" onClick={cancel}>
          <ChevronLeft size={26} />
        </IconButton>
        <div className={s.headerTitle}>
          {isEdit ? (request ? 'Редактирование запроса' : 'Редактирование задачи') : request ? 'Новый запрос' : 'Новая задача'}
        </div>
        <Button onClick={submit} loading={saving} className={request ? s.requestBtn : undefined}>
          {isEdit ? 'Сохранить' : request ? 'Попросить' : 'Создать'}
        </Button>
      </header>

      <div className={s.scroll}>
        <form
          className={s.inner}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {!isEdit && (
            <div className={s.kindSwitch} role="tablist" aria-label="Что создаём">
              {(['task', 'request'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={kind === k}
                  className={[s.kindTab, kind === k && s.kindTabOn, k === 'request' && s.kindTabRequest].filter(Boolean).join(' ')}
                  onClick={() => setKind(k)}
                >
                  <KindIcon kind={k} size={17} />
                  {k === 'request' ? 'Запрос' : 'Задача'}
                </button>
              ))}
            </div>
          )}
          {request && (
            <div className={s.requestIntro}>
              <span className={s.requestIntroIcon}>
                <HandHeart size={20} />
              </span>
              <span>
                <b>Попросите коллегу помочь</b>
                <small>Без важности и проверки: коллега сделает и отметит «Готово», а вы сможете сказать спасибо.</small>
              </span>
            </div>
          )}

          <section className={s.card}>
            <TextField
              label={request ? 'О чём просите' : 'Название'}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((x) => ({ ...x, title: undefined }));
              }}
              placeholder={request ? 'Например: подменить меня на звонке в 15:00' : 'Например: подготовить квартальный отчёт'}
              maxLength={255}
              error={errors.title}
              autoFocus={!isEdit}
            />
            <TextArea
              label="Описание"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={request ? 'Подробности, чтобы коллеге было проще помочь…' : 'Детали задачи, ожидаемый результат…'}
              maxLength={10000}
              rows={4}
            />
          </section>

          {!request && (
          <section className={s.card}>
            <div className={s.cardTitle}>
              <Flag size={17} /> Приоритет
            </div>
            <div className={s.priorities}>
              {(Object.keys(PRIORITY) as Importance[])
                .sort((a, b) => PRIORITY[b].rank - PRIORITY[a].rank)
                .map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={[s.priority, importance === k && s.priorityOn].filter(Boolean).join(' ')}
                    style={importance === k ? { borderColor: PRIORITY[k].color, background: PRIORITY[k].soft, color: PRIORITY[k].color } : undefined}
                    onClick={() => setImportance(k)}
                  >
                    <Flag size={16} style={{ color: PRIORITY[k].color }} />
                    {PRIORITY[k].label}
                  </button>
                ))}
            </div>
          </section>
          )}

          <section className={s.card}>
            <div className={s.cardTitle}>
              <Clock size={17} /> Сроки
            </div>
            <DateRow label={request ? 'Когда нужно' : 'Дедлайн выполнения'} value={deadline} onPick={() => setDateFor('deadline')} onClear={() => setDeadline(null)} />
            {deadline && <div className={s.hint}>{timeLeft(deadline.toISOString())}</div>}
            {request ? (
              !deadline && <div className={s.hint}>Необязательно — без срока коллега поможет, когда сможет.</div>
            ) : (
              <>
                <DateRow label="Дедлайн проверки" value={reviewDeadline} onPick={() => setDateFor('review')} onClear={() => setReviewDeadline(null)} />
                <div className={s.hint}>Необязательно. К этому сроку исполнители сдают работу, а наблюдатели её проверяют. Не позже дедлайна выполнения.</div>
              </>
            )}
            {reviewTooLate && (
              <div className={s.warn}>
                <AlertTriangle size={15} /> Дедлайн проверки позже дедлайна выполнения
              </div>
            )}
          </section>

          <section className={s.card}>
            <div className={s.cardTitle}>
              <Users size={17} /> {request ? 'Кого попросить' : 'Участники'}
            </div>
            <button type="button" className={[s.peopleRow, errors.assignees && s.invalid].filter(Boolean).join(' ')} onClick={() => setPicker('assignees')}>
              <span className={s.peopleLabel}>{request ? 'Коллеги' : 'Исполнители'}</span>
              <span className={s.peopleValue}>
                {assignees.length ? (
                  <span className={s.stack}>
                    {assignees.slice(0, 4).map((u) => (
                      <Avatar key={u.id} name={displayName(u)} src={u.avatar_url} size={28} className={s.stackItem} />
                    ))}
                    {assignees.length > 4 && <span className={s.more}>+{assignees.length - 4}</span>}
                  </span>
                ) : (
                  <span className={s.placeholder}>Выберите</span>
                )}
                <ChevronRight size={18} />
              </span>
            </button>
            {errors.assignees && <div className={s.error}>{errors.assignees}</div>}
            {assignees.length > 0 && (
              <div className={s.chips}>
                {assignees.map((u) => (
                  <span key={u.id} className={s.chip}>
                    {displayName(u)}
                    {u.id === me.id ? ' (вы)' : ''}
                    <button type="button" onClick={() => setAssignees((p) => p.filter((x) => x.id !== u.id))} aria-label={`Убрать ${displayName(u)}`}>
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            {selfOnly && !request && <div className={s.hint}>Задача себе: проверка не нужна — завершите её сами кнопкой «Завершить».</div>}
            {selfOnly && request && <div className={s.hint}>Запрос себе — как напоминание: отметите «Готово», когда сделаете.</div>}
            {!request && (
            <>
            <button type="button" className={s.peopleRow} onClick={() => setPicker('watchers')}>
              <span className={s.peopleLabel}>
                <Eye size={14} /> Наблюдатели
              </span>
              <span className={s.peopleValue}>
                {watchers.length ? <b>{watchers.length}</b> : <span className={s.placeholder}>Вы (создатель)</span>}
                <ChevronRight size={18} />
              </span>
            </button>
            {watchers.length > 0 && (
              <div className={s.chips}>
                {watchers.map((u) => (
                  <span key={u.id} className={s.chip}>
                    {displayName(u)}
                    <button type="button" onClick={() => setWatchers((p) => p.filter((x) => x.id !== u.id))} aria-label={`Убрать ${displayName(u)}`}>
                      <X size={13} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className={s.hint}>Наблюдатели видят задачу и принимают результат. Если не выбрать — проверяете вы.</div>
            </>
            )}
          </section>

          {!isEdit && (
            <section
              className={s.card}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                addFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <div className={s.cardTitle}>
                <Paperclip size={17} /> Файлы
              </div>
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className={s.listRow}>
                  <Paperclip size={15} />
                  <span className={s.listText}>{f.name}</span>
                  <span className={s.listMeta}>{formatSize(f.size)}</span>
                  <IconButton label="Убрать файл" size={30} onClick={() => setFiles((p) => p.filter((_, x) => x !== i))}>
                    <X size={15} />
                  </IconButton>
                </div>
              ))}
              <Button variant="soft" size="sm" icon={<Plus size={16} />} onClick={() => fileInput.current?.click()}>
                Прикрепить файлы
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(Array.from(e.currentTarget.files || []));
                  e.currentTarget.value = '';
                }}
              />
            </section>
          )}

          {!isEdit && (
            <section className={s.card}>
              <div className={s.cardTitle}>
                <Flag size={17} /> Контрольные точки
              </div>
              {checkpoints.map((c, i) => (
                <div key={i} className={s.listRow}>
                  <CalendarDays size={15} />
                  <span className={s.listText}>{c.title}</span>
                  <span className={s.listMeta}>{formatDate(c.deadline.toISOString(), true)}</span>
                  <IconButton label="Убрать" size={30} onClick={() => setCheckpoints((p) => p.filter((_, x) => x !== i))}>
                    <X size={15} />
                  </IconButton>
                </div>
              ))}
              <div className={s.cpAdd}>
                <input
                  value={cpTitle}
                  onChange={(e) => setCpTitle(e.target.value)}
                  placeholder="Например: черновик отчёта"
                  maxLength={255}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (cpTitle.trim()) setDateFor('checkpoint');
                    }
                  }}
                />
                <Button size="sm" variant="soft" icon={<CalendarDays size={16} />} disabled={!cpTitle.trim()} onClick={() => setDateFor('checkpoint')}>
                  Срок
                </Button>
              </div>
              <div className={s.hint}>
                {request
                  ? 'Этапы со своими сроками — их отмечаете вы и тот, кого попросили.'
                  : 'Промежуточные этапы со своими сроками — создатель и наблюдатели отмечают их выполнение.'}
              </div>
            </section>
          )}

          {isEdit && <div className={s.hint}>Контрольные точки и файлы меняются в карточке {request ? 'запроса' : 'задачи'}.</div>}
          <button type="submit" hidden />
        </form>
      </div>

      <Modal
        open={!!picker}
        onClose={() => setPicker(null)}
        title={picker === 'watchers' ? 'Наблюдатели' : request ? 'Кого попросить' : 'Исполнители'}
        size="md"
        flush
        footer={
          <Button onClick={() => setPicker(null)} className={request && picker === 'assignees' ? s.requestBtn : undefined}>
            Готово{selectedIds.length ? ` (${selectedIds.length})` : ''}
          </Button>
        }
      >
        <div className={s.pickerBox}>
          {picker === 'assignees' ? (
            <>
              <p className={s.pickerHint}>
                {request
                  ? 'Сначала — коллеги вашей должности, дальше — по ролям.'
                  : 'Задачу можно поставить себе и подчинённым.'}
              </p>
              <AssigneePicker
                users={assignable.data as AssignableUser[] | undefined}
                loading={assignable.isLoading}
                kind={kind}
                meId={me.id}
                myRole={me.role_name}
                selected={selectedIds}
                onToggle={toggleAssignee}
                onSwitchToRequest={isEdit ? undefined : () => setKind('request')}
              />
            </>
          ) : (
            <UserPicker
              users={(pickerUsers || []) as PickableUser[]}
              loading={allUsers.isLoading}
              meId={me.id}
              multiple
              selected={selectedIds}
              onToggle={toggle}
              autoFocus
            />
          )}
        </div>
      </Modal>

      <DateTimeDialog
        open={!!dateFor}
        title={dateFor === 'deadline' ? (request ? 'Когда нужно' : 'Дедлайн выполнения') : dateFor === 'review' ? 'Дедлайн проверки' : `Срок: ${cpTitle.trim()}`}
        initial={(dateFor === 'deadline' ? deadline : dateFor === 'review' ? reviewDeadline : null) ?? undefined}
        min={isEdit ? undefined : new Date()}
        presets={DEADLINE_PRESETS}
        onClose={() => setDateFor(null)}
        onSave={(d) => {
          if (dateFor === 'deadline') setDeadline(d);
          else if (dateFor === 'review') setReviewDeadline(d);
          else {
            setCheckpoints((p) => [...p, { title: cpTitle.trim(), deadline: d }].sort((a, b) => a.deadline.getTime() - b.deadline.getTime()));
            setCpTitle('');
          }
        }}
      />
    </div>
  );
}

function DateRow({ label, value, onPick, onClear }: { label: string; value: Date | null; onPick: () => void; onClear: () => void }) {
  return (
    <div className={s.dateRow}>
      <span className={s.dateLabel}>{label}</span>
      <button type="button" className={s.dateBtn} onClick={onPick}>
        <CalendarDays size={17} />
        <span className={value ? undefined : s.placeholder}>{value ? formatDate(value.toISOString(), true) : 'Не выбран'}</span>
      </button>
      {value && (
        <IconButton label="Убрать срок" size={34} onClick={onClear}>
          <X size={16} />
        </IconButton>
      )}
    </div>
  );
}
