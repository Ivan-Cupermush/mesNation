import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  RefreshControl, ActivityIndicator, StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeContext';
import { Card } from '../../components/ui/Card';
import { api, SalesSummary, SalesTarget } from '../../services/api';

type Period = 'week' | 'month' | 'quarter';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'quarter', label: 'Квартал' },
];

const formatMoney = (value: number | string): string => {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0 ₽';
  return new Intl.NumberFormat('ru-RU').format(Math.round(num)) + ' ₽';
};

const getProgressColor = (percent: number, colors: any): string => {
  if (percent >= 80) return '#10B981'; // зелёный
  if (percent >= 50) return '#F59E0B'; // жёлтый
  return '#EF4444'; // красный
};

export default function KpiScreen({ navigation }: any) {
  const { colors } = useTheme();
  const [period, setPeriod] = useState<Period>('month');
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const data = await api.getSalesSummary(period);
      setSummary(data);
    } catch (e) {
      console.error('Ошибка загрузки KPI:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [period]);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [loadData]));

  const onRefresh = () => {
    setRefreshing(true);
    loadData();
  };

  const calculateForecast = (target: SalesTarget): number => {
    const start = new Date(target.period_start).getTime();
    const end = new Date(target.period_end).getTime();
    const now = Date.now();
    const totalDays = (end - start) / (1000 * 60 * 60 * 24);
    const passedDays = (now - start) / (1000 * 60 * 60 * 24);
    
    if (passedDays <= 0 || totalDays <= 0) return 0;
    const dailyRate = Number(target.current_value) / passedDays;
    return Math.round(dailyRate * totalDays);
  };

  const daysRemaining = (target: SalesTarget): number => {
    const end = new Date(target.period_end).getTime();
    const now = Date.now();
    return Math.max(0, Math.ceil((end - now) / (1000 * 60 * 60 * 24)));
  };

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  const personalTarget = summary?.personalTarget;
  const myTargets = summary?.targets || [];
  const fact = summary?.fact;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar 
        barStyle={colors.background === '#fff' ? 'dark-content' : 'light-content'} 
        backgroundColor={colors.background}
      />
      
      {/* Header с отступом под статус-бар */}
      <View style={[styles.header, { paddingTop: (StatusBar.currentHeight || 24) + 8 }]}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Статистика</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Переключатель периода */}
        <View style={styles.periodRow}>
          {PERIODS.map(p => {
            const active = period === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                onPress={() => setPeriod(p.id)}
                style={[
                  styles.periodChip,
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
                  {p.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* План отдела (если есть) */}
        {personalTarget && (
          <Card padding="lg" style={{ marginBottom: 16 }}>
            <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
              💰 МОЙ ПЛАН НА МЕСЯЦ
            </Text>
            <Text style={[styles.bigNumber, { color: colors.textPrimary }]}>
              {formatMoney(personalTarget.current_value)}
            </Text>
            <Text style={[styles.subNumber, { color: colors.textSecondary }]}>
              из {formatMoney(personalTarget.target_value)}
            </Text>

            <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, Number(personalTarget.progress_percent || 0))}%`,
                    backgroundColor: getProgressColor(Number(personalTarget.progress_percent || 0), colors),
                  },
                ]}
              />
            </View>

            <View style={styles.progressMeta}>
              <Text style={[styles.progressPercent, { color: colors.textPrimary }]}>
                {personalTarget.progress_percent}% выполнено
              </Text>
              <Text style={[styles.daysLeft, { color: colors.textSecondary }]}>
                Осталось {daysRemaining(personalTarget)} дн.
              </Text>
            </View>

            <View style={[styles.forecastBlock, { backgroundColor: colors.background }]}>
              <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                📈 Прогноз к концу месяца:{' '}
                <Text style={{ color: colors.textPrimary, fontWeight: '600' }}>
                  {formatMoney(calculateForecast(personalTarget))}
                </Text>
              </Text>
            </View>
          </Card>
        )}

        {/* Сводка (3 карточки) */}
        {fact && (
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={styles.statEmoji}>💰</Text>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {formatMoney(fact.total_amount)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Сумма</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={styles.statEmoji}>📦</Text>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {Number(fact.total_quantity).toFixed(0)}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Единиц</Text>
            </View>
            <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
              <Text style={styles.statEmoji}>📋</Text>
              <Text style={[styles.statValue, { color: colors.textPrimary }]}>
                {fact.total_transactions}
              </Text>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Сделок</Text>
            </View>
          </View>
        )}

        {/* Действия: импорт Excel */}
        <TouchableOpacity
          onPress={() => navigation.navigate('ImportExcel')}
          style={[styles.actionButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <Text style={{ fontSize: 20, marginRight: 12 }}>📁</Text>
          <Text style={[styles.actionText, { color: colors.textPrimary }]}>
            Импорт продаж из Excel
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: 20 }}>›</Text>
        </TouchableOpacity>

        {/* Мои KPI по товарам */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            🎯 Мои KPI по товарам
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('AddProductKpi')}
            style={[styles.addBtn, { backgroundColor: colors.accent }]}
          >
            <Text style={{ color: colors.onAccent, fontSize: 20, fontWeight: '300' }}>+</Text>
          </TouchableOpacity>
        </View>

        {myTargets.length === 0 ? (
          <View style={styles.emptyBlock}>
            <Text style={{ fontSize: 48, marginBottom: 8 }}>🎯</Text>
            <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
              Пока нет KPI по товарам
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Нажмите + чтобы добавить цель продаж
            </Text>
          </View>
        ) : (
          myTargets.map(target => {
            const percent = Number(target.progress_percent || 0);
            const current = Number(target.current_value);
            const total = Number(target.target_value);
            const unit = target.metric_type === 'amount' ? '₽' 
                       : target.metric_type === 'contracts' ? 'контр.' : 'шт';

            return (
              <TouchableOpacity
                key={target.id}
                onPress={() => navigation.navigate('ProductKpiDetail', { targetId: target.id })}
                activeOpacity={0.7}
              >
                <Card padding="md" style={{ marginBottom: 10 }}>
                  <View style={styles.targetHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.targetName, { color: colors.textPrimary }]} numberOfLines={1}>
                        📦 {target.product_name}
                      </Text>
                      <Text style={[styles.targetDesc, { color: colors.textSecondary }]}>
                        {current} / {total} {unit}
                      </Text>
                    </View>
                    <Text style={[styles.targetPercent, { 
                      color: getProgressColor(percent, colors),
                    }]}>
                      {percent}%
                    </Text>
                  </View>
                  <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${Math.min(100, percent)}%`,
                          backgroundColor: getProgressColor(percent, colors),
                        },
                      ]}
                    />
                  </View>
                  <Text style={[styles.remaining, { color: colors.textSecondary }]}>
                    {percent >= 100 
                      ? '🔥 Перевыполнение!' 
                      : `Осталось: ${(total - current).toFixed(target.metric_type === 'amount' ? 0 : 0)} ${unit}`}
                  </Text>
                </Card>
              </TouchableOpacity>
            );
          })
        )}

        {/* Топ товаров */}
        {summary?.topProducts && summary.topProducts.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, marginTop: 20 }]}>
              🏆 Топ товаров
            </Text>
            <Card padding="md" style={{ marginTop: 8 }}>
              {summary.topProducts.slice(0, 5).map((p, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.topRow,
                    idx < summary.topProducts.length - 1 && { 
                      borderBottomWidth: StyleSheet.hairlineWidth, 
                      borderBottomColor: colors.border,
                      paddingBottom: 10,
                      marginBottom: 10,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.topName, { color: colors.textPrimary }]} numberOfLines={1}>
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`} {p.product_name}
                    </Text>
                    <Text style={[styles.topMeta, { color: colors.textSecondary }]}>
                      {Number(p.total_quantity).toFixed(0)} шт · {p.transactions_count} сделок
                    </Text>
                  </View>
                  <Text style={[styles.topAmount, { color: colors.accent }]}>
                    {formatMoney(p.total_amount)}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </View>
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
    paddingBottom: 8,
  },
  title: { fontSize: 32, fontWeight: '700' },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  periodChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  bigNumber: {
    fontSize: 28,
    fontWeight: '700',
  },
  subNumber: {
    fontSize: 14,
    marginTop: 2,
    marginBottom: 12,
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
  progressMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressPercent: { fontSize: 13, fontWeight: '600' },
  daysLeft: { fontSize: 13 },
  forecastBlock: {
    padding: 10,
    borderRadius: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  statEmoji: { fontSize: 22, marginBottom: 4 },
  statValue: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  statLabel: { fontSize: 11 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 20,
  },
  actionText: { flex: 1, fontSize: 15, fontWeight: '500' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBlock: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptySubtitle: { fontSize: 13, marginTop: 4 },
  targetHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  targetName: { fontSize: 15, fontWeight: '600', marginBottom: 2 },
  targetDesc: { fontSize: 13 },
  targetPercent: { fontSize: 20, fontWeight: '700', marginLeft: 8 },
  remaining: { fontSize: 12, marginTop: 4 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topName: { fontSize: 14, fontWeight: '500', marginBottom: 2 },
  topMeta: { fontSize: 12 },
  topAmount: { fontSize: 14, fontWeight: '700', marginLeft: 8 },
});
