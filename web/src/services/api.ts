import axios from 'axios';
import { SERVER_URL, getToken, clearToken } from '../utils';

// Создаём instance axios
export const apiClient = axios.create({
  baseURL: SERVER_URL,
  timeout: 30000,
});

// Интерцептор для добавления токена
apiClient.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Интерцептор для обработки ошибок авторизации
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      clearToken();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

async function request<T>(url: string, options: any = {}): Promise<T> {
  const { method = 'GET', body, ...rest } = options;
  
  const config: any = {
    method,
    url,
    ...rest,
  };

  if (body) {
    config.data = typeof body === 'string' ? JSON.parse(body) : body;
    config.headers = {
      ...config.headers,
      'Content-Type': 'application/json',
    };
  }

  const response = await apiClient.request(config);
  return response.data;
}

// ==================== АВТОРИЗАЦИЯ ====================
export interface User {
  id: number;
  username: string;
  display_name: string;
  email?: string;
  role_name: string;
  avatar_url?: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export const api = {
  login: async (username: string, password: string): Promise<LoginResponse> => {
    const response = await apiClient.post('/api/auth/login', { username, password });
    return response.data;
  },

  register: async (username: string, password: string, display_name: string): Promise<LoginResponse> => {
    const response = await apiClient.post('/api/auth/register', { username, password, display_name });
    return response.data;
  },

  getCurrentUser: (): Promise<User> =>
    request<User>('/api/auth/me'),

  logout: (): Promise<void> =>
    request<void>('/api/auth/logout', { method: 'POST' }).catch(() => {}),

  // ==================== ЗАДАЧИ ====================
  getTasks: (params?: any) => request<any[]>('/api/tasks', { params }),
  
  getTaskById: (id: number) => request<any>(`/api/tasks/${id}`),
  
  createTask: (data: any) => request<any>('/api/tasks', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  updateTask: (id: number, data: any) => request<any>(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  deleteTask: (id: number) => request<void>(`/api/tasks/${id}`, {
    method: 'DELETE',
  }),

  // ==================== KPI ====================
  getMyKpi: (): Promise<any> =>
    request<any>('/api/kpi/sales/targets/my-monthly').catch(() => null),

  getSalesSummary: (period: 'week' | 'month' | 'quarter' = 'month') =>
    request<any>(`/api/kpi/sales/summary?period=${period}`),

  getSubordinates: () => request<any[]>('/api/kpi/sales/subordinates'),

  getEmployeeStats: (userId: number, period: string = 'month') =>
    request<any>(`/api/kpi/sales/employee/${userId}/stats?period=${period}`),

  assignTarget: (data: any) =>
    request<any>('/api/kpi/sales/targets/assign', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ==================== ИМПОРТ ====================
  previewImport: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/api/kpi/sales/import/preview', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data;
  },

  confirmImport: (importId: number, mapping: Record<string, string | null>) =>
    request<any>('/api/kpi/sales/import/confirm', {
      method: 'POST',
      body: JSON.stringify({ importId, mapping }),
    }),

  // ==================== ЗАМЕТКИ ====================
  getNotesByDate: (date: string) => request<any[]>(`/api/notes?date=${date}`),
  
  getFavoriteNotes: () => request<any[]>('/api/notes/favorites'),
  
  getDaysWithNotes: (month: string) => request<any[]>(`/api/notes/days?month=${month}`),

  createNote: (data: any) => request<any>('/api/notes', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  updateNote: (id: number, data: any) => request<any>(`/api/notes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  deleteNote: (id: number) => request<void>(`/api/notes/${id}`, {
    method: 'DELETE',
  }),

  // ==================== БАЗА ЗНАНИЙ ====================
  getChatSessions: (): Promise<any[]> =>
    request<any[]>('/api/knowledge/sessions'),

  getSessionMessages: (sessionId: number): Promise<any[]> =>
    request<any[]>(`/api/knowledge/sessions/${sessionId}/messages`),

  sendChatMessage: (data: { session_id?: number; message: string }): Promise<any> =>
    request<any>('/api/knowledge/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  sendMessageFeedback: (messageId: number, feedback: 'positive' | 'negative', comment?: string): Promise<void> =>
    request<void>(`/api/knowledge/messages/${messageId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ feedback, comment }),
    }),

  // ==================== ПРОФИЛЬ ====================
  updateProfile: (data: any) => request<any>('/api/auth/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  uploadAvatar: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('avatar', file);

    const response = await apiClient.post('/api/auth/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });

    return response.data;
  },
};

// ==================== ДОПОЛНИТЕЛЬНЫЕ ФУНКЦИИ ====================
export const getSalesTransactions = (params?: any): Promise<any[]> =>
  request<any[]>('/api/kpi/sales/transactions', { params });

// ==================== ПОЛЬЗОВАТЕЛИ И ДЕРЕВО РОЛЕЙ ====================
export const getSubtreeUsers = (): Promise<any[]> =>
  request<any[]>('/api/role-tree/subtree-users').catch(() => []);

export const getUsers = (): Promise<any[]> =>
  request<any[]>('/api/users').catch(() => []);

// ==================== ДЕТАЛИ ЗАДАЧ ====================
export interface TaskHistoryItem {
  id: number;
  task_id: number;
  from_status: string | null;
  to_status: string;
  changed_by: number;
  changed_by_name: string;
  changed_by_username: string;
  avatar_url: string | null;
  comment: string | null;
  created_at: string;
}

export interface TaskCanvasPost {
  id: number;
  task_id: number;
  author_id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  content: string;
  content_type: string;
  created_at: string;
  updated_at: string;
  is_edited?: boolean;
}

export interface TaskFile {
  id: number;
  task_id: number;
  file_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  uploaded_by: number;
  uploaded_at: string;
}

export const getTask = (id: number): Promise<any> =>
  request<any>(`/api/tasks/${id}`);

export const getTaskHistory = (id: number): Promise<TaskHistoryItem[]> =>
  request<TaskHistoryItem[]>(`/api/tasks/${id}/history`);

export const getTaskComments = (id: number): Promise<TaskCanvasPost[]> =>
  request<TaskCanvasPost[]>(`/api/tasks/${id}/comments`);

export const transitionTask = (id: number, to_status: string, comment?: string): Promise<any> =>
  request<any>(`/api/tasks/${id}/transition`, {
    method: 'POST',
    body: JSON.stringify({ to_status, comment }),
  });

export const addCanvasPost = (taskId: number, content: string): Promise<TaskCanvasPost> =>
  request<TaskCanvasPost>(`/api/tasks/${taskId}/canvas`, {
    method: 'POST',
    body: JSON.stringify({ content, content_type: 'text' }),
  });

export const updateTaskComment = (taskId: number, commentId: number, content: string): Promise<TaskCanvasPost> =>
  request<TaskCanvasPost>(`/api/tasks/${taskId}/comments/${commentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  });

export const deleteTaskComment = (taskId: number, commentId: number): Promise<void> =>
  request<void>(`/api/tasks/${taskId}/comments/${commentId}`, {
    method: 'DELETE',
  });

export const uploadTaskFile = async (taskId: number, file: File): Promise<TaskFile> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await apiClient.post(`/api/tasks/${taskId}/files`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

export const deleteTaskFile = (taskId: number, fileId: number): Promise<void> =>
  request<void>(`/api/tasks/${taskId}/files/${fileId}`, { method: 'DELETE' });

// ==================== ЗАМЕТКИ ====================
export interface Note {
  id: number;
  title: string;
  content: string;
  note_date: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface DayWithNotes {
  date: string;
  count: number;
}

export const getNotesByMonth = (month: string): Promise<Note[]> =>
  request<Note[]>(`/api/notes?month=${month}`);

export const getNotesByDate = (date: string): Promise<Note[]> =>
  request<Note[]>(`/api/notes?date=${date}`);

export const getDaysWithNotes = (month: string): Promise<DayWithNotes[]> =>
  request<DayWithNotes[]>(`/api/notes/days-with-notes?month=${month}`);


export const getFavoriteNotes = (): Promise<Note[]> =>
  request<Note[]>('/api/notes?favorite=true');


export const createNote = (data: {
  title: string;
  content: string;
  note_date: string;
  is_favorite?: boolean;
}): Promise<Note> =>
  request<Note>('/api/notes', {
    method: 'POST',
    body: JSON.stringify(data),
  });


export const updateNote = (id: number, data: Partial<{title: string; content: string; is_favorite: boolean}>): Promise<Note> =>
  request<Note>(`/api/notes/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });


export const deleteNote = (id: number): Promise<void> =>
  request<void>(`/api/notes/${id}`, { method: 'DELETE' });
