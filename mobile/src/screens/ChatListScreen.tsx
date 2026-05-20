import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getToken, SERVER_URL } from '../utils';
import { appStyles } from '../styles/appStyles';

export default function ChatListScreen({ navigation, onLogout }: { navigation: any; onLogout: () => void }) {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleLogout = async () => {
    const RNFS = require('react-native-fs');
    try { await RNFS.unlink(`${RNFS.DocumentDirectoryPath}/token.txt`); } catch (e) {}
    onLogout();
  };

  if (loading) return <View style={appStyles.centered}><ActivityIndicator size="large" /></View>;

  return (
    <View style={appStyles.container}>
      <Text style={appStyles.screenTitle}>Чаты</Text>
      <TouchableOpacity
        style={appStyles.chatItem}
        onPress={() => navigation.navigate('Chat', { chatId: 'general', chatName: 'Общий чат' })}
      >
        <View style={appStyles.chatItemContent}>
          <View style={appStyles.avatarPlaceholder}><Text style={appStyles.avatarText}>G</Text></View>
          <View style={appStyles.chatInfo}>
            <Text style={appStyles.chatName}>Общий чат</Text>
            <Text style={appStyles.lastMsg}>Доступен всем сотрудникам</Text>
          </View>
        </View>
      </TouchableOpacity>

      <FlatList
        data={chats}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => {
          const isPrivate = item.type === 'private';
          const currentUserId = require('../screens/AuthScreen').getCurrentUserId();
          const displayName = item.name || (isPrivate && item.members ? item.members.find((p: any) => p.id !== currentUserId)?.display_name || 'Собеседник' : 'Чат');
          const avatarLetter = (displayName[0] || '?').toUpperCase();
          return (
            <TouchableOpacity
              style={appStyles.chatItem}
              onPress={() => navigation.navigate('Chat', { chatId: item.id.toString(), chatName: displayName })}
            >
              <View style={appStyles.chatItemContent}>
                <View style={appStyles.avatarPlaceholder}><Text style={appStyles.avatarText}>{avatarLetter}</Text></View>
                <View style={appStyles.chatInfo}>
                  <Text style={appStyles.chatName}>{displayName}</Text>
                  {item.last_message && <Text style={appStyles.lastMsg}>{item.last_message.text?.substring(0, 40)}</Text>}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        contentContainerStyle={{ paddingBottom: 20 }}
      />
      <View style={appStyles.buttons}>
        <TouchableOpacity style={appStyles.createButton} onPress={() => navigation.navigate('CreateChat')}>
          <Text style={appStyles.createButtonText}>+ Создать чат</Text>
        </TouchableOpacity>
        <TouchableOpacity style={appStyles.logoutButton} onPress={handleLogout}>
          <Text style={appStyles.logoutText}>Выйти</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
