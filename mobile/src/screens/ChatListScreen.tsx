import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, SafeAreaView, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getToken, SERVER_URL } from '../utils';
import { ChatRow } from '../components/ChatRow';
import { TelegramColors, TelegramSizes, TelegramFonts } from '../theme/telegramTheme';
import { useTheme } from '../theme/ThemeContext';

export default function ChatListScreen({ navigation, onLogout }: { navigation: any; onLogout: () => void }) {
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { theme } = useTheme();
  const isDark = theme === 'dark';

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

  const formatTime = (ts: string) => {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 1) return 'Вчера';
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? TelegramColors.dark.background : TelegramColors.light.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: isDark ? TelegramColors.dark.primaryText : TelegramColors.light.primaryText }}>Загрузка...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? TelegramColors.dark.background : TelegramColors.light.background }}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      {/* Header */}
      <View style={{
        height: TelegramSizes.headerHeight,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        backgroundColor: isDark ? TelegramColors.dark.secondaryBackground : TelegramColors.light.secondaryBackground,
        borderBottomWidth: 1,
        borderBottomColor: isDark ? TelegramColors.dark.divider : TelegramColors.light.divider,
      }}>
        <Text style={{
          flex: 1,
          fontSize: TelegramFonts.sizes.title,
          fontWeight: TelegramFonts.weights.bold,
          color: isDark ? TelegramColors.dark.primaryText : TelegramColors.light.primaryText,
        }}>mesNation</Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateChat')} style={{ padding: 8 }}>
          <Text style={{ fontSize: 22, color: TelegramColors.light.accent }}>✚</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')} style={{ padding: 8 }}>
          <Text style={{ fontSize: 22, color: TelegramColors.light.accent }}>👤</Text>
        </TouchableOpacity>
      </View>

      {/* Список чатов */}
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <ChatRow
            title={item.name || 'Чат'}
            lastMessage={item.last_message?.text || ''}
            time={formatTime(item.last_message?.created_at)}
            unreadCount={0}
            avatar={undefined}
            isPinned={false}
            isMuted={false}
            onPress={() => {
              if (item.is_supergroup) {
                navigation.navigate('TopicList', { chatId: item.id.toString(), chatName: item.name });
              } else {
                navigation.navigate('Chat', { chatId: item.id.toString(), chatName: item.name });
              }
            }}
          />
        )}
      />

      {/* Кнопка выхода (как раньше) */}
      <View style={{ padding: 16 }}>
        <TouchableOpacity
          style={{
            paddingVertical: 14,
            borderRadius: 12,
            alignItems: 'center',
            backgroundColor: isDark ? TelegramColors.dark.secondaryBackground : TelegramColors.light.secondaryBackground,
          }}
          onPress={onLogout}
        >
          <Text style={{ color: isDark ? TelegramColors.dark.primaryText : TelegramColors.light.primaryText, fontSize: 16 }}>Выйти</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
