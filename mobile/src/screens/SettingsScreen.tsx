import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FileSpreadsheet,
  TreePine,
  UserPlus,
  LogOut,
  ChevronRight,
  Crown,
  Shield,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import { api } from '../services/api';
import { SERVER_URL } from '../utils';

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

export default function SettingsScreen({ navigation }: any) {
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    api.getCurrentUser().then(setCurrentUser).catch(console.error);
  }, []);

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', 'Нужно будет войти заново', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: async () => {
          await api.logout();
          navigation.reset({ index: 0, routes: [{ name: 'Auth' }] });
        },
      },
    ]);
  };

  const goToProfile = () => {
    // Переход в ProfileScreen через ChatTab (там уже есть onLogout)
    navigation.getParent()?.navigate('ChatTab', { screen: 'Profile' });
  };

  const adminActions = [
    {
      id: 'import-excel',
      icon: FileSpreadsheet,
      title: 'Импорт из Excel',
      description: 'Загрузка KPI и отчётов продаж',
      color: '#3B82F6',
      bg: '#DBEAFE',
      screen: 'ImportExcel',
    },
    {
      id: 'role-tree',
      icon: TreePine,
      title: 'Дерево ролей',
      description: 'Иерархия и управление правами',
      color: '#8B5CF6',
      bg: '#EDE9FE',
      screen: 'RoleTreeEditor',
    },
    {
      id: 'create-user',
      icon: UserPlus,
      title: 'Новый сотрудник',
      description: 'Добавить пользователя в систему',
      color: '#F59E0B',
      bg: '#FEF3C7',
      screen: 'CreateUserRole',
    },
  ];

  const name = currentUser?.display_name || currentUser?.username || '';
  const roleName = currentUser?.role_name || 'Сотрудник';
  const isAdmin =
    roleName === 'director' ||
    roleName === 'admin' ||
    (roleName || '').toLowerCase().includes('руководитель');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== HERO HEADER ===== */}
        <View style={styles.heroSection}>
          <Text style={styles.bigTitle}>НАСТРОЙКИ</Text>
          <Text style={styles.bigSubtitle}>Управление системой и аккаунтом</Text>
        </View>

        {/* ===== ПРОФИЛЬ (кликабельный с аватаркой) ===== */}
        {currentUser && (
          <TouchableOpacity
            style={styles.profileCard}
            activeOpacity={0.7}
            onPress={goToProfile}
          >
            <View style={styles.profileRow}>
              <View
                style={[
                  styles.profileAvatar,
                  {
                    backgroundColor: currentUser.avatar_url
                      ? '#ECECE8'
                      : hashColor(name),
                  },
                ]}
              >
                {currentUser.avatar_url ? (
                  <Image
                    source={{ uri: SERVER_URL + currentUser.avatar_url }}
                    style={styles.profileAvatarImg}
                  />
                ) : (
                  <Text style={styles.profileAvatarText}>{initials(name)}</Text>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName} numberOfLines={1}>
                  {name}
                </Text>
                <View style={styles.roleRow}>
                  <View style={[styles.roleBadge, { backgroundColor: '#ECFDF5' }]}>
                    {isAdmin ? (
                      <Crown size={10} color="#1F7A52" strokeWidth={2.5} />
                    ) : (
                      <Shield size={10} color="#1F7A52" strokeWidth={2.5} />
                    )}
                    <Text style={[styles.roleBadgeText, { color: '#1F7A52' }]}>
                      {roleName === 'director'
                        ? 'Директор'
                        : roleName === 'admin'
                          ? 'Администратор'
                          : roleName}
                    </Text>
                  </View>
                </View>
                {!!currentUser.email && (
                  <Text style={styles.profileEmail} numberOfLines={1}>
                    {currentUser.email}
                  </Text>
                )}
              </View>
              <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
            </View>
          </TouchableOpacity>
        )}

        {/* ===== АДМИНИСТРИРОВАНИЕ ===== */}
        {isAdmin && (
          <>
            <Text style={styles.sectionTitle}>АДМИНИСТРИРОВАНИЕ</Text>
            <View style={styles.card}>
              {adminActions.map((a, i) => {
                const Icon = a.icon;
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={[styles.actionRow, i > 0 && styles.actionRowBorder]}
                    onPress={() => navigation.navigate(a.screen)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.actionIconWrap, { backgroundColor: a.bg }]}>
                      <Icon size={20} color={a.color} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.actionTitle}>{a.title}</Text>
                      <Text style={styles.actionSub}>{a.description}</Text>
                    </View>
                    <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ===== ОПАСНАЯ ЗОНА ===== */}
        <Text style={styles.sectionTitle}>АККАУНТ</Text>
        <View style={styles.dangerCard}>
          <TouchableOpacity
            style={styles.dangerRow}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <LogOut size={20} color="#DC2626" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerTitle}>Выйти из аккаунта</Text>
              <Text style={styles.dangerSub}>
                Потребуется повторный вход
              </Text>
            </View>
            <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* ===== FOOTER ===== */}
        <View style={styles.footer}>
          <SettingsIcon size={14} color="#BDBDBD" strokeWidth={2} />
          <Text style={styles.footerText}>mesNation v1.0</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },

  scrollContent: { padding: 20, gap: 16 },

  // ===== HERO =====
  heroSection: { marginBottom: 8, paddingTop: 8 },
  bigTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  bigSubtitle: {
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    fontSize: 16,
    fontStyle: 'italic',
    color: '#6F6F73',
    marginTop: 4,
  },

  // ===== PROFILE CARD =====
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  profileAvatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  profileAvatarText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 18,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 4,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  profileEmail: {
    fontSize: 13,
    color: '#6F6F73',
    fontWeight: '500',
  },

  // ===== SECTIONS =====
  sectionTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 20,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 4,
  },

  // ===== CARD =====
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },

  // ===== ACTION ROW =====
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  actionRowBorder: {
    borderTopWidth: 1,
    borderTopColor: '#F4F4F5',
    borderRadius: 0,
  },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 2,
  },
  actionSub: {
    fontSize: 12,
    color: '#6F6F73',
    fontWeight: '500',
  },

  // ===== DANGER CARD =====
  dangerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 3,
  },
  dangerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 16,
  },
  dangerTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#DC2626',
    marginBottom: 2,
  },
  dangerSub: {
    fontSize: 12,
    color: '#6F6F73',
    fontWeight: '500',
  },

  // ===== FOOTER =====
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 24,
  },
  footerText: {
    fontSize: 12,
    color: '#BDBDBD',
    fontWeight: '500',
  },
});