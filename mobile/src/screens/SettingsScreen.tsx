import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Platform,
  Alert,
  Image,
  Modal,
  TextInput,
  ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FileSpreadsheet,
  TreePine,
  UserPlus,
  Users,
  LogOut,
  ChevronRight,
  Crown,
  Shield,
  Settings as SettingsIcon,
  Building2,
  Pencil,
  Palette,
} from 'lucide-react-native';
import { api } from '../services/api';
import { SERVER_URL } from '../utils';

import { T, themed } from '../theme/runtime';
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

export default function SettingsScreen({ navigation, onLogout }: any) {
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [companyDraft, setCompanyDraft] = useState('');
  const [renaming, setRenaming] = useState(false);

  const saveCompanyName = async () => {
    const value = companyDraft.trim();
    if (!value) return;
    setRenaming(true);
    try {
      const r = await api.renameCompany(value);
      setCurrentUser((u: any) => ({ ...u, company_name: r.company_name }));
      setRenameOpen(false);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось переименовать компанию');
    } finally {
      setRenaming(false);
    }
  };

  useEffect(() => {
    api.getCurrentUser().then(setCurrentUser).catch(console.error);
  }, []);

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', 'Нужно будет войти заново', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: () => onLogout?.(),
      },
    ]);
  };

  const goToProfile = () => {
    navigation.getParent()?.navigate('ChatTab', { screen: 'Profile' });
  };

  const adminActions = [
    {
      id: 'import-excel',
      icon: FileSpreadsheet,
      title: 'Импорт из Excel',
      description: 'Загрузка KPI и отчётов продаж',
      color: T.info,
      bg: T.infoSoft,
      screen: 'ImportExcel',
    },
    {
      id: 'role-tree',
      icon: TreePine,
      title: 'Дерево ролей',
      description: 'Иерархия и управление правами',
      color: T.violet,
      bg: T.violetSoft,
      screen: 'RoleTreeEditor',
    },
    {
      id: 'create-user',
      icon: UserPlus,
      title: 'Новый сотрудник',
      description: 'Добавить пользователя в систему',
      color: T.warning,
      bg: T.warningSoft,
      screen: 'CreateUserRole',
    },
    {
      id: 'employees',
      icon: Users,
      title: 'Сотрудники',
      description: 'Все сотрудники компании',
      color: T.info,
      bg: T.infoSoft,
      screen: 'Employees',
    },
  ];

  const name = currentUser?.display_name || currentUser?.username || '';
  const roleName = currentUser?.role_name || 'Сотрудник';
  // Права определяются положением в дереве ролей, а не названием должности:
  // раньше раздел скрывался у директора, чья должность называлась иначе.
  const isDirector = !!currentUser?.is_director;
  const isAdmin = isDirector || !!currentUser?.has_subordinates;

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
                      ? T.surfaceActive
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
                  <View style={[styles.roleBadge, { backgroundColor: T.accentMuted }]}>
                    {isDirector ? (
                      <Crown size={10} color={T.accent} strokeWidth={2.5} />
                    ) : (
                      <Shield size={10} color={T.accent} strokeWidth={2.5} />
                    )}
                    <Text style={[styles.roleBadgeText, { color: T.accent }]}>
                      {roleName === 'director' ? 'Директор' : roleName === 'admin' ? 'Администратор' : roleName}
                    </Text>
                  </View>
                </View>
                {!!currentUser.email && (
                  <Text style={styles.profileEmail} numberOfLines={1}>
                    {currentUser.email}
                  </Text>
                )}
              </View>
              <ChevronRight size={18} color={T.textMuted} strokeWidth={2} />
            </View>
          </TouchableOpacity>
        )}

        {/* ===== КОМПАНИЯ ===== */}
        {!!currentUser?.company_name && (
          <>
            <Text style={styles.sectionTitle}>КОМПАНИЯ</Text>
            <View style={styles.card}>
              <View style={styles.actionRow}>
                <View style={[styles.actionIconWrap, { backgroundColor: T.accentMuted }]}>
                  <Building2 size={20} color={T.accent} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionTitle}>{currentUser.company_name}</Text>
                  <Text style={styles.actionSub}>Название компании</Text>
                </View>
                {isDirector && (
                  <TouchableOpacity
                    onPress={() => {
                      setCompanyDraft(currentUser.company_name);
                      setRenameOpen(true);
                    }}
                    hitSlop={10}
                    accessibilityLabel="Переименовать компанию"
                  >
                    <Pencil size={18} color={T.textSecondary} strokeWidth={2} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
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
                    <ChevronRight size={18} color={T.textMuted} strokeWidth={2} />
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}

        {/* ===== ОФОРМЛЕНИЕ ===== */}
        <Text style={styles.sectionTitle}>ОФОРМЛЕНИЕ</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('Appearance')} activeOpacity={0.7}>
            <View style={[styles.actionIconWrap, { backgroundColor: T.accentMuted }]}>
              <Palette size={20} color={T.accent} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitle}>Тема и фон чатов</Text>
              <Text style={styles.actionSub}>Светлая/тёмная тема, цвет, фон, размер текста</Text>
            </View>
            <ChevronRight size={18} color={T.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* ===== ОПАСНАЯ ЗОНА ===== */}
        <Text style={styles.sectionTitle}>АККАУНТ</Text>
        <View style={styles.dangerCard}>
          <TouchableOpacity
            style={styles.dangerRow}
            onPress={handleLogout}
            activeOpacity={0.7}
          >
            <View style={[styles.actionIconWrap, { backgroundColor: T.dangerSoft }]}>
              <LogOut size={20} color={T.danger} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerTitle}>Выйти из аккаунта</Text>
              <Text style={styles.dangerSub}>
                Потребуется повторный вход
              </Text>
            </View>
            <ChevronRight size={18} color={T.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        {/* ===== FOOTER ===== */}
        <View style={styles.footer}>
          <SettingsIcon size={14} color={T.textMuted} strokeWidth={2} />
          <Text style={styles.footerText}>коммуникационный шлюз Dixit</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={renameOpen} transparent animationType="fade" onRequestClose={() => setRenameOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Название компании</Text>
            <TextInput
              style={styles.modalInput}
              value={companyDraft}
              onChangeText={setCompanyDraft}
              maxLength={200}
              autoFocus
              placeholder="ООО «Компания»"
              placeholderTextColor={T.textMuted}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setRenameOpen(false)} style={styles.modalBtn}>
                <Text style={styles.modalBtnText}>Отмена</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveCompanyName}
                disabled={renaming || !companyDraft.trim()}
                style={[styles.modalBtn, styles.modalBtnPrimary]}
              >
                {renaming ? (
                  <ActivityIndicator color={T.onAccent} />
                ) : (
                  <Text style={[styles.modalBtnText, { color: T.onAccent }]}>Сохранить</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  modalBackdrop: { flex: 1, backgroundColor: T.overlay, justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: T.card, borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: T.textPrimary, marginBottom: 14 },
  modalInput: {
    height: 48, borderRadius: 12, borderWidth: 1, borderColor: T.border,
    paddingHorizontal: 14, fontSize: 16, color: T.textPrimary, backgroundColor: T.background,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  modalBtn: { minWidth: 100, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  modalBtnPrimary: { backgroundColor: T.accent },
  modalBtnText: { fontSize: 15, fontWeight: '700', color: T.textPrimary },
  container: { flex: 1, backgroundColor: T.background },

  scrollContent: { padding: 20, gap: 16 },

  // ===== HERO =====
  heroSection: { marginBottom: 8, paddingTop: 8 },
  bigTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40,
    fontWeight: '900',
    color: T.textPrimary,
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  bigSubtitle: {
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    fontSize: 16,
    fontStyle: 'italic',
    color: T.textSecondary,
    marginTop: 4,
  },

  // ===== PROFILE CARD =====
  profileCard: {
    backgroundColor: T.card,
    borderRadius: 22,
    padding: 20,
    shadowColor: T.shadow,
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
    color: T.onAccent,
    fontWeight: '700',
    fontSize: 18,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: T.textPrimary,
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
    color: T.textSecondary,
    fontWeight: '500',
  },

  // ===== SECTIONS =====
  sectionTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 20,
    fontWeight: '900',
    color: T.textPrimary,
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 4,
  },

  // ===== CARD =====
  card: {
    backgroundColor: T.card,
    borderRadius: 22,
    padding: 8,
    shadowColor: T.shadow,
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
    borderTopColor: T.border,
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
    color: T.textPrimary,
    marginBottom: 2,
  },
  actionSub: {
    fontSize: 12,
    color: T.textSecondary,
    fontWeight: '500',
  },

  // ===== DANGER CARD =====
  dangerCard: {
    backgroundColor: T.card,
    borderRadius: 22,
    padding: 8,
    shadowColor: T.shadow,
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
    color: T.danger,
    marginBottom: 2,
  },
  dangerSub: {
    fontSize: 12,
    color: T.textSecondary,
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
    color: T.textMuted,
    fontWeight: '500',
  }
}));