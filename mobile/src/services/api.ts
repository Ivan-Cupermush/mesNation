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
  note_date: string;
  created_at: string;
  updated_at: string;
}

export interface DayWithNotes {
  note_date: string;
  note_count: number;
}

// ===== Типы для модуля KPI Продаж =====
export type MetricType = 'quantity' | 'amount' | 'contracts';

export interface SalesTarget {
  id: number;
  user_id: number;
  is_department_target: boolean;
  department_id: number | null;
  product_name: string | null;
  metric_type: MetricType;
  target_value: number;
  current_value: number;
  period_start: string;
  period_end: string;
  description: string | null;
  progress_percent?: number;
  created_at: string;
  updated_at: string;
}

export interface SalesTransaction {
  id: number;
  user_id: number;
  target_id: number | null;
  product_name: string;
  quantity: number;
  amount: number;
  transaction_date: string;
  client_name: string | null;
  notes: string | null;
  import_id: number | null;
  created_at: string;
}

export interface SalesImport {
  id: number;
  user_id: number;
  file_name: string;
  file_size: number | null;
  total_rows: number;
  imported_rows: number;
  skipped_rows: number;
  total_amount: number;
  status: 'pending' | 'completed' | 'failed';
  error_log: string[] | null;
  created_at: string;
  completed_at: string | null;
}

export interface ImportPreview {
  importId: number;
  fileName: string;
  totalRows: number;
  preview: any[];
  headers: string[];
  suggestedMapping: Record<string, string | null>;
  validation: {
    valid: number;
    invalid: number;
    errors: string[];
  };
  totalAmount: number;
}

export interface ImportResult {
  success: boolean;
  imported: number;
  skipped: number;
  totalAmount: number;
  errors: string[];
}

export interface SalesSummary {
  fact: {
    total_amount: number;
    total_quantity: number;
    total_transactions: number;
  };
  targets: SalesTarget[];
  personalTarget: SalesTarget | null;
  topProducts: Array<{
    product_name: string;
    total_quantity: number;
    total_amount: number;
    transactions_count: number;
  }>;
  period: string;
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

  // ===== KPI Продаж =====
  
  // Цели продаж
  getSalesTargets: () =>
    request<SalesTarget[]>('/api/kpi/sales/targets'),

  createSalesTarget: (data: {
    product_name?: string;
    metric_type?: MetricType;
    target_value: number;
    current_value?: number;
    period_start?: string;
    period_end?: string;
    description?: string;
    is_department_target?: boolean;
  }) =>
    request<SalesTarget>('/api/kpi/sales/targets', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateSalesTarget: (id: number, data: Partial<SalesTarget>) =>
    request<SalesTarget>(`/api/kpi/sales/targets/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteSalesTarget: (id: number) =>
    request<{ success: boolean }>(`/api/kpi/sales/targets/${id}`, { method: 'DELETE' }),

  // Транзакции
  getSalesTransactions: (params?: { target_id?: number; period?: 'week' | 'month' }) => {
    const query = new URLSearchParams();
    if (params?.target_id) query.set('target_id', String(params.target_id));
    if (params?.period) query.set('period', params.period);
    const q = query.toString();
    return request<SalesTransaction[]>(`/api/kpi/sales/transactions${q ? `?${q}` : ''}`);
  },

  createSalesTransaction: (data: {
    product_name: string;
    quantity?: number;
    amount?: number;
    transaction_date?: string;
    client_name?: string;
    notes?: string;
    target_id?: number;
  }) =>
    request<SalesTransaction>('/api/kpi/sales/transactions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Сводка
  getSalesSummary: (period: 'week' | 'month' | 'quarter' = 'month') =>
    request<SalesSummary>(`/api/kpi/sales/summary?period=${period}`),

  // Импорт Excel
  previewImport: async (fileUri: string, fileName: string, fileType: string): Promise<ImportPreview> => {
    const token = await getToken();
    if (!token) throw new Error('Нет токена');
    
    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: fileType,
    } as any);
    
    const res = await fetch(`${SERVER_URL}/api/kpi/sales/import/preview`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка загрузки файла');
    return data;
  },

  confirmImport: (importId: number, mapping: Record<string, string | null>) =>
    request<ImportResult>('/api/kpi/sales/import/confirm', {
      method: 'POST',
      body: JSON.stringify({ importId, mapping }),
    }),

  getImportHistory: () =>
    request<SalesImport[]>('/api/kpi/sales/import/history'),
};
