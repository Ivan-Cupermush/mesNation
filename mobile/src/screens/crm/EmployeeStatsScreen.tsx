import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl, Platform,
  ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  User, Trophy, CheckCircle2, Clock, AlertCircle,
  Wallet, TrendingUp, ArrowLeft, Package,
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
const fmtDate = (d: string | Date): string =>
  new Date(d).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' });

export default function EmployeeStatsScreen({ route, navigation }: any) {
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
      console.error('Ошибка загрузки:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, period]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

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

  const { user, kpis = [], tasks, taskStats, summary, transactions = [] } = data;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color="#141414" strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {userName || 'Сотрудник'}
        </Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#1F7A52" />}
      >
        {/* User header */}
        <View style={styles.userHeader}>
          <View style={styles.userAvatar}>
            <User size={30} color="#FFFFFF" strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={1}>{user.display_name || user.username}</Text>
            <Text style={styles.subtitle}>{user.role_name || 'Сотрудник'}</Text>
          </View>
        </View>

        {/* Periods */}
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

        {/* ВСЕ KPI из Excel */}
        {kpis.length > 0 ? (
          <>
            <Text style={styles.sectionTitle}>KPI сотрудника ({kpis.length})</Text>
            {kpis.map((kpi: any) => (
              <View key={String(kpi.id)} style={[styles.card, { marginBottom: 12 }]}>
                <View style={styles.kpiHeader}>
                  <View style={styles.kpiIcon}>
                    <Trophy size={22} color="#1F7A52" strokeWidth={2.2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.kpiTitle}>{kpi.product_name || 'Цель'}</Text>
                    <Text style={styles.kpiSubtitle}>
                      {kpi.metric_type === 'amount' ? 'Сумма (₽)' : kpi.metric_type === 'contracts' ? 'Контракты' : 'Количество (шт)'}
                    </Text>
                  </View>
                  <View style={styles.percentBadge}>
                    <Text style={styles.percentText}>{Number(kpi.progress_percent || kpi.progress || 0)}%</Text>
                  </View>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${Math.min(100, Number(kpi.progress_percent || kpi.progress || 0))}%` }]} />
                </View>
                <Text style={styles.progressText}>
                  {kpi.current_value || 0} / {kpi.target_value || 0}
                </Text>
              </View>
            ))}
          </>
        ) : (
          <View style={[styles.card, { alignItems: 'center', paddingVertical: 30 }]}>
            <Package size={32} color="#9CA3AF" />
            <Text style={{ color: '#6F6F73', marginTop: 12, fontSize: 14 }}>
              Нет активных KPI
            </Text>
            <Text style={{ color: '#9CA3AF', marginTop: 4, fontSize: 12 }}>
              Импортируйте Excel-файл для этого сотрудника
            </Text>
          </View>
        )}

        {/* Fact stats */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#D1FAE5' }]}>
              <Wallet size={22} color="#1F7A52" strokeWidth={2.2} />
            </View>
            <Text style={styles.statValue}>{fmt(summary?.total_amount || 0)}</Text>
            <Text style={styles.statLabel}>Выручка</Text>
          </View>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#DBEAFE' }]}>
              <TrendingUp size={22} color="#3B82F6" strokeWidth={2.2} />
            </View>
            <Text style={styles.statValue}>{summary?.total_transactions || 0}</Text>
            <Text style={styles.statLabel}>Сделки</Text>
          </View>
        </View>

        {/* Task stats */}
        <View style={styles.card}>
          <Text style={styles.sectionTitleInner}>Статистика задач</Text>
          <View style={styles.taskStatsGrid}>
            <View style={styles.taskStatItem}>
              <CheckCircle2 size={18} color="#1F7A52" />
              <Text style={styles.taskStatValue}>{taskStats.completed}</Text>
              <Text style={styles.taskStatLabel}>Выполнено</Text>
            </View>
            <View style={styles.taskStatItem}>
              <Clock size={18} color="#3B82F6" />
              <Text style={styles.taskStatValue}>{taskStats.in_progress}</Text>
              <Text style={styles.taskStatLabel}>В работе</Text>
            </View>
            <View style={styles.taskStatItem}>
              <AlertCircle size={18} color="#DC2626" />
              <Text style={styles.taskStatValue}>{taskStats.overdue}</Text>
              <Text style={styles.taskStatLabel}>Просрочено</Text>
            </View>
          </View>
        </View>

        {/* ИСТОРИЯ ПРОДАЖ (все строки из Excel) */}
        {transactions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>История продаж ({transactions.length})</Text>
            <View style={[styles.card, { padding: 8 }]}>
              {transactions.map((tx: any, idx: number) => (
                <View key={String(tx.id || idx)} style={[styles.txRow, idx < transactions.length - 1 && styles.txRowBorder]}>
                  <View style={styles.txIconWrap}>
                    <TrendingUp size={16} color="#1F7A52" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txProduct}>{tx.product_name || 'Товар'}</Text>
                    <Text style={styles.txMeta}>
                      {fmtDate(tx.transaction_date)}{tx.client_name ? ` • ${tx.client_name}` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.txAmount}>+{fmt(tx.amount || 0)}</Text>
                    {Number(tx.quantity) > 1 && <Text style={styles.txQty}>{tx.quantity} шт.</Text>}
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Recent tasks */}
        {tasks.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.sectionTitleInner}>Последние задачи</Text>
            {tasks.slice(0, 5).map((task: any) => (
              <View key={String(task.id)} style={styles.taskRow}>
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
  scrollContent: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF8' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FAFAF8' },
  errorText: { fontSize: 16, color: '#DC2626', fontWeight: '600' },

  // ===== HEADER (премиум) =====
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: '#FAFAF8',
  },
  backBtn: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: '#FFFFFF',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 3,
  },
  headerTitle: {
    fontSize: 17, fontWeight: '700', flex: 1, textAlign: 'center', color: '#141414',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },

  // ===== USER HEADER =====
  userHeader: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 20 },
  userAvatar: {
    width: 64, height: 64, borderRadius: 20, backgroundColor: '#1F7A52',
    justifyContent: 'center', alignItems: 'center', marginRight: 16,
    shadowColor: '#1F7A52', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6,
  },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 40, fontWeight: '900', color: '#141414', letterSpacing: -0.5, lineHeight: 44,
  },
  subtitle: {
    fontFamily: Platform.OS === 'ios' ? 'Didot' : 'serif',
    fontSize: 16, fontStyle: 'italic', color: '#6F6F73', marginTop: 2,
  },

  // ===== PERIODS =====
  periodSwitch: {
    flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 18, padding: 4, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  periodBtn: { flex: 1, height: 40, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  periodBtnActive: { backgroundColor: '#1F7A52' },
  periodText: {
    fontSize: 14, fontWeight: '600', color: '#6F6F73',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  periodTextActive: { color: '#FFFFFF' },

  sectionTitle: {
    fontSize: 20, fontWeight: '800', color: '#141414', marginBottom: 12, marginTop: 4,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  sectionTitleInner: {
    fontSize: 17, fontWeight: '700', color: '#141414', marginBottom: 14,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },

  // ===== CARD =====
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  kpiIcon: {
    width: 46, height: 46, borderRadius: 14, backgroundColor: '#D1FAE5',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  kpiTitle: {
    fontSize: 16, fontWeight: '700', color: '#141414',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  kpiSubtitle: { fontSize: 12, color: '#6F6F73', fontWeight: '500', marginTop: 2 },
  percentBadge: {
    backgroundColor: '#D1FAE5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
  },
  percentText: { color: '#1F7A52', fontSize: 13, fontWeight: '800' },
  progressBarBg: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#1F7A52', borderRadius: 4 },
  progressText: { fontSize: 12, color: '#6F6F73', fontWeight: '600', marginTop: 8, textAlign: 'right' },

  // ===== STATS =====
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  statIcon: {
    width: 46, height: 46, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  statValue: {
    fontSize: 18, fontWeight: '800', color: '#141414', marginBottom: 2,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  statLabel: { fontSize: 11, color: '#6F6F73', fontWeight: '600' },

  // ===== TASK STATS =====
  taskStatsGrid: { flexDirection: 'row', gap: 10 },
  taskStatItem: {
    flex: 1, alignItems: 'center', paddingVertical: 14,
    backgroundColor: '#F9FAFB', borderRadius: 16,
  },
  taskStatValue: {
    fontSize: 22, fontWeight: '800', color: '#141414', marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  taskStatLabel: { fontSize: 11, color: '#6F6F73', fontWeight: '600', marginTop: 3 },

  // ===== TRANSACTIONS =====
  txRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14 },
  txRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  txIconWrap: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: '#D1FAE5',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  txProduct: {
    fontSize: 14, fontWeight: '700', color: '#141414',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  txMeta: { fontSize: 11, color: '#6F6F73', fontWeight: '500', marginTop: 2 },
  txAmount: {
    fontSize: 14, fontWeight: '700', color: '#1F7A52',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  txQty: { fontSize: 10, color: '#6F6F73', fontWeight: '500', marginTop: 2 },

  // ===== TASKS =====
  taskRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  taskStatusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 10 },
  taskTitle: {
    fontSize: 14, fontWeight: '600', color: '#141414',
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  taskMeta: { fontSize: 11, color: '#6F6F73', fontWeight: '500', marginTop: 2 },
});
