import { SERVER_URL, getToken } from '../utils';

// ================================================================
// ========== ЗАДАЧИ (Tasks) — интерфейсы ========================
// ================================================================

export interface TaskAssignee {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

export interface TaskCheckpoint {
  id: number;
  task_id: number;
  title: string;
  deadline: string;
  status: 'pending' | 'done';
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

export interface Task {
  id: number;
  title: string;
  description: string;
  importance: 'green' | 'yellow' | 'red';
  hard_deadline: string | null;
  executor_deadline: string | null;
  reviewer_deadline: string | null;
  archived_at: string | null;
  status: string;
  status_new: 'new' | 'in_progress' | 'on_review' | 'done' | 'overdue' | 'rejected' | 'archived';
  creator_id: number;
  creator_username?: string;
  creator_name?: string;
  creator?: TaskAssignee;
  watcher_id: number | null;
  executor_comment: string | null;
  watcher_comment: string | null;
  archived_as: string | null;
  assignees_count: number;
  watchers_count?: number;
  pending_checkpoints: number;
  assignees?: TaskAssignee[];
  watchers?: TaskAssignee[];
  checkpoints?: TaskCheckpoint[];
  canvas?: TaskCanvasPost[];
  files?: TaskFile[];
  transition?: {
    from: string;
    to: string;
    action: string;
    changed_by: number;
    comment: string | null;
  };
  created_at: string;
  updated_at: string;
}

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

// ================================================================
// ========== ДЕРЕВО РОЛЕЙ (Role Tree) ===========================
// ================================================================

export interface RoleNode {
  id: number;
  name: string;
  parent_id: number | null;
  description: string;
  level: number;
  color: string;
  icon: string;
  users_count: number;
  created_by: number | null;
  created_at: string;
}

export interface UserInSubtree {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  role_name: string;
}

// ================================================================
// ========== ЗАМЕТКИ (Notes) ====================================
// ================================================================

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

// ================================================================
// ========== KPI ПРОДАЖИ ========================================
// ================================================================

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

// ================================================================
// ========== БАЗА ЗНАНИЙ (Knowledge + AI) =======================
// ================================================================

export interface KnowledgeHealth {
  ollama: boolean;
  database: boolean;
  pgvector: boolean;
  ready: boolean;
}

export interface KnowledgeDocument {
  id: number;
  filename: string;
  original_name: string;
  file_size: number;
  mime_type: string;
  tags: string[];
  description: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  chunks_count: number;
  error_message: string | null;
  uploaded_by: number;
  uploaded_by_name?: string;
  created_at: string;
  processed_at: string | null;
}

export interface ChatSession {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  last_message?: string;
}

export interface SourceChunk {
  chunk_id: number;
  document_name: string;
  document_id: number;
  content: string;
  similarity: string;
}

export interface ChatMessage {
  id: number;
  session_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  source_chunk_ids?: number[];
  source_chunks?: SourceChunk[];
  feedback?: 'positive' | 'negative' | null;
  feedback_comment?: string | null;
  created_at: string;
}

export interface ChatResponse {
  session_id: number;
  user_message: ChatMessage;
  assistant_message: ChatMessage & { source_chunks: SourceChunk[] };
}

export interface KnowledgeStats {
  documents_by_status: Record<string, number>;
  total_chunks: number;
  total_sessions: number;
  messages_by_role: Record<string, number>;
}

// ================================================================
// ========== БАЗОВАЯ ФУНКЦИЯ ЗАПРОСА ============================
// ================================================================

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

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

// ================================================================
// ========== API ==================================================
// ================================================================

export const api = {
  // ==================== АВТОРИЗАЦИЯ ====================
  getCurrentUser: () =>
    request<{
      id: number;
      username: string;
      email: string;
      display_name: string;
      avatar_url: string | null;
      role_id: number;
      department_id: number | null;
    }>('/api/auth/me'),

  // ==================== ЗАДАЧИ (Tasks) ====================
  getTasks: (params?: {
    filter?: 'all' | 'mine' | 'created' | 'watching' | 'review';
    status?: string;
    importance?: string;
    sort_by?: 'deadline' | 'priority';
    include_archived?: boolean;
  }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<Task[]>(`/api/tasks${query ? '?' + query : ''}`);
  },

  getTask: (id: number) => request<Task>(`/api/tasks/${id}`),

  createTask: (data: {
    title: string;
    description?: string;
    importance?: 'green' | 'yellow' | 'red';
    hard_deadline?: string;
    executor_deadline?: string;
    assignee_ids: number[];
    watcher_ids?: number[];
    checkpoints?: { title: string; deadline: string }[];
  }) =>
    request<Task>('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTask: (
    id: number,
    data: Partial<{
      title: string;
      description: string;
      importance: 'green' | 'yellow' | 'red';
      hard_deadline: string | null;
      executor_deadline: string | null;
      reviewer_deadline: string | null;
      executor_comment: string | null;
      watcher_comment: string | null;
      archived_as: string | null;
    }>,
  ) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteTask: (id: number) =>
    request<{ success: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),

  transitionTask: (id: number, to_status: string, comment?: string) =>
    request<Task>(`/api/tasks/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ to_status, comment }),
    }),

  getTaskHistory: (id: number) =>
    request<TaskHistoryItem[]>(`/api/tasks/${id}/history`),

  addCanvasPost: (taskId: number, content: string, content_type?: string) =>
    request<TaskCanvasPost>(`/api/tasks/${taskId}/canvas`, {
      method: 'POST',
      body: JSON.stringify({ content, content_type }),
    }),

  getTaskComments: (taskId: number) =>
    request<TaskCanvasPost[]>(`/api/tasks/${taskId}/comments`),

  updateTaskComment: (taskId: number, commentId: number, content: string) =>
    request<TaskCanvasPost>(`/api/tasks/${taskId}/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  deleteTaskComment: (taskId: number, commentId: number) =>
    request<{ success: boolean }>(`/api/tasks/${taskId}/comments/${commentId}`, {
      method: 'DELETE',
    }),

  uploadTaskFile: async (
    taskId: number,
    fileUri: string,
    fileName: string,
    fileType: string,
    fileSize: number,
  ) => {
    const token = await getToken();
    if (!token) throw new Error('Нет токена');

    const formData = new FormData();
    formData.append('file', {
      uri: fileUri,
      name: fileName,
      type: fileType,
    } as any);

    const res = await fetch(`${SERVER_URL}/api/tasks/${taskId}/files`, {
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

  deleteTaskFile: (taskId: number, fileId: number) =>
    request<{ success: boolean }>(`/api/tasks/${taskId}/files/${fileId}`, {
      method: 'DELETE',
    }),

  // ==================== ДЕРЕВО РОЛЕЙ (Role Tree) ====================
  getRoleTree: () => request<RoleNode[]>('/api/role-tree'),

  getUsersInSubtree: (nodeId: number) =>
    request<UserInSubtree[]>(`/api/role-tree/users/in-subtree/${nodeId}`),

  /**
   * Получает всех пользователей из поддерева текущего юзера.
   * Используется в CreateTaskScreen для выбора исполнителей/наблюдателей.
   */
  getSubtreeUsers: async (): Promise<UserInSubtree[]> => {
    try {
      const me = await api.getCurrentUser();
      if (!me.role_id) return [];
      const users = await api.getUsersInSubtree(me.role_id);
      // Исключаем самого себя (создатель не может быть исполнителем у самого себя в большинстве случаев)
      return users.filter((u) => u.id !== me.id);
    } catch (e) {
      console.log('getSubtreeUsers error:', e);
      return [];
    }
  },

  createRoleNode: (data: {
    name: string;
    parent_id: number | null;
    description?: string;
    color?: string;
    icon?: string;
  }) =>
    request<RoleNode>('/api/role-tree', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRoleNode: (id: number, data: Partial<RoleNode>) =>
    request<RoleNode>(`/api/role-tree/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  deleteRoleNode: (id: number) =>
    request<{ success: boolean; message?: string }>(`/api/role-tree/${id}`, {
      method: 'DELETE',
    }),

  createUser: (data: {
    username: string;
    email: string;
    password: string;
    display_name?: string;
    role_node_id: number;
  }) =>
    request<any>('/api/role-tree/users', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // ==================== ЗАМЕТКИ (Notes) ====================
  getNotesByMonth: (month: string) =>
    request<Note[]>(`/api/notes?month=${month}`),

  getNotesByDate: (date: string) =>
    request<Note[]>(`/api/notes?date=${date}`),

  getFavoriteNotes: () => request<Note[]>('/api/notes?favorite=true'),

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

  // ==================== KPI ПРОДАЖИ ====================
  getSalesTargets: () => request<SalesTarget[]>('/api/kpi/sales/targets'),

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

  getSalesTransactions: (params?: { target_id?: number; period?: 'week' | 'month' }) => {
    const query = new URLSearchParams();
    if (params?.target_id) query.set('target_id', String(params.target_id));
    if (params?.period) query.set('period', params.period);
    const q = query.toString();
    return request<SalesTransaction[]>(
      `/api/kpi/sales/transactions${q ? `?${q}` : ''}`,
    );
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

  getSalesSummary: (period: 'week' | 'month' | 'quarter' = 'month') =>
    request<SalesSummary>(`/api/kpi/sales/summary?period=${period}`),

  previewImport: async (
    fileUri: string,
    fileName: string,
    fileType: string,
  ): Promise<ImportPreview> => {
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

  getImportHistory: () => request<SalesImport[]>('/api/kpi/sales/import/history'),

  // ==================== БАЗА ЗНАНИЙ (Knowledge + AI) ====================
  getKnowledgeHealth: (): Promise<KnowledgeHealth> =>
    request<KnowledgeHealth>('/api/knowledge/health'),

  sendChatMessage: (data: {
    session_id?: number;
    message: string;
  }): Promise<ChatResponse> =>
    request<ChatResponse>('/api/knowledge/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getChatSessions: (): Promise<ChatSession[]> =>
    request<ChatSession[]>('/api/knowledge/sessions'),

  getSessionMessages: (sessionId: number): Promise<ChatMessage[]> =>
    request<ChatMessage[]>(`/api/knowledge/sessions/${sessionId}/messages`),

  deleteChatSession: (sessionId: number): Promise<void> =>
    request<void>(`/api/knowledge/sessions/${sessionId}`, { method: 'DELETE' }),

  sendMessageFeedback: (
    messageId: number,
    feedback: 'positive' | 'negative',
    comment?: string,
  ): Promise<void> =>
    request<void>(`/api/knowledge/messages/${messageId}/feedback`, {
      method: 'POST',
      body: JSON.stringify({ feedback, comment }),
    }),

  getKnowledgeDocuments: (filters?: {
    status?: string;
    tag?: string;
  }): Promise<KnowledgeDocument[]> => {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.tag) params.append('tag', filters.tag);
    const query = params.toString();
    return request<KnowledgeDocument[]>(
      `/api/knowledge/documents${query ? `?${query}` : ''}`,
    );
  },

  deleteKnowledgeDocument: (id: number): Promise<void> =>
    request<void>(`/api/knowledge/documents/${id}`, { method: 'DELETE' }),

  uploadKnowledgeDocument: async (
    file: { uri: string; name: string; type: string },
    tags: string[] = [],
    description?: string,
  ): Promise<KnowledgeDocument> => {
    const formData = new FormData();
    formData.append('file', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);
    formData.append('tags', JSON.stringify(tags));
    if (description) formData.append('description', description);

    const token = await getToken();
    const response = await fetch(`${SERVER_URL}/api/knowledge/documents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'multipart/form-data',
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Ошибка загрузки');
    return data;
  },

  getKnowledgeStats: (): Promise<KnowledgeStats> =>
    request<KnowledgeStats>('/api/knowledge/stats'),
};