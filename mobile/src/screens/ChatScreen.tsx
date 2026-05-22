import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, KeyboardAvoidingView,
  Platform, TouchableOpacity, ActivityIndicator, Alert, Modal,
} from 'react-native';
import io from 'socket.io-client';
import { getToken, SERVER_URL } from '../utils';
import { appStyles } from '../styles/appStyles';

export default function ChatScreen({ route, navigation }: any) {
  const { chatId, chatName, topicId } = route.params || {};
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [selectedMessage, setSelectedMessage] = useState<any>(null);
  const [replyTo, setReplyTo] = useState<any>(null);
  const [editingMessage, setEditingMessage] = useState<any>(null);
  const socketRef = useRef<any>(null);
  const flatListRef = useRef<FlatList>(null);

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
        const res = await fetch(`${SERVER_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const user = await res.json();
        if (user.id) {
          userId = user.id;
          if (mounted) setCurrentUserId(userId);
        }
      } catch (e) {}

      const effectiveUserId = userId || 1;
      const socket = io(SERVER_URL, { auth: { token } });
      socketRef.current = socket;
      socket.emit('join_chat', chatId);

      // Загружаем сообщения с учётом topicId
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
        }
      } catch (e) {}

      socket.on('new_message', (msg: any) => {
        // Фильтруем по chat_id и, если мы внутри топика, по topic_id
        if (msg.chat_id !== chatId) return;
        if (topicId && msg.topic_id !== topicId) return;
        if (mounted) {
          const isDeletedForAll = msg.deleted_for_all;
          const isDeletedForMe = Array.isArray(msg.deleted_for_user_ids) && msg.deleted_for_user_ids.includes(effectiveUserId);
          if (!isDeletedForAll && !isDeletedForMe) {
            setMessages(prev => [...prev, msg]);
          }
        }
      });
      socket.on('message_edited', (updated: any) => {
        if (mounted) setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      });
      socket.on('message_deleted', ({ id }: { id: number }) => {
        if (mounted) setMessages(prev => prev.filter(m => m.id !== id));
      });

      if (mounted) setLoading(false);

      return () => {
        mounted = false;
        socket.off('new_message');
        socket.off('message_edited');
        socket.off('message_deleted');
        socket.disconnect();
      };
    })();

    return () => { mounted = false; };
  }, [chatId, topicId]);

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

  // ... остальные функции (handleLongPress, deleteMessage, startEditing, startReply) остаются без изменений
  const handleLongPress = (message: any) => setSelectedMessage(message);
  const deleteMessage = async (scope: 'me' | 'all') => {
    if (!selectedMessage) return;
    const token = await getToken();
    try {
      await fetch(`${SERVER_URL}/api/messages/${selectedMessage.id}?scope=${scope}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
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
  const startReply = () => {
    if (selectedMessage) {
      setReplyTo(selectedMessage);
      setSelectedMessage(null);
    }
  };
  const findMessageById = (id: number) => messages.find(m => m.id === id);

  if (loading) return <View style={appStyles.centered}><ActivityIndicator size="large" /></View>;

  // JSX остаётся прежним, только добавляем поддержку topicId в шапке при необходимости
  return (
    <KeyboardAvoidingView style={appStyles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {replyTo && (
        <View style={{ padding: 8, backgroundColor: '#e8e8e8', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#666' }}>Ответ на:</Text>
            <Text numberOfLines={1} style={{ fontWeight: '500' }}>{replyTo.text}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 4 }}>
            <Text style={{ fontSize: 18, color: '#666' }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      {editingMessage && (
        <View style={{ padding: 8, backgroundColor: '#fff3cd', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#666' }}>Редактирование:</Text>
            <Text numberOfLines={1} style={{ fontWeight: '500' }}>{editingMessage.text}</Text>
          </View>
          <TouchableOpacity onPress={() => { setEditingMessage(null); setText(''); }} style={{ padding: 4 }}>
            <Text style={{ fontSize: 18, color: '#666' }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item, index) => item.id?.toString() || index.toString()}
        renderItem={({ item }) => {
          const isMyMessage = item.sender_id === currentUserId;
          const quotedMessage = item.reply_to_message_id ? findMessageById(item.reply_to_message_id) : null;
          return (
            <TouchableOpacity onLongPress={() => handleLongPress(item)}>
              <View style={[appStyles.messageBubble, isMyMessage ? appStyles.myMessage : appStyles.otherMessage]}>
                {quotedMessage && (
                  <View style={{ backgroundColor: 'rgba(0,0,0,0.1)', padding: 6, borderRadius: 6, marginBottom: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '600' }}>{quotedMessage.sender_id}:</Text>
                    <Text style={{ fontSize: 13 }}>{quotedMessage.text}</Text>
                  </View>
                )}
                <Text style={appStyles.sender}>{item.sender_id}:</Text>
                <Text style={appStyles.messageText}>{item.text}</Text>
                {item.edited_at && <Text style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>изменено</Text>}
                {item.file_url && <Text style={appStyles.file}>📎 {item.file_name}</Text>}
              </View>
            </TouchableOpacity>
          );
        }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 5 }}
      />
      <View style={appStyles.inputRow}>
        <TextInput
          style={appStyles.messageInput}
          value={text}
          onChangeText={setText}
          placeholder="Сообщение..."
          placeholderTextColor="#999"
        />
        <TouchableOpacity style={appStyles.sendButton} onPress={sendMessage}>
          <Text style={appStyles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={!!selectedMessage} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setSelectedMessage(null)}>
          <View style={{ backgroundColor: '#fff', marginHorizontal: 30, marginTop: 'auto', marginBottom: 'auto', borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 15 }}>Действия с сообщением</Text>
            <TouchableOpacity style={{ paddingVertical: 12 }} onPress={startReply}>
              <Text>Ответить</Text>
            </TouchableOpacity>
            {selectedMessage?.sender_id === currentUserId && (
              <TouchableOpacity style={{ paddingVertical: 12 }} onPress={startEditing}>
                <Text>Редактировать</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={{ paddingVertical: 12 }} onPress={() => deleteMessage('me')}>
              <Text>Удалить у меня</Text>
            </TouchableOpacity>
            {selectedMessage?.sender_id === currentUserId && (
              <TouchableOpacity style={{ paddingVertical: 12 }} onPress={() => deleteMessage('all')}>
                <Text style={{ color: 'red' }}>Удалить у всех</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}
