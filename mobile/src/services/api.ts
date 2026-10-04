import { request as httpRequest, upload, ApiError, UploadFile } from './http';
import { SERVER_URL } from '../config';

export { ApiError };

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
  status: 'pending' | 'completed' | 'missed';
  completed_at?: string | null;
  completed_by?: number | null;
  completed_by_name?: string | null;
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
  /** Просрочена: не завершена, а дедлайн прошёл (вычисляет сервер). */
  is_overdue?: boolean;
  /** Роли текущего пользователя в задаче — для иконок на плашке. */
  is_creator?: boolean;
  is_assignee?: boolean;
  is_watcher?: boolean;
  /** Руководитель участника: видит задачу, но не управляет ей. */
  is_supervisor?: boolean;
  comments_count?: number;
  files_count?: number;
  status_before_archive?: string | null;
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
  /** Прямые члены роли (активные). */
  users_count: number;
  /** Глубина от корня по фактической структуре дерева. */
  depth: number;
  /** Корень дерева = позиция директора. */
  is_root: boolean;
  created_by: number | null;
  created_at: string;
}

export interface CurrentUser {
  id: number;
  username: string;
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  is_active: boolean;
  role_id: number | null;
  role_name: string | null;
  role_color?: string | null;
  role_icon?: string | null;
  role_depth: number | null;
  department_id: number | null;
  is_director: boolean;
  has_subordinates: boolean;
  company_name: string | null;
}

export interface Employee {
  id: number;
  username: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  is_active: boolean;
  deactivated_at?: string | null;
  role_node_id: number | null;
  role_name: string | null;
  role_color?: string | null;
  role_icon?: string | null;
  is_director: boolean;
  can_manage?: boolean;
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
  files_count?: number;
  files?: NoteFile[];
}

export interface NoteFile {
  id: number;
  note_id: number;
  file_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
}

/** Заметка, отправленная во внутренний чат (снимок на момент отправки). */
export interface SharedNote {
  id: number;
  title: string;
  content: string;
  files: { file_url: string; file_name: string; file_size: number | null; mime_type: string | null }[];
  sender_id: number;
  sender_name: string;
  created_at: string;
  accepted_note_id: number | null;
  is_accepted: boolean;
}

/** Краткая карточка пересланной заметки внутри сообщения. */
export interface NoteShareCard {
  id: number;
  title: string;
  preview: string;
  files_count: number;
  sender_id: number;
  accepted_user_ids: number[];
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

/**
 * Совместимость со старым стилем вызовов request(path, { method, body: JSON.stringify(...) }).
 * Вся работа (токен, таймаут, 401, ошибки) — в services/http.ts.
 */
function request<T>(path: string, options?: { method?: string; body?: string }): Promise<T> {
  return httpRequest<T>(path, {
    method: (options?.method as any) || 'GET',
    body: options?.body !== undefined ? JSON.parse(options.body) : undefined,
  });
}

// ================================================================
// ========== API ==================================================
// ================================================================

export const api = {
  // ==================== АВТОРИЗАЦИЯ ====================
  getCurrentUser: () => request<CurrentUser>('/api/auth/me'),

  renameCompany: (company_name: string) =>
    request<{ company_name: string }>('/api/company', { method: 'PATCH', body: JSON.stringify({ company_name }) }),

  changePassword: (current_password: string, new_password: string) =>
    httpRequest<{ success: boolean }>('/api/auth/change-password', { method: 'POST', body: { current_password, new_password } }),

  // ==================== СОТРУДНИКИ ====================
  getUsers: (includeInactive = false) =>
    httpRequest<Employee[]>('/api/users', { query: { include_inactive: includeInactive || undefined } }),

  getUser: (id: number) => httpRequest<CurrentUser & { can_manage: boolean }>(`/api/users/${id}`),

  /** Кому можно ставить задачи: себе, вниз по дереву и коллегам своего уровня. */
  getAssignableUsers: () => httpRequest<UserInSubtree[]>('/api/users/assignable'),

  setUserActive: (id: number, is_active: boolean) =>
    httpRequest<CurrentUser>(`/api/users/${id}/active`, { method: 'PATCH', body: { is_active } }),

  /** Без пароля — сервер сгенерирует новый и вернёт его один раз. */
  resetUserPassword: (id: number, password?: string) =>
    httpRequest<{ password: string }>(`/api/users/${id}/reset-password`, { method: 'POST', body: password ? { password } : {} }),

  // ==================== ЗАДАЧИ (Tasks) ====================
  getTasks: (params?: {
    filter?: 'all' | 'mine' | 'created' | 'watching' | 'review' | 'team';
    overdue?: boolean;
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
    reviewer_deadline?: string;
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
      description: string | null;
      importance: 'green' | 'yellow' | 'red';
      hard_deadline: string | null;
      executor_deadline: string | null;
      reviewer_deadline: string | null;
      executor_comment: string | null;
      watcher_comment: string | null;
      assignee_ids: number[];
      watcher_ids: number[];
    }>,
  ) =>
    request<Task>(`/api/tasks/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  /** «Удаление» = архив с пометкой «удалена» (можно разархивировать). */
  deleteTask: (id: number, reason?: string) =>
    httpRequest<{ success: boolean }>(`/api/tasks/${id}`, { method: 'DELETE', query: { reason } }),

  unarchiveTask: (id: number) => httpRequest<Task>(`/api/tasks/${id}/unarchive`, { method: 'POST' }),

  addCheckpoint: (taskId: number, title: string, deadline: string) =>
    httpRequest<TaskCheckpoint>(`/api/tasks/${taskId}/checkpoints`, { method: 'POST', body: { title, deadline } }),

  updateCheckpoint: (taskId: number, checkpointId: number, data: Partial<Pick<TaskCheckpoint, 'title' | 'deadline' | 'status'>>) =>
    httpRequest<TaskCheckpoint>(`/api/tasks/${taskId}/checkpoints/${checkpointId}`, { method: 'PATCH', body: data }),

  deleteCheckpoint: (taskId: number, checkpointId: number) =>
    httpRequest<{ success: boolean }>(`/api/tasks/${taskId}/checkpoints/${checkpointId}`, { method: 'DELETE' }),

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

  uploadTaskFile: (taskId: number, fileUri: string, fileName: string, fileType: string, _fileSize?: number) =>
    upload<TaskFile>(`/api/tasks/${taskId}/files`, 'file', { uri: fileUri, name: fileName, type: fileType }),

  deleteTaskFile: (taskId: number, fileId: number) =>
    request<{ success: boolean }>(`/api/tasks/${taskId}/files/${fileId}`, {
      method: 'DELETE',
    }),

  // ==================== ДЕРЕВО РОЛЕЙ (Role Tree) ====================
  getRoleTree: () => request<RoleNode[]>('/api/role-tree'),

  getUsersInSubtree: (nodeId: number) =>
    request<UserInSubtree[]>(`/api/role-tree/users/in-subtree/${nodeId}`),

  /** Кандидаты в исполнители (себе, вниз по дереву, коллегам своего уровня). */
  getSubtreeUsers: (): Promise<UserInSubtree[]> => httpRequest<UserInSubtree[]>('/api/users/assignable'),

  /** Люди, привязанные непосредственно к роли (без поддерева). */
  getRoleUsers: (nodeId: number) => httpRequest<UserInSubtree[]>(`/api/role-tree/${nodeId}/users`),

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

  assignUserToRole: (userId: number, roleNodeId: number) =>
    request<{ success: boolean }>(`/api/role-tree/users/${userId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ role_node_id: roleNodeId }),
    }),

  getAllUsersWithRoles: (includeInactive = false) =>
    httpRequest<Employee[]>('/api/users', { query: { include_inactive: includeInactive || undefined } }),

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

  getNote: (id: number) => request<Note>(`/api/notes/${id}`),

  duplicateNote: (id: number) => request<Note>(`/api/notes/${id}/duplicate`, { method: 'POST', body: '{}' }),

  uploadNoteFile: (noteId: number, file: UploadFile) => upload<NoteFile>(`/api/notes/${noteId}/files`, 'file', file),

  deleteNoteFile: (noteId: number, fileId: number) =>
    request<{ success: boolean }>(`/api/notes/${noteId}/files/${fileId}`, { method: 'DELETE' }),

  /** Ссылка на PDF (живёт 10 минут), открывается во внешнем приложении. */
  getNotePdfUrl: async (noteId: number) => {
    const { url } = await request<{ url: string }>(`/api/notes/${noteId}/pdf-link`);
    return `${SERVER_URL}${url}`;
  },

  shareNote: (noteId: number, data: { chat_id: number; topic_id?: number | null; comment?: string }) =>
    request<any>(`/api/notes/${noteId}/share`, { method: 'POST', body: JSON.stringify(data) }),

  getSharedNote: (shareId: number) => request<SharedNote>(`/api/notes/shared/${shareId}`),

  acceptSharedNote: (shareId: number) => request<Note>(`/api/notes/shared/${shareId}/accept`, { method: 'POST', body: '{}' }),

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

  // Получить личный KPI текущего пользователя
  getMyKpi: (): Promise<any> =>
    request<any>('/api/kpi/sales/targets/my-monthly').catch(() => null),

  getSalesSummary: (period: 'week' | 'month' | 'quarter' = 'month') =>
    request<SalesSummary>(`/api/kpi/sales/summary?period=${period}`),

  previewImport: (fileUri: string, fileName: string, fileType: string | null): Promise<ImportPreview> =>
    upload<ImportPreview>('/api/kpi/sales/import/preview', 'file', { uri: fileUri, name: fileName, type: fileType }),

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

  uploadKnowledgeDocument: (
    file: { uri: string; name: string; type: string },
    tags: string[] = [],
    description?: string,
  ): Promise<KnowledgeDocument> =>
    upload<KnowledgeDocument>('/api/knowledge/documents', 'file', file, { tags: JSON.stringify(tags), description }),

  getKnowledgeStats: (): Promise<KnowledgeStats> =>
    request<KnowledgeStats>('/api/knowledge/stats'),

  // Получить статистику конкретного сотрудника
  getEmployeeStats: (userId: number, period: string = 'month') =>
    request<any>(`/api/kpi/sales/employee/${userId}/stats?period=${period}`),

  getSubordinates: () => request<any[]>('/api/kpi/sales/subordinates'),

  // Назначить KPI подчинённому
  assignTarget: (data: {
    user_id: number;
    product_name: string;
    metric_type?: MetricType;
    target_value: number;
    current_value?: number;
    period_start?: string;
    period_end?: string;
    description?: string;
  }) =>
    request<SalesTarget>('/api/kpi/sales/targets/assign', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  importKpiReport: (fileUri: string, fileName: string, fileType: string) =>
    upload<any>('/api/kpi/sales/import-report', 'file', { uri: fileUri, name: fileName, type: fileType }),

  importReport: (fileUri: string, fileName: string, fileType: string) =>
    upload<any>('/api/kpi/sales/import-report', 'file', { uri: fileUri, name: fileName, type: fileType }),

  // Выход из системы
  logout: (): Promise<void> =>
    request<void>('/api/auth/logout', { method: 'POST' }).catch(() => {}),
};