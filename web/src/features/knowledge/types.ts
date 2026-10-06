/** Данные «Базы знаний» (server/src/routes/knowledge.ts). */

export interface KnowledgeHealth {
  ollama: boolean;
  database: boolean;
  pgvector: boolean;
  ready: boolean;
}

export interface SourceChunk {
  chunk_id: number;
  document_id: number;
  document_name: string;
  content: string;
  /** Есть только в свежем ответе; в истории диалога не хранится. */
  similarity?: string;
}

export interface KbMessage {
  id: number;
  session_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  source_chunks?: SourceChunk[];
  feedback?: 'positive' | 'negative' | null;
  feedback_comment?: string | null;
  created_at: string;
  /** Вопрос ещё отправляется (локальный). */
  pending?: boolean;
}

export interface KbSession {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
  last_message: string | null;
}

export interface ChatResponse {
  session_id: number;
  user_message: KbMessage;
  assistant_message: KbMessage;
}

export type DocStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface KbDocument {
  id: number;
  original_name: string;
  file_size: number;
  mime_type: string;
  tags: string[] | null;
  description: string | null;
  status: DocStatus;
  chunks_count: number | null;
  error_message: string | null;
  uploaded_by: number | null;
  uploaded_by_name?: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface KbStats {
  documents_by_status: Partial<Record<DocStatus, number>>;
  total_chunks: number;
  total_sessions: number;
  messages_by_role: Partial<Record<'user' | 'assistant', number>>;
}
