import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  User,
  Target,
  CheckCircle2,
  Clock,
  AlertCircle,
  DollarSign,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react-native';
import { api } from '../../services/api';

type Period = 'week' | 'month' | 'quarter';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
];

const fmt = (v: number | string): string => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '0 ₽';
  return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
};

export default function EmployeeStatsScreen({ route }: any) {
  const { userId, userName } = route.params;
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const stats = await api.getEmployeeStats(userId, period);
      setData(stats);
    } catch (e) {
      console.error('Ошибка загрузки статистики:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, period]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = () => { setRefreshing(true); loadData(); };

  if (loading && !data) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1F7A52" />
      </SafeAreaView>
    );
  }

  if (!data) {
    return (
      <SafeAreaView style={styles.errorContainer}>
        <Text style={styles.errorText}>Не удалось загрузить данные</Text>
      </SafeAreaView>
    );
  }

  const { user, kpi, tasks, taskStats, summary } = data;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1F7A52" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.userAvatar}>
            <User size={32} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{user.display_name || user.username}</Text>
            <Text style={styles.subtitle}>{user.role_name || 'Сотрудник'}</Text>
          </View>
        </View>

        {/* Period Selector */}
        <View style={styles.periodContainer}>
          <View style={styles.periodSwitch}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[styles.periodBtn, period === p.id && styles.periodBtnActive]}
                onPress={() => setPeriod(p.id)}
              >
                <Text style={[styles.periodText, period === p.id && styles.periodTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* KPI */}
        {kpi && (
          <View style={styles.kpiCard}>
            <View style={styles.kpiHeader}>
              <View style={styles.kpiIcon}>
                <Target size={24} color="#1F7A52" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.kpiTitle}>KPI</Text>
                <Text style={styles.kpiSubtitle}>{kpi.product_name || 'Цель'}</Text>
              </View>
            </View>
            <View style={styles.progressBarContainer}>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${kpi.progress || 0}%` }]} />
              </View>
              <Text style={styles.progressText}>
                {kpi.current_value || 0} / {kpi.target_value || 0} ({kpi.progress || 0}%)
              </Text>
            </View>
          </View>
        )}

        {/* Sales Stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#1F7A52' }]}>
              <DollarSign size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.statValue}>{fmt(summary?.total_amount || 0)}</Text>
            <Text style={styles.statLabel}>Выручка</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#3B82F6' }]}>
              <ShoppingCart size={24} color="#FFFFFF" />
            </View>
            <Text style={styles.statValue}>{summary?.total_transactions || 0}</Text>
            <Text style={styles.statLabel}>Сделки</Text>
          </View>
        </View>

        {/* Task Stats */}
        <View style={styles.taskStatsCard}>
          <Text style={styles.sectionTitle}>Статистика задач</Text>
          <View style={styles.taskStatsGrid}>
            <View style={styles.taskStatItem}>
              <CheckCircle2 size={20} color="#1F7A52" />
              <Text style={styles.taskStatValue}>{taskStats.completed}</Text>
              <Text style={styles.taskStatLabel}>Выполнено</Text>
            </View>
            <View style={styles.taskStatItem}>
              <Clock size={20} color="#3B82F6" />
              <Text style={styles.taskStatValue}>{taskStats.in_progress}</Text>
              <Text style={styles.taskStatLabel}>В работе</Text>
            </View>
            <View style={styles.taskStatItem}>
              <AlertCircle size={20} color="#DC2626" />
              <Text style={styles.taskStatValue}>{taskStats.overdue}</Text>
              <Text style={styles.taskStatLabel}>Просрочено</Text>
            </View>
          </View>
        </View>

        {/* Recent Tasks */}
        {tasks.length > 0 && (
          <View style={styles.tasksCard}>
            <Text style={styles.sectionTitle}>Последние задачи</Text>
            {tasks.slice(0, 5).map((task: any, idx: number) => (
              <View key={task.id} style={styles.taskRow}>
                <View style={[styles.taskStatusDot, {
                  backgroundColor: task.status === 'done' ? '#1F7A52' :
                                   task.status === 'in_progress' ? '#3B82F6' : '#6F6F73'
                }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.taskTitle} numberOfLines={1}>{task.title}</Text>
                  <Text style={styles.taskMeta}>
                    {task.deadline ? new Date(task.deadline).toLocaleDateString('ru-RU') : 'Без дедлайна'}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  scrollContent: { paddingHorizontal: 24, paddingTop: 8 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF8' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF8' },
  errorText: { fontSize: 16, color: '#DC2626', fontWeight: '600' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  userAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1F7A52',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6F6F73',
    fontWeight: '500',
  },
  periodContainer: { marginBottom: 24 },
  periodSwitch: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  periodBtn: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodBtnActive: { backgroundColor: '#1F7A52' },
  periodText: { fontSize: 14, fontWeight: '600', color: '#6F6F73' },
  periodTextActive: { color: '#FFFFFF' },
  kpiCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  kpiIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  kpiTitle: { fontSize: 18, fontWeight: '700', color: '#141414', marginBottom: 2 },
  kpiSubtitle: { fontSize: 13, color: '#6F6F73', fontWeight: '500' },
  progressBarContainer: { marginTop: 8 },
  progressBarBg: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#1F7A52', borderRadius: 4 },
  progressText: { fontSize: 13, color: '#6F6F73', fontWeight: '600', marginTop: 8, textAlign: 'right' },
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  statIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: '#141414', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#6F6F73', fontWeight: '600' },
  taskStatsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#141414', marginBottom: 16 },
  taskStatsGrid: { flexDirection: 'row', gap: 12 },
  taskStatItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 16,
  },
  taskStatValue: { fontSize: 24, fontWeight: '700', color: '#141414', marginTop: 8 },
  taskStatLabel: { fontSize: 11, color: '#6F6F73', fontWeight: '600', marginTop: 4 },
  tasksCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  taskStatusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  taskTitle: { fontSize: 15, fontWeight: '600', color: '#141414', marginBottom: 2 },
  taskMeta: { fontSize: 12, color: '#6F6F73', fontWeight: '500' },
});
