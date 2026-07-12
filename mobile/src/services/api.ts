import { SERVER_URL, getToken } from '../utils';

export interface Task {
  id: number;
  title: string;
  description: string;
  importance: 'green' | 'yellow' | 'red';
  hard_deadline: string | null;
  status_new: 'new' | 'in_progress' | 'on_review' | 'done' | 'overdue' | 'rejected' | 'archived';
  creator_id: number;
  creator_username?: string;
  creator_name?: string;
  watcher_id: number;
  executor_comment: string | null;
  watcher_comment: string | null;
  assignees_count: number;
  pending_checkpoints: number;
  assignees?: Array<{
    id: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
  }>;
  created_at: string;
}

export interface RoleNode {
  id: number;
  name: string;
  parent_id: number | null;
  description: string;
  level: number;
  color: string;
  icon: string;
  users_count: number;
}

export interface UserInSubtree {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role_name: string;
}

// ===== Типы для модуля Заметок =====
export interface Note {
  id: number;
  user_id: number;
  title: string;
  content: string;
  is_favorite: boolean;
  note_date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

export interface DayWithNotes {
  note_date: string;
  note_count: number;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error('Нет токена');
  
  const res = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options?.headers || {}),
    },
  });
  
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

export const api = {
  // ===== Задачи (Tasks) =====
  getTasks: (filter?: 'all' | 'mine' | 'created' | 'watching') =>
    request<Task[]>(`/api/tasks${filter ? `?filter=${filter}` : ''}`),

  getTask: (id: number) =>
    request<any>(`/api/tasks/${id}`),

  createTask: (data: {
    title: string;
    description?: string;
    importance?: 'green' | 'yellow' | 'red';
    hard_deadline?: string;
    assignee_ids: number[];
    watcher_ids?: number[];
    checkpoints?: Array<{ title: string; deadline: string }>;
  }) =>
    request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTask: (id: number, data: Partial<Task>) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteTask: (id: number) =>
    request<{ success: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),

  addCanvasPost: (taskId: number, content: string, content_type: string = 'text') =>
    request<any>(`/api/tasks/${taskId}/canvas`, {
      method: 'POST',
      body: JSON.stringify({ content, content_type }),
    }),

  // ===== Дерево ролей (Role Tree) =====
  getRoleTree: () => request<RoleNode[]>('/api/role-tree'),

  getUsersInSubtree: (nodeId: number) =>
    request<UserInSubtree[]>(`/api/role-tree/users/in-subtree/${nodeId}`),

  // ===== Заметки (Notes) =====
  getNotesByMonth: (month: string) =>
    request<Note[]>(`/api/notes?month=${month}`),

  getNotesByDate: (date: string) =>
    request<Note[]>(`/api/notes?date=${date}`),

  getFavoriteNotes: () =>
    request<Note[]>('/api/notes?favorite=true'),

  getDaysWithNotes: (month: string) =>
    request<DayWithNotes[]>(`/api/notes/days-with-notes?month=${month}`),

  createNote: (data: {
    title?: string;
    content?: string;
    note_date?: string;
    is_favorite?: boolean;
  }) =>
    request<Note>('/api/notes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateNote: (id: number, data: Partial<Note>) =>
    request<Note>(`/api/notes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteNote: (id: number) =>
    request<{ success: boolean }>(`/api/notes/${id}`, { method: 'DELETE' }),
};
