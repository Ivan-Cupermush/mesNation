import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { getToken, SERVER_URL } from '../utils';
import { getStyles } from '../styles/appStyles';
import { useTheme } from '../theme/ThemeContext';

export default function TopicInfoScreen({ route, navigation }: any) {
  const { chatId, topicId } = route.params;
  const [topic, setTopic] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const { theme } = useTheme();
  const styles = getStyles(theme);

  useEffect(() => { loadTopic(); }, []);

  const loadTopic = async () => {
    const tok = await getToken();
    const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/topics`, { headers: { Authorization: `Bearer ${tok}` } });
    const topics = await res.json();
    const found = topics.find((t: any) => t.id == topicId);
    if (found) {
      setTopic(found);
      setNewTitle(found.title);
    }
    setLoading(false);
  };

  const handleRename = async () => {
    if (!newTitle.trim()) return;
    const tok = await getToken();
    const res = await fetch(`${SERVER_URL}/api/topics/${topicId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ title: newTitle }),
    });
    if (res.ok) {
      Alert.alert('Успешно', 'Название изменено');
      setEditingTitle(false);
      loadTopic();
    } else {
      const data = await res.json();
      Alert.alert('Ошибка', data.error || 'Не удалось переименовать');
    }
  };

  const handleDelete = () => {
    Alert.alert('Удалить топик?', 'Сообщения в топике будут перенесены в общий чат.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive',
        onPress: async () => {
          const tok = await getToken();
          const res = await fetch(`${SERVER_URL}/api/topics/${topicId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${tok}` },
          });
          if (res.ok) {
            Alert.alert('Успешно', 'Топик удалён');
            navigation.goBack();
          } else {
            const data = await res.json();
            Alert.alert('Ошибка', data.error || 'Не удалось удалить');
          }
        },
      },
    ]);
  };

  if (loading) return <View style={styles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <View style={[styles.container, { padding: 16 }]}>
      <Text style={styles.label}>Название топика</Text>
      {editingTitle ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput style={[styles.input, { flex: 1 }]} value={newTitle} onChangeText={setNewTitle} />
          <TouchableOpacity style={styles.createButton} onPress={handleRename}>
            <Text style={styles.createButtonText}>Сохранить</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setEditingTitle(false)}>
            <Text style={{ color: '#999' }}>Отмена</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 18, fontWeight: '600', color: theme === 'dark' ? '#fff' : '#1a1a1a' }}>{topic?.title}</Text>
          <TouchableOpacity onPress={() => setEditingTitle(true)}>
            <Text style={{ color: '#007bff' }}>Изменить</Text>
          </TouchableOpacity>
        </View>
      )}
      <TouchableOpacity style={[styles.logoutButton, { marginTop: 20 }]} onPress={handleDelete}>
        <Text style={styles.logoutText}>Удалить топик</Text>
      </TouchableOpacity>
    </View>
  );
}
