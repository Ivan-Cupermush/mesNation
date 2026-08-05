import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  TextInput,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  UserRound,
  Users,
  Search,
  Check,
  Layers,
} from 'lucide-react-native';
import { getToken, SERVER_URL } from '../utils';

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

export default function CreateChatScreen({ navigation }: any) {
  const [type, setType] = useState<'private' | 'group'>('private');
  const [name, setName] = useState('');
  const [isSupergroup, setIsSupergroup] = useState(false);

  const [users, setUsers] = useState<any[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const [meRes, usersRes] = await Promise.all([
        fetch(`${SERVER_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${SERVER_URL}/api/users`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      if (meRes.ok) {
        const me = await meRes.json();
        setMeId(me.id);
      }
      if (usersRes.ok) {
        setUsers(await usersRes.json());
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить пользователей');
    }
    setLoadingUsers(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const otherUsers = users.filter((u) => u.id !== meId);
  const filteredUsers = search.trim()
    ? otherUsers.filter(
        (u) =>
          (u.username || '').toLowerCase().includes(search.trim().toLowerCase()) ||
          (u.display_name || '').toLowerCase().includes(search.trim().toLowerCase()),
      )
    : otherUsers;

  const toggleUser = (id: number) => {
    if (type === 'private') {
      setSelectedIds([id]);
    } else {
      setSelectedIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
      );
    }
  };

  const canCreate =
    type === 'private' ? selectedIds.length === 1 : name.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    const token = await getToken();
    if (!token) {
      Alert.alert('Ошибка', 'Нет токена');
      setCreating(false);
      return;
    }
    try {
      const body: any = { type, user_ids: selectedIds };
      if (type === 'group') {
        body.name = name.trim();
        body.is_supergroup = isSupergroup;
      }
      const res = await fetch(`${SERVER_URL}/api/chats`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        Alert.alert('Успех', 'Чат создан');
        navigation.goBack();
      } else {
        Alert.alert('Ошибка', data.error || 'Не удалось создать чат');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    } finally {
      setCreating(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>НОВЫЙ ЧАТ</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ===== ТИП ЧАТА ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <Users size={18} color="#1F7A52" strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Тип чата</Text>
          </View>

          <View style={styles.typeRow}>
            <TouchableOpacity
              onPress={() => {
                setType('private');
                setSelectedIds((prev) => prev.slice(0, 1));
              }}
              style={[styles.typeCard, type === 'private' && styles.typeCardActive]}
              activeOpacity={0.7}
            >
              <UserRound
                size={24}
                color={type === 'private' ? '#1F7A52' : '#6F6F73'}
                strokeWidth={2}
              />
              <Text
                style={[
                  styles.typeCardText,
                  type === 'private' && styles.typeCardTextActive,
                ]}
              >
                Личный
              </Text>
              <Text style={styles.typeCardHint}>Один собеседник</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setType('group')}
              style={[styles.typeCard, type === 'group' && styles.typeCardActive]}
              activeOpacity={0.7}
            >
              <Users
                size={24}
                color={type === 'group' ? '#1F7A52' : '#6F6F73'}
                strokeWidth={2}
              />
              <Text
                style={[styles.typeCardText, type === 'group' && styles.typeCardTextActive]}
              >
                Группа
              </Text>
              <Text style={styles.typeCardHint}>Много участников</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ===== НАЗВАНИЕ + СУПЕРГРУППА (только для группы) ===== */}
        {type === 'group' && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <Layers size={18} color="#1F7A52" strokeWidth={2} />
              </View>
              <Text style={styles.cardTitle}>Параметры группы</Text>
            </View>

            <Text style={styles.fieldLabel}>Название</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Например: Отдел продаж"
              placeholderTextColor="#BDBDBD"
              value={name}
              onChangeText={setName}
            />

            <View style={styles.divider} />

            <TouchableOpacity
              onPress={() => setIsSupergroup(!isSupergroup)}
              style={styles.supergroupRow}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.supergroupTitle}>Супергруппа</Text>
                <Text style={styles.supergroupHint}>
                  Топики, администраторы и права
                </Text>
              </View>
              <View style={[styles.toggle, isSupergroup && styles.toggleActive]}>
                <View style={[styles.toggleKnob, isSupergroup && styles.toggleKnobActive]} />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ===== УЧАСТНИКИ ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <UserRound size={18} color="#1F7A52" strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>
              {type === 'private' ? 'Собеседник' : 'Участники'}
            </Text>
            {selectedIds.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{selectedIds.length}</Text>
              </View>
            )}
          </View>

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

          {loadingUsers ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color="#1F7A52" />
            </View>
          ) : filteredUsers.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {search.trim() ? 'Никого не нашли' : 'Нет доступных пользователей'}
              </Text>
            </View>
          ) : (
            filteredUsers.map((u) => {
              const selected = selectedIds.includes(u.id);
              return (
                <TouchableOpacity
                  key={u.id}
                  onPress={() => toggleUser(u.id)}
                  style={[styles.userRow, selected && styles.userRowSelected]}
                  activeOpacity={0.7}
                >
                  <View style={[styles.userAvatar, { backgroundColor: hashColor(u.display_name || u.username) }]}>
                    <Text style={styles.userAvatarText}>
                      {initials(u.display_name || u.username)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.userName}>
                      {u.display_name || u.username}
                    </Text>
                    <Text style={styles.userUsername}>@{u.username}</Text>
                  </View>
                  {selected && (
                    <View style={styles.checkCircle}>
                      <Check size={14} color="#FFFFFF" strokeWidth={3} />
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* ===== КНОПКА СОЗДАНИЯ ===== */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={handleCreate}
          disabled={!canCreate || creating}
          style={[
            styles.createBtn,
            { backgroundColor: canCreate && !creating ? '#1F7A52' : '#ECECE8' },
          ]}
          activeOpacity={0.85}
        >
          {creating ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.createBtnText}>Создать чат</Text>
          )}
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ECECE8',
    backgroundColor: '#FAFAF8',
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

  // ===== SCROLL =====
  scrollContent: { padding: 20, gap: 20 },

  // ===== CARD =====
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
    gap: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#141414',
    flex: 1,
  },
  countBadge: {
    backgroundColor: '#1F7A52',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // ===== TYPE =====
  typeRow: { flexDirection: 'row', gap: 12 },
  typeCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#ECECE8',
    backgroundColor: '#FAFAF8',
  },
  typeCardActive: {
    borderColor: '#1F7A52',
    backgroundColor: '#ECFDF5',
  },
  typeCardText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#6F6F73',
  },
  typeCardTextActive: { color: '#1F7A52' },
  typeCardHint: {
    fontSize: 11,
    color: '#BDBDBD',
    fontWeight: '500',
  },

  // ===== FIELDS =====
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6F6F73',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  textInput: {
    fontSize: 16,
    color: '#141414',
    fontWeight: '500',
    paddingVertical: 8,
  },
  divider: { height: 1, backgroundColor: '#ECECE8' },

  // ===== SUPERGROUP TOGGLE =====
  supergroupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  supergroupTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#141414',
  },
  supergroupHint: {
    fontSize: 12,
    color: '#6F6F73',
    marginTop: 2,
  },
  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ECECE8',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  toggleActive: { backgroundColor: '#1F7A52' },
  toggleKnob: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  toggleKnobActive: {
    alignSelf: 'flex-end',
  },

  // ===== SEARCH =====
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAFAF8',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#ECECE8',
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#141414',
    marginLeft: 8,
    fontWeight: '500',
    padding: 0,
  },

  // ===== USERS =====
  loadingWrap: { paddingVertical: 24, alignItems: 'center' },
  emptyWrap: { paddingVertical: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#BDBDBD', fontWeight: '500' },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#FAFAF8',
    marginBottom: 8,
  },
  userRowSelected: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#1F7A52',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#141414',
  },
  userUsername: {
    fontSize: 12,
    color: '#6F6F73',
    marginTop: 1,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1F7A52',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ===== BOTTOM =====
  bottomBar: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#ECECE8',
  },
  createBtn: {
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F7A52',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  createBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});