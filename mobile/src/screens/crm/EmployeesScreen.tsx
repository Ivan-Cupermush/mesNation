import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, StatusBar, TouchableOpacity,
  ScrollView, ActivityIndicator, Image, TextInput, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeContext';
import { api, Employee } from '../../services/api';
import { publicFileUrl } from '../../services/http';
import { ChevronLeft, Search, Users, X, SearchX, TreePine } from 'lucide-react-native';
import { fuzzyMatch, translit } from '../../utils/fuzzySearch';

import { T, themed } from '../../theme/runtime';
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
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const loadEmployees = async () => {
    try {
      // Роли, email и статус приходят сразу с сервера (раньше роль была видна только у директора).
      setEmployees(await api.getUsers(true));
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Не удалось загрузить сотрудников');
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(useCallback(() => { loadEmployees(); }, []));

  const visible = useMemo(
    () => employees.filter((e) => (statusFilter === 'all' ? true : statusFilter === 'active' ? e.is_active : !e.is_active)),
    [employees, statusFilter],
  );
  const inactiveCount = employees.filter((e) => !e.is_active).length;

  const { nameMatches, contentMatches } = useMemo(() => {
    if (!debounced) return { nameMatches: [], contentMatches: [] };
    const scored = visible
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
  }, [debounced, visible]);

  const totalFound = debounced ? nameMatches.length + contentMatches.length : visible.length;

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
          <Text style={{ backgroundColor: T.warningSoft, color: T.textPrimary }}>{text}</Text>
        </Text>
      );
    }
    return (
      <Text style={baseStyle}>
        {text.slice(0, idx)}
        <Text style={{ backgroundColor: T.warningSoft, color: T.textPrimary }}>
          {text.slice(idx, idx + debounced.length)}
        </Text>
        {text.slice(idx + debounced.length)}
      </Text>
    );
  };

  const openProfile = (employee: any) => {
    navigation.navigate('UserProfile', { userId: employee.id });
  };

  // Перейти в дерево ролей и сфокусироваться на узле этого сотрудника
  const openUserInTree = (employee: any) => {
    navigation.navigate('RoleTreeEditor', { focusUserId: employee.id, focusNodeId: employee.role_node_id });
  };

  const renderEmployee = (emp: any) => {
    const name = emp.display_name || emp.username || 'Без имени';
    const role = emp.role_name || 'Без роли';
    return (
      <TouchableOpacity
        key={emp.id}
        style={[styles.employeeCard, { backgroundColor: colors.surface }, !emp.is_active && styles.inactiveCard]}
        activeOpacity={0.7}
        onPress={() => openProfile(emp)}
      >
        <View style={[styles.avatar, { backgroundColor: emp.avatar_url ? T.surfaceActive : hashColor(name) }]}>
          {emp.avatar_url ? (
            <Image source={{ uri: publicFileUrl(emp.avatar_url)! }} style={styles.avatarImg} />
          ) : (
            <Text style={styles.avatarText}>{initials(name)}</Text>
          )}
        </View>
        <View style={{ flex: 1 }}>
          {highlight(name, [styles.employeeName, { color: colors.textPrimary }])}
          <View style={styles.badgesRow}>
            <View style={[styles.roleBadge, { backgroundColor: T.accentMuted }]}>
              {highlight(role, [styles.roleBadgeText, { color: T.accent }])}
            </View>
            {!emp.is_active && (
              <View style={[styles.roleBadge, { backgroundColor: T.dangerSoft }]}>
                <Text style={[styles.roleBadgeText, { color: T.danger }]}>неактивен</Text>
              </View>
            )}
          </View>
          {emp.email ? highlight(emp.email, [styles.emailText, { color: colors.textSecondary }]) : null}
        </View>
        <TouchableOpacity
          onPress={() => openUserInTree(emp)}
          style={styles.treeBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <TreePine size={18} color={T.violet} strokeWidth={2.2} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={T.accent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <StatusBar barStyle={T.statusBar} backgroundColor={colors.background} />

      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={22} color={T.accent} strokeWidth={2.5} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>СОТРУДНИКИ</Text>
          <Text style={styles.headerSubtitle}>Все сотрудники компании</Text>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: debounced ? T.accent : colors.border }]}>
          <Search size={18} color={debounced ? T.accent : colors.textMuted} strokeWidth={2} />
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

      <View style={styles.statusChips}>
        {([
          ['active', 'Активные'],
          ['inactive', `Неактивные${inactiveCount ? ` (${inactiveCount})` : ''}`],
          ['all', 'Все'],
        ] as const).map(([id, label]) => (
          <TouchableOpacity
            key={id}
            onPress={() => setStatusFilter(id)}
            style={[styles.statusChip, statusFilter === id && styles.statusChipActive]}
            activeOpacity={0.7}
          >
            <Text style={[styles.statusChipText, statusFilter === id && styles.statusChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? (
        <TouchableOpacity onPress={loadEmployees} style={styles.errorBox}>
          <Text style={styles.errorText}>{error} · Повторить</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.countBar}>
        <Users size={14} color={colors.textSecondary} strokeWidth={2} />
        <Text style={[styles.countText, { color: colors.textSecondary }]}>
          {debounced ? `Найдено: ${totalFound} из ${visible.length}` : `Всего: ${visible.length}`}
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {!debounced ? (
          visible.map(renderEmployee)
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

const styles = themed(() => ({
  inactiveCard: { opacity: 0.6 },
  badgesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  emailText: { fontSize: 12, marginTop: 4 },
  statusChips: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 10 },
  statusChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: T.inputBg },
  statusChipActive: { backgroundColor: T.accent },
  statusChipText: { fontSize: 13, fontWeight: '600', color: T.textSecondary },
  statusChipTextActive: { color: T.onAccent },
  errorBox: { marginHorizontal: 20, marginBottom: 10, padding: 12, borderRadius: 12, backgroundColor: T.dangerSoft },
  errorText: { color: T.danger, fontSize: 13, fontWeight: '600' },
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12, gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: T.card,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  headerTitle: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24, fontWeight: '900', color: T.textPrimary, letterSpacing: 0.3, lineHeight: 28,
  },
  headerSubtitle: {
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    fontSize: 13, fontStyle: 'italic', color: T.textSecondary, marginTop: 1,
  },
  searchContainer: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12, borderRadius: 16, borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, fontWeight: '500', padding: 0 },
  searchHint: { fontSize: 11, color: T.textMuted, marginTop: 6, fontStyle: 'italic' },
  countBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingBottom: 12 },
  countText: { fontSize: 13, fontWeight: '600' },
  listContent: { paddingHorizontal: 20, gap: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginTop: 6, marginBottom: -4 },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptySub: { fontSize: 13 },
  employeeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16,
    shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarText: { color: T.onAccent, fontWeight: '700', fontSize: 16 },
  employeeName: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  roleBadgeText: { fontSize: 11, fontWeight: '700' },
  treeBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: T.violetSoft,
    alignItems: 'center', justifyContent: 'center',
  },
}));
