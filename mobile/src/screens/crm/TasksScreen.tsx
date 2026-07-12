import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, RefreshControl,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Avatar } from '../../components/ui/Avatar';
import { api, Task } from '../../services/api';

type Filter = 'all' | 'mine' | 'created' | 'watching';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'mine', label: 'Мои' },
  { id: 'created', label: 'Созданные' },
  { id: 'watching', label: 'Наблюдаю' },
];

const IMPORTANCE_MAP = {
  green: { label: 'Низкий', variant: 'success' as const, emoji: '🟢' },
  yellow: { label: 'Средний', variant: 'warning' as const, emoji: '🟡' },
  red: { label: 'Срочный', variant: 'danger' as const, emoji: '🔴' },
};

const STATUS_MAP: Record<string, { label: string; emoji: string }> = {
  new: { label: 'Новая', emoji: '🆕' },
  in_progress: { label: 'В работе', emoji: '⚙' },
  on_review: { label: 'На проверке', emoji: '👀' },
  done: { label: 'Выполнена', emoji: '✅' },
  overdue: { label: 'Просрочена', emoji: '⏰' },
  rejected: { label: 'Отклонена', emoji: '↩' },
  archived: { label: 'В архиве', emoji: '🗂' },
};

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return `${Math.abs(diffDays)} дн. назад`;
  if (diffDays === 0) return 'Сегодня';
  if (diffDays === 1) return 'Завтра';
  if (diffDays < 7) return `Через ${diffDays} дн.`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function isOverdue(iso: string | null): boolean {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

export default function TasksScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const loadTasks = useCallback(async () => {
    try {
      const data = await api.getTasks(filter);
      setTasks(data);
    } catch (e) {
      console.error('Ошибка загрузки задач:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useFocusEffect(useCallback(() => {
    loadTasks();
  }, [loadTasks]));

  const onRefresh = () => {
    setRefreshing(true);
    loadTasks();
  };

  const grouped = tasks.reduce((acc, task) => {
    const key = task.hard_deadline
      ? (isOverdue(task.hard_deadline) ? 'Просрочено' : formatDate(task.hard_deadline))
      : 'Без дедлайна';
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  const sections = Object.entries(grouped);
  const renderTaskCard = (task: Task) => {
    const importance = IMPORTANCE_MAP[task.importance];
    const status = STATUS_MAP[task.status_new] || STATUS_MAP.new;
    const overdue = isOverdue(task.hard_deadline);

    return (
      <Card
        key={task.id}
        padding="md"
        onPress={() => navigation.navigate('TaskDetail', { taskId: task.id })}
        style={{ marginBottom: 10 }}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1, marginRight: 8 }}>
            <Text style={[styles.taskTitle, { color: colors.textPrimary }]} numberOfLines={2}>
              {task.title}
            </Text>
            {task.description && (
              <Text
                style={[styles.taskDesc, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                {task.description}
              </Text>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 20 }}>{importance.emoji}</Text>
          </View>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaRow}>
            <View style={[styles.indicator, { backgroundColor: getImportanceColor(task.importance) }]} />
            <Badge
              label={`${status.emoji} ${status.label}`}
              variant={task.status_new === 'done' ? 'success' : task.status_new === 'overdue' ? 'danger' : 'muted'}
              size="sm"
            />
            {task.pending_checkpoints > 0 && (
              <View style={{ marginLeft: 6 }}>
                <Badge
                  label={`🎯 ${task.pending_checkpoints} КТ`}
                  variant="info"
                  size="sm"
                />
              </View>
            )}
          </View>

          <View style={[styles.metaRow, { marginTop: 8 }]}>
            {task.hard_deadline && (
              <Text style={[styles.deadline, { color: overdue ? colors.danger : colors.textSecondary }]}>
                📅 {formatDate(task.hard_deadline)}
              </Text>
            )}
            <View style={{ flex: 1 }} />
            {task.assignees && task.assignees.length > 0 ? (
              <View style={styles.assigneesRow}>
                {task.assignees.slice(0, 3).map((a, i) => (
                  <Avatar
                    key={a.id}
                    size="xs"
                    title={a.display_name || a.username}
                    imageUrl={a.avatar_url}
                    style={{ marginLeft: i === 0 ? 0 : -8, borderWidth: 2, borderColor: colors.surface }}
                  />
                ))}
                {task.assignees.length > 3 && (
                  <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 4 }}>
                    +{task.assignees.length - 3}
                  </Text>
                )}
              </View>
            ) : (
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                от {task.creator_name || task.creator_username}
              </Text>
            )}
          </View>
        </View>
      </Card>
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
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Задачи</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.accent }]}
          onPress={() => navigation.navigate('CreateTask')}
        >
          <Text style={{ color: colors.onAccent, fontSize: 24, fontWeight: '300' }}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filtersRow}>
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
              <Text
                style={{
                  color: active ? colors.onAccent : colors.textPrimary,
                  fontWeight: active ? '600' : '400',
                  fontSize: 13,
                }}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={sections}
        keyExtractor={([key]) => key}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        renderItem={({ item: [groupTitle, groupTasks] }) => (
          <View style={{ marginBottom: 16 }}>
            <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>
              {groupTitle} · {groupTasks.length}
            </Text>
            {groupTasks.map(renderTaskCard)}
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={{ fontSize: 64 }}>📋</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              {filter === 'mine' ? 'У вас нет активных задач' : 'Задач пока нет'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Нажмите + чтобы создать первую задачу
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

function getImportanceColor(i: 'green' | 'yellow' | 'red'): string {
  if (i === 'green') return '#10B981';
  if (i === 'yellow') return '#F59E0B';
  return '#EF4444';
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  title: { fontSize: 32, fontWeight: '700' },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  filtersRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  groupTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    marginLeft: 4,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  taskTitle: { fontSize: 16, fontWeight: '600' },
  taskDesc: { fontSize: 13, marginTop: 3 },
  cardMeta: { marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  indicator: {
    width: 4,
    height: 16,
    borderRadius: 2,
    marginRight: 8,
  },
  deadline: { fontSize: 12, fontWeight: '500' },
  assigneesRow: { flexDirection: 'row', alignItems: 'center' },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtitle: { fontSize: 14, marginTop: 6 },
});
