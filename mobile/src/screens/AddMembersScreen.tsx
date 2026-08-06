import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Platform,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ChevronLeft, UserPlus, Check, Search } from 'lucide-react-native';
import { getToken, SERVER_URL } from '../utils';

const AVATAR_COLORS = ['#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#0EA5E9', '#14B8A6', '#EF4444'];
const hashColor = (s: string) => {
  const sum = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};
const initials = (name: string) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export default function AddMembersScreen({ route, navigation }: any) {
  const { chatId } = route.params;
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [addingId, setAddingId] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    const tok = await getToken();
    if (!tok) return;
    try {
      const [usersRes, chatsRes] = await Promise.all([
        fetch(`${SERVER_URL}/api/users`, { headers: { Authorization: `Bearer ${tok}` } }),
        fetch(`${SERVER_URL}/api/chats`, { headers: { Authorization: `Bearer ${tok}` } }),
      ]);
      const usersData = await usersRes.json();
      const chatsData = await chatsRes.json();
      const chat = chatsData.find((c: any) => String(c.id) === String(chatId));
      const memberIds = chat?.members?.map((m: any) => m.id) || [];
      setUsers(usersData.filter((u: any) => !memberIds.includes(u.id)));
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить пользователей');
    }
    setLoading(false);
  }, [chatId]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const addMember = async (userId: number) => {
    setAddingId(userId);
    try {
      const tok = await getToken();
      const res = await fetch(`${SERVER_URL}/api/chats/${chatId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ user_ids: [userId] }),
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== userId));
      } else {
        const err = await res.json();
        Alert.alert('Ошибка', err.error || 'Не удалось добавить');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    }
    setAddingId(null);
  };

  const filtered = search.trim()
    ? users.filter((u) =>
        (u.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (u.username || '').toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ДОБАВИТЬ УЧАСТНИКОВ</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Search size={18} color="#6F6F73" strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск людей..."
            placeholderTextColor="#BDBDBD"
            value={search}
            onChangeText={setSearch}
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#1F7A52" /></View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyCard}>
          <UserPlus size={32} color="#BDBDBD" strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>Все уже в чате</Text>
          <Text style={styles.emptySubtitle}>Нет пользователей вне этого чата</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.userCard}>
              <View style={[styles.avatar, { backgroundColor: hashColor(item.display_name || item.username) }]}>
                <Text style={styles.avatarText}>{initials(item.display_name || item.username)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.userName}>{item.display_name || item.username}</Text>
                <Text style={styles.userUsername}>@{item.username}</Text>
              </View>
              <TouchableOpacity
                onPress={() => addMember(item.id)}
                disabled={addingId === item.id}
                style={[styles.addBtn, addingId === item.id && { backgroundColor: '#D1FAE5' }]}
                activeOpacity={0.7}
              >
                {addingId === item.id ? (
                  <Check size={18} color="#1F7A52" strokeWidth={2.5} />
                ) : (
                  <UserPlus size={18} color="#FFFFFF" strokeWidth={2} />
                )}
              </TouchableOpacity>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ECECE8',
  },
  headerBackBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 22, fontWeight: '900', color: '#141414', letterSpacing: 1,
  },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 12 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF',
    borderRadius: 16, paddingHorizontal: 14, height: 44, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#141414', fontWeight: '500', padding: 0 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listContent: { paddingHorizontal: 16, gap: 10, paddingBottom: 30 },
  userCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 12, elevation: 2,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  userName: { fontSize: 15, fontWeight: '700', color: '#141414' },
  userUsername: { fontSize: 12, color: '#6F6F73', marginTop: 1 },
  addBtn: {
    width: 40, height: 40, borderRadius: 14, backgroundColor: '#1F7A52',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyCard: { marginHorizontal: 16, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 32, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#141414', marginTop: 4 },
  emptySubtitle: { fontSize: 12, color: '#6F6F73', textAlign: 'center' },
});