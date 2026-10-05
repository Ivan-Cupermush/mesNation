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
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={{ color: colors.textSecondary, marginTop: 16 }}>Проверяем сервер...</Text>
      </View>
    );
  }

  // ===== Нет связи с сервером =====
  if (screen === 'offline') {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background, padding: 32 }]}>
        <Text style={{ fontSize: 64 }}>📡</Text>
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
          <Text style={{ fontSize: 100 }}>🚀</Text>
          <Text style={[styles.welcomeTitle, { color: colors.textPrimary }]}>
            Добро пожаловать в{'\n'}
            <Text style={{ color: colors.accent }}>Offix</Text>
          </Text>
          <Text style={[styles.welcomeSubtitle, { color: colors.textSecondary }]}>
            Корпоративный мессенджер нового поколения{'\n'}
            с CRM, задачами и иерархией прав
          </Text>

          <View style={styles.welcomeButtons}>
            <Button
              title="🏢 Создать компанию"
              onPress={() => setScreen('setup')}
              fullWidth
              size="lg"
            />
            <Text style={[styles.welcomeHint, { color: colors.textMuted }]}>
              Создайте свою компанию и станьте супер-администратором
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
            <Text style={{ fontSize: 80 }}>🔐</Text>
            <Text style={[styles.loginTitle, { color: colors.textPrimary }]}>Вход</Text>
            {companyName && (
              <View style={[styles.companyBadge, { backgroundColor: colors.accentMuted }]}>
                <Text style={{ color: colors.accent, fontWeight: '600' }}>
                  🏢 {companyName}
                </Text>
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
              icon="👤"
            />
            <Input
              label="Пароль"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              icon="🔒"
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
  welcomeTitle: { fontSize: 32, fontWeight: '700', textAlign: 'center', marginTop: 24 },
  welcomeSubtitle: { fontSize: 16, textAlign: 'center', marginTop: 12, lineHeight: 24 },
  welcomeButtons: { width: '100%', marginTop: 48 },
  welcomeHint: { fontSize: 13, textAlign: 'center', marginTop: 16 },
  loginHero: { alignItems: 'center', marginBottom: 32 },
  loginTitle: { fontSize: 28, fontWeight: '700', marginTop: 16 },
  companyBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 12 },
  form: { marginTop: 8 }
}));