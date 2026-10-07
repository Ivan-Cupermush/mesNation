/** Мессенджер: форма данных из server/src/routes/chats.ts и services/messages.ts. */

export type ChatRole = 'creator' | 'admin' | 'member';
export type AdminPermission = 'change_info' | 'delete_messages' | 'ban_users' | 'add_users' | 'pin_messages' | 'add_admins';

export interface ChatMember {
  id: number;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  role: ChatRole;
  permissions?: AdminPermission[] | null;
  joined_at?: string;
}

export interface LastMessage {
  id: number;
  text: string | null;
  sender_id: number;
  created_at: string;
  file_name: string | null;
  content_type: string | null;
  media_kind: MediaKind | null;
  thumb_url: string | null;
  file_url: string | null;
  poll_id: number | null;
  note_share_id?: number | null;
  poll_question: string | null;
  sender_name: string | null;
}

export interface Chat {
  id: number;
  name: string | null;
  type: 'private' | 'group';
  is_supergroup: boolean;
  created_by: number;
  created_at: string;
  avatar_url: string | null;
  members: ChatMember[];
  members_count: number;
  peer?: ChatMember | null;
  last_message?: LastMessage | null;
  unread_count?: number;
  my_last_read_id?: number;
  peer_last_read_id?: number;
  pinned_at?: string | null;
  muted_until?: string | null;
}

export interface ChatRights {
  is_creator: boolean;
  is_admin: boolean;
  can_change_info: boolean;
  can_add_users: boolean;
  can_ban_users: boolean;
  can_delete_messages: boolean;
  can_pin_messages: boolean;
  can_add_admins: boolean;
}

export interface ChatDetail extends Chat {
  my_rights: ChatRights;
}

export type MediaKind = 'photo' | 'video' | 'file' | 'voice' | 'video_note';

/** Реакции одного вида на сообщение (как в Telegram: одна реакция от человека). */
export interface Reaction {
  emoji: string;
  count: number;
  user_ids: number[];
}

export interface NoteShareInfo {
  id: number;
  title: string;
  preview: string;
  files_count: number;
  sender_id: number;
  accepted_user_ids: number[];
}

export interface PollOption {
  id: number;
  poll_id: number;
  option_index: number;
  text: string;
  is_correct?: boolean;
  vote_count: number;
  voters?: number[];
}

export interface Poll {
  id: number;
  question: string;
  is_anonymous: boolean;
  allows_multiple: boolean;
  is_quiz: boolean;
  correct_option_index: number | null;
  explanation?: string | null;
  is_closed: boolean;
  creator_id: number;
  options: PollOption[];
  total_votes: number;
}

export interface Message {
  id: number;
  chat_id: string;
  sender_id: number;
  text: string | null;
  file_url: string | null;
  file_name: string | null;
  thumb_url: string | null;
  reply_to_message_id: number | null;
  topic_id: number | null;
  external_reply_chat_id: number | null;
  edited_at: string | null;
  pinned: boolean;
  deleted_for_all: boolean;
  content_type: string | null;
  poll_id: number | null;
  client_id: string | null;
  created_at: string;
  forwarded_from_user_id: number | null;
  forwarded_from_message_id: number | null;
  forwarded_from_name: string | null;
  media_group_id: string | null;
  media_kind: MediaKind | null;
  media_width: number | null;
  media_height: number | null;
  media_duration: number | string | null;
  file_size: number | string | null;
  mime_type: string | null;
  /** Волна голосового: до 100 уровней 0..31 через запятую. */
  media_waveform?: string | null;
  /** Кто прослушал голосовое или кружочек. */
  listened_by?: number[] | null;
  reactions?: Reaction[] | null;
  note_share_id: number | null;
  note_share: NoteShareInfo | null;
  poll_question: string | null;
  sender_display_name: string | null;
  sender_name: string | null;
  sender_avatar_url: string | null;
  /** Только на клиенте: сообщение ещё отправляется / не отправилось. */
  pending?: 'sending' | 'failed';
  /** Только на клиенте: доля загрузки файла 0…1. */
  progress?: number;
  /** Только на клиенте: результаты опроса. */
  poll?: Poll;
  my_votes?: number[];
  /** Только на клиенте: локальная копия файла до окончания загрузки. */
  localUrl?: string | null;
  localFile?: File;
  asFile?: boolean;
}

export interface Topic {
  id: number;
  chat_id: number;
  title: string;
  icon: string;
  icon_color: string;
  icon_opacity: number;
  created_by: number | null;
  created_at: string;
  last_message?: LastMessage | null;
}

export interface ScheduledMessage {
  id: number;
  chat_id: number;
  topic_id: number | null;
  text: string;
  send_at: string;
  status: string;
  reply_to_message_id: number | null;
}
