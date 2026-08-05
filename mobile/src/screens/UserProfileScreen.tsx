import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, RouteProp } from '@react-navigation/native';
import {
  ChevronLeft,
  MessageCircle,
  Users,
  AtSign,
  Mail,
  ChevronRight,
} from 'lucide-react-native';
import { getToken, SERVER_URL } from '../utils';

type ProfileRouteProp = RouteProp<{ params: { userId: number } }, 'params'>;

const AVATAR_COLORS = [
  '#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899',
  '#F59E0B', '#0EA5E9', '#14B8A6', '#EF4444',
];

const hashColor = (s: string) => {
  const sum = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const initials = (name: string) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function UserProfileScreen({ navigation }: any) {
  const route = useRoute<ProfileRouteProp>();
  const userId = route.params.userId;

  const [user, setUser] = useState<any>(null);
  const [commonChats, setCommonChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarMode, setAvatarMode] = useState<'direct' | 'token' | 'fallback'>('direct');

  const loadChatMembers = async (chatId: number, token: string): Promise<any[]> => {
    try {
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.members)) return data.members;
      }
    } catch (e) {}
    try {
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/members`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.members)) return data.members;
      }
    } catch (e) {}
    return [];
  };

  const load = useCallback(async () => {
    const token = await getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const usersRes = await fetch(`${SERVER_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (usersRes.ok) {
        const users = await usersRes.json();
        setUser(users.find((u: any) => u.id === userId) || null);
      }

      const chatsRes = await fetch(`${SERVER_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (chatsRes.ok) {
        const chats = await chatsRes.json();
        const common: any[] = [];
        for (const c of chats) {
          if (c.type === 'private') continue;
          const members = await loadChatMembers(c.id, token);
          if (members.some((m: any) => m.id === userId)) common.push(c);
        }
        setCommonChats(common);
      }
    } catch (e) {}
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  // ===== Аватар: прямой URL -> токен -> инициалы =====
  useEffect(() => {
    if (user?.avatar_url) {
      setAvatarMode('direct');
      setAvatarUri(SERVER_URL + user.avatar_url);
    } else {
      setAvatarMode('fallback');
      setAvatarUri(null);
    }
  }, [user?.avatar_url]);

  const handleAvatarError = async () => {
    if (avatarMode === 'direct') {
      try {
        const tok = await getToken();
        const filename = String(user?.avatar_url || '').split('/').pop();
        const res = await fetch(`${SERVER_URL}/api/file-token/${filename}`, {
          headers: { Authorization: `Bearer ${tok}` },
        });
        const data = await res.json();
        if (res.ok && data.url) {
          setAvatarMode('token');
          setAvatarUri(SERVER_URL + data.url);
          return;
        }
      } catch (e) {}
      setAvatarMode('fallback');
      setAvatarUri(null);
    } else if (avatarMode === 'token') {
      setAvatarMode('fallback');
      setAvatarUri(null);
    }
  };

  // ===== Написать: найти личный чат или создать =====
  const openPrivateChat = async () => {
    const token = await getToken();
    if (!token || !user) return;
    try {
      const chatsRes = await fetch(`${SERVER_URL}/api/chats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (chatsRes.ok) {
        const chats = await chatsRes.json();
        for (const c of chats) {
          if (c.type !== 'private') continue;
          const members = await loadChatMembers(c.id, token);
          if (members.some((m: any) => m.id === userId)) {
            navigation.navigate('ChatTab', {
              screen: 'Chat',
              params: { chatId: String(c.id), chatName: user.display_name || user.username },
            });
            return;
          }
        }
      }
      const res = await fetch(`${SERVER_URL}/api/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ type: 'private', user_ids: [userId] }),
      });
      const data = await res.json();
      if (res.ok) {
        navigation.navigate('ChatTab', {
          screen: 'Chat',
          params: { chatId: String(data.id), chatName: user.display_name || user.username },
        });
      } else {
        Alert.alert('Ошибка', data.error || 'Не удалось создать чат');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    }
  };

  const openCommonChat = (c: any) => {
    if (c.is_supergroup) {
      navigation.navigate('ChatTab', {
        screen: 'TopicList',
        params: { chatId: String(c.id), chatName: c.name },
      });
    } else {
      navigation.navigate('ChatTab', {
        screen: 'Chat',
        params: { chatId: String(c.id), chatName: c.name },
      });
    }
  };

  const name = user?.display_name || user?.username || '';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ПРОФИЛЬ</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#1F7A52" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ===== HERO ===== */}
          <View style={styles.heroCard}>
            <View style={styles.avatarWrap}>
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImage}
                  onError={handleAvatarError}
                />
              ) : (
                <View style={[styles.avatarImage, { backgroundColor: hashColor(name) }]}>
                  <Text style={styles.avatarInitials}>{initials(name)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.heroName} numberOfLines={1}>
              {name || '—'}
            </Text>
            <Text style={styles.heroUsername}>@{user?.username || '…'}</Text>
          </View>

          {/* ===== КОНТАКТЫ ===== */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <AtSign size={18} color="#1F7A52" strokeWidth={2} />
              </View>
              <Text style={styles.cardTitle}>Контакты</Text>
            </View>

            <View style={styles.contactRow}>
              <AtSign size={16} color="#6F6F73" strokeWidth={2} />
              <Text style={styles.contactText}>@{user?.username || '—'}</Text>
            </View>
            {user?.email ? (
              <View style={styles.contactRow}>
                <Mail size={16} color="#6F6F73" strokeWidth={2} />
                <Text style={styles.contactText}>{user.email}</Text>
              </View>
            ) : null}
          </View>

          {/* ===== ОБЩИЕ ГРУППЫ ===== */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <Users size={18} color="#1F7A52" strokeWidth={2} />
              </View>
              <Text style={styles.cardTitle}>Общие группы</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{commonChats.length}</Text>
              </View>
            </View>

            {commonChats.length === 0 ? (
              <Text style={styles.emptyText}>Нет общих групп</Text>
            ) : (
              commonChats.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={styles.commonRow}
                  onPress={() => openCommonChat(c)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.commonAvatar, { backgroundColor: hashColor(c.name) }]}>
                    <Text style={styles.commonAvatarText}>{initials(c.name)}</Text>
                  </View>
                  <Text style={styles.commonName} numberOfLines={1}>
                    {c.name}
                  </Text>
                  <ChevronRight size={16} color="#BDBDBD" strokeWidth={2} />
                </TouchableOpacity>
              ))
            )}
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      )}

      {/* ===== КНОПКА НАПИСАТЬ ===== */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={openPrivateChat}
          disabled={loading}
          style={styles.writeBtn}
          activeOpacity={0.85}
        >
          <MessageCircle size={20} color="#FFFFFF" strokeWidth={2} />
          <Text style={styles.writeBtnText}>Написать сообщение</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ECECE8',
  },
  headerBackBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: 1,
  },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, gap: 20 },

  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  avatarWrap: { marginBottom: 8 },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 30, fontWeight: '700', color: '#FFFFFF' },
  heroName: { fontSize: 20, fontWeight: '700', color: '#141414' },
  heroUsername: { fontSize: 14, color: '#6F6F73', fontWeight: '500' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
    gap: 12,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#141414', flex: 1 },
  countBadge: {
    backgroundColor: '#1F7A52',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  countBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  contactText: { fontSize: 15, fontWeight: '500', color: '#141414' },
  emptyText: { fontSize: 13, color: '#BDBDBD', fontWeight: '500' },

  commonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F5',
  },
  commonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commonAvatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  commonName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#141414' },

  bottomBar: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#ECECE8',
  },
  writeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#1F7A52',
    shadowColor: '#1F7A52',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  writeBtnText: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
});