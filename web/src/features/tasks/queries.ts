import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/http';
import { onConnectionChange, subscribe } from '../../lib/socket';
import type { AssignableUser } from '../../lib/types';
import type { Task, TaskComment, TaskDetail, TaskHistoryItem } from './types';

export const taskKeys = {
  all: ['tasks'] as const,
  list: (scope: 'mine' | 'team') => ['tasks', 'list', scope] as const,
  detail: (id: number) => ['tasks', 'detail', id] as const,
  history: (id: number) => ['tasks', 'history', id] as const,
  comments: (id: number) => ['tasks', 'comments', id] as const,
};

/**
 * Мои задачи (создал, исполняю, наблюдаю) или задачи команды — вместе с архивом:
 * фильтры и поиск работают на сайте мгновенно, как в приложении.
 */
export function useTasks(scope: 'mine' | 'team' = 'mine', enabled = true) {
  return useQuery({
    queryKey: taskKeys.list(scope),
    queryFn: () => api.get<Task[]>('/api/tasks', { include_archived: 'true', filter: scope === 'team' ? 'team' : undefined }),
    staleTime: 15_000,
    enabled,
  });
}

export function useTask(id: number) {
  return useQuery({ queryKey: taskKeys.detail(id), queryFn: () => api.get<TaskDetail>(`/api/tasks/${id}`), enabled: id > 0 });
}

export function useTaskHistory(id: number) {
  return useQuery({ queryKey: taskKeys.history(id), queryFn: () => api.get<TaskHistoryItem[]>(`/api/tasks/${id}/history`), enabled: id > 0 });
}

export function useTaskComments(id: number) {
  return useQuery({ queryKey: taskKeys.comments(id), queryFn: () => api.get<TaskComment[]>(`/api/tasks/${id}/comments`), enabled: id > 0 });
}

/** Кому можно ставить задачи: себе, вниз по дереву и коллегам своего уровня (считает сервер). */
export function useAssignableUsers(enabled = true) {
  return useQuery({ queryKey: ['users', 'assignable'], queryFn: () => api.get<AssignableUser[]>('/api/users/assignable'), staleTime: 60_000, enabled });
}

/**
 * Задачи обновляются сами: сервер сообщает участникам о новой задаче,
 * смене статуса, комментарии, файле. После обрыва связи — перезагрузка.
 */
export function useTasksRealtime() {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const touched = new Set<number>();
    const flush = () => {
      qc.invalidateQueries({ queryKey: ['tasks', 'list'] });
      for (const id of touched) {
        qc.invalidateQueries({ queryKey: taskKeys.detail(id) });
        qc.invalidateQueries({ queryKey: taskKeys.history(id) });
        qc.invalidateQueries({ queryKey: taskKeys.comments(id) });
      }
      touched.clear();
    };
    const onEvent = (e: { task_id?: number } | undefined) => {
      if (e?.task_id) touched.add(e.task_id);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 200);
    };
    let wasDown = false;
    const offs = [
      subscribe<{ task_id: number }>('task_created', onEvent),
      subscribe<{ task_id: number }>('task_updated', onEvent),
      onConnectionChange((connected) => {
        if (!connected) wasDown = true;
        else if (wasDown) {
          wasDown = false;
          qc.invalidateQueries({ queryKey: taskKeys.all });
        }
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      if (timer.current) clearTimeout(timer.current);
    };
  }, [qc]);
}
