import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getToken, SERVER_URL } from '../utils';
import { getStyles } from '../styles/appStyles';
import { useTheme } from '../theme/ThemeContext';

export default function ChatListScreen({ navigation, onLogout }: { navigation: any; onLogout: () => void }) {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const styles = getStyles(theme);

  const loadChats = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setChats(data);
    } catch (e) {} finally { setLoading(false); }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadChats();
    }, [loadChats])
  );

  useEffect(() => {
    navigation.setOptions({
      headerStyle: { backgroundColor: theme === 'dark' ? '#1a1a1a' : '#f8f9fa' },
      headerTintColor: '#007bff',
      headerTitleStyle: { fontWeight: '600', fontSize: 18, color: theme === 'dark' ? '#fff' : '#000' },
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Text style={{ fontSize: 24, marginRight: 10 }}>👤</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, theme]);

  const getInitial = (name: string) => (name || '?')[0].toUpperCase();

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <View style={styles.container}>
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.chatItem}
            onPress={() => {
              if (item.is_supergroup) {
                navigation.navigate('TopicList', { chatId: item.id.toString(), chatName: item.name });
              } else {
                navigation.navigate('Chat', { chatId: item.id.toString(), chatName: item.name });
              }
            }}
          >
            <View style={styles.chatItemContent}>
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>{getInitial(item.name || 'G')}</Text>
              </View>
              <View style={styles.chatInfo}>
                <Text style={styles.chatName}>{item.name || 'Чат'}</Text>
                {item.last_message && (
                  <Text style={styles.lastMsg} numberOfLines={1}>
                    {item.last_message.text || '📎 Файл'}
                  </Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.createButton} onPress={() => navigation.navigate('CreateChat')}>
          <Text style={styles.createButtonText}>Создать чат</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.logoutButton} onPress={onLogout}>
          <Text style={styles.logoutText}>Выйти</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
