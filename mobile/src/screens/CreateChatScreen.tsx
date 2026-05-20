import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList, Alert, ActivityIndicator,
} from 'react-native';
import { getToken, SERVER_URL } from '../utils';
import { appStyles } from '../styles/appStyles';

export default function CreateChatScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'private' | 'group'>('group');
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [creating, setCreating] = useState(false);

  // загрузка списка пользователей
  const loadUsers = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setUsers(data);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить пользователей');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  // фильтрация пользователей по поиску
  const filteredUsers = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.display_name && u.display_name.toLowerCase().includes(search.toLowerCase()))
  );

  const toggleUser = (id: number) => {
    if (type === 'private') {
      setSelectedUserIds([id]);
    } else {
      setSelectedUserIds(prev =>
        prev.includes(id) ? prev.filter(uid => uid !== id) : [...prev, id]
      );
    }
  };

  const handleCreate = async () => {
    if (type === 'group' && !name.trim()) {
      Alert.alert('Ошибка', 'Введите название группы');
      return;
    }
    if (selectedUserIds.length === 0) {
      Alert.alert('Ошибка', 'Выберите хотя бы одного участника');
      return;
    }
    setCreating(true);
    const token = await getToken();
    if (!token) {
      Alert.alert('Ошибка', 'Нет токена');
      setCreating(false);
      return;
    }
    try {
      const body: any = { type, user_ids: selectedUserIds };
      if (type === 'group') body.name = name;
      const res = await fetch(`${SERVER_URL}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Успех', 'Чат создан');
        navigation.goBack();
      } else {
        Alert.alert('Ошибка', data.error || 'Неизвестная ошибка');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    } finally {
      setCreating(false);
    }
  };

  if (loadingUsers) return <View style={appStyles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <View style={appStyles.container}>
      <Text style={appStyles.title}>Новый чат</Text>

      {/* Выбор типа */}
      <Text style={appStyles.label}>Тип</Text>
      <View style={appStyles.typeRow}>
        <TouchableOpacity
          style={[appStyles.typeButton, type === 'group' && appStyles.typeButtonActive]}
          onPress={() => { setType('group'); setSelectedUserIds([]); }}
        >
          <Text style={[appStyles.typeButtonText, type === 'group' && appStyles.typeButtonTextActive]}>Группа</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[appStyles.typeButton, type === 'private' && appStyles.typeButtonActive]}
          onPress={() => { setType('private'); setSelectedUserIds([]); }}
        >
          <Text style={[appStyles.typeButtonText, type === 'private' && appStyles.typeButtonTextActive]}>Личный</Text>
        </TouchableOpacity>
      </View>

      {type === 'group' && (
        <TextInput
          style={appStyles.input}
          placeholder="Название группы"
          value={name}
          onChangeText={setName}
        />
      )}

      {/* Поиск пользователей */}
      <TextInput
        style={appStyles.searchInput}
        placeholder="Поиск по имени..."
        value={search}
        onChangeText={setSearch}
      />

      {/* Список пользователей */}
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const currentUserId = require('../screens/AuthScreen').getCurrentUserId();
          if (item.id === currentUserId) return null; // не показываем себя
          const isSelected = selectedUserIds.includes(item.id);
          return (
            <TouchableOpacity
              style={[appStyles.userItem, isSelected && appStyles.userItemSelected]}
              onPress={() => toggleUser(item.id)}
            >
              <View style={[appStyles.checkbox, isSelected && appStyles.checkboxChecked]}>
                {isSelected && <Text style={{ color: '#fff', fontWeight: 'bold' }}>✓</Text>}
              </View>
              <View style={appStyles.userAvatar}>
                <Text style={appStyles.userAvatarText}>
                  {(item.display_name || item.username)[0].toUpperCase()}
                </Text>
              </View>
              <Text style={appStyles.userName}>{item.display_name || item.username}</Text>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ paddingBottom: 20 }}
      />

      {/* Кнопка создания */}
      <TouchableOpacity
        style={[appStyles.createButton, creating && appStyles.disabledButton]}
        onPress={handleCreate}
        disabled={creating}
      >
        <Text style={appStyles.createButtonText}>{creating ? 'Создаём...' : 'Создать чат'}</Text>
      </TouchableOpacity>
    </View>
  );
}
