import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  StatusBar,
  Animated,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { TrendingUp, Target, Users, DollarSign, ShoppingCart, Receipt } from 'lucide-react-native';
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
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [userData, myKpiData, summaryData, subordinatesData] = await Promise.all([
        api.getCurrentUser().catch(() => null),
        api.getMyKpi().catch(() => null),
        api.getSalesSummary(period),
        api.getSubordinates().catch(() => []),
      ]);
      setSummary(summaryData);
      setMyKpi(myKpiData);
      setCurrentUser(userData);
      setSubordinates(subordinatesData);
    } catch (e) {
      console.error('KPI load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useFocusEffect(useCallback(() => { loadData(); }, [loadData]));
  const onRefresh = () => { setRefreshing(true); loadData(); };

  const fact = summary?.fact;
  const targets = summary?.targets || [];
  const avgCheck = fact && Number(fact.total_transactions) > 0
    ? Number(fact.total_amount) / Number(fact.total_transactions) : 0;

  const chartData: ChartPoint[] = (summary?.topProducts || []).slice(0, 5).map(p => ({
    label: (p.product_name || '').length > 9 ? (p.product_name as string).slice(0, 9) + '…' : p.product_name,
    value: Number(p.total_amount) || 0,
  }));

  const kpis = fact ? [
    { label: 'Выручка', value: fmt(fact.total_amount), icon: DollarSign, color: '#1F7A52' },
    { label: 'Сделки', value: String(fact.total_transactions), icon: ShoppingCart, color: '#3B82F6' },
    { label: 'Ср. чек', value: avgCheck ? fmt(avgCheck) : '—', icon: Receipt, color: '#F59E0B' },
  ] : [];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#FAFAF8" />
      
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1F7A52" />}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Статистика</Text>
          <Text style={styles.subtitle}>Продажи и динамика</Text>
        </View>

        {/* Period Selector */}
        <View style={styles.periodContainer}>
          <View style={styles.periodSwitch}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.id}
                style={[
                  styles.periodBtn,
                  period === p.id && styles.periodBtnActive,
                ]}
                onPress={() => setPeriod(p.id)}
              >
                <Text style={[
                  styles.periodText,
                  period === p.id && styles.periodTextActive,
                ]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* My KPI */}
        {myKpi && (
          <FadeIn>
            <View style={styles.myKpiCard}>
              <View style={styles.myKpiHeader}>
                <View style={styles.myKpiIcon}>
                  <Target size={24} color="#1F7A52" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.myKpiTitle}>Мой KPI</Text>
                  <Text style={styles.myKpiSubtitle}>
                    {myKpi.product_name || 'Цель месяца'}
                  </Text>
                </View>
              </View>
              <View style={styles.progressBarContainer}>
                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      { width: `${Math.min(100, myKpi.progress || 0)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.progressText}>
                  {myKpi.current_value || 0} / {myKpi.target_value || 0}
                </Text>
              </View>
            </View>
          </FadeIn>
        )}

        {/* KPI Stats */}
        {kpis.length > 0 && (
          <FadeIn>
            <View style={styles.statsGrid}>
              {kpis.map((kpi, idx) => {
                const Icon = kpi.icon;
                return (
                  <View key={idx} style={styles.statCard}>
                    <View style={[styles.statIcon, { backgroundColor: kpi.color }]}>
                      <Icon size={24} color="#FFFFFF" />
                    </View>
                    <Text style={styles.statValue}>{kpi.value}</Text>
                    <Text style={styles.statLabel}>{kpi.label}</Text>
                  </View>
                );
              })}
            </View>
          </FadeIn>
        )}

        {/* Top Products Chart */}
        {chartData.length > 0 && (
          <FadeIn>
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>Топ товаров</Text>
              <AreaChart data={chartData} />
            </View>
          </FadeIn>
        )}

        {/* Subordinates */}
        {subordinates.length > 0 && (
          <FadeIn>
            <View style={styles.subordinatesCard}>
              <View style={styles.subordinatesHeader}>
                <Users size={20} color="#1F7A52" />
                <Text style={styles.subordinatesTitle}>Команда</Text>
              </View>
              {subordinates.map((sub, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.subordinateRow}
                  onPress={() => navigation.navigate('EmployeeStats', { userId: parseInt(String(sub.user_id)) || 0, userName: sub.display_name || sub.username })}
                  activeOpacity={0.7}
                >
                  <View style={styles.subordinateAvatar}>
                    <Text style={styles.subordinateAvatarText}>
                      {(sub.display_name || sub.username || '?').charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subordinateName}>
                      {sub.display_name || sub.username}
                    </Text>
                    <Text style={styles.subordinateRole}>
                      {sub.role_name || 'Сотрудник'}
                    </Text>
                  </View>
                  <View style={styles.subordinateKpi}>
                    <Text style={styles.subordinateKpiValue}>
                      {fmt(sub.total_amount || 0)}
                    </Text>
                  </View>
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
  container: {
    flex: 1,
    backgroundColor: '#FAFAF8',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  header: {
    marginBottom: 24,
  },
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
  periodContainer: {
    marginBottom: 24,
  },
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
  periodBtnActive: {
    backgroundColor: '#1F7A52',
  },
  periodText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6F6F73',
  },
  periodTextActive: {
    color: '#FFFFFF',
  },
  myKpiCard: {
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
  myKpiHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  myKpiIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D1FAE5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  myKpiTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 2,
  },
  myKpiSubtitle: {
    fontSize: 13,
    color: '#6F6F73',
    fontWeight: '500',
  },
  progressBarContainer: {
    marginTop: 8,
  },
  progressBarBg: {
    height: 8,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#1F7A52',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    color: '#6F6F73',
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'right',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
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
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6F6F73',
    fontWeight: '600',
  },
  chartCard: {
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
  chartTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#141414',
    marginBottom: 16,
  },
  subordinatesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 4,
  },
  subordinatesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECECE8',
  },
  subordinatesTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#141414',
    marginLeft: 12,
  },
  subordinateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  subordinateAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1F7A52',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  subordinateAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subordinateName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#141414',
    marginBottom: 2,
  },
  subordinateRole: {
    fontSize: 12,
    color: '#6F6F73',
    fontWeight: '500',
  },
  subordinateKpi: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#D1FAE5',
    borderRadius: 12,
  },
  subordinateKpiValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F7A52',
  },
});
