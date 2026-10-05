import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, KeyboardAvoidingView,
  Alert, ActivityIndicator, StatusBar
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { request, setToken } from '../services/http';
import { SafeAreaView } from 'react-native-safe-area-context';
import CompanySetupScreen from './CompanySetupScreen';
import BrandMark from '../components/ui/BrandMark';
import { User, Lock, WifiOff, Building2 } from 'lucide-react-native';

import { themed } from '../theme/runtime';
type Screen = 'loading' | 'offline' | 'welcome' | 'login' | 'setup';

export default function AuthScreen({ onLoginSuccess }: { onLoginSuccess: (token: string, user: any) => void }) {
  const { colors, isDark } = useTheme();
  const [screen, setScreen] = useState<Screen>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    checkCompany();
  }, []);

  const checkCompany = async () => {
    setScreen('loading');
    try {
      const data = await request<{ hasCompany: boolean }>('/api/auth/has-company', { anonymous: true, timeoutMs: 12000 });
      if (!data.hasCompany) {
        setScreen('welcome');
        return;
      }
      request<{ company_name: string | null }>('/api/company', { anonymous: true })
        .then((c) => setCompanyName(c.company_name))
        .catch(() => undefined);
      setScreen('login');
    } catch {
      // Нет связи: не показываем пустую форму, а даём повторить.
      setScreen('offline');
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Ошибка', 'Введите логин и пароль');
      return;
    }

    setLoading(true);
    try {
      const data = await request<{ token: string; user: any }>('/api/auth/login', {
        method: 'POST',
        anonymous: true,
        body: { username: username.trim(), password },
      });
      await setToken(data.token);
      onLoginSuccess(data.token, data.user);
    } catch (e: any) {
      Alert.alert('Не удалось войти', e?.message || 'Попробуйте ещё раз');
    } finally {
      setLoading(false);
    }
  };

  // ===== Экран загрузки =====
  if (screen === 'loading') {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <BrandMark />
        <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 32 }} />
      </View>
    );
  }

  // ===== Нет связи с сервером =====
  if (screen === 'offline') {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background, padding: 32 }]}>
        <View style={[styles.offlineIcon, { backgroundColor: colors.inputBg }]}>
          <WifiOff size={34} color={colors.textSecondary} strokeWidth={2} />
        </View>
        <Text style={[styles.loginTitle, { color: colors.textPrimary, textAlign: 'center' }]}>Нет связи с сервером</Text>
        <Text style={[styles.welcomeSubtitle, { color: colors.textSecondary }]}>Проверьте интернет или подключение к рабочей сети.</Text>
        <View style={{ width: '100%', marginTop: 28, gap: 12 }}>
          <Button title="Повторить" onPress={checkCompany} fullWidth size="lg" />
          <Button title="Всё равно войти" onPress={() => setScreen('login')} fullWidth size="lg" variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  // ===== Экран создания компании =====
  if (screen === 'setup') {
    return <CompanySetupScreen onSetupSuccess={onLoginSuccess} onBack={() => setScreen('welcome')} />;
  }

  // ===== Приветственный экран (первый запуск) =====
  if (screen === 'welcome') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={isDark ? 'light-content' : 'dark-content'}
          backgroundColor="transparent"
          translucent
        />
        <View style={styles.welcomeContent}>
          <BrandMark size={84} />
          <Text style={[styles.welcomeSubtitle, { color: colors.textSecondary }]}>
            Чаты, задачи, заметки и KPI вашей компании
          </Text>

          <View style={styles.welcomeButtons}>
            <Button
              title="Создать компанию"
              onPress={() => setScreen('setup')}
              fullWidth
              size="lg"
            />
            <Text style={[styles.welcomeHint, { color: colors.textMuted }]}>
              Вы станете директором — корнем дерева ролей
            </Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ===== Экран входа (компания уже создана) =====
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor="transparent"
          translucent
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.loginHero}>
            <BrandMark />
            {companyName && (
              <View style={[styles.companyBadge, { backgroundColor: colors.accentMuted }]}>
                <Building2 size={15} color={colors.accent} strokeWidth={2.2} />
                <Text style={{ color: colors.accent, fontWeight: '600' }}>{companyName}</Text>
              </View>
            )}
          </View>

          <View style={styles.form}>
            <Input
              label="Логин"
              placeholder="ivan"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              icon={<User size={18} color={colors.textMuted} strokeWidth={2} />}
              textContentType="username"
              returnKeyType="next"
            />
            <Input
              label="Пароль"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              icon={<Lock size={18} color={colors.textMuted} strokeWidth={2} />}
              textContentType="password"
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />

            <View style={{ marginTop: 24 }}>
              <Button
                title={loading ? 'Входим...' : 'Войти'}
                onPress={handleLogin}
                loading={loading}
                disabled={loading}
                fullWidth
                size="lg"
              />
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: { padding: 20, paddingBottom: 40, flexGrow: 1, justifyContent: 'center' },
  welcomeContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  welcomeSubtitle: { fontSize: 16, textAlign: 'center', marginTop: 20, lineHeight: 24 },
  offlineIcon: { width: 76, height: 76, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  welcomeButtons: { width: '100%', marginTop: 48 },
  welcomeHint: { fontSize: 13, textAlign: 'center', marginTop: 16 },
  loginHero: { alignItems: 'center', marginBottom: 36 },
  loginTitle: { fontSize: 28, fontWeight: '700', marginTop: 16 },
  companyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, marginTop: 20 },
  form: { marginTop: 8 }
}));