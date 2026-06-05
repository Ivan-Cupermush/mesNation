import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  FlatList, ActivityIndicator,
} from 'react-native';
import { getToken, SERVER_URL } from '../utils';
import { getStyles } from '../styles/appStyles';
import { useTheme } from '../theme/ThemeContext';

export default function ManageEmployeesScreen({ navigation }: any) {
  const [users, setUsers] = useState<any[]>([]);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState('employee');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${SERVER_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (e) {}
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const handleCreate = async () => {
    if (!username.trim() || !email.trim() || !password.trim()) {
      Alert.alert('Ошибка', 'Заполните обязательные поля');
      return;
    }
    setAdding(true);
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch(`${SERVER_URL}/api/admin/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username, email, password,
          display_name: displayName || username,
          position, role
        }),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Успех', `Сотрудник ${data.username} создан`);
        setUsername(''); setEmail(''); setPassword(''); setDisplayName(''); setPosition('');
        loadUsers(); // обновить список
      } else {
        Alert.alert('Ошибка', data.error || 'Не удалось создать');
      }
    } catch (err: any) {
      Alert.alert('Ошибка', `Сервер недоступен: ${err.message}`);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (userId: number) => {
    Alert.alert('Удалить сотрудника?', 'Это действие нельзя отменить.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive',
        onPress: async () => {
          try {
            const token = await getToken();
            if (!token) return;
            const res = await fetch(`${SERVER_URL}/api/admin/users/${userId}`, {
              method: 'DELETE',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
              loadUsers();
            } else {
              const data = await res.json();
              Alert.alert('Ошибка', data.error || 'Не удалось удалить');
            }
          } catch (err: any) {
            Alert.alert('Ошибка', `Сервер недоступен: ${err.message}`);
          }
        },
      },
    ]);
  };

  return (
    <View style={[styles.container, { padding: 16 }]}>
      <Text style={styles.label}>Добавить сотрудника</Text>
      <TextInput style={styles.input} placeholder="Имя пользователя *" value={username} onChangeText={setUsername} autoCapitalize="none" editable={!adding} />
      <TextInput style={styles.input} placeholder="Email *" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" editable={!adding} />
      <TextInput style={styles.input} placeholder="Пароль *" value={password} onChangeText={setPassword} secureTextEntry editable={!adding} />
      <TextInput style={styles.input} placeholder="Отображаемое имя" value={displayName} onChangeText={setDisplayName} editable={!adding} />
      <TextInput style={styles.input} placeholder="Должность" value={position} onChangeText={setPosition} editable={!adding} />
      <TextInput style={styles.input} placeholder="Роль (employee, manager, director)" value={role} onChangeText={setRole} autoCapitalize="none" editable={!adding} />
      <TouchableOpacity style={[styles.createButton, adding && styles.disabledButton]} onPress={handleCreate} disabled={adding}>
        <Text style={styles.createButtonText}>{adding ? 'Создание...' : 'Создать'}</Text>
      </TouchableOpacity>

      <Text style={[styles.label, { marginTop: 20 }]}>Список сотрудников ({users.length})</Text>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <FlatList
          data={users}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: '600' }}>{item.display_name || item.username}</Text>
                <Text style={{ fontSize: 12, color: '#666' }}>{item.position || '—'} | {item.email}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item.id)}>
                <Text style={{ color: 'red' }}>Удалить</Text>
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}
