import { useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Flag,
  Link2,
  Monitor,
  MoreHorizontal,
  Pencil,
  Trash2,
  User,
  Users,
  Wrench,
} from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { api, ApiError } from '../../lib/http';
import { displayName, formatDate } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Modal } from '../../ui/Modal';
import { PageLoader } from '../../ui/Spinner';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { DateTimeDialog } from '../../ui/DateTimeDialog';
import { useFeedback } from '../../ui/feedback';
import { linkify } from '../chats/model';
import { taskKeys, useTask } from './queries';
import { useSplitView } from './layout';
import { DEADLINE_PRESETS, finalDeadline, nextStepHint, priorityOf, StatusPill, StatusTrack, timeLeft } from './status';
import { Checkpoints, CommentComposer, Comments, Files, History, RoleComments } from './TaskSections';
import type { TaskDetail as TaskDetailData, TaskPerson, TaskTransition } from './types';
import s from './TaskDetail.module.css';

/**
 * Карточка задачи — как в приложении: статус и этапы, подсказка «что дальше»,
 * действия по правам (приходят с сервера), сроки, люди, контрольные точки,
 * комментарии исполнителя и наблюдателя, файлы, история и обсуждение.
 */
export default function TaskDetail() {
  const { id = '' } = useParams();
  const taskId = Number(id);
  const { data: task, isLoading, error, refetch } = useTask(taskId);
  if (isLoading) return <PageLoader label="Загрузка задачи…" />;
  if (error || !task) {
    const missing = error instanceof ApiError && (error.status === 403 || error.status === 404);
    return (
      <EmptyState
        title={missing ? 'Задача недоступна' : 'Не удалось загрузить задачу'}
        text={missing ? 'Её нет или у вас нет к ней доступа.' : error instanceof Error ? error.message : undefined}
        action={<Button onClick={() => refetch()}>Повторить</Button>}
      />
    );
  }
  return <TaskView task={task} />;
}

function TaskView({ task }: { task: TaskDetailData }) {
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast, confirm, prompt } = useFeedback();
  const split = useSplitView();
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [people, setPeople] = useState<'assignees' | 'watchers' | null>(null);
  const [transition, setTransition] = useState<TaskTransition | null>(null);
  const [moveDeadline, setMoveDeadline] = useState(false);
  const [busy, setBusy] = useState(false);

  const isCreator = task.is_creator ?? task.creator_id === me.id;
  const isAssignee = task.is_assignee ?? task.assignees.some((a) => a.id === me.id);
  const isWatcher = task.is_watcher ?? task.watchers.some((w) => w.id === me.id);
  const archived = task.status_new === 'archived';
  const priority = priorityOf(task.importance);
  const deadline = finalDeadline(task);
  const creatorName = task.creator ? displayName(task.creator) : task.creator_name || 'Неизвестно';

  const refresh = () => {
    qc.invalidateQueries({ queryKey: taskKeys.detail(task.id) });
    qc.invalidateQueries({ queryKey: taskKeys.history(task.id) });
    qc.invalidateQueries({ queryKey: ['tasks', 'list'] });
  };

  const run = async (fn: () => Promise<unknown>, fail: string) => {
    setBusy(true);
    try {
      await fn();
      refresh();
      return true;
    } catch (e) {
      toast.error(e, fail);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const unarchive = async () => {
    if (await confirm({ title: 'Вернуть задачу из архива?', text: 'Задача вернётся в статус, в котором была до архивации.', confirmText: 'Разархивировать' })) {
      run(() => api.post(`/api/tasks/${task.id}/unarchive`), 'Не удалось разархивировать');
    }
  };

  const remove = async () => {
    const reason = await prompt({
      title: 'Удалить задачу?',
      text: 'Задача уйдёт в архив с пометкой «удалена». Её можно будет вернуть.',
      label: 'Причина (необязательно)',
      placeholder: 'Например: задача больше не актуальна',
      multiline: true,
      maxLength: 2000,
      confirmText: 'Удалить',
      danger: true,
    });
    if (reason === null) return;
    run(() => api.delete(`/api/tasks/${task.id}`, reason ? { reason } : undefined), 'Не удалось удалить задачу');
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/tasks/${task.id}`);
      toast('Ссылка скопирована');
    } catch {
      toast.error('Не удалось скопировать ссылку');
    }
  };

  const menuItems: MenuItem[] = [
    ...(isCreator && !archived
      ? [
          { key: 'edit', label: 'Редактировать задачу', icon: <Pencil size={19} />, onSelect: () => navigate(`/tasks/${task.id}/edit`) },
          { key: 'deadline', label: 'Перенести срок', icon: <CalendarClock size={19} />, onSelect: () => setMoveDeadline(true) },
        ]
      : []),
    { key: 'link', label: 'Скопировать ссылку', icon: <Link2 size={19} />, onSelect: copyLink },
    ...(isCreator && !archived ? [{ key: 'delete', label: 'Удалить (в архив)', danger: true, icon: <Trash2 size={19} />, onSelect: remove }] : []),
  ];

  const listOf = (p: TaskPerson[]) => (p.length === 1 ? displayName(p[0]) : `${p.length} чел.`);

  return (
    <div className={s.page}>
      <header className={s.header}>
        {!split && (
          <IconButton label="Назад" onClick={() => navigate('/tasks')}>
            <ChevronLeft size={26} />
          </IconButton>
        )}
        <div className={s.headerTitle}>Задача</div>
        <IconButton label="Действия с задачей" onClick={(e) => setMenu(anchorFrom(e.currentTarget))}>
          <MoreHorizontal size={22} />
        </IconButton>
      </header>

      <div className={s.scroll}>
        <div className={s.inner}>
          {/* ===== Заголовок и статус ===== */}
          <section className={s.hero}>
            <div className={s.heroTop}>
              <StatusPill status={task.status_new} overdue={task.is_overdue} />
              <span className={s.priority} style={{ color: priority.color, background: priority.soft }}>
                <Flag size={13} strokeWidth={2.2} /> {priority.long}
              </span>
            </div>
            {task.is_overdue && (
              <div className={s.overdue}>
                <AlertCircle size={14} strokeWidth={2.4} /> Срок выполнения прошёл
              </div>
            )}
            <h1 className={s.title}>{task.title}</h1>
            {(isCreator || isAssignee || isWatcher || task.is_supervisor) && (
              <div className={s.myRoles}>
                <span className={s.myRolesLabel}>Вы:</span>
                {isCreator && <RoleChip icon={<Monitor size={12} />} color="var(--c-info)" text="создатель" />}
                {isAssignee && <RoleChip icon={<Wrench size={12} />} color="var(--c-accent)" text="исполнитель" />}
                {isWatcher && <RoleChip icon={<Eye size={12} />} color="var(--c-violet)" text="наблюдатель" />}
                {task.is_supervisor && <RoleChip icon={<Users size={12} />} color="var(--c-warning)" text="руководитель участника" />}
              </div>
            )}
            {task.description ? (
              <div className={s.description}>
                {linkify(task.description).map((p, i) =>
                  typeof p === 'string' ? (
                    p
                  ) : (
                    <a key={i} href={p.url} target="_blank" rel="noopener noreferrer nofollow">
                      {p.url}
                    </a>
                  ),
                )}
              </div>
            ) : (
              <div className={s.noDescription}>Описание не добавлено</div>
            )}
          </section>

          {/* ===== Люди и сроки ===== */}
          <section className={s.grid}>
            <button type="button" className={s.cell} onClick={() => navigate(`/users/${task.creator_id}`)}>
              <span className={s.cellIcon}>
                <User size={18} />
              </span>
              <span className={s.cellLabel}>Создатель</span>
              <span className={s.cellValue}>{creatorName}</span>
            </button>
            <div className={s.cell}>
              <span className={s.cellIcon}>
                <CalendarDays size={18} />
              </span>
              <span className={s.cellLabel}>Дедлайн</span>
              <span className={s.cellValue}>{deadline ? formatDate(deadline, true) : 'Не указан'}</span>
              {deadline && !archived && task.status_new !== 'done' && (
                <span className={[s.cellHint, task.is_overdue && s.late].filter(Boolean).join(' ')}>{timeLeft(deadline)}</span>
              )}
            </div>
            <button type="button" className={s.cell} onClick={() => setPeople('assignees')}>
              <span className={s.cellIcon}>
                <Users size={18} />
              </span>
              <span className={s.cellLabel}>Исполнители</span>
              <span className={s.cellPeople}>
                {task.assignees.length ? (
                  <span className={s.stack}>
                    {task.assignees.slice(0, 4).map((a) => (
                      <Avatar key={a.id} name={displayName(a)} src={a.avatar_url} size={26} className={s.stackItem} />
                    ))}
                    {task.assignees.length > 4 && <span className={s.more}>+{task.assignees.length - 4}</span>}
                  </span>
                ) : (
                  <span className={s.cellValue}>Не назначены</span>
                )}
                <ChevronRight size={16} className={s.chevron} />
              </span>
            </button>
            <button type="button" className={s.cell} onClick={() => setPeople('watchers')}>
              <span className={s.cellIcon}>
                <Eye size={18} />
              </span>
              <span className={s.cellLabel}>Наблюдатели</span>
              <span className={s.cellPeople}>
                <span className={s.cellValue}>{task.watchers.length ? listOf(task.watchers) : 'Создатель'}</span>
                <ChevronRight size={16} className={s.chevron} />
              </span>
            </button>
          </section>

          {task.reviewer_deadline && (
            <section className={s.review}>
              <Clock size={16} />
              <span>
                <b>Дедлайн проверки: {formatDate(task.reviewer_deadline, true)}</b>
                <small>К этому сроку работа сдана и проверена наблюдателями</small>
              </span>
            </section>
          )}

          {/* ===== Статус и действия ===== */}
          {!archived ? (
            <section className={s.card}>
              <StatusTrack status={task.status_new} />
              <div className={s.hint}>{nextStepHint(task.status_new, { creator: isCreator, assignee: isAssignee, watcher: isWatcher })}</div>
              {task.available_transitions.length > 0 ? (
                <div className={s.actions}>
                  {task.available_transitions.map((t) => (
                    <Button
                      key={t.to}
                      variant={t.style === 'success' ? 'success' : t.style === 'danger' ? 'danger' : t.style === 'primary' ? 'primary' : 'secondary'}
                      disabled={busy}
                      onClick={() => setTransition(t)}
                      block
                    >
                      {t.action}
                    </Button>
                  ))}
                </div>
              ) : (
                !isCreator && !isAssignee && !isWatcher && <div className={s.readOnly}>Вы видите задачу как руководитель участника — менять её статус могут создатель, исполнители и наблюдатели.</div>
              )}
            </section>
          ) : (
            <section className={[s.card, s.archived].join(' ')}>
              <span className={s.archivedIcon}>
                <Archive size={20} />
              </span>
              <span className={s.archivedBody}>
                <b>{task.archived_as === 'deleted' ? 'Задача удалена' : 'Задача в архиве'}</b>
                <small>{task.archived_at ? formatDate(task.archived_at, true) : ''}</small>
              </span>
              {isCreator && (
                <Button icon={<ArchiveRestore size={18} />} onClick={unarchive} loading={busy}>
                  Разархивировать
                </Button>
              )}
            </section>
          )}

          <Checkpoints task={task} isCreator={isCreator} isWatcher={isWatcher} onChanged={refresh} />
          <RoleComments task={task} isCreator={isCreator} isAssignee={isAssignee} isWatcher={isWatcher} onChanged={refresh} />
          <Files task={task} meId={me.id} isCreator={isCreator} canUpload={isCreator || isAssignee || isWatcher} onChanged={refresh} />
          <History taskId={task.id} />
          <Comments task={task} meId={me.id} />
        </div>
      </div>

      {(isCreator || isAssignee || isWatcher) && <CommentComposer taskId={task.id} />}

      <ActionMenu open={!!menu} anchor={menu} items={menuItems} onClose={() => setMenu(null)} />

      <Modal open={!!people} onClose={() => setPeople(null)} title={people === 'watchers' ? 'Наблюдатели' : 'Исполнители'} size="sm">
        {people === 'watchers' && !task.watchers.length && <p className={s.muted}>Отдельных наблюдателей нет — за задачей следит создатель.</p>}
        {(people === 'watchers' ? task.watchers : task.assignees).map((p) => (
          <button
            key={p.id}
            type="button"
            className={s.person}
            onClick={() => {
              setPeople(null);
              navigate(`/users/${p.id}`);
            }}
          >
            <Avatar name={displayName(p)} src={p.avatar_url} size={40} />
            <span className={s.personBody}>
              <b>{displayName(p)}</b>
              <small>@{p.username}{p.is_active === false ? ' · деактивирован' : ''}</small>
            </span>
            <ChevronRight size={18} className={s.chevron} />
          </button>
        ))}
      </Modal>

      <TransitionDialog
        transition={transition}
        onClose={() => setTransition(null)}
        onConfirm={async (comment) => {
          const t = transition!;
          const ok = await run(() => api.post(`/api/tasks/${task.id}/transition`, { to_status: t.to, comment: comment || undefined }), 'Не удалось изменить статус');
          if (ok) setTransition(null);
        }}
        busy={busy}
      />

      <DateTimeDialog
        open={moveDeadline}
        title="Новый срок выполнения"
        initial={deadline ? new Date(deadline) : undefined}
        presets={DEADLINE_PRESETS}
        saveText="Перенести"
        onClose={() => setMoveDeadline(false)}
        onSave={async (d) => {
          if (task.reviewer_deadline && new Date(task.reviewer_deadline) > d) {
            toast.error('Дедлайн проверки должен быть не позже срока выполнения — сначала измените его в редактировании задачи');
            throw new Error('invalid');
          }
          const ok = await run(() => api.patch(`/api/tasks/${task.id}`, { executor_deadline: d.toISOString() }), 'Не удалось перенести срок');
          if (!ok) throw new Error('failed');
          toast.success('Срок перенесён');
        }}
      />
    </div>
  );
}

function RoleChip({ icon, color, text }: { icon: ReactNode; color: string; text: string }) {
  return (
    <span className={s.roleChip} style={{ color }}>
      {icon}
      <span>{text}</span>
    </span>
  );
}

const TRANSITION_HINT: Record<string, string> = {
  in_progress: 'Задача перейдёт в статус «В работе».',
  on_review: 'Проверяющие получат задачу на проверку.',
  done: 'Задача будет отмечена как выполненная.',
  archived: 'Задача переместится в архив. Её можно будет вернуть.',
  rejected: 'Укажите причину — исполнитель увидит этот комментарий.',
};

/** Подтверждение смены статуса; комментарий обязателен (отклонение) или по желанию. */
function TransitionDialog({
  transition,
  onClose,
  onConfirm,
  busy,
}: {
  transition: TaskTransition | null;
  onClose: () => void;
  onConfirm: (comment: string) => void;
  busy: boolean;
}) {
  const [comment, setComment] = useState('');
  const [prev, setPrev] = useState<TaskTransition | null>(null);
  if (transition !== prev) {
    setPrev(transition);
    setComment('');
  }
  const required = transition?.comment === 'required';
  const withComment = !!transition?.comment;
  const danger = transition?.style === 'danger';
  return (
    <Modal
      open={!!transition}
      onClose={onClose}
      persistent={busy}
      title={transition ? `${transition.action}?` : ''}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Отмена
          </Button>
          <Button
            variant={danger ? 'danger' : transition?.style === 'success' ? 'success' : 'primary'}
            loading={busy}
            disabled={required && !comment.trim()}
            onClick={() => onConfirm(comment.trim())}
          >
            {transition?.action}
          </Button>
        </>
      }
    >
      <p className={s.dialogText}>
        {transition?.to === 'in_progress' && transition.action === 'Вернуть на доработку'
          ? 'Напишите, что нужно доработать. Комментарий попадёт в историю задачи.'
          : TRANSITION_HINT[transition?.to || ''] || ''}
      </p>
      {withComment && (
        <textarea
          className={s.dialogInput}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={required ? (danger ? 'Например: не соответствует ТЗ, нужно переделать…' : 'Что нужно доработать…') : 'Комментарий (необязательно)'}
          maxLength={5000}
          rows={4}
          autoFocus
        />
      )}
    </Modal>
  );
}
