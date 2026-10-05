/** Задачи: форма данных из server/src/routes/tasks.ts. */

export type TaskStatus = 'new' | 'in_progress' | 'on_review' | 'done' | 'overdue' | 'rejected' | 'archived';
export type Importance = 'green' | 'yellow' | 'red';

export interface TaskPerson {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_active?: boolean;
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

export interface TaskComment {
  id: number;
  task_id: number;
  author_id: number;
  username: string;
  display_name: string | null;
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
  uploaded_by_name?: string | null;
  uploaded_at: string;
}

export interface TaskTransition {
  to: TaskStatus;
  action: string;
  comment: 'required' | 'optional' | null;
  style: 'primary' | 'success' | 'danger' | 'neutral';
}

export interface Task {
  id: number;
  title: string;
  description: string | null;
  importance: Importance;
  hard_deadline: string | null;
  executor_deadline: string | null;
  reviewer_deadline: string | null;
  status_new: TaskStatus;
  creator_id: number;
  creator_name?: string | null;
  creator_username?: string | null;
  creator?: TaskPerson;
  is_overdue?: boolean;
  current_deadline?: string | null;
  is_creator?: boolean;
  is_assignee?: boolean;
  is_watcher?: boolean;
  is_supervisor?: boolean;
  executor_comment: string | null;
  watcher_comment: string | null;
  archived_at: string | null;
  archived_as: string | null;
  status_before_archive?: string | null;
  assignees: TaskPerson[];
  watchers: TaskPerson[];
  assignees_count: number;
  watchers_count: number;
  pending_checkpoints: number;
  comments_count?: number;
  files_count?: number;
  created_at: string;
  updated_at: string;
}

export interface TaskDetail extends Task {
  available_transitions: TaskTransition[];
  checkpoints: TaskCheckpoint[];
  canvas: TaskComment[];
  files: TaskFile[];
}

export interface TaskHistoryItem {
  id: number;
  task_id: number;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  changed_by: number;
  changed_by_name: string | null;
  changed_by_username: string | null;
  avatar_url: string | null;
  comment: string | null;
  created_at: string;
}
