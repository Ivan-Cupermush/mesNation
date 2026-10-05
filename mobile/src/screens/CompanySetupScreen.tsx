import React, { useState } from 'react';
import {
  View, Text, ScrollView, KeyboardAvoidingView,
  Alert, StatusBar
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { request, setToken } from '../services/http';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, Building2, User, AtSign, Mail, Lock } from 'lucide-react-native';
import { TouchableOpacity } from 'react-native';

import { themed } from '../theme/runtime';
export default function CompanySetupScreen({ onSetupSuccess, onBack }: { onSetupSuccess: (token: string, user: any) => void; onBack?: () => void }) {
  const { colors, isDark } = useTheme();
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
    if (password.length < 8) {
      Alert.alert('Ошибка', 'Пароль должен быть не менее 8 символов');
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert('Ошибка', 'Пароли не совпадают');
      return;
    }

    setLoading(true);
    try {
      const data = await request<{ token: string; user: any; company_name: string }>('/api/auth/setup-company', {
        method: 'POST',
        anonymous: true,
        body: {
          company_name: companyName.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          display_name: displayName.trim() || username.trim(),
        },
      });

      // Сохраняем токен локально
      await setToken(data.token);

      Alert.alert(
        'Компания создана',
        `${data.user.display_name}, вы — директор компании «${data.company_name}».`,
        [{ text: 'Продолжить', onPress: () => onSetupSuccess(data.token, data.user) }]
      );
    } catch (e: any) {
      Alert.alert('Ошибка', e.message || 'Не удалось создать компанию');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {onBack && (
        <TouchableOpacity onPress={onBack} style={styles.back} accessibilityLabel="Назад">
          <ChevronLeft size={26} color={colors.textPrimary} />
        </TouchableOpacity>
      )}
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
          {/* Hero-блок */}
          <View style={styles.hero}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              Новая компания
            </Text>
            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
              Вы станете директором: сможете создавать роли и сотрудников
            </Text>
          </View>

          {/* Форма */}
          <View style={styles.form}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              КОМПАНИЯ
            </Text>
            <Input
              label="Название компании *"
              placeholder="Например: ООО Ромашка"
              value={companyName}
              onChangeText={setCompanyName}
              icon={<Building2 size={18} color={colors.textMuted} strokeWidth={2} />}
            />

            <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginTop: 24 }]}>
              ДИРЕКТОР
            </Text>
            <Input
              label="Отображаемое имя"
              placeholder="Иван Иванов"
              value={displayName}
              onChangeText={setDisplayName}
              icon={<User size={18} color={colors.textMuted} strokeWidth={2} />}
            />
            <Input
              label="Логин *"
              placeholder="ivan"
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              icon={<AtSign size={18} color={colors.textMuted} strokeWidth={2} />}
            />
            <Input
              label="Email *"
              placeholder="ivan@company.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoCorrect={false}
              icon={<Mail size={18} color={colors.textMuted} strokeWidth={2} />}
            />
            <Input
              label="Пароль * (минимум 8 символов)"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              icon={<Lock size={18} color={colors.textMuted} strokeWidth={2} />}
            />
            <Input
              label="Повторите пароль *"
              placeholder="••••••••"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              icon={<Lock size={18} color={colors.textMuted} strokeWidth={2} />}
            />

            <View style={{ marginTop: 32 }}>
              <Button
                title={loading ? 'Создаём…' : 'Создать компанию'}
                onPress={handleCreate}
                loading={loading}
                disabled={loading}
                fullWidth
                size="lg"
              />
            </View>

            <Text style={[styles.footerText, { color: colors.textMuted }]}>
              Директор — корень дерева ролей: видит все данные компании, создаёт роли и учётные записи сотрудников.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  container: { flex: 1 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 4 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 32 },
  title: { fontSize: 28, fontWeight: '700', marginTop: 16 },
  subtitle: { fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 22 },
  form: { marginTop: 8 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10, marginTop: 8, marginLeft: 2 },
  footerText: { fontSize: 12, textAlign: 'center', marginTop: 24, lineHeight: 18 }
}));