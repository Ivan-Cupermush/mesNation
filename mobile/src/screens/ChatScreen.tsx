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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import { io } from 'socket.io-client';
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
  Image as ImageIcon,
} from 'lucide-react-native';
import { getToken, SERVER_URL } from '../utils';
import { api } from '../services/api';
import { pick, types, isCancel } from '@react-native-documents/picker';

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

export default function ChatScreen({ navigation }: any) {
  const route = useRoute<ChatRouteProp>();
  const chatId = route.params.chatId;
  const chatName = route.params.chatName || 'Чат';
  const topicId = route.params.topicId ?? null;
  const initialMessageId = route.params.messageId;

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);

  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [uploading, setUploading] = useState(false);

  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState(0);

  const [showForwardModal, setShowForwardModal] = useState(false);
  const [availableChats, setAvailableChats] = useState<any[]>([]);

  const socketRef = useRef<any>(null);
  const flatListRef = useRef<FlatList>(null);

  // ===== Загрузка =====
  const loadMessages = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const url = `${SERVER_URL}/api/messages/${chatId}${topicId ? `?topic_id=${topicId}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        const filtered = data.filter((m: any) => {
          if (m.deleted_for_all) return false;
          const del = m.deleted_for_user_ids;
          if (Array.isArray(del) && currentUserId && del.includes(currentUserId)) return false;
          return true;
        });
        setMessages(filtered);
      }
    } catch (e) {}
    setLoading(false);
  }, [chatId, topicId, currentUserId]);

  const loadPinned = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const url = `${SERVER_URL}/api/messages/${chatId}/pinned${topicId ? `?topic_id=${topicId}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setPinnedMessages(await res.json());
    } catch (e) {}
  }, [chatId, topicId]);

  useEffect(() => {
    (async () => {
      try {
        const me = await api.getCurrentUser();
        setCurrentUserId(me.id);
      } catch (e) {}
    })();
  }, []);

  useEffect(() => {
    if (currentUserId !== null) loadMessages();
  }, [currentUserId, loadMessages]);

  useEffect(() => {
    loadPinned();
  }, [loadPinned]);

  // ===== WebSocket =====
  useEffect(() => {
    const socket = io(SERVER_URL);
    socketRef.current = socket;
    socket.emit('join_chat', chatId);

    socket.on('new_message', (msg: any) => {
      if (String(msg.chat_id) !== String(chatId)) return;
      const msgTopic = msg.topic_id ?? null;
      if (msgTopic !== topicId) return;
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
    });
    socket.on('message_deleted', ({ id }: { id: number }) => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    });
    socket.on('message_pinned', () => loadPinned());
    socket.on('message_unpinned', () => loadPinned());

    return () => {
      socket.emit('leave_chat', chatId);
      socket.disconnect();
    };
  }, [chatId, topicId, loadPinned]);

  // Автоскролл вниз
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // Скролл к сообщению (переход из пересылки/закрепа)
  useEffect(() => {
    if (!loading && initialMessageId) {
      const idx = messages.findIndex((m) => m.id === initialMessageId);
      if (idx >= 0) {
        setTimeout(() => flatListRef.current?.scrollToIndex({ index: idx, animated: true }), 200);
      }
    }
  }, [loading, initialMessageId, messages]);

  // ===== Действия =====
  const handleSend = async () => {
    const t = text.trim();
    if (!t) return;

    if (editingMessage) {
      try {
        const token = await getToken();
        const res = await fetch(`${SERVER_URL}/api/messages/${editingMessage.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: t }),
        });
        if (res.ok) {
          const updated = await res.json();
          setMessages((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated, edited: true } : m)),
          );
        } else {
          Alert.alert('Ошибка', 'Не удалось изменить сообщение');
        }
      } catch (e) {
        Alert.alert('Ошибка', 'Сервер недоступен');
      }
      setEditingMessage(null);
      setText('');
      return;
    }

    const payload: any = { chatId, senderId: currentUserId, text: t };
    if (replyTo) payload.reply_to_message_id = replyTo.id;
    if (topicId) payload.topic_id = topicId;
    socketRef.current?.emit('send_message', payload);
    setReplyTo(null);
    setText('');
  };

  const pickAndSendFile = async () => {
    try {
      const result = await pick({
        type: [types.allFiles],
        allowMultiSelection: false,
        copyTo: 'cachesDirectory',
      });
      const file = result[0];
      if (!file || !file.uri) return;

      setUploading(true);
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name || 'file',
        type: file.type || 'application/octet-stream',
      } as any);
      formData.append('chatId', chatId);
      formData.append('senderId', String(currentUserId || 1));
      if (topicId) formData.append('topicId', String(topicId));

      const res = await fetch(`${SERVER_URL}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json();
        Alert.alert('Ошибка', data.error || 'Не удалось загрузить файл');
      }
    } catch (err: any) {
      if (!isCancel(err)) Alert.alert('Ошибка', 'Не удалось выбрать файл');
    } finally {
      setUploading(false);
    }
  };

  const deleteMessage = async (scope: 'me' | 'all') => {
    if (!selectedMessage) return;
    const id = selectedMessage.id;
    setSelectedMessage(null);
    try {
      const token = await getToken();
      const res = await fetch(`${SERVER_URL}/api/messages/${id}?scope=${scope}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== id));
      } else {
        Alert.alert('Ошибка', 'Не удалось удалить');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    }
  };

  const togglePin = async () => {
    if (!selectedMessage) return;
    const id = selectedMessage.id;
    const isPinned = !!selectedMessage.pinned;
    setSelectedMessage(null);
    try {
      const token = await getToken();
      await fetch(`${SERVER_URL}/api/messages/${id}/${isPinned ? 'unpin' : 'pin'}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      loadPinned();
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
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

  const loadAvailableChats = async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setAvailableChats(await res.json());
    } catch (e) {}
  };

  const handleForward = async (toChatId: number) => {
    if (!selectedMessage) return;
    try {
      const token = await getToken();
      const body: any = { messageId: selectedMessage.id, toChatId };
      if (topicId) body.topicId = topicId;
      const res = await fetch(`${SERVER_URL}/api/messages/forward`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        Alert.alert('Готово', 'Сообщение переслано');
      } else {
        const err = await res.json();
        Alert.alert('Ошибка', err.error || 'Не удалось переслать');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    }
    setShowForwardModal(false);
    setSelectedMessage(null);
  };

  const showPinned = (index: number) => {
    const msg = pinnedMessages[index];
    if (!msg) return;
    const idx = messages.findIndex((m) => m.id === msg.id);
    if (idx >= 0) flatListRef.current?.scrollToIndex({ index: idx, animated: true });
  };

  const findMessageById = (id: number) => messages.find((m) => m.id === id);

  const openInfo = () => {
    if (topicId) {
      navigation.navigate('TopicInfo', { chatId, topicId, chatName });
    } else {
      navigation.navigate('ChatInfo', { chatId });
    }
  };

  const openFile = (m: any) => {
    if (m.file_url) {
      Linking.openURL(`${SERVER_URL}${m.file_url}`).catch(() =>
        Alert.alert('Ошибка', 'Не удалось открыть файл'),
      );
    }
  };

  // ===== Список с разделителями дат =====
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

  const isMineMsg = (m: any) => m.sender_id === currentUserId;

  // ===== Рендер сообщения =====
  const renderMessage = (m: any) => {
    const mine = isMineMsg(m);
    const senderName = m.sender_name || m.sender_display_name || 'Участник';
    const replied = m.reply_to_message_id ? findMessageById(m.reply_to_message_id) : null;

    return (
      <View style={[styles.msgRow, mine && styles.msgRowMine]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onLongPress={() => setSelectedMessage(m)}
          style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleOther]}
        >
          {!mine && (
            <Text style={[styles.senderName, { color: hashColor(senderName) }]}>
              {senderName}
            </Text>
          )}

          {/* Цитата ответа */}
          {m.reply_to_message_id && (
            <View style={[styles.quoteBox, mine && styles.quoteBoxMine]}>
              {replied ? (
                <>
                  <Text style={[styles.quoteName, mine && styles.quoteNameMine]}>
                    {replied.sender_name || replied.sender_display_name || 'Участник'}
                  </Text>
                  <Text
                    style={[styles.quoteText, mine && styles.quoteTextMine]}
                    numberOfLines={2}
                  >
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

          {/* Вложение */}
          {m.file_url ? (
            m.thumb_url ? (
              <TouchableOpacity onPress={() => openFile(m)}>
                <Image
                  source={{ uri: SERVER_URL + m.thumb_url }}
                  style={styles.msgImage}
                />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity onPress={() => openFile(m)} style={[styles.fileBox, mine && styles.fileBoxMine]}>
                <View style={[styles.fileIconWrap, mine && styles.fileIconWrapMine]}>
                  <FileText size={20} color={mine ? '#FFFFFF' : '#1F7A52'} strokeWidth={2} />
                </View>
                <Text
                  style={[styles.fileName, mine && styles.fileNameMine]}
                  numberOfLines={1}
                >
                  {m.file_name || 'Файл'}
                </Text>
              </TouchableOpacity>
            )
          ) : null}

          {m.text ? (
            <Text style={[styles.msgText, mine && styles.msgTextMine]}>{m.text}</Text>
          ) : null}

          <View style={[styles.msgMeta, mine && styles.msgMetaMine]}>
            {m.edited && (
              <Text style={[styles.metaText, mine && styles.metaTextMine]}>изменено · </Text>
            )}
            <Text style={[styles.metaText, mine && styles.metaTextMine]}>
              {formatTime(m.created_at)}
            </Text>
          </View>
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
        <View style={[styles.headerAvatar, { backgroundColor: hashColor(chatName) }]}>
          <Text style={styles.headerAvatarText}>{initials(chatName)}</Text>
        </View>
        <TouchableOpacity style={styles.headerCenter} onPress={openInfo} activeOpacity={0.7}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {chatName}
          </Text>
          <Text style={styles.headerSubtitle}>{topicId ? 'топик' : 'в сети'}</Text>
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
        {/* ===== СООБЩЕНИЯ ===== */}
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#1F7A52" />
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

        {/* ===== ПЛАШКА ОТВЕТА / РЕДАКТИРОВАНИЯ ===== */}
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
              onPress={() => {
                setEditingMessage(null);
                setText('');
              }}
              style={styles.plateClose}
            >
              <X size={18} color="#6F6F73" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* ===== ВВОД ===== */}
        <View style={styles.inputBar}>
          <TouchableOpacity
            onPress={pickAndSendFile}
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
            onChangeText={setText}
            placeholder="Сообщение..."
            placeholderTextColor="#BDBDBD"
            multiline
            maxLength={4000}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!text.trim()}
            style={[styles.sendBtn, { backgroundColor: text.trim() ? '#1F7A52' : '#ECECE8' }]}
          >
            <SendHorizonal size={18} color="#FFFFFF" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
              <CornerUpLeft size={20} color="#141414" strokeWidth={2} />
              <Text style={styles.sheetRowText}>Ответить</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                loadAvailableChats();
                setShowForwardModal(true);
              }}
              activeOpacity={0.7}
            >
              <Forward size={20} color="#141414" strokeWidth={2} />
              <Text style={styles.sheetRowText}>Переслать</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.sheetRow} onPress={togglePin} activeOpacity={0.7}>
              {selectedMessage?.pinned ? (
                <PinOff size={20} color="#141414" strokeWidth={2} />
              ) : (
                <Pin size={20} color="#141414" strokeWidth={2} />
              )}
              <Text style={styles.sheetRowText}>
                {selectedMessage?.pinned ? 'Открепить' : 'Закрепить'}
              </Text>
            </TouchableOpacity>

            {isMineSelected && (
              <TouchableOpacity style={styles.sheetRow} onPress={startEdit} activeOpacity={0.7}>
                <Pencil size={20} color="#141414" strokeWidth={2} />
                <Text style={styles.sheetRowText}>Изменить</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setSelectedMessage(null);
                Alert.alert('Удалить сообщение?', 'Оно исчезнет только у вас', [
                  { text: 'Отмена', style: 'cancel' },
                  { text: 'Удалить', style: 'destructive', onPress: () => deleteMessage('me') },
                ]);
              }}
              activeOpacity={0.7}
            >
              <Trash2 size={20} color="#DC2626" strokeWidth={2} />
              <Text style={[styles.sheetRowText, { color: '#DC2626' }]}>Удалить у меня</Text>
            </TouchableOpacity>

            {isMineSelected && (
              <TouchableOpacity
                style={styles.sheetRow}
                onPress={() => {
                  setSelectedMessage(null);
                  Alert.alert('Удалить у всех?', 'Сообщение исчезнет у всех участников', [
                    { text: 'Отмена', style: 'cancel' },
                    { text: 'Удалить', style: 'destructive', onPress: () => deleteMessage('all') },
                  ]);
                }}
                activeOpacity={0.7}
              >
                <Trash2 size={20} color="#7F1D1D" strokeWidth={2} />
                <Text style={[styles.sheetRowText, { color: '#7F1D1D' }]}>Удалить у всех</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ===== ПЕРЕСЫЛКА ===== */}
      <Modal visible={showForwardModal} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            setShowForwardModal(false);
            setSelectedMessage(null);
          }}
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
                  <Text style={styles.sheetRowText} numberOfLines={1}>
                    {item.name}
                  </Text>
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
  sheetRowText: { fontSize: 15, fontWeight: '600', color: '#141414', flex: 1 },
  forwardAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forwardAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
});