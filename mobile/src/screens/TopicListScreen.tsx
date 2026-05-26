import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, TextInput, Button,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getToken, SERVER_URL } from '../utils';
import { appStyles } from '../styles/appStyles';

export default function TopicListScreen({ route, navigation }: any) {
  const { chatId, chatName } = route.params;
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTopicTitle, setNewTopicTitle] = useState('');

  // Кнопка ℹ️ в шапке
  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('ChatInfo', { chatId })} style={{ padding: 8 }}>
          <Text style={{ fontSize: 22, color: '#007bff' }}>ℹ️</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, chatId]);

  const loadTopics = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/topics`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setTopics(data);
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить топики');
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useFocusEffect(useCallback(() => { loadTopics(); }, [loadTopics]));

  const createTopic = async () => {
    if (!newTopicTitle.trim()) return;
    const token = await getToken();
    try {
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/topics`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ title: newTopicTitle }),
      });
      if (res.ok) {
        setNewTopicTitle('');
        loadTopics();
      } else {
        const err = await res.json();
        Alert.alert('Ошибка', err.error);
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    }
  };

  if (loading) return <View style={appStyles.centered}><ActivityIndicator size="large" /></View>;

  const displayTopics = [{ id: null, title: 'Общий чат' }, ...topics];

  return (
    <View style={appStyles.container}>
      <Text style={appStyles.screenTitle}>{chatName} — Топики</Text>
      <FlatList
        data={displayTopics}
        keyExtractor={(item, index) => item.id?.toString() || `general-${index}`}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={appStyles.chatItem}
            onPress={() => {
              const topicId = item.id ? item.id : null;
              navigation.navigate('Chat', {
                chatId: chatId.toString(),
                chatName: item.title,
                topicId: topicId,
              });
            }}
          >
            <View style={appStyles.chatItemContent}>
              <View style={appStyles.avatarPlaceholder}>
                <Text style={appStyles.avatarText}>{item.id ? '#' : 'G'}</Text>
              </View>
              <View style={appStyles.chatInfo}>
                <Text style={appStyles.chatName}>{item.title}</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 8 }}>
        <TextInput
          style={[appStyles.input, { flex: 1, marginRight: 8 }]}
          placeholder="Новый топик"
          value={newTopicTitle}
          onChangeText={setNewTopicTitle}
        />
        <Button title="Создать" onPress={createTopic} />
      </View>
    </View>
  );
}
