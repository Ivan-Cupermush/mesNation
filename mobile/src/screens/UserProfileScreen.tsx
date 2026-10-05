import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
  Image,
  Alert,
  Share,
  TextInput
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
  KeyRound
} from 'lucide-react-native';
import { api, CurrentUser } from '../services/api';
import { publicFileUrl, request } from '../services/http';

import { T, themed } from '../theme/runtime';
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

  const [user, setUser] = useState<(CurrentUser & { can_manage: boolean }) | null>(null);
  const [commonChats, setCommonChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [showPasswordInput, setShowPasswordInput] = useState(false);

  const load = useCallback(async () => {
    try {
      const [profile, chats] = await Promise.all([api.getUser(userId), request<any[]>('/api/chats')]);
      setUser(profile);
      // Сервер отдаёт участников вместе со списком чатов — отдельные запросы не нужны.
      setCommonChats(chats.filter((c) => c.type !== 'private' && (c.members || []).some((m: any) => m.id === userId)));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить профиль');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  const avatarUri = publicFileUrl(user?.avatar_url);

  // ===== Написать: сервер вернёт существующий личный чат или создаст новый =====
  const openPrivateChat = async () => {
    if (!user) return;
    try {
      const chat = await request<any>('/api/chats', { method: 'POST', body: { type: 'private', user_ids: [userId] } });
      navigation.navigate('ChatTab', {
        screen: 'Chat',
        params: { chatId: String(chat.id), chatName: user.display_name || user.username },
      });
    } catch (e: any) {
      Alert.alert('Не удалось открыть чат', e?.message || 'Попробуйте ещё раз');
    }
  };

  // ===== Управление учётной записью (директор / руководитель) =====
  const showNewPassword = (password: string) => {
    Alert.alert(
      'Новый пароль',
      `Логин: ${user?.username}\nПароль: ${password}\n\nПередайте его сотруднику. После закрытия окна пароль больше не будет показан.`,
      [
        { text: 'Поделиться', onPress: () => Share.share({ message: `Вход в Offix\nЛогин: ${user?.username}\nПароль: ${password}` }) },
        { text: 'Готово' },
      ],
    );
  };

  const resetPassword = () => {
    Alert.alert(
      'Сбросить пароль?',
      'Будет создан новый случайный пароль. Старый перестанет работать.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Сбросить',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              showNewPassword((await api.resetUserPassword(userId)).password);
            } catch (e: any) {
              Alert.alert('Ошибка', e?.message || 'Не удалось сбросить пароль');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const setManualPassword = async () => {
    if (newPassword.length < 8) return Alert.alert('Слишком короткий пароль', 'Минимум 8 символов');
    setBusy(true);
    try {
      showNewPassword((await api.resetUserPassword(userId, newPassword)).password);
      setNewPassword('');
      setShowPasswordInput(false);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось задать пароль');
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = () => {
    if (!user) return;
    const activate = !user.is_active;
    Alert.alert(
      activate ? 'Вернуть доступ?' : 'Деактивировать сотрудника?',
      activate
        ? 'Сотрудник снова сможет входить и появится в списках.'
        : 'Сотрудник не сможет войти, пропадёт из списков участников и исполнителей. Его задачи, сообщения и история сохранятся.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: activate ? 'Активировать' : 'Деактивировать',
          style: activate ? 'default' : 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await api.setUserActive(userId, activate);
              await load();
            } catch (e: any) {
              Alert.alert('Ошибка', e?.message || 'Не удалось изменить статус');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
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
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <ChevronLeft size={24} color={T.textPrimary} strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ПРОФИЛЬ</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={T.accent} />
        </View>
      ) : error ? (
        <View style={styles.loadingWrap}>
          <Text style={styles.emptyText}>{error}</Text>
          <TouchableOpacity onPress={load} style={{ marginTop: 12 }}>
            <Text style={styles.accountBtnText}>Повторить</Text>
          </TouchableOpacity>
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
                <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
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
            {user?.role_name ? <Text style={styles.heroRole}>{user.role_name}</Text> : null}
            {user && !user.is_active ? (
              <View style={styles.inactiveBadge}>
                <Text style={styles.inactiveBadgeText}>Деактивирован</Text>
              </View>
            ) : null}
          </View>

          {/* ===== КОНТАКТЫ ===== */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <AtSign size={18} color={T.accent} strokeWidth={2} />
              </View>
              <Text style={styles.cardTitle}>Контакты</Text>
            </View>

            <View style={styles.contactRow}>
              <AtSign size={16} color={T.textSecondary} strokeWidth={2} />
              <Text style={styles.contactText}>@{user?.username || '—'}</Text>
            </View>
            <View style={styles.contactRow}>
              <Mail size={16} color={T.textSecondary} strokeWidth={2} />
              <Text style={styles.contactText}>{user?.email || 'email не указан'}</Text>
            </View>
          </View>

          {/* ===== УЧЁТНАЯ ЗАПИСЬ (видна директору и руководителю сотрудника) ===== */}
          {user?.can_manage && (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.cardIconWrap}>
                  <KeyRound size={18} color={T.accent} strokeWidth={2} />
                </View>
                <Text style={styles.cardTitle}>Учётная запись</Text>
              </View>
              <View style={styles.contactRow}>
                <Text style={styles.accountLabel}>Логин</Text>
                <Text style={styles.contactText} selectable>{user.username}</Text>
              </View>
              <View style={styles.contactRow}>
                <Text style={styles.accountLabel}>Пароль</Text>
                <Text style={styles.accountHint}>хранится зашифрованным — его можно только заменить</Text>
              </View>
              {showPasswordInput ? (
                <View style={styles.passwordRow}>
                  <TextInput
                    style={styles.passwordInput}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    placeholder="Новый пароль (мин. 6 символов)"
                    placeholderTextColor={T.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity onPress={setManualPassword} disabled={busy} style={styles.accountBtnSmall}>
                    <Text style={styles.accountBtnText}>Сохранить</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View style={styles.accountActions}>
                <TouchableOpacity onPress={resetPassword} disabled={busy} style={styles.accountBtn} activeOpacity={0.7}>
                  <Text style={styles.accountBtnText}>Сгенерировать пароль</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setShowPasswordInput((v) => !v)}
                  disabled={busy}
                  style={styles.accountBtn}
                  activeOpacity={0.7}
                >
                  <Text style={styles.accountBtnText}>{showPasswordInput ? 'Скрыть' : 'Задать вручную'}</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={toggleActive}
                disabled={busy}
                style={[styles.accountBtn, styles.accountBtnWide, !user.is_active ? styles.activateBtn : styles.deactivateBtn]}
                activeOpacity={0.7}
              >
                <Text style={[styles.accountBtnText, { color: user.is_active ? T.danger : T.accent }]}>
                  {user.is_active ? 'Деактивировать сотрудника' : 'Активировать сотрудника'}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ===== ОБЩИЕ ГРУППЫ ===== */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrap}>
                <Users size={18} color={T.accent} strokeWidth={2} />
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
                  <ChevronRight size={16} color={T.textMuted} strokeWidth={2} />
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
          disabled={loading || !user?.is_active}
          style={[styles.writeBtn, user && !user.is_active && { opacity: 0.5 }]}
          activeOpacity={0.85}
        >
          <MessageCircle size={20} color={T.onAccent} strokeWidth={2} />
          <Text style={styles.writeBtnText}>Написать сообщение</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  heroRole: { marginTop: 6, fontSize: 13, fontWeight: '700', color: T.accent },
  inactiveBadge: { marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: T.dangerSoft },
  inactiveBadgeText: { fontSize: 12, fontWeight: '700', color: T.danger },
  accountLabel: { width: 70, fontSize: 13, fontWeight: '600', color: T.textSecondary },
  accountHint: { flex: 1, fontSize: 12, color: T.textMuted, fontStyle: 'italic' },
  accountActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  accountBtn: { flex: 1, paddingVertical: 11, borderRadius: 12, backgroundColor: T.accentMuted, alignItems: 'center' },
  accountBtnWide: { flex: 0, marginTop: 8 },
  accountBtnSmall: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: T.accentMuted },
  accountBtnText: { fontSize: 13, fontWeight: '700', color: T.accent },
  deactivateBtn: { backgroundColor: T.dangerSoft },
  activateBtn: { backgroundColor: T.accentMuted },
  passwordRow: { flexDirection: 'row', gap: 8, marginTop: 10, alignItems: 'center' },
  passwordInput: { flex: 1, borderWidth: 1, borderColor: T.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: T.textPrimary },
  container: { flex: 1, backgroundColor: T.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
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
    color: T.textPrimary,
    letterSpacing: 1,
  },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, gap: 20 },

  heroCard: {
    backgroundColor: T.card,
    borderRadius: 22,
    padding: 28,
    alignItems: 'center',
    gap: 8,
    shadowColor: T.shadow,
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
  avatarInitials: { fontSize: 30, fontWeight: '700', color: T.onAccent },
  heroName: { fontSize: 20, fontWeight: '700', color: T.textPrimary },
  heroUsername: { fontSize: 14, color: T.textSecondary, fontWeight: '500' },

  card: {
    backgroundColor: T.card,
    borderRadius: 22,
    padding: 20,
    shadowColor: T.shadow,
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
    backgroundColor: T.accentMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 17, fontWeight: '700', color: T.textPrimary, flex: 1 },
  countBadge: {
    backgroundColor: T.accent,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  countBadgeText: { color: T.onAccent, fontSize: 12, fontWeight: '700' },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  contactText: { fontSize: 15, fontWeight: '500', color: T.textPrimary },
  emptyText: { fontSize: 13, color: T.textMuted, fontWeight: '500' },

  commonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: T.border,
  },
  commonAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commonAvatarText: { color: T.onAccent, fontWeight: '700', fontSize: 13 },
  commonName: { flex: 1, fontSize: 15, fontWeight: '600', color: T.textPrimary },

  bottomBar: {
    padding: 16,
    backgroundColor: T.card,
    borderTopWidth: 1,
    borderTopColor: T.border,
  },
  writeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    height: 52,
    borderRadius: 18,
    backgroundColor: T.accent,
    shadowColor: T.shadow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  writeBtnText: { fontSize: 16, fontWeight: '700', color: T.onAccent }
}));