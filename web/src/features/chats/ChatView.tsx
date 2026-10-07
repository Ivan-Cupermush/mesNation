import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  BellOff,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Copy,
  Download,
  CornerUpLeft,
  CornerUpRight,
  Forward,
  Image as ImageIcon,
  Images,
  Info,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Search,
  Square,
  Trash2,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { useMe } from '../auth/AuthProvider';
import { api, ApiError, downloadFile, openFile } from '../../lib/http';
import { emitEvent, subscribe } from '../../lib/socket';
import { formatDate, lastSeenLabel, plural } from '../../lib/format';
import { useIsMobile } from '../../lib/useMedia';
import { Avatar } from '../../ui/Avatar';
import { Button, IconButton } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Spinner } from '../../ui/Spinner';
import { ActionMenu, type MenuItem } from '../../ui/ActionMenu';
import { anchorFrom, type MenuAnchor } from '../../ui/menuAnchor';
import { DateTimeDialog, SCHEDULE_PRESETS } from '../../ui/DateTimeDialog';
import { useFeedback } from '../../ui/feedback';
import { chatKeys, isMuted, useChatDetail, useTopics } from './queries';
import { MUTE_OPTIONS, markChatRead, setChatMute } from './chatActions';
import { buildFeed, isVisualMedia, isVoiceLike, messagePreview, rowMain, rowMessages, saveName, type Row } from './model';
import { useChatMessages } from './useChatMessages';
import { clearActiveChat, setActiveChat } from './activeChat';
import MessageBubble, { ServiceLine } from './MessageBubble';
import { Composer, type ComposerHandle } from './Composer';
import AttachDialog, { type PickedItem, type SendOptions } from './AttachDialog';
import PollComposer from './PollComposer';
import NotePicker from './NotePicker';
import ChatPicker from './ChatPicker';
import MediaViewer, { type ViewerItem } from './MediaViewer';
import { DeleteDialog, ScheduledList } from './ChatDialogs';
import { TopicIcon } from './topicIcons';
import ReactionPicker from './ReactionPicker';
import VoicePlayerBar from './voice/VoicePlayerBar';
import { seekVoice, setVoiceHandlers, toggleVoice } from './voice/voicePlayer';
import type { Recording } from './voice/useRecorder';
import type { Message, Reaction, ScheduledMessage } from './types';
import s from './ChatView.module.css';

type Typing = Record<number, { name: string; at: number }>;

/** Расстояние от низа ленты, после которого показывается кнопка «вниз». */
const AWAY_PX = 400;

/** Своя реакция: та же — снимается, другая — заменяет прежнюю (как на сервере). */
function applyReaction(list: Reaction[] | null | undefined, emoji: string, meId: number): Reaction[] | null {
  const prev = (list || []).find((r) => r.user_ids.includes(meId))?.emoji ?? null;
  let next = (list || [])
    .map((r) => (r.user_ids.includes(meId) ? { ...r, count: r.count - 1, user_ids: r.user_ids.filter((id) => id !== meId) } : r))
    .filter((r) => r.count > 0);
  if (prev !== emoji) {
    const at = next.findIndex((r) => r.emoji === emoji);
    if (at >= 0) next = next.map((r, i) => (i === at ? { ...r, count: r.count + 1, user_ids: [...r.user_ids, meId] } : r));
    else next = [...next, { emoji, count: 1, user_ids: [meId] }];
  }
  return next.length ? next : null;
}


/**
 * Переписка — как ChatScreen в приложении: лента с альбомами и сериями,
 * «Непрочитанные», закреп, ответ/правка/пересылка/удаление, отложенные
 * сообщения, опросы, заметки, вложения (выбор, вставка, перетаскивание),
 * «печатает…», «в сети», отметки прочтения, черновики.
 */
export default function ChatView() {
  const { chatId = '', topicId: topicParam } = useParams();
  const topicId = topicParam && Number(topicParam) > 0 ? Number(topicParam) : null;
  const inTopicRoute = topicParam !== undefined;
  const base = inTopicRoute ? `/chats/${chatId}/topic/${topicParam}` : `/chats/${chatId}`;
  const me = useMe();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const { toast, confirm } = useFeedback();
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedMessageId = Number(searchParams.get('m')) || null;

  const { data: chat, error: chatError, isFetchedAfterMount: chatFresh } = useChatDetail(chatId, { fresh: true });
  const { data: topics } = useTopics(chatId, { enabled: inTopicRoute });
  const topic = topicId ? (topics?.find((t) => t.id === topicId) ?? null) : null;
  const feed = useChatMessages(chatId, topicId, me.id);
  const { messages, loadUntil, loadOlder, hasOlder, loadingOlder, update: updateMessage } = feed;
  // Свежий список для обработчиков, которые не должны меняться при каждом сообщении (пузыри не перерисовываются).
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const isGroup = chat?.type === 'group';
  const rights = chat?.my_rights;
  const chatName = chat?.name || 'Чат';

  // ===== Состояние экрана =====
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editing, setEditing] = useState<Message | null>(null);
  const [menu, setMenu] = useState<{ row: Row; anchor: MenuAnchor } | null>(null);
  const [headerMenu, setHeaderMenu] = useState<{ anchor: MenuAnchor; mute?: boolean } | null>(null);
  const headerAnchor = useRef<MenuAnchor>({ x: 0, y: 0 });
  const [highlight, setHighlight] = useState<number | null>(null);
  const [pendingJump, setPendingJump] = useState<number | null>(null);
  const [forward, setForward] = useState<{ ids: number[]; mode: 'forward' | 'reply' } | null>(null);
  const [toDelete, setToDelete] = useState<Message[] | null>(null);
  const [attach, setAttach] = useState<{ files: File[]; kind: 'media' | 'file' } | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number } | null>(null);
  const [scheduleText, setScheduleText] = useState<string | null>(null);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [typing, setTyping] = useState<Typing>({});
  const [onlineIds, setOnlineIds] = useState<number[]>([]);
  const [peerPresence, setPeerPresence] = useState<{ online: boolean; last_seen_at: string | null } | null>(null);
  const [peerLastReadId, setPeerLastReadId] = useState(0);
  const [unreadAnchor, setUnreadAnchor] = useState<number | null>(null);
  const [anchorReady, setAnchorReady] = useState(false);
  const [away, setAway] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  /** Выделенные сообщения (режим выделения, как в Telegram); null — режим выключен. */
  const [selection, setSelection] = useState<number[] | null>(null);
  const [search, setSearch] = useState<{ q: string; results: Message[]; index: number; loading: boolean; error: string | null } | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const anchorSet = useRef(false);
  const positioned = useRef(false);
  const lastReadSent = useRef(0);
  const awayRef = useRef(false);
  const dragDepth = useRef(0);

  // ===== Отметки прочтения и «Непрочитанные» =====
  useEffect(() => {
    if (chat) setPeerLastReadId((p) => Math.max(p, chat.peer_last_read_id || 0));
  }, [chat]);

  // Разделитель «Непрочитанные» — только по состоянию на момент открытия:
  // сообщения, пришедшие при открытом чате, его не создают.
  useEffect(() => {
    if (anchorSet.current || feed.loading || !chat || !chatFresh) return;
    anchorSet.current = true;
    const lastRead = chat.my_last_read_id ?? 0;
    const hasUnread = messages.some((m) => m.id > lastRead && m.sender_id !== me.id && m.content_type !== 'service');
    setUnreadAnchor(hasUnread ? lastRead : null);
    setAnchorReady(true);
  }, [chat, chatFresh, feed.loading, messages, me.id]);

  // ===== Закреплённые и запланированные =====
  const pinnedQuery = useQuery({
    queryKey: chatKeys.pinned(chatId, topicId),
    queryFn: () => api.get<Message[]>(`/api/messages/${chatId}/pinned`, { topic_id: topicId ?? undefined }),
    staleTime: 30_000,
  });
  const pinned = pinnedQuery.data || [];
  const scheduledQuery = useQuery({
    queryKey: ['scheduled', chatId, topicId ?? 0],
    queryFn: () => api.get<ScheduledMessage[]>(`/api/chats/${chatId}/scheduled`, { topic_id: topicId ?? undefined }),
    staleTime: 30_000,
  });
  const scheduled = scheduledQuery.data || [];
  const refetchPinned = pinnedQuery.refetch;
  // Закрепили новое — показываем его первым.
  useEffect(() => setPinnedIndex(0), [pinned.length]);
  const refetchScheduled = scheduledQuery.refetch;

  // ===== Присутствие собеседника =====
  const peerId = chat?.type === 'private' ? (chat.peer?.id ?? null) : null;
  useEffect(() => {
    if (!peerId) return;
    api
      .get<{ user_id: number; online: boolean; last_seen_at: string | null }[]>('/api/users/presence', { ids: String(peerId) })
      .then((r) => r[0] && setPeerPresence(r[0]))
      .catch(() => undefined);
    return subscribe<{ user_id: number; online: boolean; last_seen_at?: string | null }>('presence', (p) => {
      if (p.user_id === peerId) setPeerPresence((prev) => ({ online: p.online, last_seen_at: p.last_seen_at ?? prev?.last_seen_at ?? null }));
    });
  }, [peerId]);

  // ===== События чата =====
  useEffect(() => {
    const same = (id: unknown) => String(id) === String(chatId);
    const offs = [
      subscribe<Message>('new_message', (m) => {
        if (!same(m.chat_id) || (m.topic_id ?? null) !== topicId || m.sender_id === me.id) return;
        setTyping((t) => {
          if (!(m.sender_id in t)) return t;
          const next = { ...t };
          delete next[m.sender_id];
          return next;
        });
        if (awayRef.current) setNewWhileAway((n) => n + 1);
        if (m.content_type === 'service') qc.invalidateQueries({ queryKey: chatKeys.detail(chatId) });
      }),
      subscribe('message_pinned', () => refetchPinned()),
      subscribe('message_unpinned', () => refetchPinned()),
      subscribe('message_deleted', () => refetchPinned()),
      subscribe('scheduled_changed', () => refetchScheduled()),
      subscribe<{ chat_id: number | string; user_id: number; message_id: number }>('messages_read', (e) => {
        if (same(e.chat_id) && e.user_id !== me.id) setPeerLastReadId((p) => Math.max(p, e.message_id));
      }),
      subscribe<{ chatId: string; userId: number; userName: string }>('user_typing', (e) => {
        if (!same(e.chatId) || e.userId === me.id) return;
        setTyping((t) => ({ ...t, [e.userId]: { name: e.userName, at: Date.now() } }));
      }),
      subscribe<{ chatId: string; userId: number }>('user_stop_typing', (e) => {
        if (!same(e.chatId)) return;
        setTyping((t) => {
          if (!(e.userId in t)) return t;
          const next = { ...t };
          delete next[e.userId];
          return next;
        });
      }),
      subscribe<number[]>('online_users', (ids) => setOnlineIds(ids)),
      subscribe<{ chatId: number | string }>('removed_from_chat', (e) => {
        if (!same(e.chatId)) return;
        toast('Вас исключили из этого чата');
        navigate('/chats', { replace: true });
      }),
      subscribe<{ chatId: number | string }>('chat_deleted', (e) => {
        if (!same(e.chatId)) return;
        toast('Владелец удалил эту группу');
        navigate('/chats', { replace: true });
      }),
    ];
    return () => {
      offs.forEach((off) => off());
      emitEvent('stop_typing', { chatId: Number(chatId) });
    };
  }, [chatId, topicId, me.id, qc, navigate, toast, refetchPinned, refetchScheduled]);

  // «Печатает…» гаснет само, если stop_typing не пришёл.
  useEffect(() => {
    if (!Object.keys(typing).length) return;
    const t = setInterval(() => {
      setTyping((cur) => {
        const now = Date.now();
        const next = Object.fromEntries(Object.entries(cur).filter(([, v]) => now - v.at < 6000));
        return Object.keys(next).length === Object.keys(cur).length ? cur : next;
      });
    }, 2000);
    return () => clearInterval(t);
  }, [typing]);

  // Открытый чат не присылает уведомлений о своих сообщениях.
  useEffect(() => {
    setActiveChat(chatId, topicId);
    return () => clearActiveChat(chatId, topicId);
  }, [chatId, topicId]);

  // ===== Прочитано: вкладка видна — отмечаем последнее загруженное =====
  useEffect(() => {
    if (feed.loading) return;
    const maxId = messages.reduce((mx, m) => (m.id > mx ? m.id : mx), 0);
    const mark = () => {
      if (document.visibilityState !== 'visible' || maxId <= lastReadSent.current) return;
      lastReadSent.current = maxId;
      markChatRead(chatId, maxId).catch(() => {
        lastReadSent.current = 0;
      });
    };
    const t = setTimeout(mark, 400);
    document.addEventListener('visibilitychange', mark);
    return () => {
      clearTimeout(t);
      document.removeEventListener('visibilitychange', mark);
    };
  }, [messages, feed.loading, chatId]);

  // ===== Лента =====
  const membersById = useMemo(() => new Map((chat?.members || []).map((m) => [m.id, m])), [chat]);
  const senderNameOf = useCallback(
    (m: Message) => m.sender_display_name || m.sender_name || membersById.get(m.sender_id)?.display_name || membersById.get(m.sender_id)?.username || 'Участник',
    [membersById],
  );
  const items = useMemo(() => buildFeed(messages, me.id, unreadAnchor), [messages, me.id, unreadAnchor]);
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  const findEl = (id: number) => scrollRef.current?.querySelector<HTMLElement>(`[data-mid~="${id}"]`) ?? null;

  const flash = (id: number) => {
    setHighlight(id);
    setTimeout(() => setHighlight((h) => (h === id ? null : h)), 1600);
  };

  /** Перейти к сообщению; если его нет в загруженной части — догрузить историю. */
  const jumpTo = useCallback(
    async (id: number) => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-mid~="${id}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        flash(id);
        return;
      }
      if (await loadUntil(id)) setPendingJump(id);
      else toast('Сообщение не найдено — возможно, его удалили');
    },
    [loadUntil, toast],
  );

  // После догрузки истории — прокрутка к нужному сообщению.
  useEffect(() => {
    if (pendingJump === null) return;
    const el = findEl(pendingJump);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    flash(pendingJump);
    setPendingJump(null);
  }, [messages, pendingJump]);

  // Первое открытие: к сообщению из ссылки, к «Непрочитанным» или вниз.
  useEffect(() => {
    if (feed.loading || !anchorReady || positioned.current) return;
    positioned.current = true;
    if (linkedMessageId) {
      jumpTo(linkedMessageId);
      setSearchParams((p) => {
        p.delete('m');
        return p;
      }, { replace: true });
      return;
    }
    requestAnimationFrame(() => scrollRef.current?.querySelector('[data-unread]')?.scrollIntoView({ block: 'start' }));
  }, [feed.loading, anchorReady, linkedMessageId, jumpTo, setSearchParams]);

  // Ссылка на сообщение, когда чат уже открыт (уведомление, поиск).
  useEffect(() => {
    if (positioned.current && linkedMessageId) {
      jumpTo(linkedMessageId);
      setSearchParams((p) => {
        p.delete('m');
        return p;
      }, { replace: true });
    }
  }, [linkedMessageId, jumpTo, setSearchParams]);

  const scrollToBottom = (smooth = true) => {
    scrollRef.current?.scrollTo({ top: 0, behavior: smooth ? 'smooth' : 'auto' });
    setNewWhileAway(0);
  };

  // Лента перевёрнута (column-reverse): scrollTop = 0 внизу, вверх — отрицательный.
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const fromBottom = Math.abs(el.scrollTop);
    const fromTop = el.scrollHeight - el.clientHeight - fromBottom;
    const isAway = fromBottom > AWAY_PX;
    if (isAway !== awayRef.current) {
      awayRef.current = isAway;
      setAway(isAway);
      if (!isAway) setNewWhileAway(0);
    }
    if (fromTop < 600 && hasOlder && !loadingOlder) loadOlder();
  };

  // Новое сообщение внизу: если вы почти у низа ленты — докручиваем к нему (как в Telegram).
  const lastKey = messages.length ? messages[messages.length - 1].client_id || messages[messages.length - 1].id : null;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && lastKey !== null && !awayRef.current && el.scrollTop !== 0) el.scrollTo({ top: 0, behavior: 'smooth' });
  }, [lastKey]);

  // Короткая история не даёт прокрутки — подгружаем ещё сами.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || feed.loading || loadingOlder || !hasOlder) return;
    if (el.scrollHeight <= el.clientHeight + 50) loadOlder();
  }, [messages, feed.loading, loadingOlder, hasOlder, loadOlder]);

  // ===== Отправка =====
  const sendText = (text: string) => {
    const reply = replyTo?.id ?? null;
    setReplyTo(null);
    scrollToBottom(false);
    feed.sendText(text, reply).catch((e) => toast.error(e, 'Сообщение не отправлено'));
  };

  const sendFiles = (picked: PickedItem[], opts: SendOptions) => {
    const reply = replyTo?.id ?? null;
    setReplyTo(null);
    scrollToBottom(false);
    feed
      .sendFiles(
        picked.map((p) => ({ file: p.file, kind: p.kind, width: p.width, height: p.height })),
        { caption: opts.caption, group: opts.group, asFile: opts.asFile, replyToId: reply },
      )
      .catch((e) => toast.error(e instanceof ApiError && e.status === 413 ? 'Файл слишком большой (максимум 200 МБ)' : e, 'Не все файлы отправлены'));
  };

  const saveEdit = async (text: string) => {
    if (!editing) return false;
    try {
      const updated = await api.patch<Message>(`/api/messages/${editing.id}`, { text });
      feed.update(updated.id, updated);
      setEditing(null);
      return true;
    } catch (e) {
      toast.error(e, 'Не удалось изменить');
      return false;
    }
  };

  const editLast = () => {
    const last = [...messages].reverse().find((m) => m.sender_id === me.id && m.id > 0 && !m.poll_id && !m.note_share_id && m.content_type !== 'service');
    if (last) startEdit(last);
  };

  const startEdit = (m: Message) => {
    setReplyTo(null);
    setEditing(m);
  };

  const startReply = (m: Message) => {
    setEditing(null);
    setReplyTo(m);
    composerRef.current?.focus();
  };

  const schedule = async (sendAt: Date) => {
    const text = scheduleText;
    if (!text) return;
    try {
      await api.post(`/api/chats/${chatId}/scheduled`, { text, send_at: sendAt.toISOString(), topic_id: topicId, reply_to_message_id: replyTo?.id ?? null });
      composerRef.current?.clear();
      setReplyTo(null);
      refetchScheduled();
      toast.success(`Будет отправлено ${sendAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`);
    } catch (e) {
      toast.error(e, 'Не удалось запланировать');
      throw e;
    }
  };

  const shareNote = async (noteId: number) => {
    try {
      await api.post(`/api/notes/${noteId}/share`, { chat_id: Number(chatId), topic_id: topicId });
    } catch (e) {
      toast.error(e, 'Не удалось отправить заметку');
    }
  };

  const onFiles = (files: File[], kind: 'media' | 'file') => setAttach({ files, kind });

  // ===== Перетаскивание файлов в чат =====
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const dragHandlers = {
    onDragEnter: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current++;
      setDragOver(true);
    },
    onDragOver: (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    },
    onDragLeave: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (!dragDepth.current) setDragOver(false);
    },
    onDrop: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onFiles(files, files.every((f) => /^(image|video)\//.test(f.type)) ? 'media' : 'file');
    },
  };

  // ===== Действия с сообщениями =====
  const deleteMessages = async (targets: Message[], scope: 'me' | 'all') => {
    const ids = targets.map((t) => t.id).filter((id) => id > 0);
    try {
      // Одним запросом (по 100), как выделение в Telegram; старый сервер — по одному.
      for (let i = 0; i < ids.length; i += 100) {
        const part = ids.slice(i, i + 100);
        try {
          await api.post('/api/messages/bulk-delete', { ids: part, scope });
        } catch (e) {
          if (!(e instanceof ApiError && e.status === 404)) throw e;
          for (const id of part) await api.delete(`/api/messages/${id}`, { scope });
        }
      }
      feed.remove(ids);
      setSelection(null);
    } catch (e) {
      toast.error(e, 'Не удалось удалить');
      throw e;
    }
  };

  // ===== Реакции =====
  const react = useCallback(
    async (m: Message, emoji: string) => {
      if (m.id < 0 || m.pending || m.content_type === 'service') return;
      const before = m.reactions ?? null;
      updateMessage(m.id, { reactions: applyReaction(before, emoji, me.id) });
      try {
        const r = await api.post<{ id: number; reactions: Reaction[] | null }>(`/api/messages/${m.id}/reactions`, { emoji });
        updateMessage(m.id, { reactions: r.reactions });
      } catch (e) {
        updateMessage(m.id, { reactions: before });
        toast.error(e instanceof ApiError && e.status === 404 ? 'Реакции заработают после обновления сервера' : e, 'Не удалось поставить реакцию');
      }
    },
    [updateMessage, me.id, toast],
  );

  // ===== Голосовые и кружочки =====
  /** Голосовые после этого — плеер включит их по очереди. */
  const voiceQueueAfter = useCallback(
    (m: Message) => messagesRef.current.filter((x) => x.media_kind === 'voice' && !x.pending && x.id > 0 && !x.deleted_for_all && x.id > m.id),
    [],
  );
  const markListened = useCallback(
    (m: Message) => {
      if (m.id < 0 || m.sender_id === me.id || (m.listened_by || []).includes(me.id)) return;
      if (String(m.chat_id) === String(chatId)) updateMessage(m.id, { listened_by: [...(m.listened_by || []), me.id] });
      api.post(`/api/messages/${m.id}/listened`).catch(() => undefined);
    },
    [chatId, updateMessage, me.id],
  );
  useEffect(() => {
    setVoiceHandlers({
      onStart: markListened,
      onError: (e) =>
        toast.error(
          e instanceof DOMException && e.name === 'NotSupportedError' ? 'Браузер не умеет проигрывать этот формат. Откройте сайт в Chrome, Edge, Яндекс Браузере, Firefox или Safari' : e,
          'Не удалось воспроизвести',
        ),
    });
    return () =>
      // Голосовое играет и после ухода из чата — «прослушано» всё равно отмечаем.
      setVoiceHandlers({
        onStart: (m) => {
          if (m.sender_id !== me.id && m.id > 0) api.post(`/api/messages/${m.id}/listened`).catch(() => undefined);
        },
      });
  }, [markListened, toast, me.id]);
  const onPlayVoice = useCallback((m: Message) => toggleVoice(m, voiceQueueAfter(m)), [voiceQueueAfter]);
  const onSeekVoice = useCallback((m: Message, ratio: number) => seekVoice(m, ratio, voiceQueueAfter(m)), [voiceQueueAfter]);

  const sendRecording = (r: Recording) => {
    const reply = replyTo?.id ?? null;
    setReplyTo(null);
    scrollToBottom(false);
    feed
      .sendRecording(r, reply)
      .catch((e) => toast.error(e instanceof ApiError && e.status === 413 ? 'Запись слишком большая' : e, r.kind === 'voice' ? 'Голосовое не отправлено' : 'Видеосообщение не отправлено'));
  };

  const saveFile = (m: Message) => {
    if (m.file_url && !m.pending) downloadFile(m.file_url, saveName(m)).catch((e) => toast.error(e, 'Не удалось сохранить'));
  };

  // ===== Выделение =====
  const selectedMsgs = useMemo(
    () => (selection ? messages.filter((m) => selection.includes(m.id)).sort((a, b) => a.id - b.id) : []),
    [messages, selection],
  );
  const startSelect = (row: Row) => setSelection(rowMessages(row).filter((m) => m.id > 0).map((m) => m.id));
  const toggleSelect = useCallback((row: Row) => {
    const ids = rowMessages(row)
      .filter((m) => m.id > 0)
      .map((m) => m.id);
    if (!ids.length) return;
    setSelection((cur) => {
      const now = cur || [];
      const all = ids.every((id) => now.includes(id));
      const next = all ? now.filter((id) => !ids.includes(id)) : [...now, ...ids.filter((id) => !now.includes(id))];
      // Сняли последнее — выходим из режима выделения, как в Telegram.
      return next.length ? next : null;
    });
  }, []);

  /** Текст выделенного: одно сообщение — как есть, несколько — с именами и временем. */
  const selectionText = (list: Message[]) => {
    const withText = list.filter((m) => m.text && m.content_type !== 'service');
    if (withText.length === 1) return withText[0].text!;
    return withText
      .map((m) => `${m.sender_id === me.id ? me.display_name || me.username : senderNameOf(m)}, [${formatDate(m.created_at, true)}]\n${m.text}`)
      .join('\n\n');
  };

  /** «Сохранить»: файлы — скачиваются, текст — одним .txt. */
  const saveSelection = (list: Message[]) => {
    list.filter((m) => m.file_url).forEach(saveFile);
    const text = selectionText(list.filter((m) => m.text && !m.file_url));
    if (text) {
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(chatName || 'Чат').replace(/[\\/:*?"<>|]+/g, ' ').trim()} — сообщения.txt`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
    setSelection(null);
  };

  // ===== Поиск по чату =====
  const searchQ = search?.q.trim() ?? '';
  useEffect(() => {
    if (!search || searchQ.length < 1) return;
    let alive = true;
    setSearch((cur) => (cur ? { ...cur, loading: true, error: null } : cur));
    const t = setTimeout(async () => {
      try {
        const results = await api.get<Message[]>(`/api/messages/${chatId}/search`, { q: searchQ, topic_id: topicId ?? undefined });
        if (!alive) return;
        setSearch((cur) => (cur ? { ...cur, results, index: 0, loading: false } : cur));
        if (results[0]) jumpTo(results[0].id);
      } catch (e) {
        if (!alive) return;
        const text = e instanceof ApiError && e.status === 404 ? 'Поиск заработает после обновления сервера' : e instanceof Error ? e.message : 'Не удалось найти';
        setSearch((cur) => (cur ? { ...cur, results: [], loading: false, error: text } : cur));
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, chatId, topicId, search !== null]);

  const searchStep = (dir: 1 | -1) => {
    if (!search?.results.length) return;
    const index = Math.max(0, Math.min(search.results.length - 1, search.index + dir));
    if (index === search.index) return;
    setSearch({ ...search, index });
    jumpTo(search.results[index].id);
  };

  const openSearch = () => {
    setSelection(null);
    setSearch((cur) => cur ?? { q: '', results: [], index: 0, loading: false, error: null });
  };

  // Ctrl+F — поиск по чату, Esc — выйти из поиска или выделения (как в Telegram).
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.code === 'KeyF') {
        e.preventDefault();
        openSearch();
      } else if (e.key === 'Escape' && !e.defaultPrevented) {
        if (selection) setSelection(null);
        else if (search) setSearch(null);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  // Другой чат — без выделения и поиска.
  useEffect(() => {
    setSelection(null);
    setSearch(null);
  }, [chatId, topicId]);

  const togglePin = async (m: Message) => {
    try {
      await api.post(`/api/messages/${m.id}/${m.pinned ? 'unpin' : 'pin'}`);
      feed.update(m.id, { pinned: !m.pinned });
      refetchPinned();
    } catch (e) {
      toast.error(e, 'Не удалось');
    }
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // http без TLS: clipboard API недоступен — старый способ
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast('Текст скопирован');
  };

  const pollAction = async (url: string, method: 'POST' | 'DELETE') => {
    try {
      if (method === 'POST') await api.post(url);
      else await api.delete(url);
    } catch (e) {
      toast.error(e);
    }
  };

  const menuItems = (row: Row): MenuItem[] => {
    const main = rowMain(row);
    const all = rowMessages(row).filter((m) => m.id > 0);
    const mine = main.sender_id === me.id;
    const list: MenuItem[] = [{ key: 'reply', label: 'Ответить', icon: <CornerUpLeft size={19} />, onSelect: () => startReply(main) }];
    if (main.text && main.content_type !== 'note') list.push({ key: 'copy', label: 'Копировать текст', icon: <Copy size={19} />, onSelect: () => copyText(main.text!) });
    if (isVisualMedia(main)) list.push({ key: 'open', label: 'Открыть', icon: <ImageIcon size={19} />, onSelect: () => openMedia(main) });
    if (main.file_url && !main.poll_id && (isVoiceLike(main) || isVisualMedia(main))) {
      list.push({ key: 'save', label: 'Сохранить', icon: <Download size={19} />, onSelect: () => all.forEach(saveFile) });
    }
    if (!main.poll_id) {
      list.push({ key: 'forward', label: 'Переслать', icon: <Forward size={19} />, onSelect: () => setForward({ ids: all.map((m) => m.id), mode: 'forward' }) });
      list.push({ key: 'replyElsewhere', label: 'Ответить в другом чате', icon: <CornerUpRight size={19} />, onSelect: () => setForward({ ids: [main.id], mode: 'reply' }) });
    }
    if (rights?.can_pin_messages !== false) {
      list.push({
        key: 'pin',
        label: main.pinned ? 'Открепить' : 'Закрепить',
        icon: main.pinned ? <PinOff size={19} /> : <Pin size={19} />,
        onSelect: () => togglePin(main),
      });
    }
    if (mine && !main.poll_id && !main.note_share_id && main.content_type !== 'service') {
      list.push({ key: 'edit', label: main.file_url ? 'Изменить подпись' : 'Изменить', icon: <Pencil size={19} />, onSelect: () => startEdit(main) });
    }
    if (main.poll && !main.poll.is_closed && !main.poll.is_quiz && (main.my_votes || []).length) {
      list.push({ key: 'retract', label: 'Отменить голос', icon: <Undo2 size={19} />, onSelect: () => pollAction(`/api/polls/${main.poll_id}/vote`, 'DELETE') });
    }
    if (main.poll && !main.poll.is_closed && main.poll.creator_id === me.id) {
      list.push({
        key: 'stop',
        label: main.poll.is_quiz ? 'Остановить викторину' : 'Остановить опрос',
        icon: <Square size={19} />,
        onSelect: async () => {
          if (await confirm({ title: 'Остановить опрос?', text: 'Голосовать больше будет нельзя, все увидят итоги.', confirmText: 'Остановить', danger: true })) {
            pollAction(`/api/polls/${main.poll_id}/close`, 'POST');
          }
        },
      });
    }
    if (all.length) list.push({ key: 'select', label: 'Выбрать', icon: <CheckCircle2 size={19} />, onSelect: () => startSelect(row) });
    list.push({ key: 'delete', label: 'Удалить', danger: true, icon: <Trash2 size={19} />, onSelect: () => setToDelete(all) });
    return list;
  };

  // ===== Медиа и файлы =====
  const openMedia = useCallback(
    (msg: Message) => {
      if (msg.pending) return;
      const media = messages.filter((m) => !m.pending && m.id > 0 && isVisualMedia(m) && m.file_url);
      const index = Math.max(0, media.findIndex((m) => m.id === msg.id));
      setViewer({ index, items: media.map((m) => ({ ...m, sender_label: m.sender_id === me.id ? 'Вы' : senderNameOf(m) })) });
    },
    [messages, me.id, senderNameOf],
  );

  const openFileMsg = useCallback(
    (m: Message) => {
      if (m.file_url && !m.pending) openFile(m.file_url).catch((e) => toast.error(e, 'Не удалось открыть файл'));
    },
    [toast],
  );

  const onReplyClick = useCallback(
    (m: Message) => {
      if (!m.reply_to_message_id) return;
      if (m.external_reply_chat_id) navigate(`/chats/${m.external_reply_chat_id}?m=${m.reply_to_message_id}`);
      else jumpTo(m.reply_to_message_id);
    },
    [jumpTo, navigate],
  );

  const onRetry = useCallback(
    async (m: Message) => {
      const again = await confirm({ title: 'Сообщение не отправлено', text: 'Нет связи с сервером или чат недоступен.', confirmText: 'Повторить', cancelText: 'Удалить' });
      if (again) feed.retry(m).catch((e) => toast.error(e, 'Снова не получилось'));
      else feed.discard(m);
    },
    [confirm, feed, toast],
  );

  const onNoteAccepted = useCallback(
    async (messageId: number, noteId: number) => {
      const m = byId.get(messageId);
      if (m?.note_share && !m.note_share.accepted_user_ids.includes(me.id)) {
        feed.update(messageId, { note_share: { ...m.note_share, accepted_user_ids: [...m.note_share.accepted_user_ids, me.id] } });
      }
      if (await confirm({ title: 'Заметка сохранена', text: 'Копия добавлена в ваши заметки на сегодня.', confirmText: 'Открыть', cancelText: 'Остаться в чате' })) {
        navigate(`/notes/${noteId}`);
      }
    },
    [byId, confirm, feed, me.id, navigate],
  );

  const onMenu = useCallback((row: Row, anchor: MenuAnchor) => setMenu({ row, anchor }), []);
  const onSenderClick = useCallback((userId: number) => navigate(`/users/${userId}`), [navigate]);

  const forwardTo = async (toChatId: number, toTopicId: number | null, comment: string) => {
    const f = forward!;
    if (f.mode === 'reply') {
      await api.post('/api/messages/reply-to-another-chat', { message_id: f.ids[0], target_chat_id: toChatId, target_topic_id: toTopicId, text: comment || undefined });
      toast.success('Ответ отправлен');
      return;
    }
    for (let i = 0; i < f.ids.length; i++) {
      await api.post('/api/messages/forward', { messageId: f.ids[i], toChatId, topicId: toTopicId, comment: i === 0 && comment ? comment : undefined });
    }
    setSelection(null);
    toast.success(f.ids.length > 1 ? 'Сообщения пересланы' : 'Сообщение переслано');
  };

  // ===== Шапка =====
  const typingNames = Object.values(typing).map((t) => t.name.split(' ')[0]);
  const subtitle = (() => {
    if (typingNames.length) {
      if (!isGroup) return 'печатает…';
      if (typingNames.length === 1) return `${typingNames[0]} печатает…`;
      return `${typingNames.length} ${plural(typingNames.length, ['человек печатает', 'человека печатают', 'человек печатают'])}…`;
    }
    if (inTopicRoute) return chat?.name ? `тема в «${chat.name}»` : 'тема';
    if (!chat) return '';
    if (chat.type === 'private') return peerPresence?.online ? 'в сети' : lastSeenLabel(peerPresence?.last_seen_at);
    const total = chat.members_count || chat.members?.length || 0;
    const memberIds = new Set(chat.members.map((m) => m.id));
    const online = onlineIds.filter((id) => memberIds.has(id)).length;
    return `${total} ${plural(total, ['участник', 'участника', 'участников'])}${online > 1 ? `, ${online} в сети` : ''}`;
  })();
  const subtitleActive = typingNames.length > 0 || (chat?.type === 'private' && peerPresence?.online);
  const title = inTopicRoute ? topic?.title || (topicId ? 'Тема' : 'Общий') : chatName;
  const muted = isMuted(chat?.muted_until);
  const infoPath = `${base}/info`;

  const headerItems: MenuItem[] = headerMenu?.mute
    ? [
        ...MUTE_OPTIONS.map((o) => ({
          key: o.key,
          label: o.label,
          onSelect: () => setChatMute(chatId, o.ms).then(() => qc.invalidateQueries({ queryKey: chatKeys.detail(chatId) }), (e) => toast.error(e)),
        })),
      ]
    : [
        { key: 'info', label: inTopicRoute && topicId ? 'О теме' : chat?.type === 'private' ? 'Профиль' : 'Информация', icon: <Info size={19} />, onSelect: () => navigate(infoPath) },
        { key: 'search', label: 'Поиск', icon: <Search size={19} />, onSelect: openSearch },
        { key: 'media', label: 'Медиа и файлы', icon: <Images size={19} />, onSelect: () => navigate(`${base}/media`) },
        muted
          ? {
              key: 'unmute',
              label: 'Включить уведомления',
              icon: <Bell size={19} />,
              onSelect: () => setChatMute(chatId, 0).then(() => qc.invalidateQueries({ queryKey: chatKeys.detail(chatId) }), (e) => toast.error(e)),
            }
          : { key: 'mute', label: 'Отключить уведомления', icon: <BellOff size={19} />, onSelect: () => setTimeout(() => setHeaderMenu({ anchor: headerAnchor.current, mute: true }), 0) },
        { key: 'scheduled', label: `Запланированные${scheduled.length ? ` (${scheduled.length})` : ''}`, icon: <CalendarClock size={19} />, onSelect: () => setScheduledOpen(true) },
        ...(messages.some((m) => m.id > 0 && m.content_type !== 'service')
          ? [
              {
                key: 'select',
                label: 'Выбрать сообщения',
                icon: <CheckCircle2 size={19} />,
                onSelect: () => {
                  setSearch(null);
                  setSelection([]);
                },
              },
            ]
          : []),
      ];

  const goBack = () => navigate(inTopicRoute ? `/chats/${chatId}` : '/chats');

  if (chatError) {
    const notMember = chatError instanceof ApiError && (chatError.status === 403 || chatError.status === 404);
    return (
      <div className={s.center}>
        <EmptyState
          title={notMember ? 'Чат недоступен' : 'Не удалось открыть чат'}
          text={notMember ? 'Его удалили или вы больше не участник.' : chatError instanceof Error ? chatError.message : undefined}
          action={<Button onClick={() => navigate('/chats')}>К списку чатов</Button>}
        />
      </div>
    );
  }

  // Как в Telegram: сначала последнее закреплённое, нажатие листает к более ранним.
  const pinnedPos = pinned.length ? pinned.length - 1 - (pinnedIndex % pinned.length) : -1;
  const currentPinned = pinnedPos >= 0 ? pinned[pinnedPos] : null;
  const menuMain = menu ? rowMain(menu.row) : null;

  return (
    <div className={s.view} {...dragHandlers}>
      {/* ===== Шапка ===== */}
      {selection ? (
        <header className={[s.header, s.selectHeader].join(' ')}>
          <IconButton label="Отменить выделение" onClick={() => setSelection(null)}>
            <X size={22} />
          </IconButton>
          <span className={s.selectTitle}>
            {selectedMsgs.length
              ? `${selectedMsgs.length} ${plural(selectedMsgs.length, ['сообщение', 'сообщения', 'сообщений'])}`
              : 'Выберите сообщения'}
          </span>
          {(() => {
            const one = selectedMsgs.length === 1 ? selectedMsgs[0] : null;
            const canEdit = !!one && one.sender_id === me.id && !one.poll_id && !one.note_share_id && !isVoiceLike(one) && one.content_type !== 'service';
            const hasText = selectedMsgs.some((m) => m.text && m.content_type !== 'service');
            const canForward = selectedMsgs.length > 0 && selectedMsgs.every((m) => !m.poll_id);
            return (
              <>
                {canEdit && (
                  <IconButton
                    label="Изменить"
                    onClick={() => {
                      setSelection(null);
                      startEdit(one!);
                    }}
                  >
                    <Pencil size={20} />
                  </IconButton>
                )}
                {hasText && (
                  <IconButton
                    label="Копировать"
                    onClick={() => {
                      copyText(selectionText(selectedMsgs));
                      setSelection(null);
                    }}
                  >
                    <Copy size={20} />
                  </IconButton>
                )}
                {selectedMsgs.length > 0 && (
                  <IconButton label="Сохранить" onClick={() => saveSelection(selectedMsgs)}>
                    <Download size={20} />
                  </IconButton>
                )}
                {canForward && (
                  <IconButton label="Переслать" onClick={() => setForward({ ids: selectedMsgs.map((m) => m.id), mode: 'forward' })}>
                    <Forward size={20} />
                  </IconButton>
                )}
                {selectedMsgs.length > 0 && (
                  <IconButton label="Удалить" tone="danger" onClick={() => setToDelete(selectedMsgs)}>
                    <Trash2 size={20} />
                  </IconButton>
                )}
              </>
            );
          })()}
        </header>
      ) : search ? (
        <header className={[s.header, s.searchHeader].join(' ')}>
          <IconButton label="Закрыть поиск" onClick={() => setSearch(null)}>
            <ChevronLeft size={26} />
          </IconButton>
          <div className={s.searchField}>
            <Search size={17} className={s.searchIcon} />
            <input
              autoFocus
              className={s.searchInput}
              value={search.q}
              placeholder="Поиск в чате"
              aria-label="Поиск в чате"
              onChange={(e) => setSearch({ ...search, q: e.target.value, ...(e.target.value.trim() ? {} : { results: [], index: 0, error: null }) })}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setSearch(null);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  searchStep(e.shiftKey ? -1 : 1);
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  searchStep(1);
                } else if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  searchStep(-1);
                }
              }}
            />
            {search.loading && <Spinner size={16} />}
          </div>
          <span className={s.searchCount}>
            {search.error
              ? search.error
              : searchQ && !search.loading
                ? search.results.length
                  ? `${search.index + 1} из ${search.results.length}`
                  : 'Не найдено'
                : ''}
          </span>
          <IconButton label="Раньше" size={36} disabled={!search.results.length || search.index >= search.results.length - 1} onClick={() => searchStep(1)}>
            <ChevronUp size={21} />
          </IconButton>
          <IconButton label="Позже" size={36} disabled={!search.results.length || search.index <= 0} onClick={() => searchStep(-1)}>
            <ChevronDown size={21} />
          </IconButton>
        </header>
      ) : (
        <header className={s.header}>
          {(isMobile || inTopicRoute) && (
            <IconButton label="Назад" onClick={goBack}>
              <ChevronLeft size={26} />
            </IconButton>
          )}
          <button type="button" className={s.headerMain} onClick={() => navigate(infoPath)}>
            {inTopicRoute ? (
              <TopicIcon topic={topic} size={40} />
            ) : (
              <Avatar name={chatName} src={chat?.avatar_url} size={40} online={chat?.type === 'private' && !!peerPresence?.online} />
            )}
            <span className={s.titles}>
              <span className={s.title}>
                {title}
                {muted && <BellOff size={14} className={s.mutedIcon} />}
              </span>
              {subtitle && <span className={[s.subtitle, subtitleActive && s.subtitleActive].filter(Boolean).join(' ')}>{subtitle}</span>}
            </span>
          </button>
          <IconButton
            label="Меню чата"
            onClick={(e) => {
              headerAnchor.current = anchorFrom(e.currentTarget);
              setHeaderMenu({ anchor: headerAnchor.current });
            }}
          >
            <MoreVertical size={21} />
          </IconButton>
        </header>
      )}

      <VoicePlayerBar
        nameOf={(m) => (m.sender_id === me.id ? 'Вы' : senderNameOf(m))}
        onOpen={(m) => {
          if (String(m.chat_id) === String(chatId) && (m.topic_id ?? null) === topicId) jumpTo(m.id);
          else navigate(`/chats/${m.chat_id}${m.topic_id ? `/topic/${m.topic_id}` : ''}?m=${m.id}`);
        }}
      />

      {/* ===== Закреп ===== */}
      {currentPinned && (
        <div className={s.pinned}>
          <button
            type="button"
            className={s.pinnedMain}
            onClick={() => {
              jumpTo(currentPinned.id);
              setPinnedIndex((i) => (i + 1) % pinned.length);
            }}
          >
            <span className={s.pinnedLine} />
            <span className={s.pinnedBody}>
              <span className={s.pinnedLabel}>Закреплённое сообщение{pinned.length > 1 ? ` #${pinnedPos + 1}` : ''}</span>
              <span className={s.pinnedText}>{messagePreview(currentPinned) || 'Вложение'}</span>
            </span>
          </button>
          {rights?.can_pin_messages !== false ? (
            <IconButton
              label="Открепить"
              size={36}
              onClick={async () => {
                if (await confirm({ title: 'Открепить сообщение?', confirmText: 'Открепить' })) togglePin({ ...currentPinned, pinned: true });
              }}
            >
              <X size={18} />
            </IconButton>
          ) : (
            <Pin size={18} className={s.pinnedIcon} />
          )}
        </div>
      )}

      {/* ===== Лента ===== */}
      <div className={s.feedWrap}>
        <div ref={scrollRef} className={s.feed} onScroll={onScroll}>
          <div className={s.feedInner}>
            {feed.loadingOlder && (
              <div className={s.older}>
                <Spinner size={20} />
              </div>
            )}
            {feed.loading ? (
              <div className={s.center}>
                <Spinner size={30} />
              </div>
            ) : feed.error && messages.length === 0 ? (
              <div className={s.center}>
                <div className={s.emptyCard}>
                  <div>{feed.error}</div>
                  <Button size="sm" onClick={feed.reload}>
                    Повторить
                  </Button>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className={s.center}>
                <div className={s.emptyCard}>
                  <b>Сообщений пока нет</b>
                  <span>Напишите что-нибудь или отправьте файл через скрепку.</span>
                </div>
              </div>
            ) : (
              items.map((it) => {
                if (it.type === 'divider') return <ServiceLine key={it.key} text={it.label} strong />;
                if (it.type === 'unread')
                  return (
                    <div key={it.key} className={s.unread} data-unread>
                      Непрочитанные сообщения
                    </div>
                  );
                if (it.type === 'service') return <ServiceLine key={it.key} text={it.msg.text || ''} />;
                const main = rowMain(it.row);
                const replied = main.reply_to_message_id ? (byId.get(main.reply_to_message_id) ?? null) : null;
                return (
                  <MessageBubble
                    key={it.key}
                    row={it.row}
                    mine={it.mine}
                    firstInSeries={it.firstInSeries}
                    lastInSeries={it.lastInSeries}
                    isGroup={isGroup}
                    senderName={senderNameOf(main)}
                    senderAvatar={main.sender_avatar_url || membersById.get(main.sender_id)?.avatar_url}
                    replied={replied}
                    repliedName={replied ? (replied.sender_id === me.id ? 'Вы' : senderNameOf(replied)) : ''}
                    peerLastReadId={peerLastReadId}
                    meId={me.id}
                    highlighted={highlight !== null && rowMessages(it.row).some((m) => m.id === highlight)}
                    onMenu={onMenu}
                    onOpenMedia={openMedia}
                    onOpenFile={openFileMsg}
                    onReplyClick={onReplyClick}
                    onRetry={onRetry}
                    onCancel={feed.discard}
                    onSenderClick={onSenderClick}
                    onNoteAccepted={onNoteAccepted}
                    onReact={react}
                    onPlayVoice={onPlayVoice}
                    onSeekVoice={onSeekVoice}
                    onVideoNotePlayed={markListened}
                    selecting={!!selection}
                    selected={!!selection && rowMessages(it.row).every((m) => selection.includes(m.id))}
                    onToggleSelect={toggleSelect}
                    searchQuery={search && searchQ ? searchQ : undefined}
                  />
                );
              })
            )}
          </div>
        </div>

        {away && (
          <button type="button" className={s.down} onClick={() => scrollToBottom()} aria-label="Вниз">
            <ChevronDown size={24} />
            {newWhileAway > 0 && <span className={s.downBadge}>{newWhileAway}</span>}
          </button>
        )}

        {dragOver && (
          <div className={s.drop}>
            <Upload size={34} />
            <span>Отпустите, чтобы отправить</span>
          </div>
        )}
      </div>

      {/* ===== Плашки над вводом ===== */}
      {!selection && (replyTo || editing) && (
        <div className={s.plate}>
          {replyTo ? <CornerUpLeft size={20} className={s.plateIcon} /> : <Pencil size={20} className={s.plateIcon} />}
          <button type="button" className={s.plateBody} onClick={() => jumpTo((replyTo || editing)!.id)}>
            <span className={s.plateLabel}>{replyTo ? `Ответ ${replyTo.sender_id === me.id ? 'себе' : senderNameOf(replyTo)}` : 'Редактирование'}</span>
            <span className={s.plateText}>{messagePreview(replyTo || editing)}</span>
          </button>
          <IconButton
            label="Отменить"
            size={36}
            onClick={() => {
              setReplyTo(null);
              setEditing(null);
            }}
          >
            <X size={19} />
          </IconButton>
        </div>
      )}
      {scheduled.length > 0 && !editing && !selection && (
        <button type="button" className={[s.plate, s.plateButton].join(' ')} onClick={() => setScheduledOpen(true)}>
          <CalendarClock size={20} className={s.plateIcon} />
          <span className={s.plateBody}>
            <span className={s.plateLabel}>Запланировано: {scheduled.length}</span>
            <span className={s.plateText}>Нажмите, чтобы посмотреть, перенести или отменить</span>
          </span>
        </button>
      )}

      {selection ? (
        <div className={s.selectBar}>
          <Button
            variant="secondary"
            icon={<CornerUpLeft size={18} />}
            disabled={selectedMsgs.length !== 1}
            className={selectedMsgs.length > 1 ? s.selectBarHidden : undefined}
            onClick={() => {
              const m = selectedMsgs[0];
              setSelection(null);
              if (m) startReply(m);
            }}
          >
            Ответить
          </Button>
          <Button
            icon={<Forward size={18} />}
            disabled={!selectedMsgs.length || selectedMsgs.some((m) => !!m.poll_id)}
            onClick={() => setForward({ ids: selectedMsgs.map((m) => m.id), mode: 'forward' })}
          >
            Переслать
          </Button>
        </div>
      ) : (
      <Composer
        ref={composerRef}
        draftKey={`${chatId}.${topicId ?? 'main'}`}
        editing={editing}
        onSend={sendText}
        onSaveEdit={saveEdit}
        onCancel={() => {
          setReplyTo(null);
          setEditing(null);
        }}
        onSchedule={(text) => setScheduleText(text)}
        onFiles={onFiles}
        onPoll={() => setPollOpen(true)}
        onNote={() => setNotesOpen(true)}
        onEditLast={editLast}
        onTyping={() => emitEvent('typing', { chatId: Number(chatId) })}
        onStopTyping={() => emitEvent('stop_typing', { chatId: Number(chatId) })}
        onRecorded={sendRecording}
        onRecordError={(e) => toast.error(e)}
      />
      )}

      {/* ===== Окна ===== */}
      <ActionMenu
        open={!!menu}
        anchor={menu?.anchor ?? null}
        title={menuMain ? (menuMain.sender_id === me.id ? 'Вы' : senderNameOf(menuMain)) : undefined}
        header={
          menuMain ? (
            <>
              {menuMain.id > 0 && menuMain.content_type !== 'service' && (
                <ReactionPicker
                  current={(menuMain.reactions || []).find((r) => r.user_ids.includes(me.id))?.emoji}
                  onPick={(emoji) => {
                    setMenu(null);
                    react(menuMain, emoji);
                  }}
                />
              )}
              {isMobile && <div className={s.menuPreview}>{messagePreview(menuMain)}</div>}
            </>
          ) : undefined
        }
        items={menu ? menuItems(menu.row) : []}
        onClose={() => setMenu(null)}
      />
      <ActionMenu open={!!headerMenu} anchor={headerMenu?.anchor ?? null} items={headerItems} title={headerMenu?.mute ? 'Без звука' : undefined} onClose={() => setHeaderMenu(null)} />
      <AttachDialog initial={attach} onClose={() => setAttach(null)} onSend={sendFiles} />
      <PollComposer open={pollOpen} chatId={chatId} topicId={topicId} onClose={() => setPollOpen(false)} />
      <NotePicker open={notesOpen} onClose={() => setNotesOpen(false)} onPick={shareNote} />
      <ChatPicker
        open={!!forward}
        title={forward?.mode === 'reply' ? 'Ответить в другом чате' : 'Переслать'}
        action={forward?.mode === 'reply' ? 'Ответить' : 'Переслать'}
        onClose={() => setForward(null)}
        onSend={forwardTo}
      />
      <DeleteDialog
        open={!!toDelete}
        count={toDelete?.length || 0}
        canAll={!!toDelete && (toDelete.every((m) => m.sender_id === me.id) || !!rights?.can_delete_messages)}
        peerName={chat?.type === 'private' ? chat.peer?.display_name || chat.peer?.username : null}
        onClose={() => setToDelete(null)}
        onDelete={(scope) => deleteMessages(toDelete || [], scope)}
      />
      <DateTimeDialog
        open={scheduleText !== null}
        title="Отправить позже"
        min={new Date(Date.now() + 60_000)}
        presets={SCHEDULE_PRESETS}
        saveText="Запланировать"
        onClose={() => setScheduleText(null)}
        onSave={schedule}
      />
      <ScheduledList open={scheduledOpen} items={scheduled} onClose={() => setScheduledOpen(false)} onChanged={() => refetchScheduled()} />
      {viewer && (
        <MediaViewer
          items={viewer.items}
          index={viewer.index}
          onClose={() => setViewer(null)}
          onForward={(it) => {
            setViewer(null);
            setForward({ ids: [it.id], mode: 'forward' });
          }}
          onShowInChat={(it) => {
            setViewer(null);
            setTimeout(() => jumpTo(it.id), 50);
          }}
        />
      )}
    </div>
  );
}
