import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Modal,
  Image,
  Linking,
  Pressable,
  BackHandler,
  LayoutAnimation,
  Vibration,
  Animated,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused, useRoute, RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  ChevronLeft,
  MoreVertical,
  Paperclip,
  SendHorizonal,
  CornerUpLeft,
  Forward,
  Pin,
  PinOff,
  Pencil,
  Trash2,
  X,
  Copy,
  CalendarClock,
  ChevronDown,
  Undo2,
  Square,
  Image as ImageIcon,
  Download,
  Search,
  ChevronUp,
} from 'lucide-react-native';
import { TOPIC_ICONS, hexToRgba } from '../theme/topicIcons';
import { SERVER_URL } from '../config';
import { api } from '../services/api';
import { ApiError, request, signedFileUrl, uploadWithProgress, UploadCancelled } from '../services/http';
import { emitEvent, joinChat, makeClientId, sendMessage, subscribe } from '../services/socket';
import DateTimePickerModal from '../components/DateTimePickerModal';
import ShareToChatModal from '../components/ShareToChatModal';
import AttachSheet, { MediaSendOptions, PickedFile, PickedMedia } from '../components/chat/AttachSheet';
import PollComposer, { PollDraft, PollMediaDraft } from '../components/chat/PollComposer';
import NotePickerModal from '../components/chat/NotePickerModal';
import MediaViewer, { ViewerItem } from '../components/chat/MediaViewer';
import ActionSheet, { SheetAction } from '../components/chat/ActionSheet';
import MessageRow, { DayDivider, Row, ServiceRow } from '../components/chat/MessageRow';
import { WallpaperView } from '../components/chat/ChatWallpaper';
import { useChatWallpaper } from '../theme/wallpapers';
import { C, REACTIONS, dayLabel, hashColor, initials, isDocument, isVisualMedia, lastSeenLabel, messagePreview, plural } from '../components/chat/chatUtils';

import { T, themed } from '../theme/runtime';
import { withAlpha } from '../theme/palettes';
import { useTheme } from '../theme/ThemeContext';
import { glass } from '../theme/glass';
import { clearActiveChat, setActiveChat } from '../notifications/state';
import VoicePlayerBar from '../components/chat/voice/VoicePlayerBar';
import { RecordButton, RecordingLayer, useChatRecorder, VideoNoteResult, VoiceResult } from '../components/chat/voice/ChatRecorder';
import VideoNoteCamera from '../components/chat/voice/VideoNoteCamera';
import { seekVoice, setVoiceStartHandler, stopVoice, toggleVoice } from '../components/chat/voice/voicePlayer';
import { copyText, saveMessagesToDevice } from '../components/chat/saveToDevice';
import { clearChatNotification } from '../notifications/display';
import SafeBottom from '../components/ui/SafeBottom';
type ChatRouteProp = RouteProp<
  { params: { chatId: string; chatName: string; topicId?: number | null; messageId?: number } },
  'params'
>;

type SendStatus = 'sending' | 'sent' | 'failed';

/** Сообщение на экране: серверное или ещё отправляющееся (локальное). */
type ChatMessage = any & { client_id?: string | null; status?: SendStatus; local?: boolean };

type ListItem =
  | { type: 'divider'; key: string; label: string }
  | { type: 'unread'; key: string }
  | { type: 'service'; key: string; msg: any }
  | { type: 'row'; key: string; row: Exclude<Row, { type: 'divider' }>; mine: boolean; showName: boolean; showAvatar: boolean };

const PAGE = 60;
const draftKey = (chatId: string, topicId: number | null) => `@offix/draft/${chatId}/${topicId ?? 'main'}`;
const SERIES_GAP_MS = 10 * 60 * 1000;

function withoutKey<T>(obj: Record<number, T>, key: number): Record<number, T> {
  if (!(key in obj)) return obj;
  const next = { ...obj };
  delete next[key];
  return next;
}

export default function ChatScreen({ navigation }: any) {
  const route = useRoute<ChatRouteProp>();
  const chatId = route.params.chatId;
  const topicId = route.params.topicId ?? null;
  const initialMessageId = route.params.messageId;
  const isFocused = useIsFocused();
  const { sendByEnter } = useTheme();

  const [chat, setChat] = useState<any>(null);
  const chatName = chat?.name || route.params.chatName || 'Чат';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [peerLastReadId, setPeerLastReadId] = useState(0);
  const [unreadAnchor, setUnreadAnchor] = useState<number | null>(null);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);

  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState(0);
  const [forwardIds, setForwardIds] = useState<number[] | null>(null);
  const [topicMeta, setTopicMeta] = useState<any>(null);

  const [showAttach, setShowAttach] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [viewer, setViewer] = useState<{ items: ViewerItem[]; index: number } | null>(null);

  const [scheduled, setScheduled] = useState<any[]>([]);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [showScheduledList, setShowScheduledList] = useState(false);

  const [typing, setTyping] = useState<Record<number, { name: string; at: number }>>({});
  const [peerPresence, setPeerPresence] = useState<{ online: boolean; last_seen_at?: string | null } | null>(null);
  const [onlineIds, setOnlineIds] = useState<number[]>([]);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(0);

  // Выделение сообщений (как в Telegram): ключ строки ленты → строка.
  const [selected, setSelected] = useState<Map<string, Exclude<Row, { type: 'divider' }>>>(() => new Map());
  const selecting = selected.size > 0;
  const [toast, setToast] = useState<string | null>(null);
  const toastAnim = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Высоты парящих шапки и низа — под них заходит лента.
  const [dockH, setDockH] = useState(64);
  const [topH, setTopH] = useState(64);
  const insets = useSafeAreaInsets();

  const listRef = useRef<FlatList>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const lastReadSent = useRef(0);
  const scrolledUp = useRef(false);
  const meRef = useRef<number | null>(null);
  meRef.current = currentUserId;

  const { wallpaper } = useChatWallpaper(chatId);
  const isGroup = chat ? chat.type === 'group' : false;
  const rights = chat?.my_rights || {};

  // ===== Загрузка =====
  const withPoll = useCallback(async (m: ChatMessage): Promise<ChatMessage> => {
    if (!m.poll_id || m.poll) return m;
    try {
      const pd = await request<any>(`/api/polls/${m.poll_id}/results`);
      return { ...m, poll: pd.poll, my_votes: pd.my_votes };
    } catch {
      return m;
    }
  }, []);

  const loadChat = useCallback(async () => {
    try {
      const c = await request<any>(`/api/chats/${chatId}`);
      setChat(c);
      setPeerLastReadId((p) => Math.max(p, c.peer_last_read_id || 0));
      return c;
    } catch {
      return null;
    }
  }, [chatId]);

  const loadMessages = useCallback(async () => {
    try {
      const data = await request<ChatMessage[]>(`/api/messages/${chatId}`, {
        query: { topic_id: topicId ?? undefined, limit: PAGE },
      });
      const enriched = await Promise.all(data.filter((m) => !m.deleted_for_all).map(withPoll));
      setHasOlder(data.length >= PAGE);
      // Неотправленные локальные сообщения не теряем при перезагрузке истории.
      setMessages((prev) => {
        const pending = prev.filter((m) => m.local && m.status !== 'sent');
        return [...enriched, ...pending.filter((p) => !enriched.some((e) => e.client_id && e.client_id === p.client_id))];
      });
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e?.message || 'Не удалось загрузить сообщения');
    } finally {
      setLoading(false);
    }
  }, [chatId, topicId, withPoll]);

  const loadOlder = async () => {
    if (loadingOlder || !hasOlder || loading) return;
    const oldest = messages.find((m) => typeof m.id === 'number');
    if (!oldest) return;
    setLoadingOlder(true);
    try {
      const data = await request<ChatMessage[]>(`/api/messages/${chatId}`, {
        query: { topic_id: topicId ?? undefined, limit: PAGE, before: oldest.id },
      });
      const enriched = await Promise.all(data.filter((m) => !m.deleted_for_all).map(withPoll));
      setHasOlder(data.length >= PAGE);
      setMessages((prev) => [...enriched.filter((e) => !prev.some((p) => p.id === e.id)), ...prev]);
    } catch {
      // попробуем при следующей прокрутке
    } finally {
      setLoadingOlder(false);
    }
  };

  const loadPinned = useCallback(async () => {
    try {
      setPinnedMessages(await request<any[]>(`/api/messages/${chatId}/pinned`, { query: { topic_id: topicId ?? undefined } }));
    } catch {
      // закреп — второстепенная информация
    }
  }, [chatId, topicId]);

  const loadScheduled = useCallback(async () => {
    try {
      setScheduled(await request<any[]>(`/api/chats/${chatId}/scheduled`, { query: { topic_id: topicId ?? undefined } }));
    } catch {
      setScheduled([]);
    }
  }, [chatId, topicId]);

  useEffect(() => {
    api.getCurrentUser().then((me) => setCurrentUserId(me.id)).catch(() => undefined);
    loadChat().then((c) => {
      // Разделитель «Непрочитанные» — по состоянию на момент открытия.
      if (c) setUnreadAnchor(c.my_last_read_id ?? null);
    });
    loadMessages();
    loadPinned();
    loadScheduled();
  }, [loadChat, loadMessages, loadPinned, loadScheduled]);

  // ===== Присутствие собеседника =====
  const peerId: number | null = chat?.type === 'private' ? chat?.peer?.id ?? null : null;
  useEffect(() => {
    if (!peerId) return;
    request<any[]>('/api/users/presence', { query: { ids: String(peerId) } })
      .then((r) => r[0] && setPeerPresence(r[0]))
      .catch(() => undefined);
    return subscribe('presence', (p: any) => {
      if (p.user_id === peerId) setPeerPresence({ online: p.online, last_seen_at: p.last_seen_at });
    });
  }, [peerId]);

  // ===== Черновик =====
  useEffect(() => {
    AsyncStorage.getItem(draftKey(chatId, topicId))
      .then((d) => d && setText((cur) => cur || d))
      .catch(() => undefined);
  }, [chatId, topicId]);

  const onChangeText = (value: string) => {
    setText(value);
    const now = Date.now();
    if (value.trim() && now - lastTypingSent.current > 3000) {
      lastTypingSent.current = now;
      emitEvent('typing', { chatId: Number(chatId) });
    }
    if (editingMessage) return; // правка сообщения — не черновик
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      const key = draftKey(chatId, topicId);
      (value.trim() ? AsyncStorage.setItem(key, value) : AsyncStorage.removeItem(key)).catch(() => undefined);
    }, 400);
  };

  const clearDraft = () => {
    if (draftTimer.current) clearTimeout(draftTimer.current);
    AsyncStorage.removeItem(draftKey(chatId, topicId)).catch(() => undefined);
  };

  // ===== Реальное время =====
  useEffect(() => {
    let leave: (() => void) | undefined;
    joinChat(chatId).then((fn) => (leave = fn));
    const belongsHere = (msg: any) => String(msg.chat_id) === String(chatId) && (msg.topic_id ?? null) === topicId;
    const sameChat = (id: any) => String(id) === String(chatId);

    const unsubs = [
      subscribe('new_message', async (msg: any) => {
        if (!belongsHere(msg)) return;
        const full = await withPoll(msg);
        setMessages((prev) => {
          if (full.client_id && prev.some((m) => m.client_id === full.client_id)) {
            return prev.map((m) => (m.client_id === full.client_id ? { ...full, status: 'sent' } : m));
          }
          if (prev.some((m) => m.id === full.id)) return prev;
          return [...prev, full];
        });
        if (msg.sender_id !== meRef.current) {
          setTyping((t) => withoutKey(t, msg.sender_id));
          if (scrolledUp.current) setNewWhileAway((n) => n + 1);
        }
        if (msg.content_type === 'service') loadChat();
      }),
      subscribe('message_edited', (msg: any) => {
        if (!belongsHere(msg)) return;
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, ...msg } : m)));
      }),
      subscribe('message_deleted', ({ id }: { id: number }) => {
        setMessages((prev) => prev.filter((m) => m.id !== id));
        loadPinned();
      }),
      subscribe('message_pinned', () => loadPinned()),
      subscribe('message_unpinned', () => loadPinned()),
      subscribe('poll_updated', async ({ poll_id }: { poll_id: number }) => {
        try {
          const pd = await request<any>(`/api/polls/${poll_id}/results`);
          setMessages((prev) => prev.map((m) => (m.poll_id === poll_id ? { ...m, poll: pd.poll, my_votes: pd.my_votes } : m)));
        } catch {
          // опрос мог стать недоступен
        }
      }),
      subscribe('scheduled_changed', () => loadScheduled()),
      subscribe('message_reactions', (e: any) => {
        if (!sameChat(e.chat_id)) return;
        setMessages((prev) => prev.map((m) => (m.id === e.id ? { ...m, reactions: e.reactions } : m)));
      }),
      subscribe('message_listened', (e: any) => {
        if (!sameChat(e.chat_id)) return;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === e.id && !(m.listened_by || []).includes(e.user_id) ? { ...m, listened_by: [...(m.listened_by || []), e.user_id] } : m,
          ),
        );
      }),
      subscribe('messages_read', (e: any) => {
        if (sameChat(e.chat_id) && e.user_id !== meRef.current) setPeerLastReadId((p) => Math.max(p, e.message_id));
      }),
      subscribe('user_typing', (e: any) => {
        if (!sameChat(e.chatId) || e.userId === meRef.current) return;
        setTyping((t) => ({ ...t, [e.userId]: { name: e.userName, at: Date.now() } }));
      }),
      subscribe('user_stop_typing', (e: any) => {
        if (!sameChat(e.chatId)) return;
        setTyping((t) => withoutKey(t, e.userId));
      }),
      subscribe('online_users', (ids: number[]) => setOnlineIds(ids)),
      subscribe('chat_updated', (c: any) => {
        if (sameChat(c.id)) loadChat();
      }),
      subscribe('members_changed', (e: any) => {
        if (sameChat(e.chatId)) loadChat();
      }),
      subscribe('removed_from_chat', (e: any) => {
        if (!sameChat(e.chatId)) return;
        Alert.alert('Вы больше не участник', 'Вас исключили из этого чата.');
        navigation.goBack();
      }),
      subscribe('chat_deleted', (e: any) => {
        if (!sameChat(e.chatId)) return;
        Alert.alert('Чат удалён', 'Владелец удалил эту группу.');
        navigation.goBack();
      }),
    ];
    return () => {
      unsubs.forEach((u) => u());
      emitEvent('stop_typing', { chatId: Number(chatId) });
      leave?.();
    };
  }, [chatId, topicId, loadPinned, loadScheduled, withPoll, loadChat, navigation]);

  // «Печатает…» гаснет само, если не пришло stop_typing.
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

  // ===== Уведомления =====
  // Открытый чат не присылает уведомлений о своих сообщениях; при открытии
  // его уведомление из шторки убирается (как в Telegram).
  useEffect(() => {
    if (!isFocused) return;
    setActiveChat(chatId, topicId);
    clearChatNotification(chatId).catch(() => undefined);
    return () => clearActiveChat(chatId, topicId);
  }, [isFocused, chatId, topicId]);

  // ===== Прочитано =====
  useEffect(() => {
    if (!isFocused || loading) return;
    const maxId = messages.reduce((mx, m) => (typeof m.id === 'number' && m.id > mx ? m.id : mx), 0);
    if (maxId <= lastReadSent.current) return;
    const t = setTimeout(() => {
      lastReadSent.current = maxId;
      request(`/api/chats/${chatId}/read`, { method: 'POST', body: { message_id: maxId } }).catch(() => {
        lastReadSent.current = 0;
      });
    }, 400);
    return () => clearTimeout(t);
  }, [messages, isFocused, loading, chatId]);

  // ===== Метаданные топика =====
  useEffect(() => {
    if (!topicId) return;
    request<any[]>(`/api/chats/${chatId}/topics`)
      .then((topics) => setTopicMeta(topics.find((x) => x.id === topicId) || null))
      .catch(() => undefined);
  }, [chatId, topicId]);

  // ===== Лента: группировка в альбомы, разделители, серии =====
  const membersById = useMemo(() => {
    const map: Record<number, any> = {};
    (chat?.members || []).forEach((m: any) => (map[m.id] = m));
    return map;
  }, [chat]);

  const senderNameOf = useCallback(
    (m: any): string => m.sender_display_name || m.sender_name || membersById[m.sender_id]?.display_name || membersById[m.sender_id]?.username || 'Участник',
    [membersById],
  );

  const items: ListItem[] = useMemo(() => {
    // 1) альбомы
    const rows: (Exclude<Row, { type: 'divider' }> | { type: 'service'; key: string; msg: any })[] = [];
    for (const m of messages) {
      if (m.content_type === 'service') {
        rows.push({ type: 'service', key: `s-${m.id}`, msg: m });
        continue;
      }
      const last = rows[rows.length - 1];
      const groupable = isVisualMedia(m) || isDocument(m);
      if (m.media_group_id && groupable && last && last.type !== 'service') {
        const lastMsg = last.type === 'album' ? last.msgs[0] : last.msg;
        // Альбом — только однородный: фото/видео отдельно, документы отдельно.
        const sameKind = isDocument(m) === isDocument(lastMsg);
        if (lastMsg.media_group_id === m.media_group_id && lastMsg.sender_id === m.sender_id && sameKind) {
          const msgs = last.type === 'album' ? [...last.msgs, m] : [last.msg, m];
          rows[rows.length - 1] = { type: 'album', key: `a-${m.media_group_id}`, msgs };
          continue;
        }
      }
      rows.push({ type: 'message', key: `m-${m.client_id || m.id}`, msg: m });
    }
    // 2) разделители дней, «Непрочитанные», серии одного отправителя
    const out: ListItem[] = [];
    let lastDay = '';
    let unreadPlaced = false;
    const first = (r: any) => (r.type === 'album' ? r.msgs[0] : r.msg);
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const m = first(r);
      const d = new Date(m.created_at);
      if (d.toDateString() !== lastDay) {
        lastDay = d.toDateString();
        out.push({ type: 'divider', key: `d-${lastDay}`, label: dayLabel(d) });
      }
      if (!unreadPlaced && unreadAnchor !== null && typeof m.id === 'number' && m.id > unreadAnchor && m.sender_id !== currentUserId && currentUserId) {
        unreadPlaced = true;
        out.push({ type: 'unread', key: 'unread' });
      }
      if (r.type === 'service') {
        out.push(r);
        continue;
      }
      const prev = rows[i - 1];
      const next = rows[i + 1];
      const sameSeries = (a: any) =>
        a &&
        a.type !== 'service' &&
        first(a).sender_id === m.sender_id &&
        Math.abs(new Date(first(a).created_at).getTime() - d.getTime()) < SERIES_GAP_MS &&
        new Date(first(a).created_at).toDateString() === d.toDateString();
      out.push({
        type: 'row',
        key: r.key,
        row: r,
        mine: m.sender_id === currentUserId,
        showName: !sameSeries(prev),
        showAvatar: !sameSeries(next),
      });
    }
    return out.reverse(); // список перевёрнут: новые снизу
  }, [messages, currentUserId, unreadAnchor]);

  const findMessage = useCallback((id: number) => messages.find((m) => m.id === id), [messages]);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Сообщение, к которому переходим после подгрузки истории.
  const [pendingJump, setPendingJump] = useState<number | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const indexOfMessage = useCallback(
    (id: number) => items.findIndex((it) => it.type === 'row' && (it.row.type === 'album' ? it.row.msgs.some((m) => m.id === id) : it.row.msg.id === id)),
    [items],
  );

  /** Подгружает старые страницы, пока не дойдёт до нужного сообщения (как переход по цитате в Telegram). */
  const loadUntil = async (targetId: number) => {
    let oldest = messagesRef.current.find((m) => typeof m.id === 'number')?.id;
    const acc: ChatMessage[] = [];
    for (let i = 0; i < 40 && oldest && oldest > targetId; i++) {
      const data = await request<ChatMessage[]>(`/api/messages/${chatId}`, { query: { topic_id: topicId ?? undefined, limit: PAGE, before: oldest } });
      const enriched = await Promise.all(data.filter((m) => !m.deleted_for_all).map(withPoll));
      acc.unshift(...enriched);
      if (data.length < PAGE) {
        setHasOlder(false);
        break;
      }
      oldest = data[0]?.id;
    }
    if (acc.length) setMessages((prev) => [...acc.filter((e) => !prev.some((p) => p.id === e.id)), ...prev]);
  };

  const scrollToMessage = (id: number) => {
    const idx = indexOfMessage(id);
    if (idx < 0) {
      setPendingJump(id);
      loadUntil(id).catch(() => {
        setPendingJump(null);
        Alert.alert('Сообщение', 'Не удалось загрузить историю — проверьте связь.');
      });
      return;
    }
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setHighlightId(id);
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    highlightTimer.current = setTimeout(() => setHighlightId(null), 1600);
  };

  // История подгрузилась — переходим к сообщению.
  useEffect(() => {
    if (pendingJump === null) return;
    const idx = indexOfMessage(pendingJump);
    if (idx >= 0) {
      const id = pendingJump;
      setPendingJump(null);
      setTimeout(() => scrollToMessage(id), 120);
    } else if (!hasOlder) {
      setPendingJump(null);
      Alert.alert('Сообщение', 'Сообщение удалено или недоступно.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, pendingJump, hasOlder]);

  useEffect(() => {
    if (!loading && initialMessageId) setTimeout(() => scrollToMessage(initialMessageId), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialMessageId]);

  // ===== Отправка =====

  // Идущие загрузки: client_id → отмена (крестик на сообщении).
  const uploads = useRef(new Map<string, () => void>());
  // Отменённые ещё до начала загрузки (стояли в очереди альбома).
  const cancelled = useRef(new Set<string>());

  const setProgress = (clientId: string, progress: number) =>
    setMessages((prev) => prev.map((m) => (m.client_id === clientId && m.status === 'sending' ? { ...m, progress } : m)));

  /** Отменить отправку файла/фото: остановить загрузку и убрать сообщение. */
  const cancelUpload = useCallback((msg: any) => {
    cancelled.current.add(msg.client_id);
    uploads.current.get(msg.client_id)?.();
    uploads.current.delete(msg.client_id);
    setMessages((prev) => prev.filter((m) => m.client_id !== msg.client_id));
  }, []);

  /** Отправляет (или повторяет отправку) локального сообщения. */
  const deliver = async (local: ChatMessage) => {
    if (cancelled.current.has(local.client_id)) return;
    setMessages((prev) => prev.map((m) => (m.client_id === local.client_id ? { ...m, status: 'sending', progress: 0 } : m)));
    try {
      let saved: any;
      if (local.local_file) {
        let last = 0;
        const task = uploadWithProgress<any>(
          '/api/upload',
          'file',
          local.local_file,
          {
            chatId,
            topicId: topicId ?? undefined,
            client_id: local.client_id,
            caption: local.text || undefined,
            media_group_id: local.media_group_id || undefined,
            as_file: local.as_file ? 'true' : undefined,
            reply_to_message_id: local.reply_to_message_id || undefined,
            // Голосовое / кружочек: тип, длительность, волна.
            kind: local.upload?.kind,
            duration: local.upload?.duration,
            waveform: local.upload?.waveform,
          },
          (p) => {
            // Не перерисовываем ленту на каждый байт — шаг 4%.
            if (p - last >= 0.04 || p >= 1) {
              last = p;
              setProgress(local.client_id, p);
            }
          },
        );
        uploads.current.set(local.client_id, task.abort);
        try {
          saved = await task.promise;
        } finally {
          uploads.current.delete(local.client_id);
        }
      } else {
        saved = await sendMessage({
            chatId,
            text: local.text,
            reply_to_message_id: local.reply_to_message_id ?? null,
            topic_id: topicId,
            client_id: local.client_id,
          });
      }
      setMessages((prev) => prev.map((m) => (m.client_id === local.client_id ? { ...saved, status: 'sent' } : m)));
    } catch (e) {
      if (e instanceof UploadCancelled) return; // сообщение уже убрано
      setMessages((prev) => prev.map((m) => (m.client_id === local.client_id ? { ...m, status: 'failed' } : m)));
      if (e instanceof ApiError && e.status === 413) Alert.alert('Файл слишком большой', 'Максимальный размер — 200 МБ');
    }
  };

  const baseLocal = (): ChatMessage => ({
    id: `local-${makeClientId()}`,
    local: true,
    client_id: makeClientId(),
    status: 'sending',
    chat_id: chatId,
    topic_id: topicId,
    sender_id: currentUserId,
    created_at: new Date().toISOString(),
  });

  const handleSend = async () => {
    const t = text.trim();
    // У фото можно убрать подпись, у текстового сообщения текст обязателен.
    if (!t && !(editingMessage && editingMessage.file_url)) return;
    emitEvent('stop_typing', { chatId: Number(chatId) });
    lastTypingSent.current = 0;

    if (editingMessage) {
      try {
        const updated = await request<any>(`/api/messages/${editingMessage.id}`, { method: 'PATCH', body: { text: t } });
        setMessages((prev) => prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
        setEditingMessage(null);
        setText('');
      } catch (e: any) {
        Alert.alert('Не удалось изменить', e?.message || 'Попробуйте ещё раз');
      }
      return;
    }

    const local: ChatMessage = { ...baseLocal(), text: t, reply_to_message_id: replyTo?.id ?? null };
    setMessages((prev) => [...prev, local]);
    setReplyTo(null);
    setText('');
    clearDraft();
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    deliver(local);
  };

  /** Новая группа сообщений (альбом). */
  const newGroupId = () => `g${Date.now()}${Math.random().toString(36).slice(2, 8)}`;

  /** Ставит локальные сообщения в ленту и отправляет их по порядку. */
  const enqueue = async (locals: ChatMessage[]) => {
    setMessages((prev) => [...prev, ...locals]);
    setReplyTo(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    // По одному, чтобы порядок в альбоме совпал с порядком выбора.
    for (const l of locals) await deliver(l);
  };

  /**
   * Фото и видео из галереи (как в Telegram): по умолчанию альбомами по 10,
   * подпись — у первого; «Без сжатия» — отправка файлами.
   */
  const sendMedia = async (picked: PickedMedia[], caption: string, opts: MediaSendOptions) => {
    const reply = replyTo?.id ?? null;
    const locals: ChatMessage[] = [];
    let groupId: string | null = null;
    picked.forEach((p, i) => {
      if (opts.group && picked.length > 1 && i % 10 === 0) groupId = newGroupId();
      locals.push({
        ...baseLocal(),
        client_id: makeClientId(),
        text: i === 0 ? caption || null : null,
        reply_to_message_id: i === 0 ? reply : null,
        media_kind: opts.asFile ? 'file' : p.isVideo ? 'video' : 'photo',
        media_group_id: opts.group && picked.length > 1 ? groupId : null,
        media_width: p.width,
        media_height: p.height,
        media_duration: p.duration,
        local_uri: opts.asFile ? null : p.uri,
        file_url: opts.asFile ? 'local' : null,
        file_name: p.name,
        as_file: opts.asFile,
        local_file: { uri: p.uri, name: p.name, type: p.type },
      });
    });
    await enqueue(locals);
  };

  /**
   * Документы: список выбранного с подписью; вместе — одной группой
   * (по 10), подпись — под последним файлом, как в Telegram.
   */
  const sendFiles = async (files: PickedFile[], caption: string, opts: { group: boolean }) => {
    const reply = replyTo?.id ?? null;
    let groupId: string | null = null;
    const locals: ChatMessage[] = files.map((f, i) => {
      if (opts.group && files.length > 1 && i % 10 === 0) groupId = newGroupId();
      return {
        ...baseLocal(),
        client_id: makeClientId(),
        text: i === files.length - 1 ? caption || null : null,
        reply_to_message_id: i === 0 ? reply : null,
        media_kind: 'file',
        media_group_id: opts.group && files.length > 1 ? groupId : null,
        file_url: 'local',
        file_name: f.name || 'Файл',
        file_size: f.size,
        as_file: true,
        local_file: { uri: f.uri, name: f.name || 'file', type: f.type },
      };
    });
    await enqueue(locals);
  };

  const createPoll = async (p: PollDraft, media: PollMediaDraft | null) => {
    const body = { ...p, chat_id: Number(chatId), topic_id: topicId };
    if (media) {
      // Опрос с вложением: вопрос и файл одним запросом.
      await uploadWithProgress('/api/polls/with-media', 'file', media, {
        payload: JSON.stringify(body),
        as_file: media.kind === 'file' ? 'true' : undefined,
      }).promise;
    } else {
      await request('/api/polls', { method: 'POST', body });
    }
    // Сам опрос придёт всем участникам по сокету.
  };

  const shareNote = async (noteId: number) => {
    setShowNotes(false);
    try {
      await api.shareNote(noteId, { chat_id: Number(chatId), topic_id: topicId });
    } catch (e: any) {
      Alert.alert('Не удалось отправить заметку', e?.message || '');
    }
  };

  const retryOrDiscard = (m: ChatMessage) => {
    Alert.alert('Сообщение не отправлено', 'Нет связи с сервером или чат недоступен.', [
      { text: 'Удалить', style: 'destructive', onPress: () => setMessages((prev) => prev.filter((x) => x.client_id !== m.client_id)) },
      { text: 'Отмена', style: 'cancel' },
      { text: 'Повторить', onPress: () => deliver(m) },
    ]);
  };

  // ===== Отложенная отправка =====
  const scheduleMessage = async (sendAt: Date) => {
    const t = text.trim();
    setShowSchedulePicker(false);
    if (!t) return;
    try {
      await request(`/api/chats/${chatId}/scheduled`, {
        method: 'POST',
        body: { text: t, send_at: sendAt.toISOString(), topic_id: topicId, reply_to_message_id: replyTo?.id ?? null },
      });
      setText('');
      setReplyTo(null);
      clearDraft();
      loadScheduled();
      Alert.alert('Запланировано', `Сообщение будет отправлено ${sendAt.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}`);
    } catch (e: any) {
      Alert.alert('Не удалось запланировать', e?.message || 'Попробуйте ещё раз');
    }
  };

  const cancelScheduled = async (id: number) => {
    try {
      await request(`/api/scheduled/${id}`, { method: 'DELETE' });
      loadScheduled();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось отменить');
    }
  };

  const sendScheduledNow = async (id: number) => {
    try {
      await request(`/api/scheduled/${id}/send-now`, { method: 'POST' });
      loadScheduled();
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось отправить');
    }
  };

  // ===== Действия с сообщениями =====
  const rowMessages = (row: Exclude<Row, { type: 'divider' }>) => (row.type === 'album' ? row.msgs : [row.msg]);
  const rowMain = (row: Exclude<Row, { type: 'divider' }>) => (row.type === 'album' ? row.msgs.find((m) => m.text) || row.msgs[0] : row.msg);

  const deleteMessages = async (targets: ChatMessage[], scope: 'me' | 'all') => {
    try {
      for (const t of targets) await request(`/api/messages/${t.id}`, { method: 'DELETE', query: { scope } });
      const ids = new Set(targets.map((t) => t.id));
      setMessages((prev) => prev.filter((m) => !ids.has(m.id)));
    } catch (e: any) {
      Alert.alert('Не удалось удалить', e?.message || 'Попробуйте ещё раз');
    }
  };

  const confirmDelete = (row: Exclude<Row, { type: 'divider' }>) => {
    const targets = rowMessages(row).filter((m) => typeof m.id === 'number');
    const main = rowMain(row);
    const mine = main.sender_id === currentUserId;
    const canAll = mine || rights.can_delete_messages;
    const n = targets.length;
    const what = n > 1 ? `${n} ${plural(n, ['сообщение', 'сообщения', 'сообщений'])}` : 'сообщение';
    Alert.alert(`Удалить ${what}?`, canAll ? 'Можно удалить только у себя или у всех участников.' : 'Сообщение исчезнет только у вас.', [
      { text: 'Отмена', style: 'cancel' },
      ...(canAll ? [{ text: 'Удалить у всех', style: 'destructive' as const, onPress: () => deleteMessages(targets, 'all') }] : []),
      { text: 'Удалить у меня', style: 'destructive' as const, onPress: () => deleteMessages(targets, 'me') },
    ]);
  };

  const togglePin = async (target: ChatMessage) => {
    try {
      await request(`/api/messages/${target.id}/${target.pinned ? 'unpin' : 'pin'}`, { method: 'POST' });
      setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, pinned: !target.pinned } : m)));
      loadPinned();
    } catch (e: any) {
      Alert.alert('Не удалось', e?.message || 'Попробуйте ещё раз');
    }
  };

  const forwardTo = async (toChatId: number, comment: string) => {
    const ids = forwardIds || [];
    try {
      for (let i = 0; i < ids.length; i++) {
        await request('/api/messages/forward', {
          method: 'POST',
          body: { messageId: ids[i], toChatId, comment: i === 0 && comment ? comment : undefined },
        });
      }
      setForwardIds(null);
      Alert.alert('Готово', ids.length > 1 ? 'Сообщения пересланы' : 'Сообщение переслано');
    } catch (e: any) {
      Alert.alert('Не удалось переслать', e?.message || 'Попробуйте ещё раз');
    }
  };

  const actionsFor = (row: Exclude<Row, { type: 'divider' }>): SheetAction[] => {
    const main = rowMain(row);
    if (main.local) return [];
    const mine = main.sender_id === currentUserId;
    const list: SheetAction[] = [
      { key: 'reply', label: 'Ответить', icon: <CornerUpLeft size={20} color={C.text} />, onPress: () => setReplyTo(main) },
    ];
    if (main.text && main.content_type !== 'note') {
      list.push({
        key: 'copy',
        label: 'Копировать текст',
        icon: <Copy size={20} color={C.text} />,
        onPress: () => Clipboard.setString(main.text),
      });
    }
    if (isVisualMedia(main)) {
      list.push({ key: 'open', label: 'Открыть', icon: <ImageIcon size={20} color={C.text} />, onPress: () => openMedia(main) });
    }
    if (!main.poll_id) {
      list.push({
        key: 'forward',
        label: 'Переслать',
        icon: <Forward size={20} color={C.text} />,
        onPress: () => setForwardIds(rowMessages(row).map((m) => m.id)),
      });
    }
    if (rights.can_pin_messages !== false) {
      list.push({
        key: 'pin',
        label: main.pinned ? 'Открепить' : 'Закрепить',
        icon: main.pinned ? <PinOff size={20} color={C.text} /> : <Pin size={20} color={C.text} />,
        onPress: () => togglePin(main),
      });
    }
    if (mine && !main.poll_id && !main.note_share_id) {
      list.push({
        key: 'edit',
        label: main.file_url ? 'Изменить подпись' : 'Изменить',
        icon: <Pencil size={20} color={C.text} />,
        onPress: () => {
          setEditingMessage(main);
          setText(main.text || '');
        },
      });
    }
    if (main.poll && !main.poll.is_closed && !main.poll.is_quiz && (main.my_votes || []).length) {
      list.push({
        key: 'retract',
        label: 'Отменить голос',
        icon: <Undo2 size={20} color={C.text} />,
        onPress: () =>
          request(`/api/polls/${main.poll_id}/vote`, { method: 'DELETE' }).catch((e) => Alert.alert('Ошибка', e?.message || '')),
      });
    }
    if (main.poll && !main.poll.is_closed && main.poll.creator_id === currentUserId) {
      list.push({
        key: 'stop',
        label: main.poll.is_quiz ? 'Остановить викторину' : 'Остановить опрос',
        icon: <Square size={20} color={C.text} />,
        onPress: () =>
          Alert.alert('Остановить опрос?', 'Голосовать больше будет нельзя, все увидят итоги.', [
            { text: 'Отмена', style: 'cancel' },
            {
              text: 'Остановить',
              style: 'destructive',
              onPress: () => request(`/api/polls/${main.poll_id}/close`, { method: 'POST' }).catch((e) => Alert.alert('Ошибка', e?.message || '')),
            },
          ]),
      });
    }
    list.push({ key: 'delete', label: 'Удалить', danger: true, icon: <Trash2 size={20} color={C.danger} />, onPress: () => confirmDelete(row) });
    return list;
  };

  // ===== Медиа и файлы =====
  const openMedia = (msg: any) => {
    if (msg.local) return;
    const media = messages.filter((m) => !m.local && isVisualMedia(m) && m.file_url);
    const index = Math.max(0, media.findIndex((m) => m.id === msg.id));
    setViewer({
      index,
      items: media.map((m) => ({ ...m, sender_name: senderNameOf(m) })),
    });
  };

  const openFile = async (m: any) => {
    if (!m.file_url || m.local) return;
    try {
      // Файлы чатов защищены: открываем по подписанной ссылке на 10 минут.
      await Linking.openURL(await signedFileUrl(m.file_url));
    } catch (e: any) {
      Alert.alert('Не удалось открыть файл', e?.message || '');
    }
  };

  const onPressReply = (m: any) => {
    if (findMessage(m.reply_to_message_id)) {
      scrollToMessage(m.reply_to_message_id);
    } else if (m.external_reply_chat_id) {
      navigation.push('Chat', { chatId: String(m.external_reply_chat_id), chatName: 'Другой чат', messageId: m.reply_to_message_id });
    }
  };

  const onNoteAccepted = (messageId: number, noteId: number) => {
    setMessages((prev) =>
      prev.map((x) =>
        x.id === messageId && x.note_share && currentUserId && !x.note_share.accepted_user_ids.includes(currentUserId)
          ? { ...x, note_share: { ...x.note_share, accepted_user_ids: [...x.note_share.accepted_user_ids, currentUserId] } }
          : x,
      ),
    );
    Alert.alert('Заметка сохранена', 'Копия добавлена в ваши заметки на сегодня.', [
      { text: 'Остаться в чате', style: 'cancel' },
      { text: 'Открыть', onPress: () => navigation.navigate('NotesTab', { screen: 'NoteEditor', params: { noteId } }) },
    ]);
  };


  // ===== Голосовые и кружочки =====
  /** Голосовые после этого — плеер включит их сам по очереди, как Telegram. */
  const voicesAfter = (msg: any) => {
    const at = new Date(msg.created_at).getTime();
    return messages.filter((m) => !m.local && m.media_kind === 'voice' && m.file_url && new Date(m.created_at).getTime() > at);
  };

  const onPlayVoice = useCallback(
    (msg: any) => {
      toggleVoice(msg, voicesAfter(msg)).catch((e: any) => Alert.alert('Не удалось воспроизвести', e?.message || ''));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages],
  );

  const onSeekVoice = useCallback(
    (msg: any, ratio: number) => {
      seekVoice(msg, ratio, voicesAfter(msg)).catch(() => undefined);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages],
  );

  /** Прослушано: точка у голосового гаснет у всех. */
  const markListened = useCallback(
    (msg: any) => {
      const me = meRef.current;
      if (!me || typeof msg.id !== 'number' || msg.sender_id === me || (msg.listened_by || []).includes(me)) return;
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, listened_by: [...(m.listened_by || []), me] } : m)));
      request(`/api/messages/${msg.id}/listened`, { method: 'POST' }).catch(() => undefined);
    },
    [],
  );

  useEffect(() => {
    setVoiceStartHandler(markListened);
    return () => {
      setVoiceStartHandler(null);
      stopVoice();
    };
  }, [markListened]);

  const sendVoice = (r: VoiceResult) => {
    const duration = Math.round(r.durationMs / 100) / 10;
    enqueue([
      {
        ...baseLocal(),
        media_kind: 'voice',
        file_url: 'local',
        local_uri: r.uri,
        media_duration: duration,
        media_waveform: r.waveform,
        reply_to_message_id: replyTo?.id ?? null,
        local_file: { uri: r.uri, name: 'voice.m4a', type: 'audio/mp4' },
        upload: { kind: 'voice', duration, waveform: r.waveform },
      },
    ]);
  };

  const sendVideoNote = (r: VideoNoteResult) => {
    const duration = Math.round(r.durationMs / 100) / 10;
    enqueue([
      {
        ...baseLocal(),
        media_kind: 'video_note',
        file_url: 'local',
        local_uri: r.uri,
        media_duration: duration,
        reply_to_message_id: replyTo?.id ?? null,
        local_file: { uri: r.uri, name: 'video_note.mp4', type: 'video/mp4' },
        upload: { kind: 'video_note', duration },
      },
    ]);
  };

  const recorder = useChatRecorder({ onVoice: sendVoice, onVideoNote: sendVideoNote });

  // ===== Реакции =====
  /** Своя реакция: сразу на экране, потом — как ответил сервер. */
  const onReact = useCallback((msg: any, emoji: string) => {
    const me = meRef.current;
    if (!me || typeof msg.id !== 'number') return;
    Vibration.vibrate(8);
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msg.id) return m;
        const list: any[] = (m.reactions || []).map((r: any) => ({ ...r, user_ids: (r.user_ids || []).filter((u: number) => u !== me) }));
        const had = (m.reactions || []).find((r: any) => (r.user_ids || []).includes(me))?.emoji;
        if (had !== emoji) {
          const hit = list.find((r) => r.emoji === emoji);
          if (hit) hit.user_ids.push(me);
          else list.push({ emoji, user_ids: [me] });
        }
        const next = list.map((r) => ({ ...r, count: r.user_ids.length })).filter((r) => r.count > 0);
        return { ...m, reactions: next.length ? next : null };
      }),
    );
    request<any>(`/api/messages/${msg.id}/reactions`, { method: 'POST', body: { emoji } })
      .then((r) => setMessages((prev) => prev.map((m) => (m.id === r.id ? { ...m, reactions: r.reactions } : m))))
      .catch(() => loadMessages());
  }, [loadMessages]);

  // ===== Поиск по чату =====
  const [searching, setSearching] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchHits, setSearchHits] = useState<number[]>([]);
  const [searchIdx, setSearchIdx] = useState(0);
  const [searchBusy, setSearchBusy] = useState(false);

  useEffect(() => {
    if (!searching) return;
    const q = searchQ.trim();
    if (!q) {
      setSearchHits([]);
      return;
    }
    setSearchBusy(true);
    const t = setTimeout(async () => {
      try {
        const res = await request<any[]>(`/api/messages/${chatId}/search`, { query: { q, topic_id: topicId ?? undefined } });
        const ids = res.map((m) => m.id);
        setSearchHits(ids);
        setSearchIdx(0);
        if (ids.length) scrollToMessage(ids[0]);
      } catch {
        setSearchHits([]);
      } finally {
        setSearchBusy(false);
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ, searching, chatId, topicId]);

  const searchStep = (dir: 1 | -1) => {
    const next = searchIdx + dir; // 0 — самое новое; «вверх» — к старым
    if (next < 0 || next >= searchHits.length) return;
    setSearchIdx(next);
    scrollToMessage(searchHits[next]);
  };

  const closeSearch = () => {
    setSearching(false);
    setSearchQ('');
    setSearchHits([]);
  };

  useEffect(() => {
    if (!searching) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeSearch();
      return true;
    });
    return () => sub.remove();
  }, [searching]);

  // ===== Выделение сообщений =====
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    Animated.timing(toastAnim, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
    }, 1800);
  };

  const clearSelection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.create(160, 'easeInEaseOut', 'opacity'));
    setSelected(new Map());
  }, []);

  /** Удержание — начать выделение с этого сообщения (вместо всплывающего меню). */
  const startSelection = useCallback((row: Exclude<Row, { type: 'divider' }>) => {
    if (rowMain(row).local) return;
    Vibration.vibrate(10);
    LayoutAnimation.configureNext(LayoutAnimation.create(160, 'easeInEaseOut', 'opacity'));
    setSelected((prev) => {
      if (prev.size) {
        const next = new Map(prev);
        next.set(row.key, row);
        return next;
      }
      return new Map([[row.key, row]]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleSelect = useCallback((row: Exclude<Row, { type: 'divider' }>) => {
    if (rowMain(row).local) return;
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(row.key)) next.delete(row.key);
      else next.set(row.key, row);
      if (!next.size) LayoutAnimation.configureNext(LayoutAnimation.create(160, 'easeInEaseOut', 'opacity'));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // «Назад» на телефоне снимает выделение, а не закрывает чат.
  useEffect(() => {
    if (!selecting) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      clearSelection();
      return true;
    });
    return () => sub.remove();
  }, [selecting, clearSelection]);

  const selRows = useMemo(() => [...selected.values()], [selected]);
  const selMsgs = useMemo(
    () =>
      selRows
        .flatMap((r) => rowMessages(r))
        .filter((m) => typeof m.id === 'number')
        .sort((a, b) => a.id - b.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selRows],
  );
  const selSingle = selRows.length === 1 ? rowMain(selRows[0]) : null;
  const selCanEdit = !!selSingle && selSingle.sender_id === currentUserId && !selSingle.poll_id && !selSingle.note_share_id && selSingle.media_kind !== 'video_note';
  const selCanCopy = selMsgs.some((m) => m.text && m.content_type !== 'note');
  const selCanForward = selMsgs.length > 0 && selMsgs.every((m) => !m.poll_id);
  const selCanSave = selMsgs.some((m) => m.file_url || m.text);
  const selMore = selRows.length === 1 ? actionsFor(selRows[0]).filter((a) => ['pin', 'open', 'retract', 'stop'].includes(a.key)) : [];

  const selReply = () => {
    if (!selSingle) return;
    setReplyTo(selSingle);
    clearSelection();
  };

  const selForward = () => {
    setForwardIds(selMsgs.map((m) => m.id));
    clearSelection();
  };

  const selCopy = () => {
    Clipboard.setString(copyText(selMsgs, senderNameOf));
    clearSelection();
    showToast(selMsgs.filter((m) => m.text).length > 1 ? 'Сообщения скопированы' : 'Текст скопирован');
  };

  const selEdit = () => {
    if (!selSingle) return;
    setEditingMessage(selSingle);
    setText(selSingle.text || '');
    clearSelection();
  };

  const selSave = async () => {
    const list = selMsgs;
    clearSelection();
    try {
      const r = await saveMessagesToDevice(list, senderNameOf);
      const parts = [
        r.gallery ? (r.gallery > 1 ? `${r.gallery} в галерею` : 'Сохранено в галерею') : '',
        r.files ? (r.files > 1 ? `файлов: ${r.files}` : 'Файл сохранён') : '',
        r.text ? 'Текст сохранён' : '',
      ].filter(Boolean);
      if (parts.length) showToast(parts.join(' · '));
    } catch (e: any) {
      Alert.alert('Не удалось сохранить', e?.message || '');
    }
  };

  const selDelete = () => {
    const list = selMsgs;
    if (!list.length) return;
    const canAll = list.every((m) => m.sender_id === currentUserId || rights.can_delete_messages);
    const n = list.length;
    const what = n > 1 ? `${n} ${plural(n, ['сообщение', 'сообщения', 'сообщений'])}` : 'сообщение';
    const run = async (scope: 'me' | 'all') => {
      clearSelection();
      try {
        for (let i = 0; i < list.length; i += 100) {
          const ids = list.slice(i, i + 100).map((m) => m.id);
          try {
            await request('/api/messages/bulk-delete', { method: 'POST', body: { ids, scope } });
          } catch (e) {
            // Сервер ещё без удаления пачкой — удаляем по одному.
            if (!(e instanceof ApiError && e.status === 404)) throw e;
            for (const mid of ids) await request(`/api/messages/${mid}`, { method: 'DELETE', query: { scope } });
          }
        }
        const ids = new Set(list.map((m) => m.id));
        setMessages((prev) => prev.filter((m) => !ids.has(m.id)));
        loadPinned();
      } catch (e: any) {
        Alert.alert('Не удалось удалить', e?.message || 'Попробуйте ещё раз');
      }
    };
    Alert.alert(`Удалить ${what}?`, canAll ? 'Можно удалить только у себя или у всех участников.' : 'Сообщения исчезнут только у вас.', [
      { text: 'Отмена', style: 'cancel' },
      ...(canAll ? [{ text: 'Удалить у всех', style: 'destructive' as const, onPress: () => run('all') }] : []),
      { text: 'Удалить у меня', style: 'destructive' as const, onPress: () => run('me') },
    ]);
  };

  // ===== Шапка =====
  const openInfo = () => {
    if (topicId) navigation.navigate('TopicInfo', { chatId, topicId });
    else navigation.navigate('ChatInfo', { chatId });
  };

  const typingNames = Object.values(typing).map((t) => t.name.split(' ')[0]);
  const subtitle = (() => {
    if (typingNames.length) {
      if (!isGroup) return 'печатает…';
      if (typingNames.length === 1) return `${typingNames[0]} печатает…`;
      return `${typingNames.length} ${plural(typingNames.length, ['человек печатает', 'человека печатают', 'человек печатают'])}…`;
    }
    if (topicId) return chat?.name ? `тема в «${chat.name}»` : 'тема';
    if (!chat) return '';
    if (chat.type === 'private') return peerPresence?.online ? 'в сети' : lastSeenLabel(peerPresence?.last_seen_at);
    const total = chat.members_count || chat.members?.length || 0;
    const memberIds = new Set((chat.members || []).map((m: any) => m.id));
    const online = onlineIds.filter((id) => memberIds.has(id)).length;
    return `${total} ${plural(total, ['участник', 'участника', 'участников'])}${online > 1 ? `, ${online} в сети` : ''}`;
  })();
  const subtitleActive = typingNames.length > 0 || (chat?.type === 'private' && peerPresence?.online);

  const renderHeaderAvatar = () => {
    if (topicMeta) {
      const Icon = TOPIC_ICONS[topicMeta.icon] || TOPIC_ICONS.hash;
      const color = topicMeta.icon_color || C.accent;
      return (
        <View style={[styles.headerAvatar, { backgroundColor: hexToRgba(color, 0.12) }]}>
          <Icon size={22} color={color} strokeWidth={2} style={{ opacity: topicMeta.icon_opacity ?? 1 }} />
        </View>
      );
    }
    if (chat?.avatar_url) return <Image source={{ uri: SERVER_URL + chat.avatar_url }} style={styles.headerAvatar} />;
    return (
      <View style={[styles.headerAvatar, { backgroundColor: hashColor(chatName) }]}>
        <Text style={styles.headerAvatarText}>{initials(chatName)}</Text>
        {chat?.type === 'private' && peerPresence?.online && <View style={styles.onlineDot} />}
      </View>
    );
  };

  const renderItem = ({ item }: { item: ListItem }) => {
    if (item.type === 'divider') return <DayDivider label={item.label} />;
    if (item.type === 'unread') {
      return (
        <View style={styles.unreadBar}>
          <Text style={styles.unreadText}>Непрочитанные сообщения</Text>
        </View>
      );
    }
    if (item.type === 'service') return <ServiceRow text={item.msg.text} />;
    const main = rowMain(item.row);
    const replied = main.reply_to_message_id ? findMessage(main.reply_to_message_id) : null;
    const sender = membersById[main.sender_id];
    return (
      <MessageRow
        row={item.row}
        mine={item.mine}
        showName={item.showName}
        showAvatar={item.showAvatar}
        isGroup={isGroup}
        senderName={senderNameOf(main)}
        senderAvatar={main.sender_avatar_url || sender?.avatar_url}
        replied={replied}
        repliedName={replied ? (replied.sender_id === currentUserId ? 'Вы' : senderNameOf(replied)) : ''}
        peerLastReadId={peerLastReadId}
        currentUserId={currentUserId || 0}
        highlighted={highlightId !== null && rowMessages(item.row).some((m) => m.id === highlightId)}
        onLongPress={startSelection}
        selecting={selecting}
        selected={selected.has(item.row.key)}
        onToggleSelect={toggleSelect}
        onPlayVoice={onPlayVoice}
        onSeekVoice={onSeekVoice}
        onVideoNoteStarted={markListened}
        onReact={onReact}
        onOpenMedia={openMedia}
        onOpenFile={openFile}
        onPressReply={onPressReply}
        onSwipeReply={(m) => !m.local && setReplyTo(m)}
        onRetry={retryOrDiscard}
        onCancelUpload={cancelUpload}
        onNoteAccepted={onNoteAccepted}
        onPressSender={(userId) => navigation.navigate('UserProfile', { userId })}
      />
    );
  };

  const canSend = !!text.trim();
  // Пустое поле — микрофон/кружочек; есть текст или правка — «отправить».
  const showRecord = !canSend && !editingMessage;
  const recordingVideo = recorder.mode === 'video' && (recorder.phase === 'recording' || recorder.phase === 'locked');

  // Лента уходит под парящие шапку и поле ввода (стекло, как в iOS / новом Telegram).
  const listPadTop = dockH + 6; // перевёрнутый список: это низ экрана
  const listPadBottom = topH + 6;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView style={styles.flex1} behavior="padding" keyboardVerticalOffset={0}>
        <View style={[styles.listWrap, { marginBottom: -dockH }]}>
          <WallpaperView wallpaper={wallpaper} />
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={C.accent} />
            </View>
          ) : loadError && messages.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.emptyText}>{loadError}</Text>
              <TouchableOpacity onPress={loadMessages} style={styles.retryBtn}>
                <Text style={styles.retryText}>Повторить</Text>
              </TouchableOpacity>
            </View>
          ) : messages.length === 0 ? (
            <View style={styles.center}>
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>Сообщений пока нет</Text>
                <Text style={styles.emptyText}>Напишите что-нибудь, запишите голосовое или отправьте фото через скрепку.</Text>
              </View>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              inverted
              data={items}
              keyExtractor={(it) => it.key}
              renderItem={renderItem}
              contentContainerStyle={{ paddingTop: listPadTop, paddingBottom: listPadBottom }}
              onEndReached={loadOlder}
              onEndReachedThreshold={0.4}
              ListFooterComponent={loadingOlder ? <ActivityIndicator color={C.accent} style={{ marginVertical: 12 }} /> : null}
              onScroll={(e) => {
                const up = e.nativeEvent.contentOffset.y > 400;
                scrolledUp.current = up;
                if (up !== showScrollDown) setShowScrollDown(up);
                if (!up && newWhileAway) setNewWhileAway(0);
              }}
              scrollEventThrottle={64}
              onScrollToIndexFailed={(info) => {
                listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
                setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, animated: true, viewPosition: 0.5 }), 300);
              }}
              keyboardShouldPersistTaps="handled"
              maintainVisibleContentPosition={{ minIndexForVisible: 1, autoscrollToTopThreshold: 120 }}
            />
          )}

          {showScrollDown && !selecting && (
            <TouchableOpacity
              style={[styles.scrollDown, { bottom: dockH + 12 }]}
              onPress={() => {
                listRef.current?.scrollToOffset({ offset: 0, animated: true });
                setNewWhileAway(0);
              }}
              accessibilityLabel="Вниз"
            >
              <ChevronDown size={24} color={C.text} />
              {newWhileAway > 0 && (
                <View style={styles.scrollBadge}>
                  <Text style={styles.scrollBadgeText}>{newWhileAway}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {recordingVideo && <VideoNoteCamera rec={recorder} />}

          {toast && (
            <Animated.View
              pointerEvents="none"
              style={[styles.toast, { bottom: dockH + 16, opacity: toastAnim, transform: [{ translateY: toastAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }]}
            >
              <Text style={styles.toastText}>{toast}</Text>
            </Animated.View>
          )}
        </View>

        {/* ===== НИЗ: парящие плашки и поле ввода ===== */}
        <View style={styles.dock} onLayout={(e) => setDockH(e.nativeEvent.layout.height)} pointerEvents="box-none">
          {searching && !selecting ? (
            // Поиск: «N из M» и стрелки к старым/новым совпадениям.
            <View style={styles.selBar}>
              <Text style={styles.searchCount}>
                {searchBusy ? 'Ищем…' : !searchQ.trim() ? 'Введите запрос' : searchHits.length ? `${searchIdx + 1} из ${searchHits.length}` : 'Ничего не найдено'}
              </Text>
              <TouchableOpacity onPress={() => searchStep(1)} disabled={searchIdx >= searchHits.length - 1} style={styles.pillBtn} accessibilityLabel="Предыдущее совпадение">
                <ChevronUp size={24} color={searchIdx >= searchHits.length - 1 ? T.textMuted : C.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => searchStep(-1)} disabled={searchIdx <= 0} style={styles.pillBtn} accessibilityLabel="Следующее совпадение">
                <ChevronDown size={24} color={searchIdx <= 0 ? T.textMuted : C.accent} />
              </TouchableOpacity>
            </View>
          ) : selecting ? (
            // Выделение: «Ответить» и «Переслать» вместо поля ввода (как в Telegram).
            <View style={styles.selBar}>
              {selSingle ? (
                <TouchableOpacity onPress={selReply} style={styles.selBtn} activeOpacity={0.7}>
                  <CornerUpLeft size={22} color={C.accent} />
                  <Text style={styles.selBtnText}>Ответить</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.flex1} />
              )}
              {selCanForward && (
                <TouchableOpacity onPress={selForward} style={[styles.selBtn, styles.selBtnRight]} activeOpacity={0.7}>
                  <Text style={styles.selBtnText}>Переслать</Text>
                  <Forward size={22} color={C.accent} />
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <>
              {(replyTo || editingMessage) && (
                <View style={styles.plate}>
                  {replyTo ? <CornerUpLeft size={20} color={C.accent} /> : <Pencil size={20} color={C.accent} />}
                  <TouchableOpacity style={styles.plateBody} onPress={() => replyTo && scrollToMessage(replyTo.id)} activeOpacity={0.7}>
                    <Text style={styles.plateLabel} numberOfLines={1}>
                      {replyTo ? `Ответ ${replyTo.sender_id === currentUserId ? 'себе' : senderNameOf(replyTo)}` : 'Редактирование'}
                    </Text>
                    <Text style={styles.plateText} numberOfLines={1}>
                      {messagePreview(replyTo || editingMessage)}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (editingMessage) setText('');
                      setReplyTo(null);
                      setEditingMessage(null);
                    }}
                    style={styles.plateClose}
                    accessibilityLabel="Отменить"
                  >
                    <X size={20} color={C.textMuted} />
                  </TouchableOpacity>
                </View>
              )}
              {scheduled.length > 0 && !editingMessage && (
                <TouchableOpacity style={styles.plate} onPress={() => setShowScheduledList(true)} activeOpacity={0.7}>
                  <CalendarClock size={20} color={C.accent} />
                  <View style={styles.plateBody}>
                    <Text style={styles.plateLabel}>Запланировано: {scheduled.length}</Text>
                    <Text style={styles.plateText}>Нажмите, чтобы посмотреть или отменить</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* Скрепка, капсула ввода, микрофон/отправка — отдельные парящие элементы */}
              <View style={styles.inputBar}>
                <TouchableOpacity
                  onPress={() => setShowAttach(true)}
                  style={[styles.roundGlass, editingMessage && styles.disabled]}
                  accessibilityLabel="Вложения"
                  disabled={!!editingMessage}
                >
                  <Paperclip size={22} color={C.text} strokeWidth={2} />
                </TouchableOpacity>
                <View style={styles.inputCapsule}>
                  <TextInput
                    style={styles.input}
                    value={text}
                    onChangeText={onChangeText}
                    placeholder={editingMessage?.file_url ? 'Подпись' : 'Сообщение'}
                    placeholderTextColor={T.textMuted}
                    multiline
                    maxLength={4000}
                    // «Отправка по Enter» (Внешний вид → Чаты): Enter отправляет вместо новой строки.
                    submitBehavior={sendByEnter ? 'submit' : 'newline'}
                    returnKeyType={sendByEnter ? 'send' : 'default'}
                    onSubmitEditing={sendByEnter ? handleSend : undefined}
                  />
                </View>
                {showRecord || recorder.phase !== 'idle' ? (
                  <View style={styles.roundGlass}>
                    <RecordButton rec={recorder} />
                  </View>
                ) : (
                  <TouchableOpacity
                    onPress={handleSend}
                    onLongPress={() => canSend && !editingMessage && setShowSchedulePicker(true)}
                    delayLongPress={350}
                    style={styles.sendBtn}
                    accessibilityLabel="Отправить. Удерживайте, чтобы запланировать"
                  >
                    {editingMessage ? <Pencil size={18} color={T.onAccent} strokeWidth={2.5} /> : <SendHorizonal size={19} color={T.onAccent} strokeWidth={2.4} />}
                  </TouchableOpacity>
                )}
              </View>
              <RecordingLayer rec={recorder} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* ===== ВЕРХ: парящие шапка, закреп и плеер ===== */}
      <View style={[styles.topLayer, { paddingTop: insets.top + 6 }]} onLayout={(e) => setTopH(e.nativeEvent.layout.height)} pointerEvents="box-none">
        {selecting ? (
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={clearSelection} style={styles.roundGlass} accessibilityLabel="Снять выделение">
              <X size={22} color={C.text} strokeWidth={2.2} />
            </TouchableOpacity>
            <View style={styles.selCountPill}>
              <Text style={styles.selCount}>{selMsgs.length}</Text>
            </View>
            <View style={styles.flex1} />
            <View style={styles.actionsPill}>
              {selCanEdit && (
                <TouchableOpacity onPress={selEdit} style={styles.pillBtn} accessibilityLabel="Изменить">
                  <Pencil size={20} color={C.text} />
                </TouchableOpacity>
              )}
              {selCanCopy && (
                <TouchableOpacity onPress={selCopy} style={styles.pillBtn} accessibilityLabel="Копировать">
                  <Copy size={20} color={C.text} />
                </TouchableOpacity>
              )}
              {selCanForward && (
                <TouchableOpacity onPress={selForward} style={styles.pillBtn} accessibilityLabel="Переслать">
                  <Forward size={21} color={C.text} />
                </TouchableOpacity>
              )}
              {selCanSave && (
                <TouchableOpacity onPress={selSave} style={styles.pillBtn} accessibilityLabel="Сохранить">
                  <Download size={20} color={C.text} />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={selDelete} style={styles.pillBtn} accessibilityLabel="Удалить">
                <Trash2 size={20} color={C.danger} />
              </TouchableOpacity>
              {selMore.length > 0 && (
                <TouchableOpacity onPress={() => setMoreOpen(true)} style={styles.pillBtn} accessibilityLabel="Ещё">
                  <MoreVertical size={20} color={C.text} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : searching ? (
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={closeSearch} style={styles.roundGlass} accessibilityLabel="Закрыть поиск">
              <X size={22} color={C.text} strokeWidth={2.2} />
            </TouchableOpacity>
            <View style={[styles.titlePill, styles.searchPill]}>
              <Search size={18} color={C.textMuted} />
              <TextInput
                style={styles.searchInput}
                value={searchQ}
                onChangeText={setSearchQ}
                placeholder="Поиск по сообщениям"
                placeholderTextColor={T.textMuted}
                autoFocus
                returnKeyType="search"
              />
              {searchBusy && <ActivityIndicator size="small" color={C.accent} />}
            </View>
          </View>
        ) : (
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.roundGlass} accessibilityLabel="Назад">
              <ChevronLeft size={26} color={C.text} strokeWidth={2.2} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.titlePill} activeOpacity={0.75} onPress={openInfo} accessibilityLabel="Информация о чате">
              <Text style={styles.headerTitle} numberOfLines={1}>
                {topicMeta?.title || chatName}
              </Text>
              {subtitle ? (
                <Text style={[styles.headerSubtitle, subtitleActive && { color: C.accent }]} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSearching(true)} style={styles.roundGlass} accessibilityLabel="Поиск по сообщениям">
              <Search size={20} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={openInfo} activeOpacity={0.8} style={styles.avatarRing} accessibilityLabel="Профиль чата">
              {renderHeaderAvatar()}
            </TouchableOpacity>
          </View>
        )}

        {/* Одно выделенное сообщение — ряд реакций, как в Telegram */}
        {selecting && selSingle && selSingle.content_type !== 'service' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.reactPill} contentContainerStyle={styles.reactPillInner}>
            {REACTIONS.map((e) => {
              const mineR = (selSingle.reactions || []).some((r: any) => r.emoji === e && (r.user_ids || []).includes(currentUserId));
              return (
                <TouchableOpacity
                  key={e}
                  onPress={() => {
                    onReact(selSingle, e);
                    clearSelection();
                  }}
                  style={[styles.reactBtn, mineR && styles.reactBtnOn]}
                  accessibilityLabel={`Реакция ${e}`}
                >
                  <Text style={styles.reactEmoji}>{e}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {pinnedMessages.length > 0 && !searching && (
          <TouchableOpacity
            style={styles.pinnedBar}
            onPress={() => {
              const msg = pinnedMessages[currentPinnedIndex];
              if (msg) scrollToMessage(msg.id);
              setCurrentPinnedIndex((i) => (i + 1) % pinnedMessages.length);
            }}
            activeOpacity={0.7}
          >
            <View style={styles.pinnedLine} />
            <View style={styles.flex1}>
              <Text style={styles.pinnedLabel}>Закреплённое сообщение{pinnedMessages.length > 1 ? ` #${currentPinnedIndex + 1}` : ''}</Text>
              <Text style={styles.pinnedText} numberOfLines={1}>
                {messagePreview(pinnedMessages[currentPinnedIndex]) || 'Вложение'}
              </Text>
            </View>
            <Pin size={18} color={C.textMuted} />
          </TouchableOpacity>
        )}

        <VoicePlayerBar nameOf={(m) => (m.sender_id === currentUserId ? 'Вы' : senderNameOf(m))} onOpen={(m) => typeof m.id === 'number' && scrollToMessage(m.id)} />
      </View>

      {/* ===== МОДАЛКИ ===== */}
      <AttachSheet
        visible={showAttach}
        onClose={() => setShowAttach(false)}
        onSendMedia={sendMedia}
        onSendFiles={sendFiles}
        onPoll={() => setShowPoll(true)}
        onNote={() => setShowNotes(true)}
      />
      <PollComposer visible={showPoll} onClose={() => setShowPoll(false)} onSubmit={createPoll} />
      <NotePickerModal visible={showNotes} onClose={() => setShowNotes(false)} onPick={shareNote} />
      <MediaViewer
        visible={!!viewer}
        items={viewer?.items || []}
        initialIndex={viewer?.index || 0}
        onClose={() => setViewer(null)}
        onForward={(it) => {
          setViewer(null);
          setForwardIds([it.id]);
        }}
        onShowInChat={(it) => {
          setViewer(null);
          setTimeout(() => scrollToMessage(it.id), 250);
        }}
      />
      <ActionSheet
        visible={moreOpen && !!selSingle}
        title={selSingle ? (selSingle.sender_id === currentUserId ? 'Вы' : senderNameOf(selSingle)) : ''}
        preview={selSingle ? messagePreview(selSingle) : ''}
        actions={selMore.map((a) => ({
          ...a,
          onPress: () => {
            clearSelection();
            a.onPress();
          },
        }))}
        onClose={() => setMoreOpen(false)}
      />
      <ShareToChatModal visible={!!forwardIds} title="Переслать" onClose={() => setForwardIds(null)} onSend={forwardTo} />

      <DateTimePickerModal
        visible={showSchedulePicker}
        initialDate={new Date(Date.now() + 60 * 60 * 1000)}
        minDate={new Date()}
        title="Отправить позже"
        onClose={() => setShowSchedulePicker(false)}
        onSave={scheduleMessage}
      />

      <Modal visible={showScheduledList} transparent animationType="slide" onRequestClose={() => setShowScheduledList(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowScheduledList(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Запланированные сообщения</Text>
          <FlatList
            data={scheduled}
            keyExtractor={(item) => String(item.id)}
            style={{ maxHeight: 380 }}
            ListEmptyComponent={<Text style={styles.emptyText}>Нет запланированных сообщений</Text>}
            renderItem={({ item }) => (
              <View style={styles.scheduledRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.scheduledTime}>
                    {new Date(item.send_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={styles.scheduledText} numberOfLines={2}>
                    {item.text}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => sendScheduledNow(item.id)} style={styles.scheduledBtn} accessibilityLabel="Отправить сейчас">
                  <SendHorizonal size={16} color={C.accent} strokeWidth={2} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() =>
                    Alert.alert('Отменить отправку?', item.text, [
                      { text: 'Нет', style: 'cancel' },
                      { text: 'Отменить', style: 'destructive', onPress: () => cancelScheduled(item.id) },
                    ])
                  }
                  style={styles.scheduledBtn}
                  accessibilityLabel="Отменить"
                >
                  <Trash2 size={16} color={C.danger} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            )}
          />
          <Text style={styles.sheetHint}>Чтобы запланировать: напишите текст и удерживайте кнопку отправки.</Text>
          <SafeBottom />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: C.bg },
  flex1: { flex: 1 },
  disabled: { opacity: 0.45 },

  // ----- Верх: парящие элементы над лентой -----
  topLayer: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 8, paddingBottom: 4, gap: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roundGlass: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', ...glass() },
  titlePill: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, ...glass() },
  avatarRing: { width: 44, height: 44, borderRadius: 22, ...glass(), padding: 0, alignItems: 'center', justifyContent: 'center' },
  headerAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  headerAvatarText: { color: T.onAccent, fontSize: 15, fontWeight: '700' },
  onlineDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: T.success,
    borderWidth: 2,
    borderColor: T.card,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: C.text, textAlign: 'center' },
  headerSubtitle: { fontSize: 12, color: C.textMuted, marginTop: 1, textAlign: 'center' },
  selCountPill: { height: 44, minWidth: 44, borderRadius: 22, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', ...glass() },
  selCount: { fontSize: 18, fontWeight: '800', color: C.text },
  actionsPill: { flexDirection: 'row', alignItems: 'center', height: 44, borderRadius: 22, paddingHorizontal: 4, ...glass() },
  pillBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  searchPill: { flexDirection: 'row', justifyContent: 'flex-start', gap: 8 },
  searchInput: { flex: 1, fontSize: 16, color: C.text, paddingVertical: 0 },
  searchCount: { flex: 1, fontSize: 15, fontWeight: '600', color: C.text, paddingLeft: 16 },
  reactPill: { flexGrow: 0, alignSelf: 'flex-start', maxWidth: '100%', borderRadius: 24, ...glass(0.95) },
  reactPillInner: { paddingHorizontal: 6, paddingVertical: 4, gap: 2 },
  reactBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  reactBtnOn: { backgroundColor: withAlpha(T.accent, 0.18) },
  reactEmoji: { fontSize: 24 },

  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    ...glass(),
  },
  pinnedLine: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.accent },
  pinnedLabel: { fontSize: 13, fontWeight: '700', color: C.accent },
  pinnedText: { fontSize: 14, color: C.text },

  // ----- Лента -----
  listWrap: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyCard: { borderRadius: 20, padding: 20, alignItems: 'center', maxWidth: 290, ...glass(0.9) },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 },
  emptyText: { fontSize: 14, color: C.textMuted, textAlign: 'center' },
  retryBtn: { marginTop: 12, paddingHorizontal: 18, height: 40, borderRadius: 12, backgroundColor: C.accent, justifyContent: 'center' },
  retryText: { color: T.onAccent, fontWeight: '700' },
  unreadBar: { marginVertical: 8, paddingVertical: 5, backgroundColor: withAlpha(T.card, 0.85), alignItems: 'center' },
  unreadText: { fontSize: 13, color: C.accent, fontWeight: '700' },

  scrollDown: {
    position: 'absolute',
    right: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...glass(0.92),
  },
  scrollBadge: {
    position: 'absolute',
    top: -6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollBadgeText: { color: T.onAccent, fontSize: 11, fontWeight: '800' },
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(20,24,22,0.9)',
  },
  toastText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },

  // ----- Низ: парящие плашки и ввод -----
  dock: { paddingHorizontal: 8, paddingBottom: 6, paddingTop: 4, gap: 6 },
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 14,
    paddingRight: 4,
    paddingVertical: 5,
    borderRadius: 18,
    ...glass(0.92),
  },
  plateBody: { flex: 1, borderLeftWidth: 2, borderLeftColor: C.accent, paddingLeft: 8 },
  plateLabel: { fontSize: 13, fontWeight: '700', color: C.accent },
  plateText: { fontSize: 14, color: C.text },
  plateClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  inputCapsule: { flex: 1, minHeight: 44, borderRadius: 22, justifyContent: 'center', ...glass(0.92) },
  input: {
    minHeight: 44,
    maxHeight: 140,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 12 : 10,
    paddingBottom: Platform.OS === 'ios' ? 12 : 10,
    fontSize: 16,
    color: C.text,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accent },

  selBar: { flexDirection: 'row', alignItems: 'center', height: 50, borderRadius: 25, paddingHorizontal: 4, ...glass(0.94) },
  selBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: 48 },
  selBtnRight: { justifyContent: 'flex-end' },
  selBtnText: { fontSize: 15, fontWeight: '700', color: C.accent, textTransform: 'uppercase', letterSpacing: 0.3 },

  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: T.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 16,
    paddingBottom: 28,
  },
  sheetHandle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: T.surfaceActive, marginBottom: 12 },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginBottom: 8 },
  sheetHint: { fontSize: 13, color: C.textMuted, marginTop: 10 },
  scheduledRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.border },
  scheduledTime: { fontSize: 12, fontWeight: '700', color: C.accent, marginBottom: 2 },
  scheduledText: { fontSize: 15, color: C.text },
  scheduledBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: T.inputBg },
}));
