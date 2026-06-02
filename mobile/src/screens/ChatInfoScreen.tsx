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
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<any[]>([]);
  const [topics, setTopics] = useState<any[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState<number | null>(null);
  const [mergeMessages, setMergeMessages] = useState(true);
  const [stats, setStats] = useState<{ total_files: number; total_images: number } | null>(null);
  const [admins, setAdmins] = useState<any[]>([]);
  const { theme } = useTheme();
  const styles = getStyles(theme);

  useEffect(() => { loadChatInfo(); }, []);

  const loadChatInfo = async () => {
    const tok = await getToken();
    if (!tok) return;
    try {
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

      // Статистика
      const statsRes = await fetch(`${SERVER_URL}/api/chats/${chatId}/stats`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // Администраторы
      const adminsRes = await fetch(`${SERVER_URL}/api/chats/${chatId}/admins`, {
        headers: { Authorization: `Bearer ${tok}` },
      });
      if (adminsRes.ok) {
        const adminsData = await adminsRes.json();
        setAdmins(adminsData);
      }
    } catch (e) {}
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
      const tok = await getToken();
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ is_supergroup: true }),
      });
      if (res.ok) {
        navigation.reset({
          index: 0,
          routes: [{ name: 'TopicList', params: { chatId: chatId.toString(), chatName: chat?.name || 'Чат' } }],
        });
      } else {
        const data = await res.json();
        Alert.alert('Ошибка', data.error || 'Не удалось включить супергруппу');
      }
    } else {
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
      body: JSON.stringify({ is_supergroup: false, keep_topic_id: selectedTopicId, merge: mergeMessages }),
    });
    if (res.ok) {
      setSelectedTopicId(null);
      navigation.reset({
        index: 1,
        routes: [
          { name: 'ChatList' },
          { name: 'Chat', params: { chatId: chatId.toString(), chatName: chat?.name || 'Чат' } },
        ],
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

  const openAdminModal = () => {
    const adminIds = admins.map(a => a.id);
    const candidates = members.filter(m => m.id !== chat?.created_by && !adminIds.includes(m.id));
    setAvailableUsers(candidates);
    setSelectedUserId(null);
    setAdminPermissions(['change_info', 'delete_messages', 'ban_users', 'add_users', 'pin_messages']);
    setShowAdminModal(true);
  };

  const handleDelete = () => {
    Alert.alert(
      'Удалить чат?',
      'Чат будет удалён для всех участников. Это действие необратимо.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            const tok = await getToken();
            const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${tok}` },
            });
            const data = await res.json();
            if (res.ok) {
              Alert.alert('Успешно', 'Чат удалён');
              navigation.goBack();
            } else {
              Alert.alert('Ошибка', data.error || 'Не удалось удалить чат');
            }
          },
        },
      ]
    );
  };

  const handleLeave = () => {
    Alert.alert(
      'Выйти из чата?',
      'Вы покинете чат и больше не сможете читать сообщения.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            const tok = await getToken();
            const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${tok}` },
            });
            const data = await res.json();
            if (res.ok) {
              Alert.alert('Успешно', 'Вы вышли из чата');
              navigation.goBack();
            } else {
              Alert.alert('Ошибка', data.error || 'Не удалось выйти из чата');
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

        {chat?.type === 'group' && chat?.created_by === currentUserId && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <Text style={styles.label}>Супергруппа</Text>
            <Switch value={chat?.is_supergroup} onValueChange={handleToggleSupergroup} />
          </View>
        )}

        <Text style={styles.label}>Тип: {chat?.type === 'group' ? 'Группа' : 'Приватный'}</Text>
        {stats && (
          <View style={{ marginVertical: 10, padding: 10, backgroundColor: theme === 'dark' ? '#2c2c2e' : '#f8f8f8', borderRadius: 8 }}>
            <TouchableOpacity onPress={() => navigation.navigate('MediaList', { chatId: chatId.toString(), type: 'files' })}>
              <Text style={[styles.label, { marginBottom: 5 }]}>Файлы: {stats.total_files}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => navigation.navigate('MediaList', { chatId: chatId.toString(), type: 'images' })}>
              <Text style={[styles.label, { marginBottom: 5 }]}>Медиа: {stats.total_images}</Text>
            </TouchableOpacity>
          </View>
        )}

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
                  role: item.role || 'member',
                })}
              >
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{(item.username || 'U')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{item.display_name || item.username}</Text>
                  <Text style={{ color: '#999', fontSize: 12 }}>@{item.username}</Text>
                  <Text style={{ fontSize: 11, color: item.role === 'creator' ? '#007bff' : item.role === 'admin' ? '#28a745' : '#999' }}>
                    {item.role === 'creator' ? 'Владелец' : item.role === 'admin' ? 'Админ' : 'Участник'}
                  </Text>
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

        {/* Администраторы */}
        <Text style={[styles.label, { marginTop: 20 }]}>Администраторы ({admins.length})</Text>
        {admins.map((admin: any) => (
          <View key={admin.id} style={{ marginBottom: 10 }}>
            <View style={styles.userItem}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{(admin.username || 'A')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{admin.display_name || admin.username}</Text>
                <Text style={{ color: '#999', fontSize: 12 }}>@{admin.username}</Text>
                <Text style={{ fontSize: 10, color: '#666' }}>
                  Права: {admin.permissions ? admin.permissions.join(', ') : 'все'}
                </Text>
              </View>
              {(chat?.created_by === currentUserId || admins.find((a: any) => a.id === currentUserId)?.permissions?.includes('add_admins')) && (
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  <TouchableOpacity onPress={() => {
                    setSelectedUserId(admin.id);
                    setAdminPermissions(admin.permissions || []);
                    setShowAdminModal(true);
                  }}>
                    <Text style={{ color: '#007bff', fontSize: 14 }}>Права</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => {
                    Alert.alert('Снять администратора?', '', [
                      { text: 'Отмена', style: 'cancel' },
                      { text: 'Снять', style: 'destructive', onPress: async () => {
                        const tok = await getToken();
                        await fetch(`${SERVER_URL}/api/chats/${chatId}/admins/${admin.id}`, {
                          method: 'DELETE',
                          headers: { Authorization: `Bearer ${tok}` },
                        });
                        loadChatInfo();
                      }},
                    ]);
                  }}>
                    <Text style={{ color: 'red', fontSize: 14 }}>Снять</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>
        ))}
        {(chat?.created_by === currentUserId || admins.find((a: any) => a.id === currentUserId)?.permissions?.includes('add_admins')) && (
          <TouchableOpacity style={styles.createButton} onPress={openAdminModal}>
            <Text style={styles.createButtonText}>Назначить администратора</Text>
          </TouchableOpacity>
        )}

        <View style={{ marginTop: 20, gap: 10 }}>
          {chat?.type === 'group' && chat?.created_by === currentUserId && (
            <TouchableOpacity style={styles.createButton} onPress={() => navigation.navigate('AddMembers', { chatId })}>
              <Text style={styles.createButtonText}>Добавить участников</Text>
            </TouchableOpacity>
          )}
          {chat?.created_by === currentUserId ? (
            <View style={{ gap: 10 }}>
              <TouchableOpacity style={[styles.logoutButton, { backgroundColor: '#dc3545' }]} onPress={handleDelete}>
                <Text style={[styles.logoutText, { color: '#fff' }]}>Удалить чат</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.logoutButton, { backgroundColor: '#6c757d' }]} onPress={handleLeave}>
                <Text style={[styles.logoutText, { color: '#fff' }]}>Выйти из чата</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={[styles.logoutButton, { backgroundColor: '#ff4444' }]} onPress={handleLeave}>
              <Text style={[styles.logoutText, { color: '#fff' }]}>Выйти из чата</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Модальное окно назначения/редактирования администратора */}
      <Modal visible={showAdminModal} transparent animationType="fade">
        <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowAdminModal(false)}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '85%', maxHeight: '70%' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 10, color: '#1a1a1a' }}>
              {selectedUserId && admins.find(a => a.id === selectedUserId) ? 'Изменить права' : 'Назначить администратора'}
            </Text>
            {!selectedUserId && (
              <>
                <Text style={{ fontSize: 14, color: '#666', marginBottom: 10 }}>Выберите участника:</Text>
                <ScrollView style={{ maxHeight: 150, marginBottom: 10 }}>
                  {availableUsers.map((u: any) => (
                    <TouchableOpacity
                      key={u.id}
                      style={{ paddingVertical: 10, paddingHorizontal: 15, backgroundColor: selectedUserId === u.id ? '#e3f2fd' : 'transparent', borderRadius: 8 }}
                      onPress={() => setSelectedUserId(u.id)}
                    >
                      <Text style={{ fontSize: 16, fontWeight: selectedUserId === u.id ? '600' : '400' }}>
                        {u.display_name || u.username} (@{u.username})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
            <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 10 }}>Права:</Text>
            {[
              { key: 'change_info', label: 'Изменение профиля группы' },
              { key: 'delete_messages', label: 'Удаление сообщений' },
              { key: 'ban_users', label: 'Блокировка пользователей' },
              { key: 'add_users', label: 'Добавление участников' },
              { key: 'pin_messages', label: 'Закрепление сообщений' },
              { key: 'add_admins', label: 'Добавление администраторов' },
            ].map(perm => (
              <TouchableOpacity
                key={perm.key}
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}
                onPress={() => {
                  if (adminPermissions.includes(perm.key)) {
                    setAdminPermissions(adminPermissions.filter(p => p !== perm.key));
                  } else {
                    setAdminPermissions([...adminPermissions, perm.key]);
                  }
                }}
              >
                <View style={{
                  width: 20, height: 20,
                  borderWidth: 1, borderColor: '#ccc',
                  borderRadius: 4,
                  justifyContent: 'center', alignItems: 'center',
                  marginRight: 8,
                  backgroundColor: adminPermissions.includes(perm.key) ? '#007bff' : 'transparent',
                }}>
                  {adminPermissions.includes(perm.key) && <Text style={{ color: '#fff', fontSize: 14 }}>✓</Text>}
                </View>
                <Text style={{ fontSize: 14 }}>{perm.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 15, gap: 10 }}>
              <TouchableOpacity onPress={() => setShowAdminModal(false)} style={{ padding: 10 }}>
                <Text style={{ color: '#999' }}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ backgroundColor: '#007bff', paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8 }}
                onPress={async () => {
                  if (!selectedUserId) {
                    Alert.alert('Ошибка', 'Выберите участника');
                    return;
                  }
                  const tok = await getToken();
                  let res;
                  const existingAdmin = admins.find((a: any) => a.id === selectedUserId);
                  if (existingAdmin) {
                    res = await fetch(`${SERVER_URL}/api/chats/${chatId}/admins/${selectedUserId}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
                      body: JSON.stringify({ permissions: adminPermissions }),
                    });
                  } else {
                    res = await fetch(`${SERVER_URL}/api/chats/${chatId}/admins`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
                      body: JSON.stringify({ user_id: selectedUserId, permissions: adminPermissions }),
                    });
                  }
                  if (res.ok) {
                    setShowAdminModal(false);
                    loadChatInfo();
                  } else {
                    Alert.alert('Ошибка', 'Не удалось сохранить');
                  }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '600' }}>Сохранить</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Модальное окно отключения супергруппы */}
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
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <Text style={{ fontSize: 14 }}>Объединить сообщения</Text>
              <Switch value={mergeMessages} onValueChange={setMergeMessages} />
            </View>
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
