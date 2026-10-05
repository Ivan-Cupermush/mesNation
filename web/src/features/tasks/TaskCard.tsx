import { memo } from 'react';
import { CalendarDays, Eye, Flag, MessageCircle, Monitor, Paperclip, Users, Wrench } from 'lucide-react';
import { displayName } from '../../lib/format';
import { Avatar } from '../../ui/Avatar';
import { priorityOf, shortDate, stageDeadline, StatusPill, StatusSegments } from './status';
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

/** Карточка задачи в списке — как в приложении. */
function TaskCard({ task, active, onOpen }: Props) {
  const priority = priorityOf(task.importance);
  const due = stageDeadline(task);
  const assignees = task.assignees || [];
  return (
    <button type="button" className={[s.card, active && s.active].filter(Boolean).join(' ')} onClick={() => onOpen(task)}>
      <span className={s.head}>
        <span className={s.priority} style={{ color: priority.color }}>
          <Flag size={15} strokeWidth={2.2} />
          {priority.label}
        </span>
        {task.is_overdue && <span className={s.overdue}>просрочена</span>}
        {task.archived_as === 'deleted' && <span className={s.deleted}>удалена</span>}
        <RoleIcons task={task} />
      </span>
      <span className={s.title}>{task.title}</span>
      <span className={s.progress}>
        <StatusPill status={task.status_new} overdue={task.is_overdue} />
        <StatusSegments status={task.status_new} />
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
