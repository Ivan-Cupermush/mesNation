import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, StatusBar, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { api, SalesSummary } from '../../services/api';
import FloatingActionMenu from '../../components/FloatingActionMenu';
import { AreaChart, ChartPoint } from '../../components/statistics/AreaChart';

type Period = 'week' | 'month' | 'quarter';
const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'Нед' },
  { id: 'month', label: 'Мес' },
  { id: 'quarter', label: 'Кв' },
];

const fmt = (v: number | string): string => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '0 ₽';
  return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
};
const progressColor = (p: number, c: any) => (p >= 80 ? c.success : p >= 50 ? c.warning : c.danger);

const FadeIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(o, { toValue: 1, duration: 380, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={{ opacity: o }}>{children}</Animated.View>;
};

export default function KpiScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
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
    { label: 'Выручка', value: fmt(fact.total_amount) },
    { label: 'Сделки', value: String(fact.total_transactions) },
    { label: 'Ср. чек', value: avgCheck ? fmt(avgCheck) : '—' },
  ] : [];

  const group = { backgroundColor: colors.elevated, borderColor: colors.border };

  return (
    <View style={[styles.root, { backgroundColor: colors.surface }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} backgroundColor={colors.surface} />
        )}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: (StatusBar.currentHeight || 24) + 12 }]}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Статистика</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>Продажи и динамика</Text>
        </View>

        {/* Мой KPI */}
        {myKpi && (
          <View style={[styles.group, group, { marginBottom: 16 }]}>
            <View style={[styles.kpiHeader]}>
              <Text style={[styles.kpiTitle, { color: colors.textPrimary }]}>🎯 {myKpi.product_name}</Text>
              <Text style={[styles.kpiSubtitle, { color: colors.textSecondary }]}>
                {myKpi.current_value} / {myKpi.target_value} {myKpi.metric_type === 'quantity' ? 'шт' : '₽'}
              </Text>
            </View>
            
            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View style={[
                styles.progressFill,
                { 
                  width: `${Math.min(100, parseFloat(myKpi.progress_percent || 0))}%`,
                  backgroundColor: progressColor(parseFloat(myKpi.progress_percent || 0), colors)
                }
              ]} />
            </View>
            
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>
              {parseFloat(myKpi.progress_percent || 0) >= 100 
                ? '✅ Цель достигнута!'
                : `Осталось ${(myKpi.target_value - myKpi.current_value).toFixed(0)} ${myKpi.metric_type === 'quantity' ? 'шт' : '₽'}`
              }
            </Text>
          </View>
        )}

        {/* Period */}
        <View style={[styles.segment, { backgroundColor: colors.surfaceActive }]}>
          {PERIODS.map(p => {
            const active = period === p.id;
            return (
              <TouchableOpacity key={p.id} activeOpacity={0.7} onPress={() => setPeriod(p.id)} style={styles.segItem}>
                {active && <View style={[styles.segActive, { backgroundColor: colors.elevated, shadowColor: colors.shadow }]} />}
                <Text style={[styles.segText, { color: active ? colors.textPrimary : colors.textSecondary }]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {loading ? (
          <Text style={[styles.loading, { color: colors.textMuted }]}>Загрузка…</Text>
        ) : (
          <FadeIn>
            {/* График */}
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ДИНАМИКА</Text>
            <View style={[styles.group, group]}>
              <View style={styles.chartHead}>
                <Text style={[styles.groupTitle, { color: colors.textPrimary }]}>Выручка по товарам</Text>
              </View>
              {chartData.length >= 2 ? (
                <AreaChart data={chartData} />
              ) : (
                <Text style={[styles.empty, { color: colors.textMuted }]}>
                  Нет данных — импортируйте продажи из Excel
                </Text>
              )}
            </View>

            {/* KPI */}
            {kpis.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>ОБЗОР</Text>
                <View style={[styles.group, styles.kpiRow, group]}>
                  {kpis.map((k, i) => (
                    <View key={i} style={[
                      styles.kpiCell,
                      i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border },
                    ]}>
                      <Text style={[styles.kpiValue, { color: colors.textPrimary }]} numberOfLines={1} adjustsFontSizeToFit>
                        {k.value}
                      </Text>
                      <Text style={[styles.kpiLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                        {k.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* Мои цели */}
            <View style={styles.secHeadRow}>
              <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>МОИ ЦЕЛИ</Text>
              <TouchableOpacity onPress={() => navigation.navigate('AddProductKpi')}
                style={[styles.plus, { backgroundColor: colors.accent }]}>
                <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '500' }}>+</Text>
              </TouchableOpacity>
            </View>

            {targets.length === 0 ? (
              <View style={[styles.group, group]}>
                <Text style={[styles.empty, { color: colors.textMuted }]}>Нет целей — нажмите «+»</Text>
              </View>
            ) : (
              <View style={[styles.group, group]}>
                {targets.map((t, idx) => {
                  const p = Number(t.progress_percent || 0);
                  const col = progressColor(p, colors);
                  return (
                    <TouchableOpacity key={t.id} activeOpacity={0.6}
                      onPress={() => navigation.navigate('ProductKpiDetail', { targetId: t.id })}
                      style={[
                        styles.targetRow,
                        idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                      ]}>
                      <View style={styles.targetHead}>
                        <Text style={[styles.targetName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {t.product_name}
                        </Text>
                        <Text style={[styles.targetPct, { color: col }]}>{p}%</Text>
                      </View>
                      <View style={[styles.bar, { backgroundColor: colors.divider }]}>
                        <View style={[styles.barFill, { width: `${Math.min(100, p)}%`, backgroundColor: col }]} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Моя команда (для руководителей) */}
            {subordinates.length > 0 && (
              <>
                <View style={styles.secHeadRow}>
                  <Text style={[styles.sectionLabel, { color: colors.textSecondary, marginBottom: 0 }]}>МОЯ КОМАНДА</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('AssignKpi')}
                    style={[styles.plus, { backgroundColor: colors.accent }]}>
                    <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '500' }}>+</Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.group, group]}>
                  {subordinates.map((user, idx) => (
                    <TouchableOpacity
                      key={user.user_id}
                      onPress={() => navigation.navigate('SubordinateDetail', { userId: user.user_id })}
                      style={[
                        styles.targetRow,
                        idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
                      ]}>
                      <View style={styles.targetHead}>
                        <Text style={[styles.targetName, { color: colors.textPrimary }]} numberOfLines={1}>
                          {user.display_name}
                        </Text>
                        <Text style={[styles.targetPct, { color: colors.accent }]}>
                          {user.kpis?.length || 0} KPI
                        </Text>
                      </View>
                      {user.kpis?.length > 0 && (
                        <View style={{ marginTop: 6 }}>
                          {user.kpis.slice(0, 2).map((kpi: any, kpiIdx: number) => {
                            const p = Number(kpi.progress_percent || 0);
                            const col = progressColor(p, colors);
                            return (
                              <View key={kpiIdx} style={{ marginBottom: kpiIdx < user.kpis.length - 1 ? 6 : 0 }}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 3 }}>
                                  <Text style={[{ fontSize: 12, color: colors.textSecondary }]} numberOfLines={1}>
                                    {kpi.product_name}
                                  </Text>
                                  <Text style={[{ fontSize: 12, fontWeight: '600', color: col }]}>
                                    {p}%
                                  </Text>
                                </View>
                                <View style={[styles.bar, { backgroundColor: colors.divider }]}>
                                  <View style={[styles.barFill, { width: `${Math.min(100, p)}%`, backgroundColor: col }]} />
                                </View>
                              </View>
                            );
                          })}
                        </View>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            )}
          </FadeIn>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {currentUser?.role_name === 'director' && (
          <FloatingActionMenu
        actions={[
          { label: 'Назначить KPI', icon: '🎯', onPress: () => navigation.navigate('AssignKpi') },
          { label: 'Импорт из Excel', icon: '📁', onPress: () => navigation.navigate('ImportExcel') },
          { label: 'Редактор дерева прав', icon: '🌳', onPress: () => navigation.navigate('RoleTreeEditor') },
          { label: 'Создать пользователя', icon: '👤', onPress: () => navigation.navigate('CreateUserRole') },
        ]}
      />
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  header: { paddingBottom: 16 },
  title: { fontSize: 34, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 15, marginTop: 3 },
  loading: { marginTop: 40, textAlign: 'center', fontSize: 14 },

  segment: { flexDirection: 'row', borderRadius: 9, padding: 2, marginBottom: 22 },
  segItem: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center' },
  segActive: {
    ...StyleSheet.absoluteFillObject, borderRadius: 8,
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 2,
  },
  segText: { fontSize: 13, fontWeight: '500' },

  sectionLabel: { fontSize: 12.5, fontWeight: '600', letterSpacing: 0.4, marginBottom: 8, marginLeft: 4 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginBottom: 22 },

  chartHead: { paddingHorizontal: 16, paddingTop: 14 },
  groupTitle: { fontSize: 15, fontWeight: '600' },
  empty: { paddingVertical: 28, paddingHorizontal: 16, textAlign: 'center', fontSize: 13.5, lineHeight: 19 },

  kpiRow: { flexDirection: 'row' },
  kpiCell: { flex: 1, paddingVertical: 16, paddingHorizontal: 8, alignItems: 'center' },
  kpiValue: { fontSize: 22, fontWeight: '600', letterSpacing: -0.3, marginBottom: 3 },
  kpiLabel: { fontSize: 12 },

  secHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, paddingHorizontal: 4 },
  plus: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },

  targetRow: { paddingHorizontal: 16, paddingVertical: 13 },
  targetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  targetName: { fontSize: 15, fontWeight: '500', flex: 1, marginRight: 10 },
  targetPct: { fontSize: 14, fontWeight: '600' },
  bar: { height: 4, borderRadius: 2, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 2 },
});

// Дополнительные стили для блока KPI
const kpiStyles = StyleSheet.create({
  kpiHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  kpiTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  kpiSubtitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
