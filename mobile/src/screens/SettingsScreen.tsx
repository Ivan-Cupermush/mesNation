import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  FileSpreadsheet,
  TreePine,
  UserPlus,
  LogOut,
  ChevronRight,
  User,
} from 'lucide-react-native';
import { api } from '../services/api';

export default function SettingsScreen({ navigation }: any) {
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    api.getCurrentUser().then(setCurrentUser).catch(console.error);
  }, []);

  const handleLogout = () => {
    Alert.alert('Выход', 'Вы уверены, что хотите выйти?', [
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

  const adminActions = [
    {
      id: 'import-excel',
      icon: FileSpreadsheet,
      title: 'Импорт из Excel',
      description: 'Загрузить данные из таблицы',
      color: '#3B82F6',
      screen: 'ImportExcel',
    },
    {
      id: 'role-tree',
      icon: TreePine,
      title: 'Редактор дерева прав',
      description: 'Управление ролями и правами',
      color: '#8B5CF6',
      screen: 'RoleTreeEditor',
    },
    {
      id: 'create-user',
      icon: UserPlus,
      title: 'Создать пользователя',
      description: 'Добавить нового сотрудника',
      color: '#F59E0B',
      screen: 'CreateUserRole',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Настройки</Text>
          <Text style={styles.subtitle}>Управление системой</Text>
        </View>

        {currentUser && (
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <User size={22} color="#1F7A52" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.profileName}>{currentUser.display_name}</Text>
              <Text style={styles.profileRole}>{currentUser.role_name || 'Сотрудник'}</Text>
              {!!currentUser.email && (
                <Text style={styles.profileEmail}>{currentUser.email}</Text>
              )}
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Администрирование</Text>
        <View style={styles.card}>
          {adminActions.map((a, i) => {
            const Icon = a.icon;
            return (
              <TouchableOpacity
                key={a.id}
                style={[styles.row, i > 0 && styles.rowBorder]}
                onPress={() => navigation.navigate(a.screen)}
                activeOpacity={0.7}
              >
                <View style={[styles.iconWrap, { backgroundColor: a.color + '1A' }]}>
                  <Icon size={20} color={a.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{a.title}</Text>
                  <Text style={styles.rowSub}>{a.description}</Text>
                </View>
                <ChevronRight size={18} color="#9CA3AF" />
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.logoutCard} onPress={handleLogout} activeOpacity={0.7}>
          <LogOut size={18} color="#DC2626" />
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F7F5' },
  content: { paddingHorizontal: 20, paddingTop: 12 },
  header: { marginBottom: 16 },
  title: { fontSize: 28, fontWeight: '700', color: '#111827' },
  subtitle: { fontSize: 14, color: '#6B7280', marginTop: 2 },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F3EE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileName: { fontSize: 16, fontWeight: '700', color: '#111827' },
  profileRole: { fontSize: 12, fontWeight: '600', color: '#1F7A52', marginTop: 2 },
  profileEmail: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E5E7EB' },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowTitle: { fontSize: 14, fontWeight: '600', color: '#111827' },
  rowSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  logoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
  },
  logoutText: { fontSize: 14, fontWeight: '600', color: '#DC2626', marginLeft: 8 },
});
