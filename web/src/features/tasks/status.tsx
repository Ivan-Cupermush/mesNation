import { Fragment } from 'react';
import { AlertCircle, Archive, Check, CheckCircle2, Eye, PlayCircle, Sparkles, XCircle, type LucideIcon } from 'lucide-react';
import { plural } from '../../lib/format';
import type { Importance, Task, TaskStatus } from './types';
import s from './status.module.css';

/**
 * Словарь статусов задачи — тот же, что в приложении (components/tasks/taskStatus.tsx):
 * синий — идёт работа, жёлтый — ждёт проверки, зелёный — готово, красный — проблема.
 */
export interface StatusMeta {
  label: string;
  /** CSS-переменные палитры, чтобы статусы были правильными и в тёмной теме. */
  color: string;
  soft: string;
  icon: LucideIcon;
  step: number;
}

export const TASK_STATUS: Record<TaskStatus, StatusMeta> = {
  new: { label: 'Новая', color: 'var(--c-text-secondary)', soft: 'var(--c-input-bg)', icon: Sparkles, step: 0 },
  in_progress: { label: 'В работе', color: 'var(--c-info)', soft: 'var(--c-info-soft)', icon: PlayCircle, step: 1 },
  on_review: { label: 'На проверке', color: 'var(--c-warning)', soft: 'var(--c-warning-soft)', icon: Eye, step: 2 },
  rejected: { label: 'На доработке', color: 'var(--c-danger)', soft: 'var(--c-danger-soft)', icon: XCircle, step: 1 },
  done: { label: 'Принята', color: 'var(--c-success)', soft: 'var(--c-success-soft)', icon: CheckCircle2, step: 3 },
  overdue: { label: 'Просрочена', color: 'var(--c-danger)', soft: 'var(--c-danger-soft)', icon: AlertCircle, step: 1 },
  archived: { label: 'В архиве', color: 'var(--c-text-secondary)', soft: 'var(--c-input-bg)', icon: Archive, step: 3 },
};

export const statusMeta = (st?: string | null): StatusMeta => TASK_STATUS[(st as TaskStatus) || 'new'] || TASK_STATUS.new;

export const PRIORITY: Record<Importance, { label: string; long: string; color: string; soft: string; rank: number }> = {
  red: { label: 'Высокий', long: 'Высокий приоритет', color: 'var(--c-danger)', soft: 'var(--c-danger-soft)', rank: 0 },
  yellow: { label: 'Средний', long: 'Средний приоритет', color: 'var(--c-warning)', soft: 'var(--c-warning-soft)', rank: 1 },
  green: { label: 'Низкий', long: 'Низкий приоритет', color: 'var(--c-success)', soft: 'var(--c-success-soft)', rank: 2 },
};

export const priorityOf = (i?: string | null) => PRIORITY[(i as Importance) || 'yellow'] || PRIORITY.yellow;

/** Общий срок задачи. */
export const finalDeadline = (t: Pick<Task, 'executor_deadline' | 'hard_deadline'>) => t.executor_deadline || t.hard_deadline || null;

/**
 * Срок, важный сейчас: до первой сдачи — «сдать до» (дедлайн проверки),
 * на проверке — «проверить до», иначе — общий срок.
 */
export function stageDeadline(t: Task): { label: string; iso: string | null } {
  const final = finalDeadline(t);
  const cur = t.current_deadline || null;
  if (cur && final && new Date(cur).getTime() !== new Date(final).getTime()) {
    return { label: t.status_new === 'on_review' ? 'проверить до' : 'сдать до', iso: cur };
  }
  return { label: '', iso: final };
}

export const shortDate = (iso: string | null | undefined, withTime = false) => {
  if (!iso) return 'Без срока';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Без срока';
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: '2-digit' }),
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
};

/** Сколько осталось до срока: «через 3 дня», «через 5 ч», «просрочено на 2 дня». */
export function timeLeft(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const h = Math.round(abs / 3_600_000);
  const d = Math.round(abs / 86_400_000);
  const part = abs < 3_600_000 ? 'меньше часа' : h < 24 ? `${h} ч` : `${d} ${plural(d, ['день', 'дня', 'дней'])}`;
  return ms >= 0 ? `осталось ${part}` : `просрочено на ${part}`;
}

/** Метка статуса для списков. */
export function StatusPill({ status, overdue }: { status: TaskStatus; overdue?: boolean }) {
  const m = statusMeta(status);
  const late = !!overdue && status !== 'done' && status !== 'archived';
  const color = late ? 'var(--c-danger)' : m.color;
  return (
    <span className={s.pill} style={{ background: late ? 'var(--c-danger-soft)' : m.soft, color }}>
      <span className={s.dot} style={{ background: color }} />
      {late && status !== 'overdue' ? `${m.label} · срок вышел` : m.label}
    </span>
  );
}

/** Мини-прогресс из 4 сегментов (для карточек). */
export function StatusSegments({ status }: { status: TaskStatus }) {
  const m = statusMeta(status);
  const filled = status === 'archived' ? 4 : m.step + 1;
  return (
    <span className={s.segments} aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={s.segment} style={{ background: i < filled ? m.color : 'var(--c-surface-active)' }} />
      ))}
    </span>
  );
}

const STEPS = ['Новая', 'В работе', 'Проверка', 'Принята'];

/** Шкала этапов: пройденные — галочки, текущий — иконка статуса. */
export function StatusTrack({ status }: { status: TaskStatus }) {
  const m = statusMeta(status);
  const archived = status === 'archived';
  const current = m.step;
  const Icon = m.icon;
  return (
    <div className={s.track}>
      {STEPS.map((label, i) => {
        const done = archived || i < current || (status === 'done' && i === 3);
        const active = !archived && i === current && status !== 'done';
        const color = active ? m.color : done ? 'var(--c-success)' : 'var(--c-text-muted)';
        return (
          <Fragment key={label}>
            {i > 0 && <span className={s.line} style={{ background: i <= current || archived ? 'var(--c-success)' : 'var(--c-surface-active)' }} />}
            <span className={s.step}>
              <span className={s.node} style={{ borderColor: color, background: done ? 'var(--c-success)' : active ? m.soft : 'var(--c-card)', color: done ? '#fff' : m.color }}>
                {done ? <Check size={13} strokeWidth={3} /> : active ? <Icon size={14} strokeWidth={2.4} /> : null}
              </span>
              <span className={[s.stepLabel, active && s.stepActive].filter(Boolean).join(' ')} style={{ color: active ? m.color : done ? 'var(--c-text-primary)' : 'var(--c-text-muted)' }}>
                {active && (status === 'rejected' || status === 'overdue') ? m.label : label}
              </span>
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

/** Подсказка «что дальше» с точки зрения текущего пользователя. */
export function nextStepHint(status: TaskStatus, roles: { creator: boolean; assignee: boolean; watcher?: boolean }): string {
  const self = roles.creator && roles.assignee;
  const reviewer = roles.creator || !!roles.watcher;
  switch (status) {
    case 'new':
      return roles.assignee ? 'Возьмите задачу в работу, когда начнёте.' : 'Ждём, пока исполнитель возьмёт задачу в работу.';
    case 'in_progress':
      if (self) return 'Когда закончите — нажмите «Завершить».';
      return roles.assignee ? 'Когда закончите — отправьте на проверку.' : 'Исполнитель работает над задачей.';
    case 'on_review':
      return reviewer ? 'Проверьте результат: примите задачу или верните с комментарием.' : 'Результат на проверке у наблюдателей.';
    case 'rejected':
      return roles.assignee ? 'Задачу вернули — посмотрите причину в истории и доработайте.' : 'Задача на доработке у исполнителя.';
    case 'overdue':
      return roles.assignee ? 'Срок вышел. Завершите работу или договоритесь о новом сроке.' : 'Срок вышел. Создатель может перенести дедлайн в меню «⋯».';
    case 'done':
      if (roles.creator) return 'Задача принята. Её можно архивировать или вернуть на доработку.';
      return reviewer ? 'Задача принята. При необходимости её можно вернуть на доработку.' : 'Задача принята.';
    case 'archived':
      return 'Задача в архиве.';
    default:
      return '';
  }
}

function atHour(days: number, h: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, 0, 0, 0);
  return d;
}

/** Быстрые варианты срока для задач и контрольных точек. */
export const DEADLINE_PRESETS = [
  { label: 'Сегодня в 18:00', at: () => atHour(0, 18) },
  { label: 'Завтра в 18:00', at: () => atHour(1, 18) },
  { label: 'Через 3 дня', at: () => atHour(3, 18) },
  { label: 'Через неделю', at: () => atHour(7, 18) },
];
