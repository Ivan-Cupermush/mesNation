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
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Camera,
  LogOut,
  Moon,
  UserRound,
  Check,
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
  const [displayName, setDisplayName] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [avatarMode, setAvatarMode] = useState<'direct' | 'token' | 'fallback'>('direct');

  const loadProfile = useCallback(async () => {
    const token = await getToken();
    if (!token) return;
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
        setDisplayName(data.display_name || '');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить профиль');
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // ===== Аватар: прямой URL -> временный токен -> инициалы =====
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

  const handleSaveName = async () => {
    if (!displayName.trim()) {
      Alert.alert('Ошибка', 'Имя не может быть пустым');
      return;
    }
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch(`${SERVER_URL}/api/auth/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      if (res.ok) {
        Alert.alert('Готово', 'Имя обновлено');
        loadProfile();
      } else {
        const data = await res.json();
        Alert.alert('Ошибка', data.error || 'Не удалось обновить имя');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Сервер недоступен');
    } finally {
      setSaving(false);
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

  const handleLogout = () => {
    Alert.alert('Выйти из аккаунта?', 'Нужно будет войти заново', [
      { text: 'Отмена', style: 'cancel' },
      { text: 'Выйти', style: 'destructive', onPress: () => onLogout?.() },
    ]);
  };

  const name = profile?.display_name || profile?.username || '';

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
        </View>

        {/* ===== ИМЯ ===== */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIconWrap}>
              <UserRound size={18} color="#1F7A52" strokeWidth={2} />
            </View>
            <Text style={styles.cardTitle}>Отображаемое имя</Text>
          </View>

          <TextInput
            style={styles.textInput}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Ваше имя"
            placeholderTextColor="#BDBDBD"
          />

          <TouchableOpacity
            onPress={handleSaveName}
            disabled={saving || displayName.trim() === (profile?.display_name || '')}
            style={[
              styles.saveBtn,
              {
                backgroundColor:
                  saving || displayName.trim() === (profile?.display_name || '')
                    ? '#ECECE8'
                    : '#1F7A52',
              },
            ]}
            activeOpacity={0.85}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.saveBtnText}>Сохранить</Text>
              </>
            )}
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

  // ===== NAME =====
  textInput: {
    fontSize: 16,
    color: '#141414',
    fontWeight: '500',
    backgroundColor: '#FAFAF8',
    borderWidth: 1,
    borderColor: '#ECECE8',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 16,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // ===== THEME =====
  themeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  themeTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#141414',
  },
  themeHint: {
    fontSize: 12,
    color: '#6F6F73',
    marginTop: 2,
  },

  // ===== LOGOUT =====
  logoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logoutText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#DC2626',
  },
});