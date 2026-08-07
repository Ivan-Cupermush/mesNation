import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, StatusBar, Animated, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import {
  Target, Users, DollarSign, ShoppingCart, Receipt,
  CheckCircle2, Clock, AlertCircle,
} from 'lucide-react-native';
import { api, SalesSummary } from '../../services/api';
import { AreaChart, ChartPoint } from '../../components/statistics/AreaChart';

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

const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(o, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ opacity: o }}>{children}</Animated.View>;
};

export default function KpiScreen({ navigation }: any) {
  const [period, setPeriod] = useState<Period>('month');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [subordinates, setSubordinates] = useState<any[]>([]);
  const [myKpi, setMyKpi] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[] | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [userData, myKpiData, summaryData, subData, txData, tasksData] = await Promise.all([
        api.getCurrentUser().catch(() => null),
        api.getMyKpi().catch(() => null),
        api.getSalesSummary(period).catch(() => null),
        api.getSubordinates().catch(() => []),
        api.getSalesTransactions({ period: period as any }).catch(() => []),
        (api as any).getTasks ? (api as any).getTasks().catch(() => null) : Promise.resolve(null),
      ]);
      setCurrentUser(userData);
      setMyKpi(myKpiData);
      setSummary(summaryData);
      setSubordinates(Array.isArray(subData) ? subData : []);
      setTransactions(Array.isArray(txData) ? txData : []);
      setTasks(Array.isArray(tasksData) ? tasksData : null);
    } catch (e) {
      console.error('KPI load error:', e);
    } finally {
      setRefreshing(false);
    }
  }, [period]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));

  const fact = summary?.fact;
  const targets = summary?.targets || [];
  const avgCheck = fact && Number(fact.total_transactions) > 0
    ? Number(fact.total_amount) / Number(fact.total_transactions) : 0;

  const chartData: ChartPoint[] = (summary?.topProducts || []).slice(0, 5).map((p: any) => ({
    label: (p.product_name || '').length > 9 ? String(p.product_name).slice(0, 9) + '…' : p.product_name,
    value: Number(p.total_amount) || 0,
  }));

  const kpis = fact ? [
    { label: 'Выручка', value: fmt(fact.total_amount), icon: DollarSign, color: '#1F7A52' },
    { label: 'Сделки', value: String(fact.total_transactions), icon: ShoppingCart, color: '#3B82F6' },
    { label: 'Ср. чек', value: avgCheck ? fmt(avgCheck) : '—', icon: Receipt, color: '#F59E0B' },
  ] : [];

  const taskStats = useMemo(() => {
    if (!tasks) return null;
    const now = new Date();
    let done = 0, inWork = 0, overdue = 0;
    tasks.forEach((t: any) => {
      const st = String(t.status || '').toLowerCase();
      const isDone = ['done', 'completed', 'complete', 'closed'].includes(st);
      const due = t.due_date ? new Date(t.due_date) : null;
      if (isDone) done++;
      else if (due && due < now) overdue++;
      else inWork++;
    });
    return { done, inWork, overdue };
  }, [tasks]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#1F7A52" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Статистика</Text>
          <Text style={styles.subtitle}>
            {currentUser ? `${currentUser.display_name || currentUser.username}` : 'Продажи и динамика'}
          </Text>
        </View>

        {/* Period Selector */}
        <View style={styles.periodSwitch}>
          {PERIODS.map(p => (
            <TouchableOpacity
              key={p.id}
              style={[styles.periodBtn, period === p.id && styles.periodBtnActive]}
              onPress={() => setPeriod(p.id)}
            >
              <Text style={[styles.periodText, period === p.id && styles.periodTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Personal monthly plan */}
        {myKpi && (
          <FadeIn>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIcon, { backgroundColor: '#D1FAE5' }]}>
                  <Target size={22} color="#1F7A52" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>Общий план на месяц</Text>
                  <Text style={styles.cardSubtitle}>{myKpi.product_name || 'Личный KPI'}</Text>
                </View>
              </View>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${Math.min(100, Number(myKpi.progress_percent) || myKpi.progress || 0)}%` }]} />
              </View>
              <Text style={styles.progressText}>{myKpi.current_value || 0} / {myKpi.target_value || 0}</Text>
            </View>
          </FadeIn>
        )}

        {/* ALL product targets */}
        {targets.length > 0 && (
          <FadeIn>
            <Text style={styles.sectionTitle}>Мои цели ({targets.length})</Text>
            {targets.map((t: any) => (
              <View key={String(t.id)} style={[styles.card, { marginBottom: 12 }]}>
                <View style={styles.cardHeader}>
                  <View style={[styles.cardIcon, { backgroundColor: '#E0E7FF' }]}>
                    <Target size={22} color="#3B82F6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>{t.product_name}</Text>
                    <Text style={styles.cardSubtitle}>
                      {t.metric_type === 'amount' ? 'Сумма (₽)' : t.metric_type === 'contracts' ? 'Контракты' : 'Количество (шт)'}
                    </Text>
                  </View>
                  <Text style={styles.percentBadge}>{Number(t.progress_percent) || 0}%</Text>
                </View>
                <View style={styles.progressBarBg}>
                  <View style={[styles.progressBarFill, { width: `${Math.min(100, Number(t.progress_percent) || 0)}%`, backgroundColor: '#3B82F6' }]} />
                </View>
                <Text style={styles.progressText}>{t.current_value} / {t.target_value}</Text>
              </View>
            ))}
          </FadeIn>
        )}

        {/* Fact stats */}
        {kpis.length > 0 && (
          <FadeIn>
            <View style={styles.statsGrid}>
              {kpis.map((k: any, idx: number) => {
                const Icon = k.icon;
                return (
                  <View key={idx} style={styles.statCard}>
                    <View style={[styles.statIcon, { backgroundColor: k.color }]}>
                      <Icon size={22} color="#fff" />
                    </View>
                    <Text style={styles.statValue}>{k.value}</Text>
                    <Text style={styles.statLabel}>{k.label}</Text>
                  </View>
                );
              })}
            </View>
          </FadeIn>
        )}

        {/* Chart */}
        {chartData.length > 0 && (
          <FadeIn>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Топ товаров</Text>
              <AreaChart data={chartData} />
            </View>
          </FadeIn>
        )}

        {/* Tasks stats */}
        {taskStats && (
          <FadeIn>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Статистика задач</Text>
              <View style={styles.tasksRow}>
                <View style={styles.taskCell}>
                  <CheckCircle2 size={20} color="#10B981" />
                  <Text style={styles.taskValue}>{taskStats.done}</Text>
                  <Text style={styles.taskLabel}>Выполнено</Text>
                </View>
                <View style={styles.taskCell}>
                  <Clock size={20} color="#3B82F6" />
                  <Text style={styles.taskValue}>{taskStats.inWork}</Text>
                  <Text style={styles.taskLabel}>В работе</Text>
                </View>
                <View style={styles.taskCell}>
                  <AlertCircle size={20} color="#EF4444" />
                  <Text style={styles.taskValue}>{taskStats.overdue}</Text>
                  <Text style={styles.taskLabel}>Просрочено</Text>
                </View>
              </View>
            </View>
          </FadeIn>
        )}

        {/* Transactions history */}
        {transactions.length > 0 && (
          <FadeIn>
            <Text style={styles.sectionTitle}>История продаж ({transactions.length})</Text>
            <View style={[styles.card, { padding: 8 }]}>
              {transactions.map((tx: any, idx: number) => (
                <View key={String(tx.id || idx)} style={[styles.txRow, idx < transactions.length - 1 && styles.txRowBorder]}>
                  <View style={styles.txIconWrap}>
                    <ShoppingCart size={16} color="#1F7A52" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.txProduct}>{tx.product_name || 'Товар'}</Text>
                    <Text style={styles.txMeta}>{fmtDate(tx.transaction_date)}{tx.client_name ? ` • ${tx.client_name}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.txAmount}>+{fmt(tx.amount || 0)}</Text>
                    {Number(tx.quantity) > 1 && <Text style={styles.txQty}>{tx.quantity} шт.</Text>}
                  </View>
                </View>
              ))}
            </View>
          </FadeIn>
        )}

        {/* Subordinates */}
        {subordinates.length > 0 && (
          <FadeIn>
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Users size={20} color="#1F7A52" />
                <Text style={[styles.cardTitle, { marginLeft: 10 }]}>Команда</Text>
              </View>
              {subordinates.map((sub: any, idx: number) => (
                <TouchableOpacity
                  key={String(sub.user_id || idx)}
                  style={styles.subRow}
                  onPress={() => navigation.navigate('EmployeeStats', { userId: parseInt(String(sub.user_id)) || 0, userName: sub.display_name || sub.username })}
                >
                  <View style={styles.subAvatar}>
                    <Text style={styles.subAvatarText}>{(sub.display_name || sub.username || '?').charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subName}>{sub.display_name || sub.username}</Text>
                    <Text style={styles.subRole}>{sub.role_name || 'Сотрудник'}</Text>
                  </View>
                  <Text style={styles.subKpi}>{fmt(sub.total_amount || 0)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </FadeIn>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FAFAF8' },
  scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
  header: { marginBottom: 16 },
  title: {
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
    fontSize: 38, fontWeight: '900', color: '#141414', letterSpacing: -0.5, lineHeight: 42,
  },
  subtitle: { fontSize: 15, color: '#6F6F73', marginTop: 2, fontWeight: '500' },
  periodSwitch: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, padding: 4, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 3,
  },
  periodBtn: { flex: 1, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  periodBtnActive: { backgroundColor: '#1F7A52' },
  periodText: { fontSize: 13, fontWeight: '600', color: '#6F6F73' },
  periodTextActive: { color: '#fff' },
  sectionTitle: { fontSize: 19, fontWeight: '700', color: '#141414', marginBottom: 10, marginTop: 4 },
  card: {
    backgroundColor: '#fff', borderRadius: 20, padding: 18, marginBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  cardIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: '#141414' },
  cardSubtitle: { fontSize: 12, color: '#6F6F73', fontWeight: '500', marginTop: 2 },
  percentBadge: {
    fontSize: 13, fontWeight: '800', color: '#1F7A52', backgroundColor: '#D1FAE5',
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, overflow: 'hidden',
  },
  progressBarBg: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  progressBarFill: { height: '100%', backgroundColor: '#1F7A52', borderRadius: 4 },
  progressText: { fontSize: 12, color: '#6F6F73', fontWeight: '600', marginTop: 8, textAlign: 'right' },
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1, backgroundColor: '#fff', borderRadius: 20, padding: 14, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 3,
  },
  statIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  statValue: { fontSize: 18, fontWeight: '700', color: '#141414', marginBottom: 2 },
  statLabel: { fontSize: 11, color: '#6F6F73', fontWeight: '600' },
  tasksRow: { flexDirection: 'row', marginTop: 12 },
  taskCell: { flex: 1, alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 14, paddingVertical: 12 },
  taskValue: { fontSize: 20, fontWeight: '800', color: '#141414', marginTop: 6 },
  taskLabel: { fontSize: 11, color: '#6F6F73', fontWeight: '600', marginTop: 2 },
  txRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 12 },
  txRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  txIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#D1FAE5', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  txProduct: { fontSize: 14, fontWeight: '700', color: '#141414', marginBottom: 2 },
  txMeta: { fontSize: 11, color: '#6F6F73', fontWeight: '500' },
  txAmount: { fontSize: 14, fontWeight: '700', color: '#1F7A52' },
  txQty: { fontSize: 10, color: '#6F6F73', fontWeight: '500', marginTop: 2 },
  subRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  subAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#1F7A52', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  subAvatarText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  subName: { fontSize: 14, fontWeight: '600', color: '#141414', marginBottom: 2 },
  subRole: { fontSize: 11, color: '#6F6F73', fontWeight: '500' },
  subKpi: { fontSize: 13, fontWeight: '700', color: '#1F7A52', backgroundColor: '#D1FAE5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, overflow: 'hidden' },
});
