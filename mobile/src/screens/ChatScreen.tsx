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
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  FileText,
  Plus,
  Check,
  Clock,
  CheckCheck,
  AlertCircle,
  CalendarClock,
} from 'lucide-react-native';
import PollBubble, { PollGlyph } from '../components/PollBubble';
import NoteShareBubble from '../components/NoteShareBubble';
import { TOPIC_ICONS, hexToRgba } from '../theme/topicIcons';
import { SERVER_URL } from '../config';
import { api } from '../services/api';
import { request, signedFileUrl, upload } from '../services/http';
import { joinChat, makeClientId, sendMessage, subscribe } from '../services/socket';
import DateTimePickerModal from '../components/DateTimePickerModal';
import { pick, types, isErrorWithCode, errorCodes } from '@react-native-documents/picker';

type ChatRouteProp = RouteProp<
  { params: { chatId: string; chatName: string; topicId?: number | null; messageId?: number } },
  'params'
>;

const AVATAR_COLORS = [
  '#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899',
  '#F59E0B', '#0EA5E9', '#14B8A6', '#EF4444',
];

const hashColor = (s: string) => {
  const sum = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const initials = (name: string) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const formatTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const dayLabel = (d: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Сегодня';
  if (d.toDateString() === yesterday.toDateString()) return 'Вчера';
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

type SendStatus = 'sending' | 'sent' | 'failed';

/** Сообщение на экране: серверное или ещё отправляющееся (локальное). */
type ChatMessage = any & { client_id?: string | null; status?: SendStatus; local?: boolean };

const draftKey = (chatId: string, topicId: number | null) => `@offix/draft/${chatId}/${topicId ?? 'main'}`;

export default function ChatScreen({ navigation }: any) {
  const route = useRoute<ChatRouteProp>();
  const chatId = route.params.chatId;
  const chatName = route.params.chatName || 'Чат';
  const topicId = route.params.topicId ?? null;
  const initialMessageId = route.params.messageId;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [uploading, setUploading] = useState(false);

  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState(0);

  const [forwardMessage, setForwardMessage] = useState<ChatMessage | null>(null);
  const [availableChats, setAvailableChats] = useState<any[]>([]);
  const [topicMeta, setTopicMeta] = useState<any>(null);

  // ===== Вложения (меню скрепки) =====
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // ===== Отложенная отправка =====
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [showScheduledList, setShowScheduledList] = useState(false);

  // ===== Опросы =====
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [pollAnonymous, setPollAnonymous] = useState(false);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [pollQuiz, setPollQuiz] = useState(false);
  const [pollCorrectIndex, setPollCorrectIndex] = useState<number | null>(null);
  const [sendingPoll, setSendingPoll] = useState(false);

  const [membersMap, setMembersMap] = useState<Record<number, { display_name: string; username: string }>>({});

  const flatListRef = useRef<FlatList>(null);
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listItemsRef = useRef<any[]>([]);

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

  const loadMessages = useCallback(async () => {
    try {
      const data = await request<ChatMessage[]>(`/api/messages/${chatId}`, {
        query: { topic_id: topicId ?? undefined, limit: 300 },
      });
      const enriched = await Promise.all(data.filter((m) => !m.deleted_for_all).map(withPoll));
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

  const loadPinned = useCallback(async () => {
    try {
      setPinnedMessages(await request<any[]>(`/api/messages/${chatId}/pinned`, { query: { topic_id: topicId ?? undefined } }));
    } catch {
      // закреп — второстепенная информация, экран работает и без неё
    }
  }, [chatId, topicId]);

  const loadScheduled = useCallback(async () => {
    try {
      setScheduled(await request<any[]>(`/api/chats/${chatId}/scheduled`, { query: { topic_id: topicId ?? undefined } }));
    } catch {
      setScheduled([]);
    }
  }, [chatId, topicId]);

  const loadMembers = useCallback(async () => {
    try {
      const list = await request<any[]>(`/api/chats/${chatId}/members`);
      const map: Record<number, { display_name: string; username: string }> = {};
      list.forEach((m) => {
        map[m.id] = { display_name: m.display_name || '', username: m.username || '' };
      });
      setMembersMap(map);
    } catch {
      // имена отправителей приходят и в самих сообщениях
    }
  }, [chatId]);

  useEffect(() => {
    api.getCurrentUser().then((me) => setCurrentUserId(me.id)).catch(() => undefined);
    loadMessages();
    loadPinned();
    loadMembers();
    loadScheduled();
  }, [loadMessages, loadPinned, loadMembers, loadScheduled]);

  // ===== Черновик: сохраняется при наборе, восстанавливается при входе =====
  useEffect(() => {
    AsyncStorage.getItem(draftKey(chatId, topicId))
      .then((d) => d && setText((cur) => cur || d))
      .catch(() => undefined);
  }, [chatId, topicId]);

  const onChangeText = (value: string) => {
    setText(value);
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

    const unsubs = [
      subscribe('new_message', async (msg: any) => {
        if (!belongsHere(msg)) return;
        const full = await withPoll(msg);
        setMessages((prev) => {
          // Подтверждение нашей же отправки: заменяем локальную копию.
          if (full.client_id && prev.some((m) => m.client_id === full.client_id)) {
            return prev.map((m) => (m.client_id === full.client_id ? { ...full, status: 'sent' } : m));
          }
          if (prev.some((m) => m.id === full.id)) return prev;
          return [...prev, full];
        });
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
    ];
    return () => {
      unsubs.forEach((u) => u());
      leave?.();
    };
  }, [chatId, topicId, loadPinned, loadScheduled, withPoll]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  useEffect(() => {
    if (!loading && initialMessageId) {
      const idx = listItemsRef.current.findIndex((m: any) => m.id === initialMessageId);
      if (idx >= 0) {
        setTimeout(() => flatListRef.current?.scrollToIndex({ index: idx, animated: true }), 200);
      }
    }
  }, [loading, initialMessageId]);

  // ===== Метаданные топика (иконка в шапке) =====
  useEffect(() => {
    if (!topicId) return;
    request<any[]>(`/api/chats/${chatId}/topics`)
      .then((topics) => setTopicMeta(topics.find((x) => x.id === topicId) || null))
      .catch(() => undefined);
  }, [chatId, topicId]);

  // ===== Отправка =====

  /** Отправляет (или повторяет отправку) локального сообщения. */
  const deliver = async (local: ChatMessage) => {
    setMessages((prev) => prev.map((m) => (m.client_id === local.client_id ? { ...m, status: 'sending' } : m)));
    try {
      const saved = await sendMessage({
        chatId,
        text: local.text,
        reply_to_message_id: local.reply_to_message_id ?? null,
        topic_id: topicId,
        client_id: local.client_id,
      });
      setMessages((prev) => {
        // Сообщение могло уже прийти по сокету — тогда локальную копию просто убираем.
        if (prev.some((m) => m.id === saved.id && m.client_id === local.client_id && !m.local)) {
          return prev.filter((m) => !(m.local && m.client_id === local.client_id));
        }
        return prev.map((m) => (m.client_id === local.client_id ? { ...saved, status: 'sent' } : m));
      });
    } catch {
      setMessages((prev) => prev.map((m) => (m.client_id === local.client_id ? { ...m, status: 'failed' } : m)));
    }
  };

  const handleSend = async () => {
    const t = text.trim();
    if (!t) return;

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

    const local: ChatMessage = {
      id: `local-${makeClientId()}`,
      local: true,
      client_id: makeClientId(),
      status: 'sending',
      chat_id: chatId,
      topic_id: topicId,
      sender_id: currentUserId,
      text: t,
      reply_to_message_id: replyTo?.id ?? null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, local]);
    setReplyTo(null);
    setText('');
    clearDraft();
    deliver(local);
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

  const onSendLongPress = () => {
    if (!text.trim() || editingMessage) return;
    setShowSchedulePicker(true);
  };

  const pickAndSendFile = async () => {
    try {
      const [file] = await pick({ type: [types.allFiles], allowMultiSelection: false });
      if (!file?.uri) return;
      setUploading(true);
      await upload(
        '/api/upload',
        'file',
        { uri: file.uri, name: file.name || 'file', type: file.type },
        { chatId, topicId: topicId ?? undefined, client_id: makeClientId() },
      );
    } catch (err: any) {
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return;
      Alert.alert('Не удалось отправить файл', err?.message || 'Попробуйте ещё раз');
    } finally {
      setUploading(false);
    }
  };

  // ===== Отправка опроса =====
  const sendPoll = async () => {
    const q = pollQuestion.trim();
    const cleaned: string[] = [];
    let correctIdx: number | null = null;
    pollOptions.forEach((o, i) => {
      const t = o.trim();
      if (t) {
        if (pollQuiz && i === pollCorrectIndex) correctIdx = cleaned.length;
        cleaned.push(t);
      }
    });
    if (!q) return Alert.alert('Ошибка', 'Введите вопрос');
    if (cleaned.length < 2) return Alert.alert('Ошибка', 'Нужно минимум 2 варианта ответа');
    if (pollQuiz && correctIdx === null) return Alert.alert('Ошибка', 'Отметьте правильный ответ');

    setSendingPoll(true);
    try {
      await request('/api/polls', {
        method: 'POST',
        body: {
          chat_id: Number(chatId),
          topic_id: topicId,
          question: q,
          options: cleaned,
          is_anonymous: pollAnonymous,
          allows_multiple: pollMultiple,
          is_quiz: pollQuiz,
          correct_option_index: correctIdx,
        },
      });
      setPollQuestion('');
      setPollOptions(['', '']);
      setPollQuiz(false);
      setPollMultiple(false);
      setPollAnonymous(false);
      setPollCorrectIndex(null);
      setShowPollModal(false);
      // Сам опрос придёт всем участникам по сокету.
    } catch (e: any) {
      Alert.alert('Не удалось создать опрос', e?.message || 'Попробуйте ещё раз');
    } finally {
      setSendingPoll(false);
    }
  };

  const deleteMessage = async (target: ChatMessage, scope: 'me' | 'all') => {
    try {
      await request(`/api/messages/${target.id}`, { method: 'DELETE', query: { scope } });
      setMessages((prev) => prev.filter((m) => m.id !== target.id));
    } catch (e: any) {
      Alert.alert('Не удалось удалить', e?.message || 'Попробуйте ещё раз');
    }
  };

  const togglePin = async () => {
    if (!selectedMessage) return;
    const target = selectedMessage;
    setSelectedMessage(null);
    try {
      await request(`/api/messages/${target.id}/${target.pinned ? 'unpin' : 'pin'}`, { method: 'POST' });
      setMessages((prev) => prev.map((m) => (m.id === target.id ? { ...m, pinned: !target.pinned } : m)));
      loadPinned();
    } catch (e: any) {
      Alert.alert('Не удалось', e?.message || 'Попробуйте ещё раз');
    }
  };

  const startEdit = () => {
    if (!selectedMessage) return;
    setEditingMessage(selectedMessage);
    setText(selectedMessage.text || '');
    setSelectedMessage(null);
  };

  const startReply = () => {
    if (!selectedMessage) return;
    setReplyTo(selectedMessage);
    setSelectedMessage(null);
  };

  const startForward = () => {
    if (!selectedMessage) return;
    setForwardMessage(selectedMessage);
    setSelectedMessage(null);
    request<any[]>('/api/chats').then(setAvailableChats).catch(() => setAvailableChats([]));
  };

  const handleForward = async (toChatId: number) => {
    const target = forwardMessage;
    setForwardMessage(null);
    if (!target) return;
    try {
      await request('/api/messages/forward', { method: 'POST', body: { messageId: target.id, toChatId } });
      Alert.alert('Готово', 'Сообщение переслано');
    } catch (e: any) {
      Alert.alert('Не удалось переслать', e?.message || 'Попробуйте ещё раз');
    }
  };

  const showPinned = (index: number) => {
    const msg = pinnedMessages[index];
    if (!msg) return;
    const idx = listItemsRef.current.findIndex((m: any) => m.id === msg.id);
    if (idx >= 0) flatListRef.current?.scrollToIndex({ index: idx, animated: true });
    setCurrentPinnedIndex((index + 1) % pinnedMessages.length);
  };

  const findMessageById = (id: number) => messages.find((m) => m.id === id);

  const openInfo = () => {
    if (topicId) {
      navigation.navigate('TopicInfo', { chatId, topicId });
    } else {
      navigation.navigate('ChatInfo', { chatId });
    }
  };

  const openFile = async (m: any) => {
    if (!m.file_url) return;
    try {
      // Файлы чатов защищены: открываем по подписанной ссылке на 10 минут.
      await Linking.openURL(await signedFileUrl(m.file_url));
    } catch (e: any) {
      Alert.alert('Не удалось открыть файл', e?.message || '');
    }
  };

  const listItems = useMemo(() => {
    const out: any[] = [];
    let lastDay = '';
    for (const m of messages) {
      const d = new Date(m.created_at);
      const day = d.toDateString();
      if (day !== lastDay) {
        lastDay = day;
        out.push({ divider: true, id: `div-${day}`, label: dayLabel(d) });
      }
      out.push(m);
    }
    return out;
  }, [messages]);
  listItemsRef.current = listItems;

  const isMineMsg = (m: any) => m.sender_id === currentUserId;


  // ===== Хелпер: имя отправителя с фолбэком на membersMap =====
  const senderNameOf = (m: any): string => {
    if (m.sender_display_name) return m.sender_display_name;
    if (m.sender_name) return m.sender_name;
    const u = membersMap[m.sender_id];
    if (u) return u.display_name || u.username || 'Участник';
    return 'Участник';
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

  const renderMessage = (m: any) => {
    const mine = isMineMsg(m);
    const senderName = senderNameOf(m);
    const replied = m.reply_to_message_id ? findMessageById(m.reply_to_message_id) : null;

    return (
      <View style={[styles.msgRow, mine && styles.msgRowMine]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={() => (m.local ? retryOrDiscard(m) : setSelectedMessage(m))}
          onPress={m.status === 'failed' ? () => retryOrDiscard(m) : undefined}
          style={m.poll ? { maxWidth: '100%' } : [styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}
        >
          {!mine && (
            <Text style={[styles.senderName, { color: hashColor(senderName) }]}>
              {senderName}
            </Text>
          )}

          {m.forwarded_from_user_id ? (
            <Text style={[styles.forwardedLabel, mine && styles.forwardedLabelMine]} numberOfLines={1}>
              Переслано от {m.forwarded_from_name || 'участника'}
            </Text>
          ) : null}

          {m.reply_to_message_id && (
            <View style={[styles.quoteBox, mine && styles.quoteBoxMine]}>
              {replied ? (
                <>
                  <Text style={[styles.quoteName, mine && styles.quoteNameMine]}>
                    {senderNameOf(replied)}
                  </Text>
                  <Text style={[styles.quoteText, mine && styles.quoteTextMine]} numberOfLines={2}>
                    {replied.text || '📎 Вложение'}
                  </Text>
                </>
              ) : m.external_reply_chat_id ? (
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('Chat', {
                      chatId: String(m.external_reply_chat_id),
                      chatName: 'Другой чат',
                      messageId: m.reply_to_message_id,
                    })
                  }
                >
                  <Text style={[styles.quoteText, mine && styles.quoteTextMine]}>
                    Сообщение из другого чата
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={[styles.quoteText, mine && styles.quoteTextMine]}>
                  Исходное сообщение удалено
                </Text>
              )}
            </View>
          )}

          {/* ОПРОС */}
          {m.poll && (
            <PollBubble
              poll={m.poll}
              myVotes={m.my_votes || []}
              currentUserId={currentUserId || 0}
              isMine={mine}
            />
          )}

          {/* ЗАМЕТКА */}
          {m.note_share && (
            <NoteShareBubble
              card={m.note_share}
              mine={mine}
              currentUserId={currentUserId || 0}
              onAccepted={(noteId) => onNoteAccepted(m.id, noteId)}
            />
          )}

          {/* Вложение */}
          {m.file_url ? (
            m.thumb_url ? (
              <TouchableOpacity onPress={() => openFile(m)}>
                <Image source={{ uri: SERVER_URL + m.thumb_url }} style={styles.msgImage} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => openFile(m)} style={[styles.fileBox, mine && styles.fileBoxMine]}>
                <View style={[styles.fileIconWrap, mine && styles.fileIconWrapMine]}>
                  <FileText size={20} color={mine ? '#FFFFFF' : '#1F7A52'} strokeWidth={2} />
                </View>
                <Text style={[styles.fileName, mine && styles.fileNameMine]} numberOfLines={1}>
                  {m.file_name || 'Файл'}
                </Text>
              </TouchableOpacity>
            )
          ) : null}

          {m.text && !m.poll && !m.note_share ? (
            <Text style={[styles.msgText, mine && styles.msgTextMine]}>{m.text}</Text>
          ) : null}

          <View style={styles.msgMeta}>
            {m.edited_at && (
              <Text style={[styles.metaText, mine && styles.metaTextMine]}>изменено · </Text>
            )}
            <Text style={[styles.metaText, mine && styles.metaTextMine]}>
              {formatTime(m.created_at)}
            </Text>
            {mine && m.status === 'sending' && <Clock size={12} color="rgba(255,255,255,0.8)" style={{ marginLeft: 4 }} />}
            {mine && (!m.status || m.status === 'sent') && <CheckCheck size={13} color="rgba(255,255,255,0.85)" style={{ marginLeft: 4 }} />}
            {mine && m.status === 'failed' && <AlertCircle size={13} color="#FECACA" style={{ marginLeft: 4 }} />}
          </View>
          {m.status === 'failed' && <Text style={styles.failedHint}>Не отправлено · нажмите, чтобы повторить</Text>}
        </TouchableOpacity>
      </View>
    );
  };

  const renderItem = ({ item }: any) =>
    item.divider ? (
      <View style={styles.dayDivider}>
        <Text style={styles.dayDividerText}>{item.label}</Text>
      </View>
    ) : (
      renderMessage(item)
    );

  const isMineSelected = selectedMessage && selectedMessage.sender_id === currentUserId;

  // ===== Иконка топика или аватар группы =====
  const renderHeaderAvatar = () => {
    if (topicMeta) {
      const Icon = TOPIC_ICONS[topicMeta.icon] || TOPIC_ICONS.hash;
      const color = topicMeta.icon_color || '#1F7A52';
      const opacity = topicMeta.icon_opacity ?? 1;
      return (
        <View style={[styles.headerAvatar, { backgroundColor: hexToRgba(color, 0.12) }]}>
          <Icon size={22} color={color} strokeWidth={2} style={{ opacity }} />
        </View>
      );
    }
    return (
      <View style={[styles.headerAvatar, { backgroundColor: hashColor(chatName) }]}>
        <Text style={styles.headerAvatarText}>{initials(chatName)}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>

        <TouchableOpacity
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          activeOpacity={0.7}
          onPress={openInfo}
        >
          {renderHeaderAvatar()}
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle} numberOfLines={1}>{chatName}</Text>
            <Text style={styles.headerSubtitle}>{topicId ? 'топик' : 'в сети'}</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity onPress={openInfo} style={styles.headerBtn}>
          <MoreVertical size={22} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* ===== ЗАКРЕП ===== */}
      {pinnedMessages.length > 0 && (
        <TouchableOpacity
          style={styles.pinnedBar}
          onPress={() => showPinned(currentPinnedIndex)}
          activeOpacity={0.7}
        >
          <Pin size={16} color="#1F7A52" strokeWidth={2} />
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.pinnedLabel}>Закреплённое сообщение</Text>
            <Text style={styles.pinnedText} numberOfLines={1}>
              {pinnedMessages[currentPinnedIndex]?.text || '📎 Вложение'}
            </Text>
          </View>
          {pinnedMessages.length > 1 && (
            <Text style={styles.pinnedCounter}>
              {currentPinnedIndex + 1}/{pinnedMessages.length}
            </Text>
          )}
        </TouchableOpacity>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#1F7A52" />
          </View>
        ) : loadError && messages.length === 0 ? (
          <View style={styles.loadingWrap}>
            <Text style={styles.plateText}>{loadError}</Text>
            <TouchableOpacity onPress={loadMessages} style={{ marginTop: 12 }}>
              <Text style={styles.plateLabel}>Повторить</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={listItems}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            onScrollToIndexFailed={() => flatListRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* ===== ПЛАШКА ОТВЕТА ===== */}
        {replyTo && (
          <View style={styles.plate}>
            <CornerUpLeft size={16} color="#1F7A52" strokeWidth={2} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.plateLabel}>Ответ:</Text>
              <Text style={styles.plateText} numberOfLines={1}>
                {replyTo.text || '📎 Вложение'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.plateClose}>
              <X size={18} color="#6F6F73" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}
        {editingMessage && (
          <View style={styles.plate}>
            <Pencil size={16} color="#1F7A52" strokeWidth={2} />
            <View style={{ flex: 1, marginLeft: 8 }}>
              <Text style={styles.plateLabel}>Редактирование:</Text>
              <Text style={styles.plateText} numberOfLines={1}>
                {editingMessage.text}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => { setEditingMessage(null); setText(''); }}
              style={styles.plateClose}
            >
              <X size={18} color="#6F6F73" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* ===== ЗАПЛАНИРОВАННЫЕ ===== */}
        {scheduled.length > 0 && (
          <TouchableOpacity style={styles.plate} onPress={() => setShowScheduledList(true)} activeOpacity={0.7}>
            <CalendarClock size={16} color="#1F7A52" strokeWidth={2} />
            <Text style={[styles.plateLabel, { flex: 1, marginLeft: 8 }]}>
              Запланировано: {scheduled.length}
            </Text>
            <Text style={styles.plateText}>Открыть</Text>
          </TouchableOpacity>
        )}

        {/* ===== ВВОД ===== */}
        <View style={styles.inputBar}>
          <TouchableOpacity
            onPress={() => setShowAttachMenu(true)}
            disabled={uploading}
            style={styles.attachBtn}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#1F7A52" />
            ) : (
              <Paperclip size={20} color="#6F6F73" strokeWidth={2} />
            )}
          </TouchableOpacity>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={onChangeText}
            placeholder="Сообщение..."
            placeholderTextColor="#BDBDBD"
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            onPress={handleSend}
            onLongPress={onSendLongPress}
            delayLongPress={350}
            disabled={!text.trim()}
            style={[styles.sendBtn, { backgroundColor: text.trim() ? '#1F7A52' : '#ECECE8' }]}
          >
            <SendHorizonal size={18} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ===== МЕНЮ СКРЕПКИ ===== */}
      <Modal visible={showAttachMenu} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowAttachMenu(false)}
          style={styles.sheetOverlay}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>ВЛОЖЕНИЯ</Text>

            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => { setShowAttachMenu(false); pickAndSendFile(); }}
              activeOpacity={0.7}
            >
              <View style={[styles.sheetRowIcon, { backgroundColor: '#ECFDF5' }]}>
                <Paperclip size={18} color="#1F7A52" strokeWidth={2} />
              </View>
              <Text style={styles.sheetRowText}>Файл или фото</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => { setShowAttachMenu(false); setShowPollModal(true); }}
              activeOpacity={0.7}
            >
              <View style={[styles.sheetRowIcon, { backgroundColor: '#ECFDF5' }]}>
                <PollGlyph width={16} color="#1F7A52" />
              </View>
              <Text style={styles.sheetRowText}>Опрос</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== МОДАЛКА СОЗДАНИЯ ОПРОСА ===== */}
      <Modal visible={showPollModal} transparent animationType="slide">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowPollModal(false)}
          style={styles.sheetOverlay}
        >
          <View style={[styles.sheet, { maxHeight: '88%' }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>НОВЫЙ ОПРОС</Text>
              <TouchableOpacity onPress={() => setShowPollModal(false)}>
                <X size={22} color="#141414" strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 440 }}>
              <TextInput
                style={styles.pollQuestionInput}
                placeholder="Задайте вопрос"
                placeholderTextColor="#BDBDBD"
                value={pollQuestion}
                onChangeText={setPollQuestion}
                maxLength={255}
                autoFocus
              />

              <Text style={styles.pollLabel}>ВАРИАНТЫ ОТВЕТОВ</Text>
              {pollOptions.map((opt, i) => (
                <View key={i} style={styles.pollOptionRow}>
                  {pollQuiz && (
                    <TouchableOpacity
                      onPress={() => setPollCorrectIndex(i)}
                      style={[styles.quizCircle, pollCorrectIndex === i && styles.quizCircleActive]}
                    >
                      {pollCorrectIndex === i && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                    </TouchableOpacity>
                  )}
                  <TextInput
                    style={styles.pollOptionInput}
                    placeholder={`Вариант ${i + 1}`}
                    placeholderTextColor="#BDBDBD"
                    value={opt}
                    onChangeText={(t) => {
                      const arr = [...pollOptions];
                      arr[i] = t;
                      setPollOptions(arr);
                    }}
                  />
                  {pollOptions.length > 2 && (
                    <TouchableOpacity
                      onPress={() => {
                        setPollOptions(pollOptions.filter((_, x) => x !== i));
                        if (pollCorrectIndex === i) setPollCorrectIndex(null);
                        else if (pollCorrectIndex !== null && i < pollCorrectIndex) {
                          setPollCorrectIndex(pollCorrectIndex - 1);
                        }
                      }}
                      style={{ padding: 6 }}
                    >
                      <X size={16} color="#BDBDBD" strokeWidth={2} />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              {pollOptions.length < 10 && (
                <TouchableOpacity
                  style={styles.addOptionBtn}
                  onPress={() => setPollOptions([...pollOptions, ''])}
                  activeOpacity={0.7}
                >
                  <Plus size={16} color="#1F7A52" strokeWidth={2.5} />
                  <Text style={styles.addOptionText}>Добавить вариант</Text>
                </TouchableOpacity>
              )}

              <View style={styles.pollSettings}>
                <View style={styles.pollSettingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pollSettingText}>Анонимное голосование</Text>
                    <Text style={styles.pollSettingHint}>Участники не увидят кто за что голосовал</Text>
                  </View>
                  <Switch
                    value={pollAnonymous}
                    onValueChange={setPollAnonymous}
                    trackColor={{ false: '#ECECE8', true: '#1F7A52' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                <View style={styles.pollSettingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pollSettingText}>Несколько ответов</Text>
                    <Text style={styles.pollSettingHint}>Можно выбрать несколько вариантов</Text>
                  </View>
                  <Switch
                    value={pollMultiple}
                    onValueChange={setPollMultiple}
                    trackColor={{ false: '#ECECE8', true: '#1F7A52' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
                <View style={styles.pollSettingRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pollSettingText}>Викторина</Text>
                    <Text style={styles.pollSettingHint}>
                      {pollQuiz ? 'Отметьте правильный ответ слева от варианта' : 'Есть один правильный ответ'}
                    </Text>
                  </View>
                  <Switch
                    value={pollQuiz}
                    onValueChange={(v) => {
                      setPollQuiz(v);
                      if (!v) setPollCorrectIndex(null);
                    }}
                    trackColor={{ false: '#ECECE8', true: '#1F7A52' }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>
            </ScrollView>

            <TouchableOpacity
              onPress={sendPoll}
              disabled={sendingPoll}
              style={[styles.pollSendBtn, { backgroundColor: sendingPoll ? '#ECECE8' : '#1F7A52' }]}
              activeOpacity={0.85}
            >
              {sendingPoll ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <PollGlyph width={16} color="#FFFFFF" />
                  <Text style={styles.pollSendText}>Создать опрос</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== КОНТЕКСТНОЕ МЕНЮ ===== */}
      <Modal visible={!!selectedMessage} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setSelectedMessage(null)}
          style={styles.sheetOverlay}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>ДЕЙСТВИЯ</Text>

            <TouchableOpacity style={styles.sheetRow} onPress={startReply} activeOpacity={0.7}>
              <View style={[styles.sheetRowIcon, { backgroundColor: '#DBEAFE' }]}>
                <CornerUpLeft size={18} color="#3B82F6" strokeWidth={2} />
              </View>
              <Text style={styles.sheetRowText}>Ответить</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetRow}
              onPress={startForward}
              activeOpacity={0.7}
            >
              <View style={[styles.sheetRowIcon, { backgroundColor: '#FEF3C7' }]}>
                <Forward size={18} color="#B45309" strokeWidth={2} />
              </View>
              <Text style={styles.sheetRowText}>Переслать</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetRow} onPress={togglePin} activeOpacity={0.7}>
              <View style={[styles.sheetRowIcon, { backgroundColor: '#ECFDF5' }]}>
                {selectedMessage?.pinned ? (
                  <PinOff size={18} color="#1F7A52" strokeWidth={2} />
                ) : (
                  <Pin size={18} color="#1F7A52" strokeWidth={2} />
                )}
              </View>
              <Text style={styles.sheetRowText}>
                {selectedMessage?.pinned ? 'Открепить' : 'Закрепить'}
              </Text>
            </TouchableOpacity>

            {isMineSelected && (
              <TouchableOpacity style={styles.sheetRow} onPress={startEdit} activeOpacity={0.7}>
                <View style={[styles.sheetRowIcon, { backgroundColor: '#F3F4F6' }]}>
                  <Pencil size={18} color="#6F6F73" strokeWidth={2} />
                </View>
                <Text style={styles.sheetRowText}>Изменить</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                const target = selectedMessage;
                setSelectedMessage(null);
                Alert.alert('Удалить сообщение?', 'Оно исчезнет только у вас', [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Удалить', style: 'destructive', onPress: () => deleteMessage(target, 'me') },
                ]);
              }}
              activeOpacity={0.7}
            >
              <View style={[styles.sheetRowIcon, { backgroundColor: '#FEE2E2' }]}>
                <Trash2 size={18} color="#DC2626" strokeWidth={2} />
              </View>
              <Text style={[styles.sheetRowText, { color: '#DC2626' }]}>Удалить у меня</Text>
            </TouchableOpacity>

            {isMineSelected && (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  const target = selectedMessage;
                  setSelectedMessage(null);
                  Alert.alert('Удалить у всех?', 'Сообщение исчезнет у всех участников', [
                    { text: 'Отмена', style: 'cancel' },
                    { text: 'Удалить', style: 'destructive', onPress: () => deleteMessage(target, 'all') },
                  ]);
                }}
                activeOpacity={0.7}
              >
                <View style={[styles.sheetRowIcon, { backgroundColor: '#7F1D1D' }]}>
                  <Trash2 size={18} color="#FFFFFF" strokeWidth={2} />
                </View>
                <Text style={[styles.sheetRowText, { color: '#7F1D1D' }]}>Удалить у всех</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== ОТЛОЖЕННАЯ ОТПРАВКА (долгое нажатие на «Отправить») ===== */}
      <DateTimePickerModal
        visible={showSchedulePicker}
        initialDate={new Date(Date.now() + 60 * 60 * 1000)}
        minDate={new Date()}
        title="Отправить позже"
        onClose={() => setShowSchedulePicker(false)}
        onSave={scheduleMessage}
      />

      <Modal visible={showScheduledList} transparent animationType="slide" onRequestClose={() => setShowScheduledList(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setShowScheduledList(false)} style={styles.sheetOverlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>ЗАПЛАНИРОВАННЫЕ СООБЩЕНИЯ</Text>
            <FlatList
              data={scheduled}
              keyExtractor={(item) => String(item.id)}
              style={{ maxHeight: 360 }}
              ListEmptyComponent={<Text style={styles.plateText}>Нет запланированных сообщений</Text>}
              renderItem={({ item }) => (
                <View style={styles.scheduledRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.scheduledTime}>
                      {new Date(item.send_at).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={styles.sheetRowText} numberOfLines={2}>{item.text}</Text>
                  </View>
                  <TouchableOpacity onPress={() => sendScheduledNow(item.id)} style={styles.scheduledBtn}>
                    <SendHorizonal size={16} color="#1F7A52" strokeWidth={2} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() =>
                      Alert.alert('Отменить отправку?', item.text, [
                        { text: 'Нет', style: 'cancel' },
                        { text: 'Отменить', style: 'destructive', onPress: () => cancelScheduled(item.id) },
                      ])
                    }
                    style={styles.scheduledBtn}
                  >
                    <Trash2 size={16} color="#DC2626" strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              )}
            />
            <Text style={[styles.plateText, { marginTop: 8 }]}>
              Чтобы запланировать: напишите текст и удерживайте кнопку отправки.
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== ПЕРЕСЫЛКА ===== */}
      <Modal visible={!!forwardMessage} transparent animationType="fade" onRequestClose={() => setForwardMessage(null)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setForwardMessage(null)}
          style={styles.sheetOverlay}
        >
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>ПЕРЕСЛАТЬ В...</Text>
            <FlatList
              data={availableChats}
              keyExtractor={(item) => String(item.id)}
              style={{ maxHeight: 320 }}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={() => handleForward(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.forwardAvatar, { backgroundColor: hashColor(item.name) }]}>
                    <Text style={styles.forwardAvatarText}>{initials(item.name)}</Text>
                  </View>
                  <Text style={styles.sheetRowText} numberOfLines={1}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  forwardedLabel: { fontSize: 12, fontStyle: 'italic', color: '#1F7A52', marginBottom: 4 },
  forwardedLabelMine: { color: 'rgba(255,255,255,0.85)' },
  failedHint: { fontSize: 11, color: '#DC2626', marginTop: 4, textAlign: 'right' },
  scheduledRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#ECECE8' },
  scheduledTime: { fontSize: 12, fontWeight: '700', color: '#1F7A52', marginBottom: 2 },
  scheduledBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  container: { flex: 1, backgroundColor: '#FAFAF8' },

  // ===== HEADER =====
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECE8',
    gap: 10,
  },
  headerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#141414' },
  headerSubtitle: { fontSize: 12, color: '#6F6F73', fontWeight: '500' },

  // ===== PINNED =====
  pinnedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  pinnedLabel: { fontSize: 11, fontWeight: '700', color: '#1F7A52' },
  pinnedText: { fontSize: 13, color: '#141414', fontWeight: '500' },
  pinnedCounter: { fontSize: 12, color: '#1F7A52', fontWeight: '600', marginLeft: 8 },

  // ===== LIST =====
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: 16, paddingBottom: 24 },

  dayDivider: { alignItems: 'center', marginVertical: 12 },
  dayDividerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6F6F73',
    backgroundColor: '#ECECE8',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },

  // ===== BUBBLES =====
  msgRow: { flexDirection: 'row', marginBottom: 8 },
  msgRowMine: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleOther: {
    backgroundColor: '#FFFFFF',
    borderBottomLeftRadius: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  bubbleMine: {
    backgroundColor: '#1F7A52',
    borderBottomRightRadius: 6,
  },
  senderName: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  msgText: { fontSize: 15, color: '#141414', lineHeight: 21, fontWeight: '500' },
  msgTextMine: { color: '#FFFFFF' },
  msgMeta: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  metaText: { fontSize: 11, color: '#BDBDBD', fontWeight: '500' },
  metaTextMine: { color: 'rgba(255,255,255,0.7)' },

  quoteBox: {
    borderLeftWidth: 3,
    borderLeftColor: '#1F7A52',
    backgroundColor: '#FAFAF8',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  quoteBoxMine: {
    borderLeftColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  quoteName: { fontSize: 12, fontWeight: '700', color: '#1F7A52' },
  quoteNameMine: { color: '#FFFFFF' },
  quoteText: { fontSize: 13, color: '#6F6F73' },
  quoteTextMine: { color: 'rgba(255,255,255,0.85)' },

  msgImage: { width: 220, height: 160, borderRadius: 12, marginBottom: 6 },
  fileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAF8',
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    gap: 10,
  },
  fileBoxMine: { backgroundColor: 'rgba(255,255,255,0.15)' },
  fileIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileIconWrapMine: { backgroundColor: 'rgba(255,255,255,0.2)' },
  fileName: { fontSize: 13, fontWeight: '600', color: '#141414', flex: 1 },
  fileNameMine: { color: '#FFFFFF' },

  // ===== PLATES =====
  plate: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#ECECE8',
  },
  plateLabel: { fontSize: 11, fontWeight: '700', color: '#1F7A52' },
  plateText: { fontSize: 13, color: '#6F6F73', fontWeight: '500' },
  plateClose: { padding: 4 },

  // ===== INPUT =====
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#ECECE8',
  },
  attachBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#FAFAF8',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#ECECE8',
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#141414',
    maxHeight: 100,
    fontWeight: '500',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ===== SHEETS =====
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 32,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ECECE8',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sheetTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 22,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: 1,
    marginBottom: 12,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  sheetRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetRowText: { fontSize: 15, fontWeight: '600', color: '#141414', flex: 1 },
  forwardAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },

  // ===== ОПРОС =====
  pollQuestionInput: {
    fontSize: 17,
    fontWeight: '700',
    color: '#141414',
    backgroundColor: '#FAFAF8',
    borderWidth: 1,
    borderColor: '#ECECE8',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  pollLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6F6F73',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  pollOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  pollOptionInput: {
    flex: 1,
    fontSize: 14,
    color: '#141414',
    backgroundColor: '#FAFAF8',
    borderWidth: 1,
    borderColor: '#ECECE8',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quizCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#BDBDBD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quizCircleActive: {
    backgroundColor: '#1F7A52',
    borderColor: '#1F7A52',
  },
  addOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  addOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F7A52',
  },
  pollSettings: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECECE8',
    gap: 4,
  },
  pollSettingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    gap: 12,
  },
  pollSettingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#141414',
  },
  pollSettingHint: {
    fontSize: 11,
    color: '#6F6F73',
    marginTop: 2,
  },
  pollSendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 18,
    marginTop: 16,
  },
  pollSendText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});