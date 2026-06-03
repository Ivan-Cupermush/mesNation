import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, KeyboardAvoidingView,
  Platform, TouchableOpacity, ActivityIndicator, Alert, Modal, Image, Linking,
} from 'react-native';
import io from 'socket.io-client';
import { getToken, SERVER_URL } from '../utils';
import { getStyles } from '../styles/appStyles';
import { useTheme } from '../theme/ThemeContext';
import { pick } from '@react-native-documents/picker';

export default function ChatScreen({ route, navigation }: any) {
  const { chatId, chatName, topicId } = route.params || {};
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [forwardMessage, setForwardMessage] = useState<any>(null);
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const [forwardTargetChatId, setForwardTargetChatId] = useState<string | null>(null);
  const [forwardTargetTopicId, setForwardTargetTopicId] = useState<number | null>(null);
  const [currentPinnedIndex, setCurrentPinnedIndex] = useState(0);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [availableChats, setAvailableChats] = useState<any[]>([]);
  const [forwardTarget, setForwardTarget] = useState<{ chatId: string; topicId?: number } | null>(null);
  const [topicsForForward, setTopicsForForward] = useState<any[]>([]);
  const socketRef = useRef<any>(null);
  const flatListRef = useRef<FlatList>(null);
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const loadPinned = async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const url = `${SERVER_URL}/api/messages/${chatId}/pinned${topicId ? `?topic_id=${topicId}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setPinnedMessages(data);
        setCurrentPinnedIndex(0);
      }
    } catch (e) {}
  };

  const showPinned = (index: number) => {
    if (index >= 0 && index < pinnedMessages.length) {
      setCurrentPinnedIndex(index);
      const msgId = pinnedMessages[index].id;
      const msgIndex = messages.findIndex(m => m.id === msgId);
      if (msgIndex >= 0) {
        flatListRef.current?.scrollToIndex({ index: msgIndex, animated: true });
      }
      setTimeout(() => {
        setCurrentPinnedIndex(prev => (prev + 1) % pinnedMessages.length);
      }, 500);
    }
  };

  const loadAvailableChats = async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAvailableChats(data.filter((c: any) => c.id.toString() !== chatId));
      }
    } catch (e) {}
  };

  const loadTopicsForForward = async (chatId: string) => {
    const token = await getToken();
    try {
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/topics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setTopicsForForward(data);
      }
    } catch (e) {}
  };

  const handleExternalReplyPress = async (externalChatId: number, replyToMessageId: number) => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const chats = await res.json();
      const isMember = chats.some((c: any) => c.id === externalChatId);
      if (isMember) {
        navigation.navigate('Chat', { chatId: externalChatId.toString(), chatName: 'Исходный чат', messageId: replyToMessageId });
      } else {
        Alert.alert('Нет доступа', 'Вы не являетесь участником этого чата.');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось проверить доступ');
    }
  };

  useEffect(() => {
    if (topicId) {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={() => navigation.navigate('TopicInfo', { chatId, topicId })} style={{ padding: 8 }}>
            <Text style={{ fontSize: 22, color: '#007bff' }}>ℹ️</Text>
          </TouchableOpacity>
        ),
      });
    } else {
      navigation.setOptions({
        headerRight: () => (
          <TouchableOpacity onPress={() => navigation.navigate('ChatInfo', { chatId })} style={{ padding: 8 }}>
            <Text style={{ fontSize: 22, color: '#007bff' }}>ℹ️</Text>
          </TouchableOpacity>
        ),
      });
    }
  }, [navigation, chatId, topicId]);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: chatName,
      headerStyle: { backgroundColor: '#f8f9fa' },
      headerTintColor: '#007bff',
      headerTitleStyle: { fontWeight: '600', fontSize: 18 },
    });
  }, [navigation, chatName]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const token = await getToken();
      if (!token) return;

      let userId: number | null = null;
      try {
        const res = await fetch(`${SERVER_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
        const user = await res.json();
        if (user.id) { userId = user.id; if (mounted) setCurrentUserId(userId); }
      } catch (e) {}

      const effectiveUserId = userId || 1;
      const socket = io(SERVER_URL, { auth: { token } });
      socketRef.current = socket;
      socket.emit('join_chat', chatId);

      let url = `${SERVER_URL}/api/messages/${chatId}`;
      if (topicId) url += `?topic_id=${topicId}`;
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (res.ok && mounted) {
          const filtered = data.filter((m: any) => {
            if (m.deleted_for_all) return false;
            const deletedFor = m.deleted_for_user_ids;
            if (Array.isArray(deletedFor)) return !deletedFor.includes(effectiveUserId);
            return true;
          });
          setMessages(filtered);
          await loadPinned();
          const msgId = route.params?.messageId;
          if (msgId) {
            const index = filtered.findIndex((m: any) => m.id == msgId);
            if (index >= 0) {
              setTimeout(() => {
                flatListRef.current?.scrollToIndex({ index, animated: true });
              }, 300);
            }
          }
        }
      } catch (e) {}

      socket.on('new_message', (msg: any) => {
        if (msg.chat_id !== chatId) return;
        if (topicId && msg.topic_id !== topicId) return;
        if (mounted) {
          const isDeletedForAll = msg.deleted_for_all;
          const isDeletedForMe = Array.isArray(msg.deleted_for_user_ids) && msg.deleted_for_user_ids.includes(effectiveUserId);
          if (!isDeletedForAll && !isDeletedForMe) setMessages(prev => [...prev, msg]);
        }
      });
      socket.on('message_edited', (updated: any) => { if (mounted) setMessages(prev => prev.map(m => m.id === updated.id ? updated : m)); });
      socket.on('message_deleted', ({ id }: { id: number }) => { if (mounted) setMessages(prev => prev.filter(m => m.id !== id)); });
      socket.on('message_pinned', (data: any) => { if (mounted) { setMessages(prev => prev.map(m => m.id === data.id ? { ...m, pinned: data.pinned } : m)); loadPinned(); } });
      socket.on('message_unpinned', (data: any) => { if (mounted) { setMessages(prev => prev.map(m => m.id === data.id ? { ...m, pinned: data.pinned } : m)); loadPinned(); } });

      if (mounted) setLoading(false);

      return () => {
        mounted = false;
        socket.off('new_message'); socket.off('message_edited'); socket.off('message_deleted');
        socket.off('message_pinned'); socket.off('message_unpinned');
        socket.disconnect();
      };
    })();
    return () => { mounted = false; };
  }, [chatId, topicId]);

  const pickAndSendFile = async () => {
    try {
      const [result] = await pick({ mode: 'import' });
      if (!result) return;
      setUploading(true);
      const token = await getToken();
      const formData = new FormData();
      formData.append('file', { uri: result.uri, type: result.type || 'application/octet-stream', name: result.name || 'file' } as any);
      formData.append('chatId', chatId);
      formData.append('senderId', currentUserId?.toString() || '1');
      if (topicId) formData.append('topicId', topicId.toString());

      const res = await fetch(`${SERVER_URL}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) Alert.alert('Ошибка', data.error || 'Не удалось загрузить файл');
    } catch (err: any) {
      if (err?.code !== 'DOCUMENT_PICKER_CANCELED') Alert.alert('Ошибка', 'Не удалось выбрать файл');
    } finally { setUploading(false); }
  };
  const sendMessage = async () => {
    if (!text.trim() || !currentUserId) return;
    if (!socketRef.current) return;
    if (editingMessage) {
      const token = await getToken();
      try {
        const res = await fetch(`${SERVER_URL}/api/messages/${editingMessage.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text }),
        });
        const updated = await res.json();
        if (res.ok) setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
        else Alert.alert('Ошибка', updated.error || 'Не удалось изменить сообщение');
      } catch (e) { Alert.alert('Ошибка', 'Сервер недоступен'); }
      setEditingMessage(null);
    } else {
      const payload: any = { chatId, senderId: currentUserId, text };
      if (replyTo) payload.reply_to_message_id = replyTo.id;
      if (topicId) payload.topic_id = topicId;
      socketRef.current.emit('send_message', payload);
      setReplyTo(null);
    }
    setText('');
  };
  const handleLongPress = (message: any) => setSelectedMessage(message);
  const deleteMessage = async (scope: 'me' | 'all') => {
    if (!selectedMessage) return;
    const token = await getToken();
    try {
      await fetch(`${SERVER_URL}/api/messages/${selectedMessage.id}?scope=${scope}`, {
        method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
      });
      setMessages(prev => prev.filter(m => m.id !== selectedMessage.id));
    } catch (e) { Alert.alert('Ошибка', 'Не удалось удалить сообщение'); }
    setSelectedMessage(null);
  };
  const startEditing = () => {
    if (!selectedMessage || selectedMessage.sender_id !== currentUserId) {
      Alert.alert('Ошибка', 'Только автор может редактировать');
      setSelectedMessage(null); return;
    }
    setEditingMessage(selectedMessage);
    setText(selectedMessage.text);
    setSelectedMessage(null);
  };
  const startReply = () => { if (selectedMessage) { setReplyTo(selectedMessage); setSelectedMessage(null); } };
  const findMessageById = (id: number) => messages.find(m => m.id === id);

  // Пересылка в другой чат: сохраняем сообщение и целевой чат для дописывания текста
  const startForward = async (targetChatId: string, targetTopicId?: number | null) => {
    const token = await getToken();
    if (!token || !selectedMessage) return;
    try {
      const body: any = {
        message_id: selectedMessage.id,
        target_chat_id: targetChatId,
        text: '',
      };
      if (targetTopicId) body.target_topic_id = targetTopicId;
      const res = await fetch(`${SERVER_URL}/api/messages/reply-to-another-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        Alert.alert('Готово', 'Сообщение переслано');
      } else {
        const err = await res.json();
        Alert.alert('Ошибка', err.error || 'Не удалось');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    }
    setShowForwardModal(false);
    setForwardTarget(null);
    setSelectedMessage(null);
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {pinnedMessages.length > 0 && (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', padding: 8, borderBottomWidth: 1, borderColor: '#ddd' }}>
          <TouchableOpacity onPress={() => showPinned(currentPinnedIndex)} style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ fontWeight: '500', fontSize: 13 }}>
              📌 {pinnedMessages[currentPinnedIndex]?.text || 'Закреплённое сообщение'}
            </Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: '#666', marginHorizontal: 8 }}>
            {currentPinnedIndex + 1}/{pinnedMessages.length}
          </Text>
        </View>
      )}
      {replyTo && (
        <View style={{ padding: 8, backgroundColor: '#e8e8e8', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}><Text style={{ fontSize: 12, color: '#666' }}>Ответ на:</Text><Text numberOfLines={1} style={{ fontWeight: '500' }}>{replyTo.text}</Text></View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 4 }}><Text style={{ fontSize: 18, color: '#666' }}>✕</Text></TouchableOpacity>
        </View>
      )}
      {editingMessage && (
        <View style={{ padding: 8, backgroundColor: '#fff3cd', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}><Text style={{ fontSize: 12, color: '#666' }}>Редактирование:</Text><Text numberOfLines={1} style={{ fontWeight: '500' }}>{editingMessage.text}</Text></View>
          <TouchableOpacity onPress={() => { setEditingMessage(null); setText(''); }} style={{ padding: 4 }}><Text style={{ fontSize: 18, color: '#666' }}>✕</Text></TouchableOpacity>
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => item.id?.toString() || index.toString()}
        renderItem={({ item }) => {
          const isMyMessage = item.sender_id === currentUserId;
          const quotedMessage = item.reply_to_message_id ? findMessageById(item.reply_to_message_id) : null;
          const isExternalReply = item.external_reply_chat_id && !quotedMessage; // если цитата не найдена локально
          return (
            <TouchableOpacity onLongPress={() => handleLongPress(item)}>
              <View style={[styles.messageBubble, isMyMessage ? styles.myMessage : styles.otherMessage]}>
                {quotedMessage && (
                  <View style={{ backgroundColor: 'rgba(0,0,0,0.1)', padding: 6, borderRadius: 6, marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600' }}>{quotedMessage.sender_id}:</Text>
                    <Text style={{ fontSize: 13 }}>{quotedMessage.text}</Text>
                  </View>
                )}
                {isExternalReply && (
                  <TouchableOpacity onPress={() => handleExternalReplyPress(item.external_reply_chat_id, item.reply_to_message_id)}>
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.05)', padding: 6, borderRadius: 6, marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, color: '#007bff' }}>Сообщение из другого чата</Text>
                    </View>
                  </TouchableOpacity>
                )}
                {item.pinned && <Text style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>📌 Закреплено</Text>}
                <Text style={isMyMessage ? styles.senderMy : styles.senderOther}>{item.sender_id}:</Text>
                <Text style={isMyMessage ? styles.messageTextMy : styles.messageTextOther}>{item.text}</Text>
                {item.file_url && (
                  <TouchableOpacity onPress={() => Linking.openURL(SERVER_URL + item.file_url)}>
                    {item.thumb_url ? (
                      <Image source={{ uri: SERVER_URL + item.thumb_url }} style={{ width: 200, height: 150, borderRadius: 8 }} />
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4 }}>
                        <Text style={{ fontSize: 20 }}>📄</Text>
                        <Text style={isMyMessage ? styles.messageTextMy : styles.messageTextOther}>{item.file_name}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                {item.edited_at && <Text style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>изменено</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 5 }}
      />
      <View style={styles.inputRow}>
        <TouchableOpacity style={{ padding: 8 }} onPress={pickAndSendFile} disabled={uploading}>
          <Text style={{ fontSize: 24 }}>{uploading ? '⏳' : '📎'}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.messageInput}
          value={text}
          onChangeText={setText}
          placeholder="Сообщение..."
          placeholderTextColor="#999"
        />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>

      {/* Модальное окно выбора чата (включая супергруппы) */}
      <Modal visible={showForwardModal} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowForwardModal(false)}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%', maxHeight: '70%' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 10, color: '#1a1a1a' }}>Выберите чат</Text>
            {!forwardTarget ? (
              <FlatList
                data={availableChats}
                keyExtractor={(item) => item.id.toString()}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' }}
                    onPress={() => {
                      if (item.is_supergroup) {
                        loadTopicsForForward(item.id.toString());
                        setForwardTarget({ chatId: item.id.toString() });
                      } else {
                        setShowForwardModal(false);
                        startForward(item.id.toString());
                      }
                    }}
                  >
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#007bff', justifyContent: 'center', alignItems: 'center', marginRight: 12 }}>
                      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>{(item.name || 'G')[0].toUpperCase()}</Text>
                    </View>
                    <Text style={{ fontSize: 16 }}>{item.name || 'Чат'}</Text>
                  </TouchableOpacity>
                )}
              />
            ) : (
              <View>
                <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 10 }}>Выберите топик</Text>
                <FlatList
                  data={topicsForForward}
                  keyExtractor={(item) => item.id.toString()}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' }}
                      onPress={() => {
                        setShowForwardModal(false);
                        startForward(forwardTarget.chatId, item.id);
                      }}
                    >
                      <Text style={{ fontSize: 16 }}># {item.title}</Text>
                    </TouchableOpacity>
                  )}
                />
                <TouchableOpacity
                  style={{ paddingVertical: 12 }}
                  onPress={() => {
                    setShowForwardModal(false);
                    startForward(forwardTarget.chatId, null);
                  }}
                >
                  <Text style={{ fontSize: 16, color: '#007bff' }}>Общий чат</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity style={{ marginTop: 10, alignSelf: 'flex-end' }} onPress={() => { setShowForwardModal(false); setForwardTarget(null); }}>
              <Text style={{ color: '#999' }}>Отмена</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Меню действий */}
      <Modal visible={!!selectedMessage} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setSelectedMessage(null)}>
          <View style={{ backgroundColor: '#fff', marginHorizontal: 30, marginTop: 'auto', marginBottom: 'auto', borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 15 }}>Действия с сообщением</Text>
            <TouchableOpacity style={{ paddingVertical: 12 }} onPress={startReply}><Text>Ответить</Text></TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 12 }} onPress={() => {
              loadAvailableChats();
              setShowForwardModal(true);
            }}><Text>Переслать</Text></TouchableOpacity>
            <TouchableOpacity style={{ paddingVertical: 12 }} onPress={async () => {
              const tok = await getToken();
              const isPinned = selectedMessage?.pinned;
              const url = `${SERVER_URL}/api/messages/${selectedMessage?.id}/${isPinned ? 'unpin' : 'pin'}`;
              const res = await fetch(url, { method: 'PATCH', headers: { Authorization: `Bearer ${tok}` } });
              if (res.ok) {
                setMessages(prev => prev.map(m => m.id === selectedMessage?.id ? { ...m, pinned: !isPinned } : m));
                loadPinned();
              } else Alert.alert('Ошибка', 'Не удалось закрепить');
              setSelectedMessage(null);
            }}><Text>{selectedMessage?.pinned ? 'Открепить' : 'Закрепить'}</Text></TouchableOpacity>
            {selectedMessage?.sender_id === currentUserId && (
              <TouchableOpacity style={{ paddingVertical: 12 }} onPress={startEditing}><Text>Редактировать</Text></TouchableOpacity>
            )}
            <TouchableOpacity style={{ paddingVertical: 12 }} onPress={() => deleteMessage('me')}><Text>Удалить у меня</Text></TouchableOpacity>
            {selectedMessage?.sender_id === currentUserId && (
              <TouchableOpacity style={{ paddingVertical: 12 }} onPress={() => deleteMessage('all')}><Text style={{ color: 'red' }}>Удалить у всех</Text></TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}
