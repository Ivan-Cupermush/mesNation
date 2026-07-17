import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator, StatusBar, TouchableOpacity,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { SERVER_URL } from '../utils';
import * as RNFS from 'react-native-fs';
import CompanySetupScreen from './CompanySetupScreen';

type Screen = 'loading' | 'welcome' | 'login' | 'setup';

export default function AuthScreen({ onLoginSuccess }: { onLoginSuccess: (token: string, user: any) => void }) {
  const { colors } = useTheme();
  const [screen, setScreen] = useState<Screen>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [companyName, setCompanyName] = useState<string | null>(null);

  useEffect(() => {
    checkCompany();
  }, []);

  const checkCompany = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/has-company`);
      const data = await res.json();

      if (!data.hasCompany) {
        setScreen('welcome');
      } else {
        // Попробуем получить название компании
        try {
          const companyRes = await fetch(`${SERVER_URL}/api/company`);
          const companyData = await companyRes.json();
          setCompanyName(companyData.company_name);
        } catch (e) {}
        setScreen('login');
      }
    } catch (e: any) {
      Alert.alert('Ошибка подключения', 'Не удалось связаться с сервером. Проверьте подключение.');
      setScreen('login');
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password) {
      Alert.alert('Ошибка', 'Введите логин и пароль');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка входа');

      // Сохраняем токен
      await RNFS.writeFile(
        `${RNFS.DocumentDirectoryPath}/token.txt`,
        data.token,
        'utf8'
      );

      onLoginSuccess(data.token, data.user);
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось войти');
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

  // ===== Экран создания компании =====
  if (screen === 'setup') {
    return <CompanySetupScreen onSetupSuccess={onLoginSuccess} />;
  }

  // ===== Приветственный экран (первый запуск) =====
  if (screen === 'welcome') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <StatusBar
          barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'}
          backgroundColor={colors.background}
        />
        <View style={styles.welcomeContent}>
          <Text style={{ fontSize: 100 }}>🚀</Text>
          <Text style={[styles.welcomeTitle, { color: colors.textPrimary }]}>
            Добро пожаловать в{'\n'}
            <Text style={{ color: colors.accent }}>mesNation</Text>
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
      </View>
    );
  }

  // ===== Экран входа (компания уже создана) =====
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'}
        backgroundColor={colors.background}
      />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
    </View>
  );
}

const styles = StyleSheet.create({
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
  form: { marginTop: 8 },
});