import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { api, Task } from '../../services/api';

type Filter = 'all' | 'mine' | 'created' | 'watching' | 'on_review' | 'rejected' | 'overdue';

const FILTERS: { id: Filter; label: string; emoji: string }[] = [
  { id: 'all',       label: 'Все',        emoji: '📋' },
  { id: 'mine',      label: 'Мои',        emoji: '🔨' },
  { id: 'created',   label: 'Созданные',  emoji: '✨' },
  { id: 'on_review', label: 'На проверке', emoji: '👁' },
  { id: 'rejected',  label: 'Отклонённые', emoji: '❌' },
  { id: 'overdue',   label: 'Просрочены', emoji: '⏰' },
];

// Конфигурация статусов с цветами
const STATUS_CONFIG: Record<string, {
  label: string;
  emoji: string;
  color: string;
  bgColor: string;
  textColor: string;
}> = {
  new:         { label: 'Новая',       emoji: '🆕', color: '#94A3B8', bgColor: '#F1F5F9', textColor: '#475569' },
  in_progress: { label: 'В работе',    emoji: '🔨', color: '#3B82F6', bgColor: '#DBEAFE', textColor: '#1E40AF' },
  on_review:   { label: 'На проверке', emoji: '👁', color: '#F59E0B', bgColor: '#FEF3C7', textColor: '#92400E' },
  done:        { label: 'Выполнена',   emoji: '✅', color: '#10B981', bgColor: '#D1FAE5', textColor: '#065F46' },
  overdue:     { label: 'Просрочена',  emoji: '⏰', color: '#DC2626', bgColor: '#FEE2E2', textColor: '#991B1B' },
  rejected:    { label: 'Отклонена',   emoji: '❌', color: '#EF4444', bgColor: '#FEE2E2', textColor: '#991B1B' },
  archived:    { label: 'В архиве',    emoji: '🗄', color: '#6B7280', bgColor: '#F3F4F6', textColor: '#374151' },
};

const IMPORTANCE_MAP = {
  green:  { label: 'Низкий',  emoji: '🟢', color: '#10B981' },
  yellow: { label: 'Средний', emoji: '🟡', color: '#F59E0B' },
  red:    { label: 'Срочный', emoji: '🔴', color: '#EF4444' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < -7) return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  if (diffDays < 0) return `${Math.abs(diffDays)} дн. назад`;
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Завтра';
  if (diffDays < 7) return `Через ${diffDays} дн.`;
  if (diffDays < 30) return `Через ${Math.ceil(diffDays / 7)} нед.`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function getDeadlineColor(iso: string | null): string {
  if (!iso) return '#94A3B8';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return '#DC2626';      // просрочено — красный
  if (diffDays <= 2) return '#EF4444';     // сегодня-завтра — красный
  if (diffDays <= 7) return '#F59E0B';     // неделя — жёлтый
  return '#10B981';                         // много времени — зелёный
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export default function TasksScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const loadData = useCallback(async () => {
    try {
      let params: any = {};
      if (filter === 'on_review') params = { status: 'on_review' };
      else if (filter === 'rejected') params = { status: 'rejected' };
      else if (filter === 'overdue') params = { status: 'overdue' };
      else params = { filter };

      const data = await api.getTasks(params);
      setTasks(data);
    } catch (e) {
      console.error('Ошибка загрузки задач:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  // Подсчёт задач по статусам
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    tasks.forEach(t => {
      counts[t.status_new] = (counts[t.status_new] || 0) + 1;
    });
    return counts;
  }, [tasks]);

  // Общее количество задач
  const totalCount = tasks.length;

  const renderTaskCard = (task: Task) => {
    const statusConf = STATUS_CONFIG[task.status_new] || STATUS_CONFIG.new;
    const importanceConf = IMPORTANCE_MAP[task.importance] || IMPORTANCE_MAP.yellow;
    const deadlineColor = task.status_new !== 'done' && task.status_new !== 'archived'
      ? getDeadlineColor(task.hard_deadline)
      : '#94A3B8';
    const overdue = task.status_new !== 'done' && task.status_new !== 'archived' && isOverdue(task.hard_deadline);

    return (
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
      >
        <Card padding="none" style={{ marginBottom: 10, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row' }}>
            {/* Цветная полоска слева (индикатор статуса) */}
            <View style={{ width: 6, backgroundColor: statusConf.color }} />

            <View style={{ flex: 1, padding: 14 }}>
              {/* Верхняя строка: важность + статус */}
              <View style={styles.topRow}>
                <View style={[styles.statusBadge, { backgroundColor: statusConf.bgColor }]}>
                  <Text style={[styles.statusBadgeText, { color: statusConf.textColor }]}>
                    {statusConf.emoji} {statusConf.label}
                  </Text>
                </View>
                <View style={[styles.importanceBadge, { backgroundColor: importanceConf.color + '20' }]}>
                  <Text style={{ fontSize: 12, color: importanceConf.color, fontWeight: '600' }}>
                    {importanceConf.emoji} {importanceConf.label}
                  </Text>
                </View>
              </View>

              {/* Заголовок задачи */}
              <Text
                style={[
                  styles.title,
                  { color: colors.textPrimary },
                  task.status_new === 'done' && { textDecorationLine: 'line-through', opacity: 0.6 },
                ]}
                numberOfLines={2}
              >
                {task.title}
              </Text>

              {/* Описание (если есть) */}
              {task.description ? (
                <Text
                  style={[styles.description, { color: colors.textSecondary }]}
                  numberOfLines={1}
                >
                  {task.description}
                </Text>
              ) : null}

              {/* Нижняя строка: дедлайн + исполнители */}
              <View style={styles.bottomRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {/* Дедлайн */}
                  <Text style={{ fontSize: 12, color: deadlineColor, fontWeight: '600' }}>
                    {overdue ? '⚠️ ' : '⏰ '}
                    {formatDate(task.hard_deadline)}
                  </Text>

                  {/* Счётчики */}
                  {task.pending_checkpoints > 0 && (
                    <View style={[styles.miniBadge, { backgroundColor: '#F59E0B' }]}>
                      <Text style={styles.miniBadgeText}>📋 {task.pending_checkpoints}</Text>
                    </View>
                  )}
                </View>

                {/* Аватарки исполнителей */}
                <View style={styles.assigneesRow}>
                  {task.assignees?.slice(0, 3).map((a, idx) => (
                    <View
                      key={a.id}
                      style={[
                        styles.avatarWrapper,
                        { marginLeft: idx > 0 ? -8 : 0, borderColor: colors.background },
                      ]}
                    >
                      <Avatar
                        uri={a.avatar_url}
                        size={28}
                        name={a.display_name}
                      />
                    </View>
                  ))}
                  {(task.assignees?.length || 0) > 3 && (
                    <View style={[styles.avatarMore, { backgroundColor: colors.surface, borderColor: colors.background }]}>
                      <Text style={{ fontSize: 11, color: colors.textSecondary, fontWeight: '600' }}>
                        +{(task.assignees?.length || 0) - 3}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Заголовок */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Задачи</Text>
        <View style={styles.headerBadge}>
          <Text style={[styles.headerBadgeText, { color: colors.textSecondary }]}>
            {totalCount} {totalCount === 1 ? 'задача' : totalCount < 5 ? 'задачи' : 'задач'}
          </Text>
        </View>
      </View>

      {/* Счётчики статусов */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.countersRow}
      >
        {Object.entries(STATUS_CONFIG).map(([status, conf]) => {
          const count = statusCounts[status] || 0;
          if (count === 0) return null;
          return (
            <View key={status} style={[styles.counterItem, { backgroundColor: conf.bgColor }]}>
              <Text style={{ fontSize: 16 }}>{conf.emoji}</Text>
              <Text style={[styles.counterNumber, { color: conf.textColor }]}>{count}</Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Фильтры */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filtersRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <TouchableOpacity
              key={f.id}
              onPress={() => setFilter(f.id)}
              style={[
                styles.filterChip,
                {
                  backgroundColor: active ? colors.accent : colors.surface,
                  borderColor: active ? colors.accent : colors.border,
                },
              ]}
            >
              <Text style={{ fontSize: 14 }}>{f.emoji}</Text>
              <Text
                style={{
                  color: active ? colors.onAccent : colors.textPrimary,
                  fontWeight: active ? '600' : '400',
                  fontSize: 13,
                  marginLeft: 4,
                }}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Список задач */}
      <FlatList
        data={tasks}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => renderTaskCard(item)}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          <View style={styles.emptyBlock}>
            <Text style={{ fontSize: 64, marginBottom: 12 }}>📭</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Нет задач
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              {filter === 'all'
                ? 'Нажмите + чтобы создать первую задачу'
                : 'В этой категории нет задач'}
            </Text>
          </View>
        }
      />

      {/* FAB — создать задачу */}
      <TouchableOpacity
        onPress={() => navigation.navigate('CreateTask')}
        activeOpacity={0.8}
        style={[styles.fab, { backgroundColor: colors.accent }]}
      >
        <Text style={{ color: colors.onAccent, fontSize: 32, fontWeight: '300', lineHeight: 34 }}>
          +
        </Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: { fontSize: 32, fontWeight: '700' },
  headerBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
  },
  headerBadgeText: { fontSize: 13, fontWeight: '600' },
  countersRow: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  counterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    gap: 4,
  },
  counterNumber: { fontSize: 14, fontWeight: '700' },
  filtersRow: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  topRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
    flexWrap: 'wrap',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  importanceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
    lineHeight: 22,
  },
  description: {
    fontSize: 13,
    marginBottom: 10,
    lineHeight: 18,
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  miniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  miniBadgeText: { color: '#fff', fontSize: 11, fontWeight: '600' },
  assigneesRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrapper: {
    borderWidth: 2,
    borderRadius: 14,
  },
  avatarMore: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    marginLeft: -8,
  },
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  emptySubtitle: { fontSize: 13, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
});