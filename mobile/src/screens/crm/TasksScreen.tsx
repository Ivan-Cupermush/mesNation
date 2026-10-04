import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView,
  Platform, TextInput, Modal, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  Search, SlidersHorizontal, X, Plus, Flag, CalendarDays, Users,
  ChevronRight, List, CalendarRange, ArrowDownUp, UserRound, Monitor, Wrench, Eye,
} from 'lucide-react-native';
import TaskCalendar from '../../components/tasks/TaskCalendar';
import { api, Task } from '../../services/api';
import { StatusPill, StatusSegments } from '../../components/tasks/taskStatus';

const AVATAR_COLORS = ['#1F7A52', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#0EA5E9', '#14B8A6', '#EF4444'];

const hashColor = (s: string) => {
  const sum = (s || '?').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const initials = (name: string) =>
  (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

const BASE_FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'mine', label: 'Исполняю' },
  { id: 'watching', label: 'Наблюдаю' },
  { id: 'created', label: 'Создал' },
  { id: 'overdue', label: 'Просроченные' },
  { id: 'archived', label: 'Архив' },
];
const TEAM_FILTER = { id: 'team', label: 'Команда' };

/**
 * Иконка роли на плашке задачи: 💻 — создал, 🔧 — исполняю, 👁 — наблюдаю.
 * Если ролей несколько, показываются все (например, создал и исполняю).
 */
function RoleIcons({ task }: { task: Task }) {
  const roles: { key: string; Icon: any; color: string; label: string }[] = [];
  if (task.is_creator) roles.push({ key: 'c', Icon: Monitor, color: '#3B82F6', label: 'Вы создатель' });
  if (task.is_assignee) roles.push({ key: 'a', Icon: Wrench, color: '#1F7A52', label: 'Вы исполнитель' });
  if (task.is_watcher && !task.is_creator) roles.push({ key: 'w', Icon: Eye, color: '#8B5CF6', label: 'Вы наблюдатель' });
  if (!roles.length && task.is_supervisor !== false && !task.is_creator && !task.is_assignee && !task.is_watcher) {
    roles.push({ key: 's', Icon: Users, color: '#F59E0B', label: 'Задача вашей команды' });
  }
  return (
    <View style={{ flexDirection: 'row', gap: 4 }} accessibilityLabel={roles.map((r) => r.label).join(', ')}>
      {roles.map(({ key, Icon, color }) => (
        <View key={key} style={[roleIconStyles.wrap, { backgroundColor: color + '1A' }]}>
          <Icon size={14} color={color} strokeWidth={2.2} />
        </View>
      ))}
    </View>
  );
}

const roleIconStyles = StyleSheet.create({
  wrap: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});

const PRIORITY_CONFIG: Record<string, { color: string; label: string }> = {
  green: { color: '#1F7A52', label: 'Низкий' },
  yellow: { color: '#F59E0B', label: 'Средний' },
  red: { color: '#DC2626', label: 'Высокий' },
};


const fmtDeadline = (iso: string | null) => {
  if (!iso) return 'Без срока';
  try {
    return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  } catch {
    return 'Без срока';
  }
};

export default function TasksScreen({ navigation }: any) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [meId, setMeId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [showFade, setShowFade] = useState(true);
  const [sortBy, setSortBy] = useState<'deadline' | 'priority'>('deadline');
  const [showSortModal, setShowSortModal] = useState(false);

  const [teamTasks, setTeamTasks] = useState<Task[]>([]);
  const [isManager, setIsManager] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [me, list] = await Promise.all([
        api.getCurrentUser(),
        api.getTasks({ include_archived: true }),
      ]);
      setMeId(me.id);
      setIsManager(me.is_director || me.has_subordinates);
      setTasks(list);
      if (me.is_director || me.has_subordinates) {
        setTeamTasks(await api.getTasks({ filter: 'team', include_archived: true }));
      }
      setError(null);
    } catch (e: any) {
      // Раньше ошибка глушилась и экран показывал «Задач пока нет».
      setError(e?.message || 'Не удалось загрузить задачи');
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  const filters = isManager ? [...BASE_FILTERS.slice(0, 4), TEAM_FILTER, ...BASE_FILTERS.slice(4)] : BASE_FILTERS;

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const filteredTasks = useMemo(() => {
    let list = activeFilter === 'team' ? [...teamTasks] : [...tasks];
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          (t.title || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q),
      );
    }
    switch (activeFilter) {
      case 'mine':
        list = list.filter((t) => t.is_assignee && t.status_new !== 'archived');
        break;
      case 'watching':
        list = list.filter((t) => t.is_watcher && !t.is_creator && t.status_new !== 'archived');
        break;
      case 'created':
        list = list.filter((t) => t.creator_id === meId && t.status_new !== 'archived');
        break;
      case 'team':
        list = list.filter((t) => t.status_new !== 'archived');
        break;
      case 'overdue':
        // Просрочка вычисляется сервером по дедлайну (статус 'overdue' никто не выставлял).
        list = list.filter((t) => t.is_overdue || t.status_new === 'overdue');
        break;
      case 'archived':
        list = list.filter((t) => t.status_new === 'archived');
        break;
      default:
        list = list.filter((t) => t.status_new !== 'archived');
        break;
    }
    const prio: Record<string, number> = { red: 0, yellow: 1, green: 2 };
    const dl = (t: Task) => {
      const iso = t.executor_deadline || t.hard_deadline;
      return iso ? new Date(iso).getTime() : Infinity;
    };
    list.sort((a, b) => {
      const pA = prio[a.importance] ?? 9;
      const pB = prio[b.importance] ?? 9;
      const dA = dl(a);
      const dB = dl(b);
      if (sortBy === 'deadline') {
        if (dA !== dB) return dA - dB;
        return pA - pB;
      }
      if (pA !== pB) return pA - pB;
      return dA - dB;
    });
    return list;
  }, [tasks, teamTasks, searchQuery, activeFilter, sortBy, meId]);

  const renderTaskCard = (task: Task) => {
    const priority = PRIORITY_CONFIG[task.importance] || PRIORITY_CONFIG.yellow;
    const deadline = task.executor_deadline || task.hard_deadline;
    const assignees = task.assignees || [];
    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
        style={styles.taskCard}
      >
        <View style={styles.taskHeader}>
          <View style={styles.priorityRow}>
            <Flag size={16} color={priority.color} strokeWidth={2} />
            <Text style={[styles.priorityLabel, { color: priority.color }]}>{priority.label}</Text>
            {task.is_overdue && <Text style={styles.overdueTag}>просрочена</Text>}
            {task.archived_as === 'deleted' && <Text style={styles.deletedTag}>удалена</Text>}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <RoleIcons task={task} />
            <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
          </View>
        </View>
        <Text style={styles.taskTitle} numberOfLines={2}>{task.title}</Text>
        <View style={styles.progressRow}>
          <StatusSegments status={task.status_new} />
        </View>
        {task.description ? (
          <Text style={styles.taskDescription} numberOfLines={2}>{task.description}</Text>
        ) : null}
        <View style={styles.taskFooter}>
          <View style={styles.assigneesRow}>
            <Users size={14} color="#6F6F73" strokeWidth={2} />
            {assignees.length > 0 ? (
              <View style={styles.avatarsStack}>
                {assignees.slice(0, 3).map((a, index) => (
                  <View
                    key={a.id}
                    style={[
                      styles.avatar,
                      { backgroundColor: hashColor(a.display_name || a.username), marginLeft: index > 0 ? -8 : 0, zIndex: 10 - index },
                    ]}
                  >
                    <Text style={styles.avatarText}>{initials(a.display_name || a.username)}</Text>
                  </View>
                ))}
                {assignees.length > 3 && (
                  <View style={[styles.avatar, styles.avatarMore, { marginLeft: -8, zIndex: 0 }]}>
                    <Text style={styles.avatarMoreText}>+{assignees.length - 3}</Text>
                  </View>
                )}
              </View>
            ) : (
              <Text style={styles.noAssignees}>Нет исполнителей</Text>
            )}
          </View>
          {(task.watchers_count ?? 0) > 0 && (
            <View style={styles.deadlineRow}>
              <Eye size={14} color="#6F6F73" strokeWidth={2} />
              <Text style={styles.deadlineText}>{task.watchers_count}</Text>
            </View>
          )}
          <View style={styles.deadlineRow}>
            <CalendarDays size={14} color={task.is_overdue ? '#B91C1C' : '#6F6F73'} strokeWidth={2} />
            <Text style={[styles.deadlineText, task.is_overdue && { color: '#B91C1C', fontWeight: '700' }]}>{fmtDeadline(deadline)}</Text>
          </View>
          <StatusPill status={task.status_new} overdue={task.is_overdue} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>ЗАДАЧИ</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.viewSwitch}>
            <TouchableOpacity
              onPress={() => setViewMode('list')}
              style={[styles.viewSwitchBtn, viewMode === 'list' && styles.viewSwitchBtnActive]}
            >
              <List size={18} color={viewMode === 'list' ? '#FFFFFF' : '#6F6F73'} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setViewMode('calendar')}
              style={[styles.viewSwitchBtn, viewMode === 'calendar' && styles.viewSwitchBtnActive]}
            >
              <CalendarRange size={18} color={viewMode === 'calendar' ? '#FFFFFF' : '#6F6F73'} strokeWidth={2} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => navigation.getParent()?.navigate('ChatTab', { screen: 'Profile' })}
            activeOpacity={0.7}
          >
            <UserRound size={20} color="#1F7A52" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={20} color="#6F6F73" strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск задач..."
            placeholderTextColor="#BDBDBD"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 ? (
            <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
              <X size={18} color="#BDBDBD" strokeWidth={2} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setShowSortModal(true)} style={styles.clearBtn}>
              <SlidersHorizontal size={18} color="#1F7A52" strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.filtersWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filtersContainer}
          contentContainerStyle={styles.filtersContent}
          scrollEventThrottle={16}
          onScroll={({ nativeEvent }) => {
            const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
            setShowFade(contentOffset.x + layoutMeasurement.width < contentSize.width - 8);
          }}
        >
          {filters.map((filter) => (
            <TouchableOpacity
              key={filter.id}
              onPress={() => setActiveFilter(filter.id)}
              style={[styles.filterChip, activeFilter === filter.id && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, activeFilter === filter.id && styles.filterChipTextActive]}>
                {filter.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {showFade && (
          <View style={styles.fadeWrap} pointerEvents="none">
            <View style={[styles.fadeStep, { opacity: 0.15 }]} />
            <View style={[styles.fadeStep, { opacity: 0.4 }]} />
            <View style={[styles.fadeStep, { opacity: 0.75 }]} />
          </View>
        )}
      </View>

      {error ? (
        <TouchableOpacity onPress={() => { setLoading(true); loadData(); }} style={styles.errorBox}>
          <Text style={styles.errorText}>{error} · Повторить</Text>
        </TouchableOpacity>
      ) : null}

      {loading && tasks.length === 0 ? (
        <View style={styles.loadingWrap}><ActivityIndicator size="large" color="#1F7A52" /></View>
      ) : viewMode === 'list' ? (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => renderTaskCard(item)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#1F7A52" />
          }
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Search size={40} color="#BDBDBD" strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>{searchQuery.trim() ? 'Ничего не найдено' : 'Задач пока нет'}</Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery.trim() ? 'Попробуй изменить запрос или фильтр' : 'Нажми «+», чтобы создать первую задачу'}
              </Text>
            </View>
          }
        />
      ) : (
        <View style={styles.calendarWrap}>
          <TaskCalendar
            tasks={filteredTasks as any}
            onPressTask={(task: any) => navigation.navigate('TaskDetail', { taskId: task.id })}
          />
        </View>
      )}

      <TouchableOpacity onPress={() => navigation.navigate('CreateTask')} activeOpacity={0.85} style={styles.fab}>
        <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>

      <Modal visible={showSortModal} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} onPress={() => setShowSortModal(false)} style={sortStyles.overlay}>
          <View style={sortStyles.sheet}>
            <View style={sortStyles.handle} />
            <Text style={sortStyles.title}>Сортировка</Text>
            <TouchableOpacity
              onPress={() => { setSortBy('deadline'); setShowSortModal(false); }}
              style={[sortStyles.option, sortBy === 'deadline' && sortStyles.optionActive]}
              activeOpacity={0.7}
            >
              <ArrowDownUp size={20} color={sortBy === 'deadline' ? '#1F7A52' : '#6F6F73'} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[sortStyles.optionTitle, sortBy === 'deadline' && sortStyles.optionTitleActive]}>По дедлайну</Text>
                <Text style={sortStyles.optionSubtitle}>Ближайшие сроки → важные</Text>
              </View>
              {sortBy === 'deadline' && (
                <View style={sortStyles.checkCircle}><Text style={sortStyles.checkText}>✓</Text></View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { setSortBy('priority'); setShowSortModal(false); }}
              style={[sortStyles.option, sortBy === 'priority' && sortStyles.optionActive]}
              activeOpacity={0.7}
            >
              <ArrowDownUp size={20} color={sortBy === 'priority' ? '#1F7A52' : '#6F6F73'} strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={[sortStyles.optionTitle, sortBy === 'priority' && sortStyles.optionTitleActive]}>По приоритету</Text>
                <Text style={sortStyles.optionSubtitle}>Важные задачи → ближайшие сроки</Text>
              </View>
              {sortBy === 'priority' && (
                <View style={sortStyles.checkCircle}><Text style={sortStyles.checkText}>✓</Text></View>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  progressRow: { marginTop: 6, marginBottom: 2 },
  overdueTag: { marginLeft: 6, fontSize: 11, fontWeight: '700', color: '#B91C1C' },
  deletedTag: { marginLeft: 6, fontSize: 11, fontWeight: '700', color: '#6F6F73' },
  errorBox: { marginHorizontal: 20, marginBottom: 8, padding: 12, borderRadius: 12, backgroundColor: '#FEF2F2' },
  errorText: { color: '#DC2626', fontSize: 13, fontWeight: '600' },
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16 },
  title: { fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed', fontSize: 40, fontWeight: '900', color: '#141414', letterSpacing: -0.5, lineHeight: 44 },
  viewSwitch: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  viewSwitchBtn: { width: 36, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  viewSwitchBtnActive: { backgroundColor: '#1F7A52' },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  searchContainer: { paddingHorizontal: 24, marginBottom: 16 },
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 16, height: 48, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4 },
  searchInput: { flex: 1, fontSize: 16, color: '#141414', marginLeft: 12, fontWeight: '500', padding: 0 },
  clearBtn: { padding: 4 },
  filtersWrap: { height: 40, marginBottom: 8 },
  filtersContainer: { flexGrow: 1 },
  filtersContent: { paddingHorizontal: 24, gap: 8, alignItems: 'center' },
  filterChip: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 8, elevation: 2 },
  filterChipActive: { backgroundColor: '#1F7A52' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#6F6F73' },
  filterChipTextActive: { color: '#FFFFFF' },
  fadeWrap: { position: 'absolute', right: 0, top: 0, bottom: 0, flexDirection: 'row' },
  fadeStep: { width: 8, height: '100%', backgroundColor: '#FAFAF8' },
  listContent: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 120, gap: 16 },
  emptyBlock: { alignItems: 'center', paddingTop: 64 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#141414', marginTop: 16 },
  emptySubtitle: { fontSize: 13, color: '#6F6F73', marginTop: 4 },
  taskCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4 },
  taskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  priorityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priorityLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  taskTitle: { fontSize: 18, fontWeight: '700', color: '#141414', marginBottom: 8, lineHeight: 24 },
  taskDescription: { fontSize: 14, color: '#6F6F73', lineHeight: 20, marginBottom: 16, fontWeight: '500' },
  taskFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#ECECE8', gap: 8 },
  assigneesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  avatarsStack: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FFFFFF' },
  avatarText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  avatarMore: { backgroundColor: '#ECECE8' },
  avatarMoreText: { fontSize: 10, fontWeight: '600', color: '#6F6F73' },
  noAssignees: { fontSize: 12, color: '#BDBDBD', fontStyle: 'italic' },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deadlineText: { fontSize: 13, color: '#6F6F73', fontWeight: '500' },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  statusText: { fontSize: 12, fontWeight: '600' },
  calendarWrap: { flex: 1, marginTop: 8 },
  fab: { position: 'absolute', right: 24, bottom: 24, width: 56, height: 56, borderRadius: 18, backgroundColor: '#1F7A52', justifyContent: 'center', alignItems: 'center', shadowColor: '#1F7A52', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 8 },
});

const sortStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 32, gap: 12 },
  handle: { width: 40, height: 4, backgroundColor: '#ECECE8', borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
  title: { fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed', fontSize: 24, fontWeight: '900', color: '#141414', letterSpacing: 0.5, marginBottom: 4 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 16, backgroundColor: '#FAFAF8', borderWidth: 1.5, borderColor: 'transparent' },
  optionActive: { backgroundColor: '#ECFDF5', borderColor: '#1F7A52' },
  optionTitle: { fontSize: 15, fontWeight: '700', color: '#141414' },
  optionTitleActive: { color: '#1F7A52' },
  optionSubtitle: { fontSize: 12, color: '#6F6F73', marginTop: 2 },
  checkCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#1F7A52', alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});