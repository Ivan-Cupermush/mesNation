import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, KeyboardAvoidingView,
  Platform, Alert, ActivityIndicator, StatusBar,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { SERVER_URL } from '../utils';
import * as RNFS from 'react-native-fs';

export default function CompanySetupScreen({ onSetupSuccess }: { onSetupSuccess: (token: string, user: any) => void }) {
  const { colors } = useTheme();
  const [companyName, setCompanyName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    // Валидация
    if (!companyName.trim()) {
      Alert.alert('Ошибка', 'Введите название компании');
      return;
    }
    if (!username.trim()) {
      Alert.alert('Ошибка', 'Введите логин');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Ошибка', 'Введите корректный email');
      return;
    }
    if (password.length < 4) {
      Alert.alert('Ошибка', 'Пароль должен быть не менее 4 символов');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Ошибка', 'Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/auth/setup-company`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          display_name: displayName.trim() || username.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка создания компании');

      // Сохраняем токен локально
      await RNFS.writeFile(
        `${RNFS.DocumentDirectoryPath}/token.txt`,
        data.token,
        'utf8'
      );

      Alert.alert(
        '🎉 Компания создана!',
        `Добро пожаловать, ${data.user.display_name}! Вы — супер-администратор компании "${data.company_name}".`,
        [{ text: 'Продолжить', onPress: () => onSetupSuccess(data.token, data.user) }]
      );
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось создать компанию');
    } finally {
      setLoading(false);
    }
  };

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
          {/* Hero-блок */}
          <View style={styles.hero}>
            <Text style={{ fontSize: 80 }}>🏢</Text>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Создание компании
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Вы станете супер-администратором и сможете{'\n'}
              управлять пользователями и правами доступа
            </Text>
          </View>

          {/* Форма */}
          <View style={styles.form}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              🏢 Компания
            </Text>
            <Input
              label="Название компании *"
              placeholder="Например: ООО Ромашка"
              value={companyName}
              onChangeText={setCompanyName}
              icon="🏢"
            />

            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 24 }]}>
              👑 Ваш профиль (супер-администратор)
            </Text>
            <Input
              label="Отображаемое имя"
              placeholder="Иван Иванов"
              value={displayName}
              onChangeText={setDisplayName}
              icon="👤"
            />
            <Input
              label="Логин *"
              placeholder="ivan"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              icon="🔑"
            />
            <Input
              label="Email *"
              placeholder="ivan@company.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              icon="📧"
            />
            <Input
              label="Пароль * (мин. 4 символа)"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              icon="🔒"
            />
            <Input
              label="Повторите пароль *"
              placeholder="••••••••"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              icon="🔒"
            />

            <View style={{ marginTop: 32 }}>
              <Button
                title={loading ? 'Создаём...' : '🚀 Создать компанию'}
                onPress={handleCreate}
                loading={loading}
                disabled={loading}
                fullWidth
                size="lg"
              />
            </View>

            <Text style={[styles.footerText, { color: colors.textMuted }]}>
              Создавая компанию, вы получаете права супер-администратора:{'\n'}
              • Создание и редактирование дерева прав{'\n'}
              • Создание пользователей{'\n'}
              • Назначение ролей{'\n'}
              • Полный доступ ко всем данным
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', marginTop: 40, marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 16 },
  subtitle: { fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  form: { marginTop: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12, marginTop: 8 },
  footerText: { fontSize: 12, textAlign: 'center', marginTop: 24, lineHeight: 18 },
});