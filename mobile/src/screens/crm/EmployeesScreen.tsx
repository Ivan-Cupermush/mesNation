import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, StatusBar, TouchableOpacity,
  ScrollView, ActivityIndicator, Image, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { api } from '../../services/api';
import { SERVER_URL } from '../../utils';
import { ChevronLeft, Search, Users, X, SearchX, TreePine } from 'lucide-react-native';
import { fuzzyMatch, translit } from '../../utils/fuzzySearch';

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

// ===== Алгоритм поиска как в проводнике Windows =====
const searchScore = (emp: any, q: string): { score: number; rank: number } => {
  const name = emp.display_name || emp.username || '';
  const role = emp.role_name || '';
  const username = emp.username || '';
  const email = emp.email || '';

  const nameR = fuzzyMatch(name, q);
  const roleR = fuzzyMatch(role, q);
  const userR = fuzzyMatch(username, q);
  const emailR = fuzzyMatch(email, q);

  // Имя (как имя файла) — приоритет выше
  if (nameR.match) return { score: nameR.rank, rank: nameR.rank };
  // Содержимое (роль, ник, email)
  if (roleR.match)  return { score: 10 + roleR.rank,  rank: roleR.rank };
  if (userR.match)  return { score: 20 + userR.rank,  rank: userR.rank };
  if (emailR.match) return { score: 30 + emailR.rank, rank: emailR.rank };
  return { score: -1, rank: -1 };
};

export default function EmployeesScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const loadEmployees = async () => {
    try {
      const [users, tree] = await Promise.all([
        api.getAllUsersWithRoles(),
        api.getRoleTree(),
      ]);
      let roleMap: Record<number, string> = {};
      const root = (tree || []).find((n: any) => !n.parent_id);
      if (root) {
        const sub = await api.getUsersInSubtree(root.id).catch(() => []);
        (sub || []).forEach((u: any) => { roleMap[u.id] = u.role_name; });
      }
      const merged = (users || []).map((u: any) => ({
        ...u,
        role_name: u.role_name || roleMap[u.id] || null,
      }));
      setEmployees(merged);
    } catch (e: any) {
      console.error('Ошибка загрузки сотрудников:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadEmployees(); }, []);

  const { nameMatches, contentMatches } = useMemo(() => {
    if (!debounced) return { nameMatches: [], contentMatches: [] };
    const scored = employees
      .map((emp) => {
        const s = searchScore(emp, debounced);
        return { emp, score: s.score, rank: s.rank };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => a.score - b.score || (a.emp.display_name || '').localeCompare(b.emp.display_name || ''));
    return {
      nameMatches: scored.filter((x) => x.score < 10).map((x) => x.emp),
      contentMatches: scored.filter((x) => x.score >= 10).map((x) => x.emp),
    };
  }, [debounced, employees]);

  const totalFound = debounced ? nameMatches.length + contentMatches.length : employees.length;

  // Подсветка совпадений (с учётом транслита показываем оригинал)
  const highlight = (text: string, baseStyle: any) => {
    if (!debounced || !text) return <Text style={baseStyle}>{text}</Text>;
    const tLow = text.toLowerCase();
    const qLow = debounced.toLowerCase();
    let idx = tLow.indexOf(qLow);
    if (idx === -1) {
      // пробуем транслит
      const tT = translit(text);
      const qT = translit(debounced);
      const idxT = tT.indexOf(qT);
      if (idxT === -1) return <Text style={baseStyle}>{text}</Text>;
      idx = idxT; // совпадение по позиции (транслит не меняет длину для большинства букв, но не всегда)
      // для безопасности просто подсветим всю строку
      return (
        <Text style={baseStyle}>
          <Text style={{ backgroundColor: '#FDE68A', color: '#141414' }}>{text}</Text>
        </Text>
      );
    }
    return (
      <Text style={baseStyle}>
        {text.slice(0, idx)}
        <Text style={{ backgroundColor: '#FDE68A', color: '#141414' }}>
          {text.slice(idx, idx + debounced.length)}
        </Text>
        {text.slice(idx + debounced.length)}
      </Text>
    );
  };

  const openProfile = (employee: any) => {
    navigation.navigate('ChatTab', {
      screen: 'UserProfile',
      params: {
        userId: employee.id,
        username: employee.username,
        displayName: employee.display_name || employee.username,
        avatarUrl: employee.avatar_url,
        role: employee.role_name,
      },
    });
  };

  // Перейти в дерево ролей и сфокусироваться на узле этого сотрудника
  const openUserInTree = (employee: any) => {
    navigation.navigate('SettingsTab', {
      screen: 'RoleTreeEditor',
      params: { focusUserId: employee.id },
    });
  };

  const renderEmployee = (emp: any) => {
    const name = emp.display_name || emp.username || 'Без имени';
    const role = emp.role_name || 'Без роли';
    return (
      <TouchableOpacity
        key={emp.id}
        style={[styles.employeeCard, { backgroundColor: colors.surface }]}
        activeOpacity={0.7}
        onPress={() => openProfile(emp)}
      >
        <View style={[styles.avatar, { backgroundColor: emp.avatar_url ? '#ECECE8' : hashColor(name) }]}>
          {emp.avatar_url ? (
            <Image source={{ uri: SERVER_URL + emp.avatar_url }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{initials(name)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          {highlight(name, [styles.employeeName, { color: colors.textPrimary }])}
          <View style={[styles.roleBadge, { backgroundColor: '#ECFDF5' }]}>
            {highlight(role, [styles.roleBadgeText, { color: '#1F7A52' }])}
          </View>
        </View>
        <TouchableOpacity
          onPress={() => openUserInTree(emp)}
          style={styles.treeBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <TreePine size={18} color="#8B5CF6" strokeWidth={2.2} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1F7A52" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={22} color="#1F7A52" strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>СОТРУДНИКИ</Text>
          <Text style={styles.headerSubtitle}>Все сотрудники компании</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: debounced ? '#1F7A52' : colors.border }]}>
          <Search size={18} color={debounced ? '#1F7A52' : colors.textMuted} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            value={query}
            onChangeText={setQuery}
            placeholder="Поиск"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {!!query && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={16} color={colors.textMuted} strokeWidth={2.4} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.searchHint}>
          💡 Гибкий поиск: регистр, кириллица/латиница, опечатки
        </Text>
      </View>

      <View style={styles.countBar}>
        <Users size={14} color={colors.textSecondary} strokeWidth={2} />
        <Text style={[styles.countText, { color: colors.textSecondary }]}>
          {debounced ? `Найдено: ${totalFound} из ${employees.length}` : `Всего: ${employees.length}`}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {!debounced ? (
          employees.map(renderEmployee)
        ) : totalFound === 0 ? (
          <View style={styles.emptyState}>
            <SearchX size={40} color={colors.textMuted} strokeWidth={1.5} />
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Ничего не найдено</Text>
            <Text style={[styles.emptySub, { color: colors.textSecondary }]}>
              {`По запросу «${query}» совпадений нет`}
            </Text>
          </View>
        ) : (
          <>
            {nameMatches.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>СОВПАДЕНИЯ В ИМЕНИ</Text>
                {nameMatches.map(renderEmployee)}
              </>
            )}
            {contentMatches.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>СОВПАДЕНИЯ В СОДЕРЖИМОМ (РОЛЬ, НИК, EMAIL)</Text>
                {contentMatches.map(renderEmployee)}
              </>
            )}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12, gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24, fontWeight: '900', color: '#141414', letterSpacing: 0.3, lineHeight: 28,
  },
  headerSubtitle: {
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    fontSize: 13, fontStyle: 'italic', color: '#6F6F73', marginTop: 1,
  },
  searchContainer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', padding: 0 },
  searchHint: { fontSize: 11, color: '#9CA3AF', marginTop: 6, fontStyle: 'italic' },
  countBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingBottom: 12 },
  countText: { fontSize: 13, fontWeight: '600' },
  listContent: { paddingHorizontal: 20, gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: 6, marginBottom: -4 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySub: { fontSize: 13 },
  employeeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { color: '#FFFFFF', fontWeight: '700', fontSize: 16 },
  employeeName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  treeBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#EDE9FE',
    alignItems: 'center', justifyContent: 'center',
  },
});
