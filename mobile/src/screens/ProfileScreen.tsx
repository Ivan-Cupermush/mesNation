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
  Image,
  Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Camera,
  LogOut,
  UserRound,
  Mail,
  Check,
  X,
  Pencil,
  AtSign,
  Shield,
  Crown,
} from 'lucide-react-native';
import { getToken, SERVER_URL } from '../utils';
import { pick } from '@react-native-documents/picker';

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

export default function ProfileScreen({ navigation, onLogout }: any) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarMode, setAvatarMode] = useState<'direct' | 'token' | 'fallback'>('direct');

  // Редактирование
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProfile = useCallback(async () => {
    const token = await getToken();
    if (!token) { setLoading(false); return; }
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить профиль');
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Аватар
  useEffect(() => {
    if (profile?.avatar_url) {
      setAvatarMode('direct');
      setAvatarUri(SERVER_URL + profile.avatar_url);
    } else {
      setAvatarMode('fallback');
      setAvatarUri(null);
    }
  }, [profile?.avatar_url]);

  const handleAvatarError = async () => {
    if (avatarMode === 'direct') {
      try {
        const tok = await getToken();
        const filename = String(profile?.avatar_url || '').split('/').pop();
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

  const handleChangeAvatar = async () => {
    try {
      const [res] = await pick({ allowMultiSelection: false });
      if (!res) return;
      setUploading(true);
      const token = await getToken();
      const formData = new FormData();
      formData.append('avatar', {
        uri: res.uri,
        type: res.type || 'image/jpeg',
        name: res.name || 'avatar.jpg',
      } as any);
      const uploadRes = await fetch(`${SERVER_URL}/api/auth/avatar`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (uploadRes.ok) {
        Alert.alert('Готово', 'Аватар обновлён');
        loadProfile();
      } else {
        Alert.alert('Ошибка', 'Не удалось загрузить аватар');
      }
    } catch (e: any) {
      if (e?.code !== 'DOCUMENT_PICKER_CANCELED') {
        Alert.alert('Ошибка', 'Не удалось выбрать файл');
      }
    } finally {
      setUploading(false);
    }
  };

  const openEditModal = () => {
    setEditName(profile?.display_name || '');
    setEditEmail(profile?.email || '');
    setShowEditModal(true);
  };

  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      Alert.alert('Ошибка', 'Имя не может быть пустым');
      return;
    }
    if (editEmail.trim() && !editEmail.includes('@')) {
      Alert.alert('Ошибка', 'Введите корректный email');
      return;
    }

    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${SERVER_URL}/api/auth/profile`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          display_name: editName.trim(),
          email: editEmail.trim(),
        }),
      });
      if (res.ok) {
        setShowEditModal(false);
        Alert.alert('Готово', 'Профиль обновлён');
        loadProfile();
      } else {
        const data = await res.json();
        Alert.alert('Ошибка', data.error || 'Не удалось обновить');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', 'Нужно будет войти заново', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => onLogout?.() },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color="#1F7A52" />
        </View>
      </SafeAreaView>
    );
  }

  const name = profile?.display_name || profile?.username || '';
  const roleName = profile?.role_name || 'Сотрудник';
  const isAdmin =
    roleName === 'director' ||
    roleName === 'admin' ||
    (roleName || '').toLowerCase().includes('руководитель');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBackBtn}>
          <ChevronLeft size={24} color="#141414" strokeWidth={2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>ПРОФИЛЬ</Text>
        <TouchableOpacity onPress={openEditModal} style={styles.headerEditBtn}>
          <Pencil size={18} color="#1F7A52" strokeWidth={2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ===== HERO: АВАТАР ===== */}
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
            <TouchableOpacity
              onPress={handleChangeAvatar}
              disabled={uploading}
              style={styles.avatarEditBtn}
            >
              {uploading ? (
                <ActivityIndicator size={12} color="#FFFFFF" />
              ) : (
                <Camera size={16} color="#FFFFFF" strokeWidth={2.5} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.heroName} numberOfLines={1}>
            {name || '—'}
          </Text>
          <Text style={styles.heroUsername}>@{profile?.username || '…'}</Text>
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
        </View>

        {/* ===== КОНТАКТНАЯ ИНФОРМАЦИЯ ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <AtSign size={18} color="#1F7A52" strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Контактная информация</Text>
            <TouchableOpacity onPress={openEditModal} style={styles.cardEditBtn}>
              <Pencil size={14} color="#6F6F73" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {/* Username (только чтение) */}
          <View style={styles.infoRow}>
            <View style={styles.infoIconWrap}>
              <UserRound size={16} color="#6F6F73" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Логин</Text>
              <Text style={styles.infoValue}>@{profile?.username || '—'}</Text>
            </View>
          </View>

          <View style={styles.infoDivider} />

          {/* Имя */}
          <TouchableOpacity style={styles.infoRow} onPress={openEditModal} activeOpacity={0.7}>
            <View style={styles.infoIconWrap}>
              <UserRound size={16} color="#1F7A52" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Отображаемое имя</Text>
              <Text style={styles.infoValue}>{profile?.display_name || '—'}</Text>
            </View>
            <ChevronLeft size={16} color="#BDBDBD" strokeWidth={2} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>

          <View style={styles.infoDivider} />

          {/* Email */}
          <TouchableOpacity style={styles.infoRow} onPress={openEditModal} activeOpacity={0.7}>
            <View style={[styles.infoIconWrap, { backgroundColor: '#DBEAFE' }]}>
              <Mail size={16} color="#3B82F6" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Email</Text>
              <Text style={[styles.infoValue, !profile?.email && styles.infoValueMuted]}>
                {profile?.email || 'Не указан'}
              </Text>
            </View>
            <ChevronLeft size={16} color="#BDBDBD" strokeWidth={2} style={{ transform: [{ rotate: '180deg' }] }} />
          </TouchableOpacity>
        </View>

        {/* ===== АККАУНТ ===== */}
        <View style={styles.card}>
          <TouchableOpacity onPress={handleLogout} style={styles.logoutRow} activeOpacity={0.7}>
            <View style={[styles.cardIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <LogOut size={18} color="#DC2626" strokeWidth={2} />
            </View>
            <Text style={styles.logoutText}>Выйти из аккаунта</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ===== МОДАЛКА РЕДАКТИРОВАНИЯ ===== */}
      <Modal visible={showEditModal} transparent animationType="slide">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowEditModal(false)}
          style={styles.modalOverlay}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={{ justifyContent: 'flex-end', flex: 1 }}
          >
            <TouchableOpacity activeOpacity={1} style={styles.modalContent}>
              <View style={styles.modalHandle} />
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>РЕДАКТИРОВАТЬ ПРОФИЛЬ</Text>
                <TouchableOpacity onPress={() => setShowEditModal(false)}>
                  <X size={22} color="#141414" strokeWidth={2} />
                </TouchableOpacity>
              </View>

              <View style={styles.modalBody}>
                <Text style={styles.modalLabel}>Отображаемое имя</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Ваше имя"
                  placeholderTextColor="#BDBDBD"
                  autoFocus
                />

                <Text style={styles.modalLabel}>Email</Text>
                <TextInput
                  style={styles.modalInput}
                  value={editEmail}
                  onChangeText={setEditEmail}
                  placeholder="example@company.com"
                  placeholderTextColor="#BDBDBD"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />

                <View style={styles.modalHint}>
                  <Mail size={14} color="#6F6F73" strokeWidth={2} />
                  <Text style={styles.modalHintText}>
                    Email используется для уведомлений и восстановления доступа
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={handleSaveProfile}
                disabled={saving || !editName.trim()}
                style={[
                  styles.modalSaveBtn,
                  (!editName.trim() || saving) && styles.modalSaveBtnDisabled,
                ]}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.modalSaveBtnText}>Сохранить</Text>
                  </>
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // ===== HEADER =====
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
  headerEditBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
  },

  // ===== SCROLL =====
  scrollContent: { padding: 20, gap: 20 },

  // ===== HERO =====
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
  avatarWrap: { position: 'relative', marginBottom: 8 },
  avatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 30,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  avatarEditBtn: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1F7A52',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  heroName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#141414',
  },
  heroUsername: {
    fontSize: 14,
    color: '#6F6F73',
    fontWeight: '500',
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
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
    gap: 0,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
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
  cardEditBtn: {
    padding: 6,
  },

  // ===== INFO ROWS =====
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6F6F73',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#141414',
  },
  infoValueMuted: {
    color: '#BDBDBD',
    fontStyle: 'italic',
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#ECECE8',
    marginLeft: 48,
  },

  // ===== LOGOUT =====
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC2626',
  },

  // ===== MODAL =====
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    paddingBottom: 32,
    gap: 16,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#ECECE8',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: 1,
  },
  modalBody: {
    gap: 12,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6F6F73',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 4,
  },
  modalInput: {
    fontSize: 16,
    color: '#141414',
    fontWeight: '500',
    backgroundColor: '#FAFAF8',
    borderWidth: 1,
    borderColor: '#ECECE8',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  modalHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  modalHintText: {
    fontSize: 12,
    color: '#6F6F73',
    flex: 1,
    fontWeight: '500',
  },
  modalSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#1F7A52',
    marginTop: 8,
    shadowColor: '#1F7A52',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 4,
  },
  modalSaveBtnDisabled: {
    backgroundColor: '#ECECE8',
    shadowOpacity: 0,
  },
  modalSaveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});