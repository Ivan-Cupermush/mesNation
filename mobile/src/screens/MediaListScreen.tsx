import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, Image, ActivityIndicator, Alert,
} from 'react-native';
import { getToken, SERVER_URL } from '../utils';
import { getStyles } from '../styles/appStyles';
import { useTheme } from '../theme/ThemeContext';

export default function MediaListScreen({ route, navigation }: any) {
  const { chatId, type } = route.params; // type: 'files' | 'images'
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<number | null>(null);
  const { theme } = useTheme();
  const styles = getStyles(theme);

  useEffect(() => {
    loadItems();
  }, []);

  const loadItems = async (before?: number) => {
    const tok = await getToken();
    if (!tok) return;
    try {
      const url = `${SERVER_URL}/api/chats/${chatId}/messages?type=${type}&limit=20${before ? `&before=${before}` : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } });
      const data = await res.json();
      if (res.ok) {
        if (before) {
          setItems(prev => [...prev, ...data]);
        } else {
          setItems(data);
        }
        if (data.length > 0) {
          setCursor(data[data.length - 1].id);
        }
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить');
    } finally {
      setLoading(false);
    }
  };

  const loadMore = () => {
    if (cursor) loadItems(cursor);
  };

  const handlePress = (item: any) => {
    // Переходим в чат с указанием messageId (пока без скролла)
    navigation.navigate('Chat', {
      chatId: item.chat_id.toString(),
      chatName: 'Чат',
      messageId: item.id,
      topicId: item.topic_id || null,
    });
  };

  const renderItem = ({ item }: any) => (
    <TouchableOpacity style={{ marginBottom: 10 }} onPress={() => handlePress(item)}>
      {item.thumb_url ? (
        <Image source={{ uri: SERVER_URL + item.thumb_url }} style={{ width: '100%', height: 200, borderRadius: 8 }} />
      ) : (
        <View style={{ backgroundColor: theme === 'dark' ? '#2c2c2e' : '#f0f0f0', padding: 15, borderRadius: 8 }}>
          <Text style={{ fontSize: 16, color: theme === 'dark' ? '#fff' : '#000' }}>📄 {item.file_name || 'Файл'}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <View style={[styles.container, { padding: 10 }]}>
      <FlatList
        data={items}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
    </View>
  );
}
