import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Target,
  FileSpreadsheet,
  TreePine,
  UserPlus,
  LogOut,
  ChevronRight,
  User,
  Building2,
} from 'lucide-react-native';
import { api } from '../services/api';
import { useTheme } from '../theme/ThemeContext';

export default function SettingsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    api.getCurrentUser()
      .then(setCurrentUser)
      .catch(console.error);
  }, []);

  const handleLogout = () => {
    Alert.alert(
      'Выход',
      'Вы уверены, что хотите выйти?',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: async () => {
            await api.logout();
            navigation.reset({
              index: 0,
              routes: [{ name: 'Auth' }],
            });
          },
        },
      ]
    );
  };

  const adminActions = [
    {
      id: 'assign-kpi',
      icon: Target,
      title: 'Назначить KPI',
      description: 'Установить цели для сотрудников',
      color: '#1F7A52',
      onPress: () => navigation.navigate('AssignKpi'),
    },
    {
      id: 'import-excel',
      icon: FileSpreadsheet,
      title: 'Импорт из Excel',
      description: 'Загрузить данные из таблицы',
      color: '#3B82F6',
      onPress: () => navigation.navigate('ImportExcel'),
    },
    {
      id: 'role-tree',
      icon: TreePine,
      title: 'Редактор дерева прав',
      description: 'Управление ролями и правами',
      color: '#8B5CF6',
      onPress: () => navigation.navigate('RoleTreeEditor'),
    },
    {
      id: 'create-user',
      icon: UserPlus,
      title: 'Создать пользователя',
      description: 'Добавить нового сотрудника',
      color: '#F59E0B',
      onPress: () => navigation.navigate('CreateUserRole'),
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Настройки</Text>
          <Text style={styles.subtitle}>Управление системой</Text>
        </View>

        {/* Profile Card */}
        {currentUser && (
          <View style={styles.profileCard}>
            <View style={styles.profileAvatar}>
              {currentUser.avatar_url ? (
                <User size={32} color="#1F7A52" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>
                    {currentUser.display_name?.charAt(0) || 'U'}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{currentUser.display_name}</Text>
              <Text style={styles.profileRole}>
                {currentUser.role_name || 'Сотрудник'}
              </Text>
              <Text style={styles.profileEmail}>{currentUser.email}</Text>
            </View>
          </View>
        )}

        {/* Admin Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Администрирование</Text>
          <View style={styles.cardContainer}>
            {adminActions.map((action, index) => {
              const Icon = action.icon;
              const isLast = index === adminActions.length - 1;
              return (
                <TouchableOpacity
                  key={action.id}
                  style={[
                    styles.actionCard,
                    !isLast && styles.actionCardBorder,
                  ]}
                  onPress={action.onPress}
                  activeOpacity={0.7}
                >
                  <View style={[styles.iconWrap, { backgroundColor: action.color }]}>
                    <Icon size={24} color="#FFFFFF" />
                  </View>
                  <View style={styles.actionInfo}>
                    <Text style={styles.actionTitle}>{action.title}</Text>
                    <Text style={styles.actionDescription}>
                      {action.description}
                    </Text>
                  </View>
                  <ChevronRight size={20} color="#6F6F73" />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Logout Button */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <LogOut size={20} color="#DC2626" />
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </TouchableOpacity>

        <View style={{ height: 80 }} />
            <TouchableOpacity
        style={styles.menuItem}
        onPress={() => navigation.navigate('KpiImport')}
      >
        <FileSpreadsheet size={20} color="#1F7A52" />
        <Text style={styles.menuItemText}>Импорт KPI из Excel</Text>
        <ChevronRight size={20} color="#9ca3af" />
      </TouchableOpacity>
</ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  content: { paddingHorizontal: 24, paddingTop: 8 },
  header: { marginBottom: 24 },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  subtitle: {
    fontSize: 16,
    color: '#6F6F73',
    marginTop: 4,
    fontWeight: '500',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  profileAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1F7A52',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 4,
  },
  profileRole: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F7A52',
    marginBottom: 2,
  },
  profileEmail: {
    fontSize: 13,
    color: '#6F6F73',
    fontWeight: '500',
  },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6F6F73',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
    marginLeft: 4,
  },
  cardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  actionCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#ECECE8',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionInfo: { flex: 1 },
  actionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 13,
    color: '#6F6F73',
    fontWeight: '500',
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#DC2626',
    marginLeft: 8,
  },
});
