import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  TextInput,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Search,
  SlidersHorizontal,
  X,
  Plus,
  Flag,
  CalendarDays,
  Users,
  ChevronRight,
  List,
  CalendarRange,
  ArrowDownUp,
} from 'lucide-react-native';
import TaskCalendar from '../../components/tasks/TaskCalendar';

// ===== МОКОВЫЕ ДАННЫЕ =====
const CURRENT_USER_ID = 1;

const mockTasks = [
  {
    id: 1,
    title: 'Подготовить квартальный отчёт',
    description: 'Собрать данные по всем отделам и подготовить презентацию для совета директоров',
    priority: 'high' as const,
    status: 'in_progress' as const,
    assignees: [
      { id: 1, name: 'АИ', color: '#1F7A52' },
      { id: 2, name: 'ВП', color: '#3B82F6' },
    ],
    deadline: '15 авг',
    deadlineISO: '2026-08-15T18:00:00',
    createdAt: '2026-08-01T10:00:00',
    creatorId: 2,
  },
  {
    id: 2,
    title: 'Разработать новый модуль CRM',
    description: 'Интеграция с API и настройка вебхуков',
    priority: 'medium' as const,
    status: 'on_review' as const,
    assignees: [{ id: 3, name: 'СК', color: '#F59E0B' }],
    deadline: '20 авг',
    deadlineISO: '2026-08-20T18:00:00',
    createdAt: '2026-07-28T10:00:00',
    creatorId: 1,
  },
  {
    id: 3,
    title: 'Обзвонить 100 клиентов',
    description: 'Провести опрос удовлетворённости и собрать обратную связь',
    priority: 'low' as const,
    status: 'done' as const,
    assignees: [
      { id: 4, name: 'ПП', color: '#8B5CF6' },
      { id: 5, name: 'АМ', color: '#EC4899' },
      { id: 6, name: 'ДК', color: '#14B8A6' },
    ],
    deadline: '10 авг',
    deadlineISO: '2026-08-10T18:00:00',
    createdAt: '2026-07-25T10:00:00',
    creatorId: 2,
  },
  {
    id: 4,
    title: 'Обновить документацию API',
    description: 'Добавить новые эндпоинты и примеры запросов',
    priority: 'medium' as const,
    status: 'new' as const,
    assignees: [{ id: 1, name: 'АИ', color: '#1F7A52' }],
    deadline: '25 авг',
    deadlineISO: '2026-08-25T18:00:00',
    createdAt: '2026-08-03T10:00:00',
    creatorId: 1,
  },
  {
    id: 5,
    title: 'Увеличить продажи на 50%',
    description: 'Разработать стратегию и план действий на следующий квартал',
    priority: 'high' as const,
    status: 'overdue' as const,
    assignees: [
      { id: 7, name: 'ИД', color: '#0EA5E9' },
      { id: 4, name: 'ПП', color: '#8B5CF6' },
    ],
    deadline: '1 авг',
    deadlineISO: '2026-08-01T18:00:00',
    createdAt: '2026-07-15T10:00:00',
    creatorId: 2,
  },
  {
    id: 6,
    title: 'Настроить резервное копирование',
    description: 'Ежедневные бэкапы БД и файлов',
    priority: 'low' as const,
    status: 'archived' as const,
    assignees: [{ id: 1, name: 'АИ', color: '#1F7A52' }],
    deadline: '20 июл',
    deadlineISO: '2026-07-20T18:00:00',
    createdAt: '2026-07-01T10:00:00',
    creatorId: 1,
  },
];

const filters = [
  { id: 'all', label: 'Все' },
  { id: 'mine', label: 'Мои' },
  { id: 'created', label: 'Созданные' },
  { id: 'overdue', label: 'Просроченные' },
  { id: 'archived', label: 'Архив' },
];

const PRIORITY_CONFIG = {
  high: { color: '#DC2626', label: 'Высокий' },
  medium: { color: '#F59E0B', label: 'Средний' },
  low: { color: '#1F7A52', label: 'Низкий' },
};

const STATUS_CONFIG = {
  new: { bg: '#F3F4F6', text: '#6B7280', label: 'Новая' },
  in_progress: { bg: '#1F7A52', text: '#FFFFFF', label: 'В работе' },
  on_review: { bg: '#FEF3C7', text: '#92400E', label: 'На проверке' },
  done: { bg: '#D1FAE5', text: '#065F46', label: 'Завершена' },
  overdue: { bg: '#7F1D1D', text: '#FFFFFF', label: 'Просрочена' },
  archived: { bg: '#F3F4F6', text: '#9CA3AF', label: 'В архиве' },
};

export default function TasksScreen({ navigation }: any) {
  // ===== ВСЕ ХУКИ ЗДЕСЬ, В САМОМ НАЧАЛЕ (никаких условий выше!) =====
  const [activeFilter, setActiveFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [showFade, setShowFade] = useState(true);
  const [sortBy, setSortBy] = useState<'deadline' | 'priority'>('deadline');
  const [showSortModal, setShowSortModal] = useState(false);

  // ===== ФИЛЬТРАЦИЯ + СОРТИРОВКА =====
  const filteredTasks = useMemo(() => {
    let list = [...mockTasks];

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q),
      );
    }

    switch (activeFilter) {
      case 'mine':
        list = list.filter((t) => t.assignees.some((a) => a.id === CURRENT_USER_ID));
        break;
      case 'created':
        list = list.filter((t) => t.creatorId === CURRENT_USER_ID);
        break;
      case 'overdue':
        list = list.filter((t) => t.status === 'overdue');
        break;
      case 'archived':
        list = list.filter((t) => t.status === 'archived');
        break;
      default:
        list = list.filter((t) => t.status !== 'archived');
        break;
    }

    // === СОРТИРОВКА ===
    const prio: Record<string, number> = { high: 0, medium: 1, low: 2 };
    list.sort((a, b) => {
      if (sortBy === 'deadline') {
        const dA = a.deadlineISO ? new Date(a.deadlineISO).getTime() : Infinity;
        const dB = b.deadlineISO ? new Date(b.deadlineISO).getTime() : Infinity;
        if (dA !== dB) return dA - dB;
        return (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9);
      } else {
        const pA = prio[a.priority] ?? 9;
        const pB = prio[b.priority] ?? 9;
        if (pA !== pB) return pA - pB;
        const dA = a.deadlineISO ? new Date(a.deadlineISO).getTime() : Infinity;
        const dB = b.deadlineISO ? new Date(b.deadlineISO).getTime() : Infinity;
        return dA - dB;
      }
    });

    return list;
  }, [searchQuery, activeFilter, sortBy]);

  const calendarTasks = useMemo(
    () =>
      filteredTasks.map((t) => ({
        id: t.id,
        title: t.title,
        importance: t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'yellow' : 'green',
        status_new: t.status,
        created_at: t.createdAt,
        executor_deadline: t.deadlineISO,
        hard_deadline: t.deadlineISO,
        reviewer_deadline: t.status === 'on_review' ? t.deadlineISO : null,
      })) as any[],
    [filteredTasks],
  );

  const renderTaskCard = (task: typeof mockTasks[0]) => {
    const priority = PRIORITY_CONFIG[task.priority];
    const status = STATUS_CONFIG[task.status];

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
        style={styles.taskCard}
      >
        <View style={styles.taskHeader}>
          <View style={styles.priorityRow}>
            <Flag size={16} color={priority.color} strokeWidth={2} />
            <Text style={[styles.priorityLabel, { color: priority.color }]}>
              {priority.label}
            </Text>
          </View>
          <ChevronRight size={18} color="#BDBDBD" strokeWidth={2} />
        </View>

        <Text style={styles.taskTitle} numberOfLines={2}>
          {task.title}
        </Text>

        {task.description ? (
          <Text style={styles.taskDescription} numberOfLines={2}>
            {task.description}
          </Text>
        ) : null}

        <View style={styles.taskFooter}>
          <View style={styles.assigneesRow}>
            <Users size={14} color="#6F6F73" strokeWidth={2} />
            <View style={styles.avatarsStack}>
              {task.assignees.slice(0, 3).map((assignee, index) => (
                <View
                  key={assignee.id}
                  style={[
                    styles.avatar,
                    {
                      backgroundColor: assignee.color,
                      marginLeft: index > 0 ? -8 : 0,
                      zIndex: 10 - index,
                    },
                  ]}
                >
                  <Text style={styles.avatarText}>{assignee.name}</Text>
                </View>
              ))}
              {task.assignees.length > 3 && (
                <View style={[styles.avatar, styles.avatarMore, { marginLeft: -8, zIndex: 0 }]}>
                  <Text style={styles.avatarMoreText}>+{task.assignees.length - 3}</Text>
                </View>
              )}
            </View>
          </View>

          <View style={styles.deadlineRow}>
            <CalendarDays size={14} color="#6F6F73" strokeWidth={2} />
            <Text style={styles.deadlineText}>{task.deadline}</Text>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* ===== HEADER ===== */}
      <View style={styles.header}>
        <Text style={styles.title}>ЗАДАЧИ</Text>
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
            <CalendarRange
              size={18}
              color={viewMode === 'calendar' ? '#FFFFFF' : '#6F6F73'}
              strokeWidth={2}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* ===== ПОИСК + КНОПКА СОРТИРОВКИ ===== */}
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

      {/* ===== ФИЛЬТРЫ С ФЕЙДОМ ===== */}
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
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter === filter.id && styles.filterChipTextActive,
                ]}
              >
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

      {/* ===== КОНТЕНТ ===== */}
      {viewMode === 'list' ? (
        <FlatList
          data={filteredTasks}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => renderTaskCard(item)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyBlock}>
              <Search size={40} color="#BDBDBD" strokeWidth={1.5} />
              <Text style={styles.emptyTitle}>Ничего не найдено</Text>
              <Text style={styles.emptySubtitle}>Попробуй изменить запрос или фильтр</Text>
            </View>
          }
        />
      ) : (
        <View style={styles.calendarWrap}>
          <TaskCalendar
            tasks={calendarTasks}
            onPressTask={(task: any) => navigation.navigate('TaskDetail', { taskId: task.id })}
          />
        </View>
      )}

      {/* ===== FAB ===== */}
      <TouchableOpacity
        onPress={() => navigation.navigate('CreateTask')}
        activeOpacity={0.85}
        style={styles.fab}
      >
        <Plus size={24} color="#FFFFFF" strokeWidth={2.5} />
      </TouchableOpacity>

      {/* ===== МОДАЛКА СОРТИРОВКИ ===== */}
      <Modal visible={showSortModal} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowSortModal(false)}
          style={sortStyles.overlay}
        >
          <View style={sortStyles.sheet}>
            <View style={sortStyles.handle} />
            <Text style={sortStyles.title}>Сортировка</Text>

            <TouchableOpacity
              onPress={() => {
                setSortBy('deadline');
                setShowSortModal(false);
              }}
              style={[
                sortStyles.option,
                sortBy === 'deadline' && sortStyles.optionActive,
              ]}
              activeOpacity={0.7}
            >
              <ArrowDownUp
                size={20}
                color={sortBy === 'deadline' ? '#1F7A52' : '#6F6F73'}
                strokeWidth={2}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    sortStyles.optionTitle,
                    sortBy === 'deadline' && sortStyles.optionTitleActive,
                  ]}
                >
                  По дедлайну
                </Text>
                <Text style={sortStyles.optionSubtitle}>
                  Ближайшие сроки → важные
                </Text>
              </View>
              {sortBy === 'deadline' && (
                <View style={sortStyles.checkCircle}>
                  <Text style={sortStyles.checkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => {
                setSortBy('priority');
                setShowSortModal(false);
              }}
              style={[
                sortStyles.option,
                sortBy === 'priority' && sortStyles.optionActive,
              ]}
              activeOpacity={0.7}
            >
              <ArrowDownUp
                size={20}
                color={sortBy === 'priority' ? '#1F7A52' : '#6F6F73'}
                strokeWidth={2}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={[
                    sortStyles.optionTitle,
                    sortBy === 'priority' && sortStyles.optionTitleActive,
                  ]}
                >
                  По приоритету
                </Text>
                <Text style={sortStyles.optionSubtitle}>
                  Важные задачи → ближайшие сроки
                </Text>
              </View>
              {sortBy === 'priority' && (
                <View style={sortStyles.checkCircle}>
                  <Text style={sortStyles.checkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: -0.5,
    lineHeight: 44,
  },
  viewSwitch: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  viewSwitchBtn: {
    width: 36,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewSwitchBtnActive: { backgroundColor: '#1F7A52' },
  searchContainer: { paddingHorizontal: 24, marginBottom: 16 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 16,
    height: 48,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#141414',
    marginLeft: 12,
    fontWeight: '500',
    padding: 0,
  },
  clearBtn: { padding: 4 },
  filtersWrap: { height: 40, marginBottom: 8 },
  filtersContainer: { flexGrow: 1 },
  filtersContent: {
    paddingHorizontal: 24,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  filterChipActive: { backgroundColor: '#1F7A52' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#6F6F73' },
  filterChipTextActive: { color: '#FFFFFF' },
  fadeWrap: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  fadeStep: { width: 8, height: '100%', backgroundColor: '#FAFAF8' },
  listContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 120,
    gap: 16,
  },
  emptyBlock: { alignItems: 'center', paddingTop: 64 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: '#141414', marginTop: 16 },
  emptySubtitle: { fontSize: 13, color: '#6F6F73', marginTop: 4 },
  taskCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  priorityRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  priorityLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  taskTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 8,
    lineHeight: 24,
  },
  taskDescription: {
    fontSize: 14,
    color: '#6F6F73',
    lineHeight: 20,
    marginBottom: 16,
    fontWeight: '500',
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ECECE8',
  },
  assigneesRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarsStack: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  avatarMore: { backgroundColor: '#ECECE8' },
  avatarMoreText: { fontSize: 10, fontWeight: '600', color: '#6F6F73' },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  deadlineText: { fontSize: 13, color: '#6F6F73', fontWeight: '500' },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  statusText: { fontSize: 12, fontWeight: '600' },
  calendarWrap: { flex: 1, marginTop: 8 },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#1F7A52',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1F7A52',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
});

const sortStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    paddingBottom: 32,
    gap: 12,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#ECECE8',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 8,
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 24,
    fontWeight: '900',
    color: '#141414',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#FAFAF8',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#1F7A52',
  },
  optionTitle: { fontSize: 15, fontWeight: '700', color: '#141414' },
  optionTitleActive: { color: '#1F7A52' },
  optionSubtitle: { fontSize: 12, color: '#6F6F73', marginTop: 2 },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#1F7A52',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});