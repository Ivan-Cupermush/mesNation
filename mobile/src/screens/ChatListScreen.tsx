import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  Search,
  Plus,
  Pin,
  MessageCircle,
  UserRound,
  Users,
} from 'lucide-react-native';
import { getToken, SERVER_URL } from '../utils';

// ===== Утилиты =====
const AVATAR_COLORS = [
  '#1F7A52',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#0EA5E9',
  '#14B8A6',
  '#EF4444',
];

const hashColor = (s: string) => {
  const sum = s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const initials = (name: string) =>
  (name || '?')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

const formatTime = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' });
};

export default function ChatListScreen({ navigation, onLogout }: any) {
  const [chats, setChats] = useState<any[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');

  const loadChats = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const [meRes, chatsRes] = await Promise.all([
        fetch(`${SERVER_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${SERVER_URL}/api/chats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (meRes.ok) {
        const me = await meRes.json();
        setMeId(me.id);
      }
      if (chatsRes.ok) {
        const data = await chatsRes.json();
        const sorted = [...data].sort(
          (a, b) =>
            new Date(b.last_message?.created_at || 0).getTime() -
            new Date(a.last_message?.created_at || 0).getTime(),
        );
        setChats(sorted);
      }
    } catch (e) {
      // тихо — покажем пустое состояние
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadChats();
    }, [loadChats]),
  );

  const filtered = query.trim()
    ? chats.filter((c) =>
        (c.name || '').toLowerCase().includes(query.trim().toLowerCase()),
      )
    : chats;

  const openChat = (item: any) => {
    if (item.is_supergroup) {
      navigation.navigate('TopicList', {
        chatId: item.id.toString(),
        chatName: item.name,
      });
    } else {
      navigation.navigate('Chat', {
        chatId: item.id.toString(),
        chatName: item.name,
      });
    }
  };

  const renderChat = ({ item }: any) => (
    <TouchableOpacity
      style={styles.chatCard}
      activeOpacity={0.7}
      onPress={() => openChat(item)}
    >
      <View
        style={[styles.avatar, { backgroundColor: hashColor(item.name || '?') }]}
      >
        <Text style={styles.avatarText}>{initials(item.name)}</Text>
      </View>

      <View style={styles.chatCenter}>
        <View style={styles.chatNameRow}>
          <Text style={styles.chatName} numberOfLines={1}>
            {item.name || 'Чат'}
          </Text>
          {item.is_supergroup && (
            <Users size={14} color="#BDBDBD" strokeWidth={2} />
          )}
        </View>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.last_message
            ? (item.last_message.sender_id === meId ? 'Вы: ' : '') +
              (item.last_message.text || '📎 Вложение')
            : 'Нет сообщений'}
        </Text>
      </View>

      <View style={styles.chatRight}>
        <Text style={styles.time}>
          {formatTime(item.last_message?.created_at)}
        </Text>
        {item.is_pinned ? (
          <Pin size={14} color="#1F7A52" strokeWidth={2} />
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <Text style={styles.title}>ЧАТЫ</Text>
        <TouchableOpacity
          style={styles.profileBtn}
          onPress={() => navigation.navigate('Profile')}
          activeOpacity={0.7}
        >
          <UserRound size={20} color="#1F7A52" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      {/* ===== ПОИСК ===== */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={20} color="#6F6F73" strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск чатов..."
            placeholderTextColor="#BDBDBD"
            value={query}
            onChangeText={setQuery}
          />
        </View>
      </View>

      {/* ===== СПИСОК ===== */}
      {loading && chats.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#1F7A52" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderChat}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadChats();
              }}
              tintColor="#1F7A52"
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <MessageCircle size={40} color="#BDBDBD" strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>
                {query.trim() ? 'Ничего не найдено' : 'Пока нет чатов'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {query.trim()
                  ? 'Попробуйте другой запрос'
                  : 'Нажмите «+», чтобы начать переписку'}
              </Text>
            </View>
          }
        />
      )}

      {/* ===== FAB: создать чат ===== */}
      <TouchableOpacity
        onPress={() => navigation.navigate('CreateChat')}
        activeOpacity={0.85}
        style={styles.fab}
      >
        <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },

  // ===== HEADER =====
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },

  // ===== SEARCH =====
  searchContainer: { paddingHorizontal: 24, marginBottom: 16 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#141414',
    marginLeft: 12,
    fontWeight: '500',
    padding: 0,
  },

  // ===== LIST =====
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 120,
    gap: 12,
  },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ===== CHAT CARD =====
  chatCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  chatCenter: { flex: 1 },
  chatNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  chatName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#141414',
    flexShrink: 1,
  },
  lastMessage: {
    fontSize: 13,
    color: '#6F6F73',
    fontWeight: '500',
  },
  chatRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  time: {
    fontSize: 12,
    color: '#BDBDBD',
    fontWeight: '500',
  },

  // ===== EMPTY =====
  emptyBlock: { alignItems: 'center', paddingTop: 64 },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#141414',
    marginTop: 16,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6F6F73',
    marginTop: 4,
  },

  // ===== FAB =====
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#1F7A52',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1F7A52',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
});