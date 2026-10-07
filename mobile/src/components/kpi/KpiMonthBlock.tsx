import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  AlertTriangle, ChevronLeft, ChevronRight, FileSpreadsheet, Settings2, Trophy, Upload, Users,
} from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import ActionSheet from '../chat/ActionSheet';
import KpiCard from './KpiCard';
import {
  dayMonth, isKpiTarget, kpiApi, KpiMonth, KpiTarget, kpiTitle, money, monthKey, monthName, monthTitle, reportPeriod, shiftMonth,
} from '../../services/kpi';

interface Props {
  userId: number;
  /** Свой KPI («Мой KPI за май») или сотрудника. */
  self: boolean;
  navigation: any;
}

/**
 * KPI за месяц (вариант 2, как на сайте): заработано по последнему отчёту
 * о продажах, прогноз на конец месяца и карточки показателей. Руководителю —
 * загрузка отчёта и файла KPI, списки клиентов и правила расчёта.
 */
export default function KpiMonthBlock({ userId, self, navigation }: Props) {
  const [month, setMonth] = useState(monthKey());
  const [data, setData] = useState<KpiMonth | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [menuFor, setMenuFor] = useState<KpiTarget | null>(null);

  const load = useCallback(async () => {
    try {
      setFailed(false);
      setData(await kpiApi.month(userId, month));
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [userId, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { setLoading(true); }, [month]);

  const kpis = (data?.targets ?? []).filter(isKpiTarget);
  const fixed = kpis.filter((t) => t.payout_rule.type === 'fixed');
  const cards = kpis.filter((t) => t.payout_rule.type !== 'fixed');
  const hasEp = kpis.some((t) => t.kpi_kind === 'ep' || t.kpi_kind === 'no_ep');
  const cov = data?.coverage ?? null;
  const [y, m] = month.split('-').map(Number);
  const lastDay = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  const open = cov ? cov.elapsed < cov.days : month >= monthKey();

  return (
    <View style={{ marginBottom: 8 }}>
      <View style={styles.head}>
        <Text style={styles.sectionTitle}>KPI</Text>
        <View style={styles.monthSwitch}>
          <TouchableOpacity onPress={() => setMonth(shiftMonth(month, -1))} style={styles.arrow} accessibilityLabel="Предыдущий месяц">
            <ChevronLeft size={18} color={T.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.monthText}>{monthTitle(month)}</Text>
          <TouchableOpacity
            onPress={() => setMonth(shiftMonth(month, 1))}
            disabled={month >= shiftMonth(monthKey(), 1)}
            style={[styles.arrow, month >= shiftMonth(monthKey(), 1) && { opacity: 0.3 }]}
            accessibilityLabel="Следующий месяц"
          >
            <ChevronRight size={18} color={T.textPrimary} />
          </TouchableOpacity>
        </View>
      </View>

      {data?.canUpload && (
        <View style={styles.tools}>
          <TouchableOpacity style={styles.tool} onPress={() => navigation.navigate('KpiImport', { mode: 'report' })}>
            <Upload size={15} color={T.accent} />
            <Text style={styles.toolText}>Отчёт о продажах</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tool} onPress={() => navigation.navigate('KpiImport', { mode: 'kpi', userId: self ? undefined : userId })}>
            <FileSpreadsheet size={15} color={T.accent} />
            <Text style={styles.toolText}>Файл KPI</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.tool} onPress={() => navigation.navigate('KpiClients')}>
            <Users size={15} color={T.accent} />
            <Text style={styles.toolText}>Клиенты ЕП</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading && !data ? (
        <View style={styles.empty}><ActivityIndicator color={T.accent} /></View>
      ) : failed || !data ? (
        <TouchableOpacity style={styles.empty} onPress={load}>
          <Text style={styles.emptyText}>Не удалось загрузить KPI. Нажмите, чтобы повторить.</Text>
        </TouchableOpacity>
      ) : (
        <>
          {cov ? (
            <View style={styles.banner}>
              <View style={styles.bannerIcon}><FileSpreadsheet size={20} color={T.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Отчёт о продажах за {reportPeriod(`${month}-01`, cov.asOf)}</Text>
                <Text style={styles.bannerText}>
                  загружен {new Date(cov.uploadedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
                  {cov.reports > 1 ? ` · отчётов за месяц: ${cov.reports}` : ''}
                </Text>
              </View>
            </View>
          ) : kpis.length > 0 ? (
            <View style={[styles.banner, { backgroundColor: T.inputBg }]}>
              <View style={styles.bannerIcon}><FileSpreadsheet size={20} color={T.accent} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.bannerTitle}>Отчётов о продажах за {monthName(month)} нет</Text>
                <Text style={styles.bannerText}>Факт — по файлу KPI. После загрузки отчёта показатели обновятся сами.</Text>
              </View>
            </View>
          ) : null}

          {hasEp && data.canUpload && data.lists.ep === 0 && (
            <TouchableOpacity style={styles.warn} onPress={() => navigation.navigate('KpiClients')}>
              <AlertTriangle size={18} color={T.warning} />
              <Text style={styles.warnText}>
                Список клиентов «Есть повод» пуст — вся выручка считается в «без ЕП». <Text style={styles.link}>Заполнить список</Text>
              </Text>
            </TouchableOpacity>
          )}

          {kpis.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {self ? 'KPI' : 'KPI сотрудника'} за {monthTitle(month)} не загружены.
                {data.canUpload ? ' Загрузите файл KPI — показатели будут обновляться по отчётам о продажах.' : ''}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.summary}>
                <View style={styles.summaryHead}>
                  <View style={styles.summaryIcon}><Trophy size={21} color={T.accent} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryTitle}>{self ? 'Мой KPI' : 'KPI'} за {monthName(month)}</Text>
                    <Text style={styles.summarySub}>
                      {fixed.length
                        ? `${fixed.map((t) => `${(t.product_name || '').trim()} ${money(t.calc.now)}`).join(' · ')} — включены`
                        : `показателей: ${cards.length}`}
                    </Text>
                  </View>
                </View>
                <View style={styles.cells}>
                  <View style={styles.cell}>
                    <Text style={styles.cellLabel}>{open ? 'Заработано на сегодня' : 'Заработано за месяц'}</Text>
                    <Text style={styles.big}>{money(data.totals.now)}</Text>
                  </View>
                  {cov && open ? (
                    <View style={styles.cell}>
                      <Text style={styles.cellLabel}>Прогноз на {dayMonth(lastDay)}</Text>
                      <Text style={[styles.big, { color: T.accent }]}>≈{money(Math.round(data.totals.forecast / 100) * 100)}</Text>
                    </View>
                  ) : (
                    <View style={styles.cell}>
                      <Text style={styles.cellLabel}>При выполнении плана</Text>
                      <Text style={[styles.big, { color: T.accent }]}>{money(data.totals.max)}</Text>
                    </View>
                  )}
                </View>
                {cov && (
                  <>
                    <Text style={styles.days}>
                      Продажи учтены по {dayMonth(cov.asOf)} — {cov.elapsed} из {cov.days} дн. · при выполнении плана {money(data.totals.max)}
                    </Text>
                    <View style={styles.bar}>
                      <View style={[styles.barFill, { width: `${(cov.elapsed / cov.days) * 100}%` }]} />
                    </View>
                  </>
                )}
                {data.totals.file != null && (
                  <Text style={styles.note}>К выплате по итоговому файлу KPI: {money(data.totals.file)}</Text>
                )}
              </View>
              {cards.map((t) => (
                <KpiCard key={t.id} target={t} monthEnd={open && cov ? lastDay : null} onMenu={data.canEdit ? () => setMenuFor(t) : undefined} />
              ))}
              <Text style={styles.note}>
                Факт обновляется после каждой загрузки отчёта о продажах. «Прогноз» — если продажи пойдут в том же темпе до конца месяца.
              </Text>
            </>
          )}
        </>
      )}

      <ActionSheet
        visible={!!menuFor}
        title={menuFor ? kpiTitle(menuFor) : ''}
        actions={[
          {
            key: 'rule',
            label: 'Правило расчёта',
            icon: <Settings2 size={20} color={T.accent} />,
            onPress: () => {
              const t = menuFor;
              setMenuFor(null);
              if (t) navigation.navigate('KpiRule', { target: t, month });
            },
          },
        ]}
        onClose={() => setMenuFor(null)}
      />
    </View>
  );
}

const font = Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium';

const styles = themed(() => ({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: T.textPrimary, fontFamily: font },
  monthSwitch: { flexDirection: 'row', alignItems: 'center', backgroundColor: T.card, borderRadius: 12, padding: 2 },
  arrow: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  monthText: { minWidth: 104, textAlign: 'center', fontSize: 14, fontWeight: '700', color: T.textPrimary },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tool: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, backgroundColor: T.accentMuted,
  },
  toolText: { fontSize: 13, fontWeight: '700', color: T.accent },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 18, backgroundColor: T.accentMuted, marginBottom: 12 },
  bannerIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: T.card, justifyContent: 'center', alignItems: 'center' },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: T.textPrimary },
  bannerText: { fontSize: 12, color: T.textSecondary, marginTop: 2 },
  warn: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 16, backgroundColor: T.warningSoft, marginBottom: 12 },
  warnText: { flex: 1, fontSize: 13, color: T.textPrimary, lineHeight: 18 },
  link: { color: T.accent, fontWeight: '700' },
  empty: { backgroundColor: T.card, borderRadius: 22, padding: 18, marginBottom: 12, alignItems: 'center' },
  emptyText: { fontSize: 14, color: T.textSecondary, lineHeight: 20 },
  summary: {
    backgroundColor: T.card, borderRadius: 22, padding: 18, marginBottom: 12, gap: 12,
    shadowColor: T.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: T.successSoft, justifyContent: 'center', alignItems: 'center' },
  summaryTitle: { fontSize: 16, fontWeight: '700', color: T.textPrimary, fontFamily: font },
  summarySub: { fontSize: 12, color: T.textSecondary, marginTop: 2 },
  cells: { flexDirection: 'row', gap: 10 },
  cell: { flex: 1, backgroundColor: T.inputBg, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12 },
  cellLabel: { fontSize: 11, color: T.textSecondary, fontWeight: '600' },
  big: {
    fontSize: 21, fontWeight: '800', color: T.textPrimary, marginTop: 3,
    fontFamily: Platform.OS === 'ios' ? 'Bebas Neue' : 'sans-serif-condensed',
  },
  days: { fontSize: 12, fontWeight: '600', color: T.textSecondary },
  bar: { height: 8, backgroundColor: T.inputBg, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: T.textMuted, borderRadius: 4 },
  note: { fontSize: 11.5, color: T.textMuted, lineHeight: 16, marginBottom: 12 },
}));
