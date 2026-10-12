import React from 'react';
import { View, Text, Platform } from 'react-native';
import { CalendarDays, Package, Store, Wallet } from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import { dayMonth, money, monthName, numberText, SalesStats } from '../../services/kpi';

/** Подпись под квадратиками: по какое число учтены продажи. */
export function statsCaption(stats: SalesStats | null | undefined, month: string): string {
  if (!stats) return `Отчётов о продажах за ${monthName(month)} пока нет — квадратики заполнятся после загрузки отчёта.`;
  const work = stats.workElapsed != null ? `рабочих дней: ${stats.workElapsed} из ${stats.workDays}` : `${stats.elapsed} из ${stats.days} дн.`;
  return `По отчёту о продажах на ${dayMonth(stats.asOf)} · ${work} (вс — выходной) · АКБ без «Есть повод»`;
}

/** Четыре квадратика продаж по отчётам о продажах: выручка, АКБ, средняя продажа в день, проданные штуки. */
export default function SalesTiles({ stats }: { stats: SalesStats | null | undefined }) {
  const tiles = [
    { key: 'sum', label: 'Выручка', value: stats ? money(stats.revenue) : '—', Icon: Wallet, color: T.accent, bg: T.successSoft },
    { key: 'akb', label: 'АКБ, точек', value: stats ? numberText(stats.akb) : '—', Icon: Store, color: T.info, bg: T.infoSoft },
    { key: 'day', label: 'В среднем за рабочий день', value: stats ? money(stats.perDay) : '—', Icon: CalendarDays, color: T.warning, bg: T.warningSoft },
    { key: 'qty', label: 'Продано, шт', value: stats ? numberText(stats.quantity) : '—', Icon: Package, color: T.violet, bg: T.violetSoft },
  ];
  return (
    <View style={styles.grid}>
      {tiles.map(({ key, label, value, Icon, color, bg }) => (
        <View key={key} style={styles.tile}>
          <View style={[styles.icon, { backgroundColor: bg }]}>
            <Icon size={20} color={color} strokeWidth={2.2} />
          </View>
          <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
            {value}
          </Text>
          <Text style={styles.label} numberOfLines={2}>
            {label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = themed(() => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  tile: {
    flexBasis: '46%', flexGrow: 1, backgroundColor: T.card, borderRadius: 22, padding: 16,
    shadowColor: T.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  icon: { width: 42, height: 42, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  value: {
    fontSize: 18, fontWeight: '800', color: T.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium',
  },
  label: { fontSize: 12, color: T.textSecondary, fontWeight: '600', marginTop: 2 },
}));
