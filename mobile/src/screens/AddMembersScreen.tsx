import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { getToken, SERVER_URL } from '../utils';
import { getStyles } from '../styles/appStyles';
import { useTheme } from '../theme/ThemeContext';

export default function AddMembersScreen({ route, navigation }: any) {
  const { chatId } = route.params;
  const [users, setUsers] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const styles = getStyles(theme);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const tok = await getToken();
    if (!tok) return;
    const [usersRes, chatsRes] = await Promise.all([
      fetch(`${SERVER_URL}/api/users`, { headers: { Authorization: `Bearer ${tok}` } }),
      fetch(`${SERVER_URL}/api/chats`, { headers: { Authorization: `Bearer ${tok}` } })
    ]);
    const usersData = await usersRes.json();
    const chatsData = await chatsRes.json();
    const chat = chatsData.find((c: any) => c.id == chatId);
    const memberIds = chat?.members?.map((m: any) => m.id) || [];
    setUsers(usersData.filter((u: any) => !memberIds.includes(u.id)));
    setMembers(chat?.members || []);
    setLoading(false);
  };

  const addMember = async (userId: number) => {
    const tok = await getToken();
    const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ user_ids: [userId] }),
    });
    if (res.ok) {
      Alert.alert('Успешно', 'Участник добавлен');
      loadData();
    } else {
      const err = await res.json();
      Alert.alert('Ошибка', err.error);
    }
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <View style={styles.container}>
      <FlatList
        data={users}
        keyExtractor={item => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.userItem} onPress={() => addMember(item.id)}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarText}>{(item.username||'?')[0].toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.userName}>{item.display_name || item.username}</Text>
              <Text style={{ color: '#999', fontSize: 12 }}>@{item.username}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
