import { useMemo } from 'react';
import { useAuth } from '../auth/AuthProvider';
import { isManager } from '../auth/roles';
import { fuzzyMatch } from '../../lib/fuzzy';
import { useTasks } from './queries';
import { finalDeadline, priorityOf } from './status';
import type { Task, TaskStatus } from './types';

export type RoleFilter = 'all' | 'mine' | 'watching' | 'review' | 'team' | 'created' | 'overdue' | 'archived';
export type StatusFilter = 'any' | Exclude<TaskStatus, 'archived'>;
export type SortBy = 'deadline' | 'priority';

/** Ролевые фильтры — как в приложении. */
export const ROLE_FILTERS: { key: RoleFilter; label: string; managersOnly?: boolean }[] = [
  { key: 'all', label: 'Все' },
  { key: 'mine', label: 'Исполняю' },
  { key: 'watching', label: 'Наблюдаю' },
  { key: 'review', label: 'Проверить' },
  { key: 'team', label: 'Команда', managersOnly: true },
  { key: 'created', label: 'Создал' },
  { key: 'overdue', label: 'Просроченные' },
  { key: 'archived', label: 'Архив' },
];

/** Фильтр по статусу — был на прежней версии сайта, сохранён. */
export const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'any', label: 'Любой статус' },
  { key: 'new', label: 'Новые' },
  { key: 'in_progress', label: 'В работе' },
  { key: 'on_review', label: 'На проверке' },
  { key: 'rejected', label: 'На доработке' },
  { key: 'done', label: 'Принятые' },
  { key: 'overdue', label: 'Просроченные' },
];

export interface TaskFilterState {
  filter: RoleFilter;
  status: StatusFilter;
  query: string;
  sort: SortBy;
}

const deadlineTime = (t: Task) => {
  const iso = t.current_deadline || finalDeadline(t);
  return iso ? new Date(iso).getTime() : Infinity;
};

/** Отфильтрованный и отсортированный список — та же логика, что в приложении (TasksScreen). */
export function useFilteredTasks(state: TaskFilterState) {
  const { user } = useAuth();
  const meId = user?.id ?? 0;
  const manager = isManager(user);
  const mine = useTasks('mine');
  const team = useTasks('team', manager && state.filter === 'team');
  const source = state.filter === 'team' ? team : mine;

  const tasks = useMemo(() => {
    let list = [...(source.data || [])];
    const q = state.query.trim();
    if (q) list = list.filter((t) => fuzzyMatch(`${t.title} ${t.description || ''}`, q).match);
    switch (state.filter) {
      case 'mine':
        list = list.filter((t) => t.is_assignee && t.status_new !== 'archived');
        break;
      case 'watching':
        list = list.filter((t) => t.is_watcher && !t.is_creator && t.status_new !== 'archived');
        break;
      case 'review':
        // Ждут моей проверки: я наблюдатель или создатель, задача сдана.
        list = list.filter((t) => t.status_new === 'on_review' && (t.is_watcher || t.creator_id === meId));
        break;
      case 'created':
        list = list.filter((t) => t.creator_id === meId && t.status_new !== 'archived');
        break;
      case 'overdue':
        list = list.filter((t) => t.is_overdue || t.status_new === 'overdue');
        break;
      case 'archived':
        list = list.filter((t) => t.status_new === 'archived');
        break;
      default:
        list = list.filter((t) => t.status_new !== 'archived');
    }
    if (state.status !== 'any') {
      list = list.filter((t) => (state.status === 'overdue' ? t.is_overdue || t.status_new === 'overdue' : t.status_new === state.status));
    }
    // Принятые — в конце: сверху то, с чем ещё нужно работать.
    const doneRank = (t: Task) => (t.status_new === 'done' ? 1 : 0);
    list.sort((a, b) => {
      if (doneRank(a) !== doneRank(b)) return doneRank(a) - doneRank(b);
      const pA = priorityOf(a.importance).rank;
      const pB = priorityOf(b.importance).rank;
      const dA = deadlineTime(a);
      const dB = deadlineTime(b);
      if (state.sort === 'deadline') return dA !== dB ? dA - dB : pA - pB;
      return pA !== pB ? pA - pB : dA - dB;
    });
    return list;
  }, [source.data, state.filter, state.status, state.query, state.sort, meId]);

  /** Счётчики для чипов: сколько ждёт моей проверки, сколько просрочено. */
  const counts = useMemo(() => {
    const all = mine.data || [];
    return {
      review: all.filter((t) => t.status_new === 'on_review' && (t.is_watcher || t.creator_id === meId)).length,
      overdue: all.filter((t) => t.status_new !== 'archived' && (t.is_overdue || t.status_new === 'overdue')).length,
    };
  }, [mine.data, meId]);

  return { tasks, counts, manager, isLoading: source.isLoading, error: source.error, refetch: source.refetch };
}
