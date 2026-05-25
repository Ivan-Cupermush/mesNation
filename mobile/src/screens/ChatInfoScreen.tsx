import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Alert, ActivityIndicator, Switch, Modal, ScrollView,
} from 'react-native';
import { getToken, SERVER_URL } from '../utils';
import { getStyles } from '../styles/appStyles';
import { useTheme } from '../theme/ThemeContext';

export default function ChatInfoScreen({ route, navigation }: any) {
  const { chatId } = route.params;
  const [chat, setChat] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [showSupergroupDialog, setShowSupergroupDialog] = useState(false);
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const { theme } = useTheme();
  const styles = getStyles(theme);

  useEffect(() => { loadChatInfo(); }, []);

  const loadChatInfo = async () => {
    const tok = await getToken();
    if (!tok) return;
    const meRes = await fetch(`${SERVER_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${tok}` } });
    const me = await meRes.json();
    if (me.id) setCurrentUserId(me.id);
    const res = await fetch(`${SERVER_URL}/api/chats`, { headers: { Authorization: `Bearer ${tok}` } });
    const chats = await res.json();
    const found = chats.find((c: any) => c.id == chatId);
    if (found) {
      setChat(found);
      setNewName(found.name || '');
      setMembers(found.members || []);
    }
    setLoading(false);
  };

  const handleRename = async () => {
    if (!newName.trim()) return;
    const tok = await getToken();
    const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ name: newName }),
    });
    if (res.ok) {
      Alert.alert('Успешно', 'Название изменено');
      setEditingName(false);
      loadChatInfo();
    } else {
      const data = await res.json();
      Alert.alert('Ошибка', data.error || 'Не удалось изменить название');
    }
  };

  const handleToggleSupergroup = async () => {
    const newValue = !chat.is_supergroup;
    if (newValue) {
      // Включение супергруппы
      const tok = await getToken();
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ is_supergroup: true }),
      });
      if (res.ok) {
        // Сбрасываем стек до экрана топиков
        navigation.reset({
          index: 0,
          routes: [{ name: 'TopicList', params: { chatId: chatId.toString(), chatName: chat?.name || 'Чат' } }],
        });
      } else {
        const data = await res.json();
        Alert.alert('Ошибка', data.error || 'Не удалось включить супергруппу');
      }
    } else {
      // Выключение: показываем диалог
      const tok = await getToken();
      const topicsRes = await fetch(`${SERVER_URL}/api/chats/${chatId}/topics`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      const topicsData = await topicsRes.json();
      setTopics(topicsData);
      setSelectedTopicId(null);
      setShowSupergroupDialog(true);
    }
  };

  const confirmDisableSupergroup = async () => {
    setShowSupergroupDialog(false);
    const tok = await getToken();
    const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ is_supergroup: false, keep_topic_id: selectedTopicId }),
    });
    if (res.ok) {
      Alert.alert('Готово', 'Супергруппа отключена');
      // Переходим в обычный чат, сбрасывая стек
      navigation.reset({
        index: 0,
        routes: [{ name: 'Chat', params: { chatId: chatId.toString(), chatName: chat?.name || 'Чат' } }],
      });
    } else {
      const data = await res.json();
      Alert.alert('Ошибка', data.error || 'Не удалось отключить супергруппу');
    }
  };

  const handleRemoveMember = async (userId: number) => {
    const tok = await getToken();
    const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/members/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tok}` },
    });
    if (res.ok) {
      loadChatInfo();
    } else {
      Alert.alert('Ошибка', 'Не удалось удалить участника');
    }
  };

  const handleLeaveOrDelete = () => {
    Alert.alert(
      chat?.created_by === currentUserId ? 'Удалить чат?' : 'Выйти из чата?',
      chat?.created_by === currentUserId
        ? 'Вы уверены? Чат будет удалён для всех участников.'
        : 'Вы уверены? Вы покинете чат.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: chat?.created_by === currentUserId ? 'Удалить' : 'Выйти',
          style: 'destructive',
          onPress: async () => {
            const tok = await getToken();
            const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${tok}` },
            });
            const data = await res.json();
            if (res.ok) {
              Alert.alert('Успешно', data.action === 'deleted' ? 'Чат удалён' : 'Вы вышли из чата');
              navigation.goBack();
            } else {
              Alert.alert('Ошибка', data.error || 'Не удалось выполнить действие');
            }
          },
        },
      ]
    );
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <View style={[styles.container, { padding: 16 }]}>
      <ScrollView>
        {/* Название чата */}
        <View style={{ marginBottom: 20 }}>
          <Text style={styles.label}>Название чата</Text>
          {editingName ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TextInput style={[styles.input, { flex: 1 }]} value={newName} onChangeText={setNewName} placeholder="Новое название" placeholderTextColor="#999" />
              <TouchableOpacity style={styles.createButton} onPress={handleRename}>
                <Text style={styles.createButtonText}>Сохранить</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingName(false)}>
                <Text style={{ color: '#999' }}>Отмена</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '600', color: theme === 'dark' ? '#fff' : '#1a1a1a' }}>{chat?.name || 'Без названия'}</Text>
              {chat?.created_by === currentUserId && (
                <TouchableOpacity onPress={() => setEditingName(true)}>
                  <Text style={{ color: '#007bff' }}>Изменить</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Супергруппа */}
        {chat?.type === 'group' && chat?.created_by === currentUserId && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={styles.label}>Супергруппа</Text>
            <Switch value={chat?.is_supergroup} onValueChange={handleToggleSupergroup} />
          </View>
        )}

        {/* Тип чата */}
        <Text style={styles.label}>Тип: {chat?.type === 'group' ? 'Группа' : 'Приватный'}</Text>

        {/* Участники */}
        <Text style={[styles.label, { marginTop: 20 }]}>Участники ({members.length})</Text>
        <FlatList
          data={members}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={[styles.userItem, { justifyContent: 'space-between' }]}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                onPress={() => navigation.navigate('UserProfile', {
                  userId: item.id,
                  username: item.username,
                  displayName: item.display_name || item.username,
                  avatarUrl: item.avatar_url || '',
                  role: item.role || 'employee',
                })}
              >
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{(item.username || 'U')[0].toUpperCase()}</Text>
                </View>
                <View>
                  <Text style={styles.userName}>{item.display_name || item.username}</Text>
                  <Text style={{ color: '#999', fontSize: 12 }}>@{item.username}</Text>
                </View>
              </TouchableOpacity>
              {chat?.created_by === currentUserId && item.id !== currentUserId && (
                <TouchableOpacity onPress={() => handleRemoveMember(item.id)}>
                  <Text style={{ color: 'red' }}>Удалить</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
          scrollEnabled={false}
        />

        {/* Кнопки действий */}
        <View style={{ marginTop: 20, gap: 10 }}>
          {chat?.type === 'group' && chat?.created_by === currentUserId && (
            <TouchableOpacity style={styles.createButton} onPress={() => navigation.navigate('AddMembers', { chatId })}>
              <Text style={styles.createButtonText}>Добавить участников</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.logoutButton, { backgroundColor: '#ff4444' }]} onPress={handleLeaveOrDelete}>
            <Text style={[styles.logoutText, { color: '#fff' }]}>
              {chat?.created_by === currentUserId ? 'Удалить чат' : 'Выйти из чата'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Модальное окно выбора топика при отключении супергруппы */}
      <Modal visible={showSupergroupDialog} transparent animationType="fade">
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}
          onPress={() => setShowSupergroupDialog(false)}
        >
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%', maxHeight: '60%' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 10, color: '#1a1a1a' }}>Выключить супергруппу?</Text>
            <Text style={{ fontSize: 14, color: '#666', marginBottom: 15 }}>
              При отключении супергруппы все топики, кроме выбранного, будут безвозвратно удалены. Это действие нельзя отменить.
            </Text>
            <Text style={{ fontSize: 15, fontWeight: '600', marginBottom: 8 }}>Оставить топик:</Text>
            <ScrollView style={{ maxHeight: 200 }}>
              <TouchableOpacity
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  borderRadius: 8,
                  marginBottom: 6,
                  backgroundColor: selectedTopicId === null ? '#e3f2fd' : '#f5f5f5',
                }}
                onPress={() => setSelectedTopicId(null)}
              >
                <Text style={{ fontSize: 16, fontWeight: selectedTopicId === null ? '700' : '400' }}>Общий чат (без топиков)</Text>
              </TouchableOpacity>
              {topics.map((topic) => (
                <TouchableOpacity
                  key={topic.id}
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    marginBottom: 6,
                    backgroundColor: selectedTopicId === topic.id ? '#e3f2fd' : '#f5f5f5',
                  }}
                  onPress={() => setSelectedTopicId(topic.id)}
                >
                  <Text style={{ fontSize: 16, fontWeight: selectedTopicId === topic.id ? '700' : '400' }}>{topic.title}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15, gap: 10 }}>
              <TouchableOpacity onPress={() => setShowSupergroupDialog(false)} style={{ padding: 10 }}>
                <Text style={{ color: '#999', fontSize: 16 }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ backgroundColor: '#ff4444', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 }}
                onPress={confirmDisableSupergroup}
              >
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Отключить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
