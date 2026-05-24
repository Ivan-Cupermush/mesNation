import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, FlatList, KeyboardAvoidingView,
  Platform, TouchableOpacity, ActivityIndicator, Alert, Modal,
  Image, Linking,
} from 'react-native';
import io from 'socket.io-client';
import { pick } from '@react-native-documents/picker';
import { Swipeable } from 'react-native-gesture-handler';
import { getToken, SERVER_URL } from '../utils';
import { getStyles } from '../styles/appStyles';
import { useTheme } from '../theme/ThemeContext';

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
  const [onlineUserIds, setOnlineUserIds] = useState<number[]>([]);
  const [typingName, setTypingName] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<Record<number, { name: string; avatar: string }>>({});
  const socketRef = useRef<any>(null);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeout = useRef<NodeJS.Timeout | null>(null);
  const remoteTypingTimeout = useRef<NodeJS.Timeout | null>(null);
  const { theme } = useTheme();
  const styles = getStyles(theme);

  useEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: chatName,
      headerStyle: { backgroundColor: theme === 'dark' ? '#1a1a1a' : '#f8f9fa' },
      headerTintColor: '#007bff',
      headerTitleStyle: { fontWeight: '600', fontSize: 18, color: theme === 'dark' ? '#fff' : '#000' },
    });
  }, [navigation, chatName, theme]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const tok = await getToken();
      if (!tok) return;

      let userId: number | null = null;
      try {
        const res = await fetch(`${SERVER_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        const user = await res.json();
        if (user.id) {
          userId = user.id;
          if (mounted) setCurrentUserId(userId);
        }
      } catch (e) {}

      const effectiveUserId = userId || 1;
      const socket = io(SERVER_URL, { auth: { token: tok, userId: effectiveUserId } });
      socketRef.current = socket;
      socket.emit('join_chat', chatId);

      let url = `${SERVER_URL}/api/messages/${chatId}`;
      if (topicId) url += `?topic_id=${topicId}`;
      try {
        const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
        const data = await res.json();
        if (res.ok && mounted) {
          const filtered = data.filter((m: any) => {
            if (m.deleted_for_all) return false;
            const deletedFor = m.deleted_for_user_ids;
            if (Array.isArray(deletedFor)) return !deletedFor.includes(effectiveUserId);
            return true;
          });
          setMessages(filtered);
          loadAllUsers(tok);
        }
      } catch (e) {}

      socket.on('new_message', (msg: any) => {
        if (msg.chat_id !== chatId) return;
        if (topicId && msg.topic_id !== topicId) return;
        if (mounted) {
          const isDeletedForAll = msg.deleted_for_all;
          const isDeletedForMe = Array.isArray(msg.deleted_for_user_ids) && msg.deleted_for_user_ids.includes(effectiveUserId);
          if (!isDeletedForAll && !isDeletedForMe) {
            setMessages(prev => [...prev, msg]);
            if (!userInfo[msg.sender_id]) loadAllUsers(tok);
          }
        }
      });
      socket.on('message_edited', (updated: any) => {
        if (mounted) setMessages(prev => prev.map(m => m.id === updated.id ? updated : m));
      });
      socket.on('message_deleted', ({ id }: { id: number }) => {
        if (mounted) setMessages(prev => prev.filter(m => m.id !== id));
      });

      socket.on('user_typing', (data: { chatId: string; userId: number; userName: string }) => {
        if (data.chatId === chatId && data.userId !== userId) {
          setTypingName(data.userName);
          if (remoteTypingTimeout.current) clearTimeout(remoteTypingTimeout.current);
          remoteTypingTimeout.current = setTimeout(() => setTypingName(null), 3000);
        }
      });
      socket.on('user_stop_typing', (data: { chatId: string; userId: number }) => {
        if (data.chatId === chatId && data.userId !== userId) {
          setTypingName(null);
          if (remoteTypingTimeout.current) clearTimeout(remoteTypingTimeout.current);
        }
      });

      socket.on('online_users', (userIds: number[]) => {
        if (mounted) setOnlineUserIds(userIds);
      });

      if (mounted) setLoading(false);

      return () => {
        mounted = false;
        socket.off('new_message');
        socket.off('message_edited');
        socket.off('message_deleted');
        socket.off('user_typing');
        socket.off('user_stop_typing');
        socket.off('online_users');
        socket.disconnect();
      };
    })();

    return () => { mounted = false; };
  }, [chatId, topicId]);

  const loadAllUsers = async (tok: string) => {
    try {
      const usersRes = await fetch(`${SERVER_URL}/api/users`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const users = await usersRes.json();
      const info: Record<number, { name: string; avatar: string }> = {};
      for (const u of users) {
        info[u.id] = { name: u.display_name || u.username || 'User ' + u.id, avatar: '' };
        if (u.avatar_url) {
          const filename = u.avatar_url.split('/').pop();
          const tokenRes = await fetch(`${SERVER_URL}/api/file-token/${filename}`, {
            headers: { Authorization: `Bearer ${tok}` },
          });
          const tokenData = await tokenRes.json();
          if (tokenRes.ok && tokenData.url) {
            info[u.id].avatar = SERVER_URL + tokenData.url;
          }
        }
      }
      setUserInfo(prev => ({ ...prev, ...info }));
    } catch (e) {}
  };

  const getUserName = (senderId: number) => userInfo[senderId]?.name || 'User ' + senderId;
  const getUserAvatar = (senderId: number) => userInfo[senderId]?.avatar || '';
  const getInitial = (name: string) => (name || '?')[0].toUpperCase();

  const handleTextChange = (val: string) => {
    setText(val);
    if (socketRef.current) {
      socketRef.current.emit('typing', { chatId, userId: currentUserId });
      if (typingTimeout.current) clearTimeout(typingTimeout.current);
      typingTimeout.current = setTimeout(() => {
        socketRef.current?.emit('stop_typing', { chatId, userId: currentUserId });
      }, 2000);
    }
  };

  const sendMessage = async () => {
    if (!text.trim() || !currentUserId) return;
    if (!socketRef.current) return;
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    socketRef.current.emit('stop_typing', { chatId, userId: currentUserId });

    if (editingMessage) {
      const tok = await getToken();
      try {
        const res = await fetch(`${SERVER_URL}/api/messages/${editingMessage.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
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

  const openFile = async (fileUrl: string) => {
    try {
      const tok = await getToken();
      const filename = fileUrl.split('/').pop();
      const res = await fetch(`${SERVER_URL}/api/file-token/${filename}`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const data = await res.json();
      if (res.ok && data.url) {
        await Linking.openURL(SERVER_URL + data.url);
      } else {
        Alert.alert('Ошибка', data.error || 'Не удалось открыть файл');
      }
    } catch (err) {
      Alert.alert('Ошибка', 'Не удалось открыть файл');
    }
  };

  const pickAndUploadFile = async () => {
    try {
      const [res] = await pick({ allowMultiSelection: false });
      if (!res) return;
      setUploading(true);
      const tok = await getToken();
      const formData = new FormData();
      formData.append('file', { uri: res.uri, type: res.type || 'application/octet-stream', name: res.name || 'file' } as any);
      formData.append('chatId', chatId);
      formData.append('senderId', String(currentUserId));
      const response = await fetch(`${SERVER_URL}/api/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok}` },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) Alert.alert('Ошибка', data.error || 'Не удалось загрузить файл');
    } catch (err: any) {
      if (err?.code === 'DOCUMENT_PICKER_CANCELED') return;
      Alert.alert('Ошибка', 'Не удалось выбрать файл');
    } finally { setUploading(false); }
  };

  const handleLongPress = (message: any) => setSelectedMessage(message);
  const deleteMessage = async (scope: 'me' | 'all') => {
    if (!selectedMessage) return;
    const tok = await getToken();
    try {
      await fetch(`${SERVER_URL}/api/messages/${selectedMessage.id}?scope=${scope}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tok}` },
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
  const startReply = (message: any) => {
    setReplyTo(message);
    setSelectedMessage(null);
  };
  const findMessageById = (id: number) => messages.find(m => m.id === id);

  const renderRightActions = (message: any) => (
    <TouchableOpacity onPress={() => startReply(message)} style={{ backgroundColor: '#007bff', justifyContent: 'center', alignItems: 'center', width: 80 }}>
      <Text style={{ color: 'white', fontSize: 20 }}>↩️</Text>
    </TouchableOpacity>
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {replyTo && (
        <View style={{ padding: 8, backgroundColor: theme === 'dark' ? '#333' : '#e8e8e8', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#666' }}>Ответ на:</Text>
            <Text numberOfLines={1} style={{ fontWeight: '500', color: theme === 'dark' ? '#fff' : '#000' }}>{replyTo.text}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={{ padding: 4 }}><Text style={{ fontSize: 18, color: '#666' }}>✕</Text></TouchableOpacity>
        </View>
      )}
      {editingMessage && (
        <View style={{ padding: 8, backgroundColor: '#fff3cd', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: '#666' }}>Редактирование:</Text>
            <Text numberOfLines={1} style={{ fontWeight: '500' }}>{editingMessage.text}</Text>
          </View>
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
          const isOnline = onlineUserIds.includes(item.sender_id);
          const avatar = getUserAvatar(item.sender_id);
          const name = getUserName(item.sender_id);
          return (
            <Swipeable renderRightActions={() => renderRightActions(item)}>
              <TouchableOpacity onLongPress={() => handleLongPress(item)} activeOpacity={0.8}>
                <View style={[styles.messageBubble, isMyMessage ? styles.myMessage : styles.otherMessage]}>
                  {quotedMessage && (
                    <View style={{ backgroundColor: 'rgba(0,0,0,0.1)', padding: 6, borderRadius: 6, marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '600' }}>{getUserName(quotedMessage.sender_id)}:</Text>
                      <Text style={{ fontSize: 13 }}>{quotedMessage.text}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {avatar ? (
                      <Image source={{ uri: avatar }} style={{ width: 24, height: 24, borderRadius: 12, marginRight: 6 }} />
                    ) : (
                      <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#007bff', justifyContent: 'center', alignItems: 'center', marginRight: 6 }}>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{getInitial(name)}</Text>
                      </View>
                    )}
                    {isOnline && !isMyMessage && (
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#4cd964', marginRight: 4 }} />
                    )}
                    <Text style={isMyMessage ? styles.senderMy : styles.senderOther}>{name}:</Text>
                  </View>
                  {item.text ? (
                    <>
                      <Text style={isMyMessage ? styles.messageTextMy : styles.messageTextOther}>{item.text}</Text>
                      {item.edited_at && <Text style={{ fontSize: 10, color: '#aaa', marginTop: 2 }}>изменено</Text>}
                    </>
                  ) : null}
                  {item.file_url && (
                    <TouchableOpacity onPress={() => openFile(item.file_url)}>
                      {item.thumb_url ? (
                        <Image source={{ uri: SERVER_URL + item.thumb_url }} style={{ width: 200, height: 150, borderRadius: 8, marginTop: 4 }} resizeMode="cover" />
                      ) : (
                        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 4 }}>
                          <Text style={{ fontSize: 20 }}>📄</Text>
                          <Text style={[styles.messageTextOther, { marginLeft: 4 }]}>{item.file_name}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            </Swipeable>
          );
        }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 5 }}
      />
      {typingName && (
        <Text style={{ padding: 4, color: '#666', fontStyle: 'italic', textAlign: 'center' }}>
          {typingName} печатает...
        </Text>
      )}
      <View style={styles.inputRow}>
        <TouchableOpacity style={[styles.sendButton, { backgroundColor: '#6c757d', marginRight: 5 }]} onPress={pickAndUploadFile} disabled={uploading}>
          {uploading ? <ActivityIndicator size="small" color="white" /> : <Text style={styles.sendButtonText}>📎</Text>}
        </TouchableOpacity>
        <TextInput style={styles.messageInput} value={text} onChangeText={handleTextChange} placeholder="Сообщение..." placeholderTextColor="#999" />
        <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
          <Text style={styles.sendButtonText}>➤</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={!!selectedMessage} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' }} onPress={() => setSelectedMessage(null)}>
          <View style={{ backgroundColor: '#fff', marginHorizontal: 30, marginTop: 'auto', marginBottom: 'auto', borderRadius: 12, padding: 20 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 15 }}>Действия с сообщением</Text>
            <TouchableOpacity style={{ paddingVertical: 12 }} onPress={() => startReply(selectedMessage)}><Text>Ответить</Text></TouchableOpacity>
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
