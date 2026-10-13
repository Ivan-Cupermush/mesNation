import { memo } from 'react';
import { CalendarDays, Eye, Flag, MessageCircle, Monitor, Paperclip, Users, Wrench } from 'lucide-react';
import { displayName } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { priorityOf, shortDate, stageDeadline, StatusPill, StatusSegments } from './status';
import { isRequest, RequestBadge } from './kind';
import { firstNameOf } from '../../lib/names';
import type { Task } from './types';
import s from './TaskCard.module.css';

/** Иконки моей роли: монитор — создал, ключ — исполняю, глаз — наблюдаю, люди — задача команды. */
export function RoleIcons({ task }: { task: Task }) {
  const roles: { key: string; Icon: typeof Monitor; color: string; label: string }[] = [];
  if (task.is_creator) roles.push({ key: 'c', Icon: Monitor, color: 'var(--c-info)', label: 'Вы создатель' });
  if (task.is_assignee) roles.push({ key: 'a', Icon: Wrench, color: 'var(--c-accent)', label: 'Вы исполнитель' });
  if (task.is_watcher && !task.is_creator) roles.push({ key: 'w', Icon: Eye, color: 'var(--c-violet)', label: 'Вы наблюдатель' });
  if (!roles.length) roles.push({ key: 's', Icon: Users, color: 'var(--c-warning)', label: 'Задача вашей команды' });
  return (
    <span className={s.roles} aria-label={roles.map((r) => r.label).join(', ')}>
      {roles.map(({ key, Icon, color, label }) => (
        <span key={key} className={s.role} style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }} title={label}>
          <Icon size={14} strokeWidth={2.2} />
        </span>
      ))}
    </span>
  );
}

interface Props {
  task: Task;
  active?: boolean;
  onOpen: (task: Task) => void;
}

/** Кто просит и кого: «Просит Иван», «Вы попросили Анну», «Иван → Анна». */
function requestLine(task: Task): string {
  const from = task.creator_name ? firstNameOf(task.creator_name) : 'Коллега';
  const to = (task.assignees || []).map((a) => firstNameOf(a));
  const toText = to.length > 2 ? `${to.slice(0, 2).join(', ')} и ещё ${to.length - 2}` : to.join(', ');
  if (task.is_creator && task.is_assignee && to.length === 1) return 'Напоминание себе';
  if (task.is_creator) return toText ? `Вы попросили: ${toText}` : 'Вы попросили';
  if (task.is_assignee) return `Просит ${from}`;
  return toText ? `${from} просит: ${toText}` : `Просит ${from}`;
}

/** Карточка задачи в списке — как в приложении. У просьбы — фиолетовая полоска и «кто просит». */
function TaskCard({ task, active, onOpen }: Props) {
  const request = isRequest(task);
  const priority = priorityOf(task.importance);
  const due = stageDeadline(task);
  const assignees = task.assignees || [];
  return (
    <button type="button" className={[s.card, request && s.request, active && s.active].filter(Boolean).join(' ')} onClick={() => onOpen(task)}>
      <span className={s.head}>
        {request ? (
          <RequestBadge />
        ) : (
          <span className={s.priority} style={{ color: priority.color }}>
            <Flag size={15} strokeWidth={2.2} />
            {priority.label}
          </span>
        )}
        {task.is_overdue && <span className={s.overdue}>просрочена</span>}
        {task.archived_as === 'deleted' && <span className={s.deleted}>удалена</span>}
        <RoleIcons task={task} />
      </span>
      <span className={s.title}>{task.title}</span>
      {request && <span className={s.from}>{requestLine(task)}</span>}
      <span className={s.progress}>
        <StatusPill status={task.status_new} overdue={task.is_overdue} kind={task.kind} />
        <StatusSegments status={task.status_new} kind={task.kind} />
      </span>
      {task.description && <span className={s.description}>{task.description}</span>}
      <span className={s.footer}>
        <span className={s.people}>
          {assignees.length > 0 ? (
            <span className={s.stack}>
              {assignees.slice(0, 3).map((a) => (
                <Avatar key={a.id} name={displayName(a)} src={a.avatar_url} size={28} className={s.stackItem} />
              ))}
              {assignees.length > 3 && <span className={s.more}>+{assignees.length - 3}</span>}
            </span>
          ) : (
            <span className={s.noPeople}>Нет исполнителей</span>
          )}
          {task.watchers_count > 0 && (
            <span className={s.meta} title={`Наблюдателей: ${task.watchers_count}`}>
              <Eye size={13} /> {task.watchers_count}
            </span>
          )}
          {!!task.comments_count && (
            <span className={s.meta} title={`Комментариев: ${task.comments_count}`}>
              <MessageCircle size={13} /> {task.comments_count}
            </span>
          )}
          {!!task.files_count && (
            <span className={s.meta} title={`Файлов: ${task.files_count}`}>
              <Paperclip size={13} /> {task.files_count}
            </span>
          )}
        </span>
        <span className={[s.due, task.is_overdue && s.dueLate].filter(Boolean).join(' ')}>
          <CalendarDays size={13} />
          {due.label ? `${due.label} ` : ''}
          {shortDate(due.iso)}
        </span>
      </span>
    </button>
  );
}

export default memo(TaskCard);
