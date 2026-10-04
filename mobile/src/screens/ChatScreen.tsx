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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
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
} from 'lucide-react-native';
import { TOPIC_ICONS, hexToRgba } from '../theme/topicIcons';
import { SERVER_URL } from '../config';
import { api } from '../services/api';
import { request, signedFileUrl, upload } from '../services/http';
import { emitEvent, joinChat, makeClientId, sendMessage, subscribe } from '../services/socket';
import DateTimePickerModal from '../components/DateTimePickerModal';
import ShareToChatModal from '../components/ShareToChatModal';
import AttachSheet, { PickedMedia } from '../components/chat/AttachSheet';
import PollComposer, { PollDraft } from '../components/chat/PollComposer';
import NotePickerModal from '../components/chat/NotePickerModal';
import MediaViewer, { ViewerItem } from '../components/chat/MediaViewer';
import ActionSheet, { SheetAction } from '../components/chat/ActionSheet';
import MessageRow, { DayDivider, Row, ServiceRow } from '../components/chat/MessageRow';
import { C, dayLabel, hashColor, initials, isVisualMedia, lastSeenLabel, messagePreview, plural } from '../components/chat/chatUtils';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';

import { T, themed } from '../theme/runtime';
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
  const [actionRow, setActionRow] = useState<Exclude<Row, { type: 'divider' }> | null>(null);
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

  const listRef = useRef<FlatList>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSent = useRef(0);
  const lastReadSent = useRef(0);
  const scrolledUp = useRef(false);
  const meRef = useRef<number | null>(null);
  meRef.current = currentUserId;

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
      if (m.media_group_id && isVisualMedia(m) && last && last.type !== 'service') {
        const lastMsg = last.type === 'album' ? last.msgs[0] : last.msg;
        if (lastMsg.media_group_id === m.media_group_id && lastMsg.sender_id === m.sender_id) {
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

  const scrollToMessage = (id: number) => {
    const idx = items.findIndex(
      (it) => it.type === 'row' && (it.row.type === 'album' ? it.row.msgs.some((m) => m.id === id) : it.row.msg.id === id),
    );
    if (idx < 0) {
      Alert.alert('Сообщение', 'Сообщение не загружено — прокрутите вверх, чтобы подгрузить историю.');
      return;
    }
    listRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.5 });
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 1600);
  };

  useEffect(() => {
    if (!loading && initialMessageId) setTimeout(() => scrollToMessage(initialMessageId), 300);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, initialMessageId]);

  // ===== Отправка =====

  /** Отправляет (или повторяет отправку) локального сообщения. */
  const deliver = async (local: ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.client_id === local.client_id ? { ...m, status: 'sending' } : m)));
    try {
      const saved = local.local_file
        ? await upload<any>('/api/upload', 'file', local.local_file, {
            chatId,
            topicId: topicId ?? undefined,
            client_id: local.client_id,
            caption: local.text || undefined,
            media_group_id: local.media_group_id || undefined,
            as_file: local.as_file ? 'true' : undefined,
            reply_to_message_id: local.reply_to_message_id || undefined,
          })
        : await sendMessage({
            chatId,
            text: local.text,
            reply_to_message_id: local.reply_to_message_id ?? null,
            topic_id: topicId,
            client_id: local.client_id,
          });
      setMessages((prev) => prev.map((m) => (m.client_id === local.client_id ? { ...saved, status: 'sent' } : m)));
    } catch {
      setMessages((prev) => prev.map((m) => (m.client_id === local.client_id ? { ...m, status: 'failed' } : m)));
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

  /** Фото/видео из галереи: несколько штук уходят одним альбомом. */
  const sendMedia = async (picked: PickedMedia[], caption: string, asFile: boolean) => {
    const groupId = picked.length > 1 && !asFile ? `g${Date.now()}${Math.random().toString(36).slice(2, 8)}` : null;
    const locals: ChatMessage[] = picked.map((p, i) => ({
      ...baseLocal(),
      client_id: makeClientId(),
      text: i === 0 ? caption || null : null,
      reply_to_message_id: i === 0 ? replyTo?.id ?? null : null,
      media_kind: asFile ? 'file' : p.isVideo ? 'video' : 'photo',
      media_group_id: groupId,
      media_width: p.width,
      media_height: p.height,
      media_duration: p.duration,
      local_uri: asFile ? null : p.uri,
      file_url: asFile ? 'local' : null,
      file_name: p.name,
      as_file: asFile,
      local_file: { uri: p.uri, name: p.name, type: p.type },
    }));
    setMessages((prev) => [...prev, ...locals]);
    setReplyTo(null);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    // По одному, чтобы порядок в альбоме совпал с порядком выбора.
    for (const l of locals) await deliver(l);
  };

  const pickFiles = async () => {
    try {
      const files = await pick({ type: [types.allFiles], allowMultiSelection: true });
      const locals: ChatMessage[] = files
        .filter((f) => f.uri)
        .map((f) => ({
          ...baseLocal(),
          client_id: makeClientId(),
          media_kind: 'file',
          file_url: 'local',
          file_name: f.name || 'Файл',
          file_size: f.size,
          as_file: true,
          local_file: { uri: f.uri, name: f.name || 'file', type: f.type },
        }));
      setMessages((prev) => [...prev, ...locals]);
      for (const l of locals) await deliver(l);
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      Alert.alert('Не удалось выбрать файл', err?.message || '');
    }
  };

  const createPoll = async (p: PollDraft) => {
    await request('/api/polls', { method: 'POST', body: { ...p, chat_id: Number(chatId), topic_id: topicId } });
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
        onLongPress={(row) => !rowMain(row).local && setActionRow(row)}
        onOpenMedia={openMedia}
        onOpenFile={openFile}
        onPressReply={onPressReply}
        onSwipeReply={(m) => !m.local && setReplyTo(m)}
        onRetry={retryOrDiscard}
        onNoteAccepted={onNoteAccepted}
        onPressSender={(userId) => navigation.navigate('UserProfile', { userId })}
      />
    );
  };

  const actionMain = actionRow ? rowMain(actionRow) : null;
  const canSend = !!text.trim();

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ===== ШАПКА ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn} accessibilityLabel="Назад">
          <ChevronLeft size={26} color={C.text} strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerMain} activeOpacity={0.7} onPress={openInfo}>
          {renderHeaderAvatar()}
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {topicMeta?.title || chatName}
            </Text>
            {subtitle ? (
              <Text style={[styles.headerSubtitle, subtitleActive && { color: C.accent }]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
        <TouchableOpacity onPress={openInfo} style={styles.headerBtn} accessibilityLabel="Информация о чате">
          <MoreVertical size={22} color={C.text} strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* ===== ЗАКРЕП ===== */}
      {pinnedMessages.length > 0 && (
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
          <View style={{ flex: 1 }}>
            <Text style={styles.pinnedLabel}>
              Закреплённое сообщение{pinnedMessages.length > 1 ? ` #${currentPinnedIndex + 1}` : ''}
            </Text>
            <Text style={styles.pinnedText} numberOfLines={1}>
              {messagePreview(pinnedMessages[currentPinnedIndex]) || 'Вложение'}
            </Text>
          </View>
          <Pin size={18} color={C.textMuted} />
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={0}>
        <View style={styles.listWrap}>
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
                <Text style={styles.emptyText}>Напишите что-нибудь или отправьте фото через скрепку.</Text>
              </View>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              inverted
              data={items}
              keyExtractor={(it) => it.key}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
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

          {showScrollDown && (
            <TouchableOpacity
              style={styles.scrollDown}
              onPress={() => {
                listRef.current?.scrollToOffset({ offset: 0, animated: true });
                setNewWhileAway(0);
              }}
              accessibilityLabel="Вниз"
            >
              <ChevronDown size={24} color={C.textMuted} />
              {newWhileAway > 0 && (
                <View style={styles.scrollBadge}>
                  <Text style={styles.scrollBadgeText}>{newWhileAway}</Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* ===== ПЛАШКИ НАД ВВОДОМ ===== */}
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
              <Text style={styles.plateLabel}>
                Запланировано: {scheduled.length}
              </Text>
              <Text style={styles.plateText}>Нажмите, чтобы посмотреть или отменить</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* ===== ВВОД ===== */}
        <View style={styles.inputBar}>
          <TouchableOpacity onPress={() => setShowAttach(true)} style={styles.attachBtn} accessibilityLabel="Вложения" disabled={!!editingMessage}>
            <Paperclip size={24} color={editingMessage ? T.textMuted : C.textMuted} strokeWidth={2} />
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={onChangeText}
            placeholder={editingMessage?.file_url ? 'Подпись' : 'Сообщение'}
            placeholderTextColor={T.textMuted}
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            onPress={handleSend}
            onLongPress={() => canSend && !editingMessage && setShowSchedulePicker(true)}
            delayLongPress={350}
            disabled={!canSend && !editingMessage}
            style={[styles.sendBtn, { backgroundColor: canSend || editingMessage ? C.accent : T.surfaceActive }]}
            accessibilityLabel="Отправить. Удерживайте, чтобы запланировать"
          >
            {editingMessage ? (
              <Pencil size={18} color={T.onAccent} strokeWidth={2.5} />
            ) : (
              <SendHorizonal size={19} color={canSend ? T.onAccent : T.textMuted} strokeWidth={2.4} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ===== МОДАЛКИ ===== */}
      <AttachSheet
        visible={showAttach}
        onClose={() => setShowAttach(false)}
        onSendMedia={sendMedia}
        onPickFiles={pickFiles}
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
        visible={!!actionRow}
        title={actionMain ? (actionMain.sender_id === currentUserId ? 'Вы' : senderNameOf(actionMain)) : ''}
        preview={actionMain ? messagePreview(actionMain) : ''}
        actions={actionRow ? actionsFor(actionRow) : []}
        onClose={() => setActionRow(null)}
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
  container: { flex: 1, backgroundColor: T.card },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    height: 58,
    backgroundColor: T.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
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
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.text },
  headerSubtitle: { fontSize: 13, color: C.textMuted, marginTop: 1 },

  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: T.card,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  pinnedLine: { width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.accent },
  pinnedLabel: { fontSize: 13, fontWeight: '700', color: C.accent },
  pinnedText: { fontSize: 14, color: C.text },

  listWrap: { flex: 1, backgroundColor: C.bg },
  listContent: { paddingVertical: 8 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyCard: { backgroundColor: 'rgba(255,255,255,0.85)', borderRadius: 18, padding: 20, alignItems: 'center', maxWidth: 280 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 4 },
  emptyText: { fontSize: 14, color: C.textMuted, textAlign: 'center' },
  retryBtn: { marginTop: 12, paddingHorizontal: 18, height: 40, borderRadius: 12, backgroundColor: C.accent, justifyContent: 'center' },
  retryText: { color: T.onAccent, fontWeight: '700' },
  unreadBar: { marginVertical: 8, paddingVertical: 5, backgroundColor: 'rgba(255,255,255,0.75)', alignItems: 'center' },
  unreadText: { fontSize: 13, color: C.accent, fontWeight: '700' },

  scrollDown: {
    position: 'absolute',
    right: 12,
    bottom: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: T.card,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.shadow,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
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

  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingLeft: 16,
    paddingRight: 4,
    paddingVertical: 6,
    backgroundColor: T.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  plateBody: { flex: 1, borderLeftWidth: 2, borderLeftColor: C.accent, paddingLeft: 8 },
  plateLabel: { fontSize: 13, fontWeight: '700', color: C.accent },
  plateText: { fontSize: 14, color: C.text },
  plateClose: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 4,
    backgroundColor: T.card,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
  },
  attachBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 140,
    paddingHorizontal: 14,
    paddingTop: Platform.OS === 'ios' ? 11 : 9,
    paddingBottom: Platform.OS === 'ios' ? 11 : 9,
    borderRadius: 21,
    backgroundColor: T.inputBg,
    fontSize: 16,
    color: C.text,
  },
  sendBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginLeft: 2, marginBottom: 1 },

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
