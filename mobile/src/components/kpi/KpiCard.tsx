import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import {
  Wallet, Sparkles, Beer, Package, Store, ListChecks, Banknote, Fuel, Target,
  CheckCircle2, Circle, MoreHorizontal, TrendingUp,
} from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import { dayMonth, KpiKind, KpiTarget, kpiTitle, kpiValue, money, numberText } from '../../services/kpi';

type Tone = 'accent' | 'violet' | 'warning' | 'info';

const KIND: Record<KpiKind, { icon: any; tone: Tone; label: string }> = {
  no_ep: { icon: Wallet, tone: 'accent', label: 'сумма продаж, ₽' },
  ep: { icon: Sparkles, tone: 'violet', label: 'продажи сети «Есть повод», ₽' },
  baltika: { icon: Beer, tone: 'warning', label: 'сумма продаж, ₽' },
  oph: { icon: Package, tone: 'info', label: 'сумма продаж, ₽' },
  akb: { icon: Store, tone: 'accent', label: 'торговые точки с продажами' },
  distra: { icon: ListChecks, tone: 'warning', label: 'выполнено позиций' },
  salary: { icon: Banknote, tone: 'accent', label: 'фиксированная выплата' },
  fuel: { icon: Fuel, tone: 'info', label: 'фиксированная выплата' },
  fixed: { icon: Banknote, tone: 'accent', label: 'фиксированная выплата' },
  other: { icon: Target, tone: 'info', label: '' },
};

const toneColor = (t: Tone) => (t === 'accent' ? T.accent : t === 'violet' ? T.violet : t === 'warning' ? T.warning : T.info);
const toneSoft = (t: Tone) => (t === 'accent' ? T.successSoft : t === 'violet' ? T.violetSoft : t === 'warning' ? T.warningSoft : T.infoSoft);
const pct = (p: number) => `${Math.round(p)}%`;

/**
 * Показатель KPI (вариант 2, как на сайте): факт и план, полоса с порогами
 * и прогнозом, «заработано сейчас», прогноз на конец месяца, подсказка и правило.
 */
export default function KpiCard({ target: t, monthEnd, onMenu }: { target: KpiTarget; monthEnd: string | null; onMenu?: () => void }) {
  const kind = KIND[t.kpi_kind ?? 'other'] ?? KIND.other;
  const Icon = kind.icon;
  const c = t.calc;
  const color = toneColor(kind.tone);
  const width = Math.max(0, Math.min(100, c.percent));
  const projected = c.forecastPercent != null && c.forecastPercent > c.percent ? Math.min(100, c.forecastPercent) : 0;
  const reached = (c.now ?? 0) > 0;
  const source = c.tracked ? 'по отчётам' : t.source === 'kpi_file' ? 'по файлу KPI' : 'вручную';
  const subtitle = [kind.label || (t.metric_type === 'amount' ? 'сумма, ₽' : 'количество'), source].filter(Boolean).join(' · ');
  const filePay = t.source === 'kpi_file' && t.payment_amount != null ? Number(t.payment_amount) : null;
  const showForecast = c.forecast != null && c.forecastValue != null && monthEnd;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={[styles.icon, { backgroundColor: toneSoft(kind.tone) }]}>
          <Icon size={21} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={2}>{kpiTitle(t)}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>
        <Text style={[styles.badge, reached && styles.badgeOn]}>
          {c.items ? `${numberText(t.current_value)} из ${c.items.length}` : pct(c.percent)}
        </Text>
        {onMenu && (
          <TouchableOpacity onPress={onMenu} style={styles.menuBtn} accessibilityLabel="Действия с показателем" hitSlop={8}>
            <MoreHorizontal size={20} color={T.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.barWrap, c.marks.length > 0 && { paddingBottom: 15 }]}>
        <View style={styles.bar}>
          {projected > 0 && <View style={[styles.fill, { width: `${projected}%`, backgroundColor: color, opacity: 0.28 }]} />}
          <View style={[styles.fill, { width: `${width}%`, backgroundColor: color }]} />
        </View>
        {c.marks.map((m) => (
          <View key={m} style={[styles.mark, { left: `${m}%` }]}>
            <View style={styles.markLine} />
            <Text style={[styles.markText, m >= 95 ? { right: 0 } : { left: -14 }]}>
              {t.kpi_kind === 'ep' && c.marks.length === 1 ? 'порог' : `${m}%`}
            </Text>
          </View>
        ))}
      </View>

      <Text style={styles.value}>
        <Text style={styles.valueStrong}>{kpiValue(t, t.current_value)}</Text> из {kpiValue(t, t.target_value)}
      </Text>

      {c.items && (
        <View style={{ gap: 7 }}>
          {c.items.map((it) => (
            <View key={it.name} style={styles.item}>
              {it.done ? <CheckCircle2 size={17} color={T.accent} /> : <Circle size={17} color={T.textMuted} />}
              <Text style={styles.itemName}>{it.name}</Text>
              <Text style={styles.itemCount}>{it.count} из {it.need} ТТ</Text>
            </View>
          ))}
        </View>
      )}

      {c.now != null && (
        <View style={styles.cells}>
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>Заработано сейчас</Text>
            <Text style={styles.cellValue}>{money(c.now)}</Text>
          </View>
          {showForecast ? (
            <View style={styles.cell}>
              <Text style={styles.cellLabel}>Прогноз на {dayMonth(monthEnd!)}</Text>
              <Text style={[styles.cellValue, { color: T.accent }]}>{money(c.forecast)}</Text>
              <Text style={styles.cellNote}>при текущем темпе: {pct(c.forecastPercent ?? 0)}</Text>
            </View>
          ) : (
            <View style={styles.cell}>
              <Text style={styles.cellLabel}>При выполнении плана</Text>
              <Text style={[styles.cellValue, { color: T.accent }]}>{money(c.max)}</Text>
            </View>
          )}
        </View>
      )}

      {c.hint ? (
        <View style={styles.hint}>
          <TrendingUp size={15} color={T.textSecondary} />
          <Text style={styles.hintText}>{c.hint}</Text>
        </View>
      ) : null}
      {(c.rule || filePay != null) ? (
        <Text style={styles.rule}>
          {c.rule ? `Правило: ${c.rule}` : ''}
          {filePay != null ? `${c.rule ? ' · ' : ''}по итоговому файлу: ${money(filePay)}` : ''}
        </Text>
      ) : null}
    </View>
  );
}

const font = Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium';

const styles = themed(() => ({
  card: {
    backgroundColor: T.card, borderRadius: 22, padding: 18, marginBottom: 12, gap: 12,
    shadowColor: T.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '700', color: T.textPrimary, fontFamily: font },
  subtitle: { fontSize: 12, color: T.textSecondary, fontWeight: '500', marginTop: 2 },
  badge: {
    fontSize: 13, fontWeight: '800', color: T.textSecondary, backgroundColor: T.inputBg,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, overflow: 'hidden',
  },
  badgeOn: { color: T.accent, backgroundColor: T.successSoft },
  menuBtn: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  barWrap: { position: 'relative' },
  bar: { height: 8, backgroundColor: T.inputBg, borderRadius: 4, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  mark: { position: 'absolute', top: -3, width: 0 },
  markLine: { position: 'absolute', left: -1, width: 2, height: 14, borderRadius: 1, backgroundColor: T.textPrimary, opacity: 0.3 },
  markText: { position: 'absolute', top: 14, width: 34, textAlign: 'center', fontSize: 10, fontWeight: '700', color: T.textMuted },
  value: { fontSize: 13, color: T.textSecondary, textAlign: 'right' },
  valueStrong: { color: T.textPrimary, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { flex: 1, fontSize: 13.5, color: T.textPrimary },
  itemCount: { fontSize: 12, color: T.textSecondary },
  cells: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1, backgroundColor: T.inputBg, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  cellLabel: { fontSize: 11, color: T.textSecondary, fontWeight: '600' },
  cellValue: { fontSize: 17, fontWeight: '800', color: T.textPrimary, marginTop: 3, fontFamily: font },
  cellNote: { fontSize: 10.5, color: T.textMuted, marginTop: 2 },
  hint: { flexDirection: 'row', gap: 7, alignItems: 'flex-start' },
  hintText: { flex: 1, fontSize: 12.5, color: T.textSecondary, lineHeight: 17 },
  rule: { fontSize: 11, color: T.textMuted, lineHeight: 15 },
}));
