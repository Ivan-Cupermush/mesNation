import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { pick } from '@react-native-documents/picker';
import {
  ArrowLeft, Upload, Users, UserRound, ListChecks, FileSpreadsheet, CheckCircle2, AlertTriangle,
  Trash2, ChevronLeft, ChevronRight,
} from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import TeamPickerModal from '../../components/kpi/TeamPickerModal';
import {
  errorText, kpiApi, KpiFilePreview, kpiTitle, money, monthTitle, numberText, ReportImportResult, reportPeriod,
  SalesReportInfo, shiftMonth,
} from '../../services/kpi';
import { UploadFile } from '../../services/http';
import { api } from '../../services/api';

type Mode = 'report' | 'kpi' | 'sheets';

const MODES: { key: Mode; title: string; text: string; icon: any }[] = [
  { key: 'report', title: 'Отчёт о продажах', text: 'Ежедневный отчёт из 1С — обновит KPI команды', icon: Users },
  { key: 'kpi', title: 'Файл KPI', text: 'План, бонусы и правила на месяц', icon: UserRound },
  { key: 'sheets', title: 'KPI по листам', text: 'Каждый лист — сотрудник', icon: ListChecks },
];

const FACT_TEXT: Record<string, string> = {
  revenue: 'по отчёту: продажи',
  clients: 'по отчёту: точки',
  items: 'по отчёту: позиции',
  manual: 'вручную / из файла',
};

async function pickSheet(): Promise<UploadFile | null> {
  try {
    const [f] = await pick({
      type: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/octet-stream'],
      allowMultiSelection: false,
    });
    return f ? { uri: f.uri, name: f.name || 'file.xlsx', type: f.type || 'application/octet-stream' } : null;
  } catch (e: any) {
    if (e?.code !== 'DOCUMENT_PICKER_CANCELED' && e?.code !== 'OPERATION_CANCELED') Alert.alert('Файл', errorText(e, 'Не удалось выбрать файл'));
    return null;
  }
}

/**
 * Загрузка KPI для руководителя — как на сайте: ежедневный отчёт о продажах
 * (с сопоставлением менеджеров и историей), файл KPI сотрудника с предпросмотром
 * и KPI по листам.
 */
export default function KpiImportScreen({ navigation, route }: any) {
  const [mode, setMode] = useState<Mode>(route.params?.mode ?? 'report');
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={T.statusBar} backgroundColor="transparent" translucent />
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={T.textPrimary} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Загрузка KPI</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
          {MODES.map((m) => {
            const Icon = m.icon;
            const on = mode === m.key;
            return (
              <TouchableOpacity key={m.key} style={[styles.mode, on && styles.modeOn]} onPress={() => setMode(m.key)}>
                <Icon size={18} color={T.accent} />
                <Text style={styles.modeTitle}>{m.title}</Text>
                <Text style={styles.modeText}>{m.text}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <TouchableOpacity onPress={() => navigation.navigate('ImportExcel')} style={{ marginVertical: 10 }}>
          <Text style={styles.link}>Импорт своих продаж (товар, сумма, дата) →</Text>
        </TouchableOpacity>
        {mode === 'report' && <ReportImport navigation={navigation} />}
        {mode === 'kpi' && <KpiFileImport navigation={navigation} presetUser={route.params?.userId} />}
        {mode === 'sheets' && <SheetsImport />}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function PickCard({ busy, text, onPick }: { busy: boolean; text: string; onPick: () => void }) {
  return (
    <View style={styles.card}>
      <View style={styles.pickIcon}>{busy ? <ActivityIndicator color={T.accent} /> : <FileSpreadsheet size={36} color={T.accent} />}</View>
      <Text style={styles.cardTitle}>{busy ? 'Загружаем и читаем файл…' : 'Выберите файл Excel'}</Text>
      <Text style={styles.cardText}>{text}</Text>
      {!busy && (
        <TouchableOpacity style={styles.primary} onPress={onPick}>
          <Upload size={18} color={T.onAccent} />
          <Text style={styles.primaryText}>Выбрать файл</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Warn({ title, lines }: { title: string; lines: string[] }) {
  return (
    <View style={styles.warn}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <AlertTriangle size={17} color={T.warning} />
        <Text style={styles.warnTitle}>{title}</Text>
      </View>
      {lines.map((l, i) => <Text key={i} style={styles.warnLine}>• {l}</Text>)}
    </View>
  );
}

// ---------- Отчёт о продажах ----------

function ReportImport({ navigation }: { navigation: any }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReportImportResult | null>(null);
  const [reports, setReports] = useState<SalesReportInfo[]>([]);
  const [unmatched, setUnmatched] = useState<{ manager_key: string; name: string; revenue: number | null }[]>([]);
  const [mapping, setMapping] = useState<string | null>(null);

  const loadLists = useCallback(() => {
    kpiApi.reports().then(setReports).catch(() => {});
    kpiApi.unmatched().then(setUnmatched).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => { loadLists(); }, [loadLists]));

  const upload = async () => {
    const file = await pickSheet();
    if (!file) return;
    setBusy(true);
    try {
      setResult(await kpiApi.importReport(file));
    } catch (e) {
      Alert.alert('Отчёт не загружен', errorText(e, 'Не удалось обработать отчёт'));
    } finally {
      setBusy(false);
    }
  };

  const assign = async (name: string, user: { id: number; name: string }) => {
    try {
      const r = await kpiApi.assignManager(name, user.id);
      Alert.alert('Готово', `«${name}» — это ${user.name}. Пересчитано показателей: ${r.targets}`);
      setResult((prev) => prev && {
        ...prev,
        results: prev.results.map((x) => (x.manager === name ? { ...x, user: user.name, userId: user.id, status: 'ok', error: undefined, updated: r.targets > 0, targetsUpdated: r.targets } : x)),
      });
      loadLists();
    } catch (e) {
      Alert.alert('Ошибка', errorText(e, 'Не удалось сопоставить'));
    }
  };

  const remove = (r: SalesReportInfo) => {
    const label = reportPeriod(r.period_start, r.period_end);
    Alert.alert(`Удалить отчёт за ${label}?`, 'Факт KPI пересчитается без него.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить', style: 'destructive', onPress: async () => {
          try { await kpiApi.deleteReport(r.id); loadLists(); } catch (e) { Alert.alert('Ошибка', errorText(e, 'Не удалось удалить')); }
        },
      },
    ]);
  };

  const picker = (
    <TeamPickerModal
      visible={!!mapping}
      title={mapping ? `Кто в 1С «${mapping}»?` : ''}
      onClose={() => setMapping(null)}
      onPick={(u) => { const n = mapping!; setMapping(null); assign(n, u); }}
    />
  );

  if (result) {
    const rep = result.report;
    const ok = result.results.filter((r) => r.status === 'ok').length;
    return (
      <>
        <View style={styles.card}>
          <View style={[styles.pickIcon, { backgroundColor: T.successSoft }]}><CheckCircle2 size={36} color={T.accent} /></View>
          <Text style={styles.cardTitle}>{rep ? `Отчёт за ${reportPeriod(rep.period_start, rep.period_end)} загружен` : 'Нечего загружать'}</Text>
          <Text style={styles.cardText}>
            {rep ? `Выручка ${money(rep.total_revenue)} · менеджеров найдено: ${ok} из ${result.results.length}${result.replaced ? ' · заменён прежний отчёт' : ''}` : 'В отчёте нет ваших сотрудников'}
          </Text>
        </View>
        {result.epListEmpty && <Warn title="Список «Есть повод» пуст" lines={['Пока он пуст, вся выручка считается в «без ЕП». Заполните его в «Клиенты ЕП».']} />}
        {result.warnings.length > 0 && <Warn title="Проверьте отчёт" lines={result.warnings} />}
        <View style={styles.list}>
          {result.results.map((r) => (
            <View key={r.manager} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.manager}</Text>
                <Text style={styles.rowSub}>
                  {money(r.total)}{r.ep ? ` · ЕП ${money(r.ep)}` : ''}{r.user ? ` · ${r.user}` : ''}
                </Text>
                <Text style={[styles.rowSub, { color: r.status === 'ok' ? T.accent : T.danger, fontWeight: '600' }]}>
                  {r.status === 'ok' ? (r.updated ? `обновлено показателей: ${r.targetsUpdated}` : 'нет KPI за этот месяц') : r.error}
                </Text>
              </View>
              {(r.status === 'unmatched' || r.status === 'ambiguous') && (
                <TouchableOpacity style={styles.smallBtn} onPress={() => setMapping(r.manager)}>
                  <Text style={styles.smallBtnText}>Выбрать</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity style={[styles.secondary, { flex: 1 }]} onPress={() => { setResult(null); loadLists(); }}>
            <Text style={styles.secondaryText}>Загрузить ещё</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondary, { flex: 1 }]} onPress={() => navigation.navigate('KpiClients')}>
            <Text style={styles.secondaryText}>Клиенты ЕП</Text>
          </TouchableOpacity>
        </View>
        {picker}
      </>
    );
  }

  return (
    <>
      <PickCard
        busy={busy}
        onPick={upload}
        text="Отчёт 1С «Валовая прибыль» с разделом «По менеджерам». Подходит отчёт с 1-го числа по сегодня (заменяет прежний) или за один день (дни складываются)."
      />
      {unmatched.length > 0 && (
        <>
          <Text style={styles.section}>Не найдены среди сотрудников</Text>
          <View style={styles.list}>
            {unmatched.map((u) => (
              <View key={u.manager_key} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{u.name}</Text>
                  <Text style={styles.rowSub}>{u.revenue != null ? money(u.revenue) : '—'}</Text>
                </View>
                <TouchableOpacity style={styles.smallBtn} onPress={() => setMapping(u.name)}>
                  <Text style={styles.smallBtnText}>Выбрать</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      )}
      {reports.length > 0 && (
        <>
          <Text style={styles.section}>Загруженные отчёты</Text>
          <View style={styles.list}>
            {reports.slice(0, 31).map((r) => (
              <View key={r.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{reportPeriod(r.period_start, r.period_end)} · {monthTitle(r.month)}</Text>
                  <Text style={styles.rowSub}>
                    {money(r.total_revenue)}{r.uploaded_by_name ? ` · ${r.uploaded_by_name}` : ''}{r.unmatched ? ` · не найдено менеджеров: ${r.unmatched}` : ''}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => remove(r)} style={styles.iconBtn} accessibilityLabel="Удалить отчёт">
                  <Trash2 size={18} color={T.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      )}
      {picker}
    </>
  );
}

// ---------- Файл KPI сотрудника ----------

function KpiFileImport({ navigation, presetUser }: { navigation: any; presetUser?: number }) {
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<UploadFile | null>(null);
  const [preview, setPreview] = useState<KpiFilePreview | null>(null);
  const [person, setPerson] = useState<{ id: number; name: string } | null>(null);
  const [month, setMonth] = useState('');
  const [picking, setPicking] = useState(false);
  const [done, setDone] = useState<{ imported: number; month: string; person: { id: number; name: string } } | null>(null);

  const choose = async () => {
    const f = await pickSheet();
    if (!f) return;
    setBusy(true);
    try {
      const p = await kpiApi.previewKpiFile(f);
      setFile(f);
      setPreview(p);
      setMonth(p.month);
      if (presetUser) {
        const team = await api.getSubordinates('month').catch(() => []);
        const found = (team as any[]).find((t) => Number(t.user_id) === presetUser);
        setPerson({ id: presetUser, name: found ? found.display_name || found.username : 'Сотрудник' });
      } else setPerson(p.suggestedUser);
    } catch (e) {
      Alert.alert('Файл KPI', errorText(e, 'Не удалось прочитать файл KPI'));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!file || !person) return;
    setBusy(true);
    try {
      const r = await kpiApi.importKpiFile(file, person.id, month);
      setDone({ imported: r.imported, month: r.month, person });
    } catch (e) {
      Alert.alert('KPI не загружен', errorText(e, 'Не удалось загрузить KPI'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <View style={styles.card}>
        <View style={[styles.pickIcon, { backgroundColor: T.successSoft }]}><CheckCircle2 size={36} color={T.accent} /></View>
        <Text style={styles.cardTitle}>KPI на {monthTitle(done.month)} загружен</Text>
        <Text style={styles.cardText}>{done.person.name}: показателей {done.imported}. Факт будет обновляться по отчётам о продажах.</Text>
        <TouchableOpacity style={styles.primary} onPress={() => navigation.navigate('EmployeeStats', { userId: done.person.id, userName: done.person.name })}>
          <Text style={styles.primaryText}>Открыть KPI сотрудника</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondary, { marginTop: 10, alignSelf: 'stretch' }]} onPress={() => { setDone(null); setPreview(null); setFile(null); }}>
          <Text style={styles.secondaryText}>Загрузить ещё</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!preview) {
    return (
      <PickCard
        busy={busy}
        onPick={choose}
        text="Сначала покажем, что нашли: сотрудника, месяц и показатели с правилами выплат из их названий. Правило потом можно поправить в карточке KPI."
      />
    );
  }

  return (
    <>
      <View style={[styles.card, { alignItems: 'stretch' }]}>
        <Text style={styles.label}>Сотрудник</Text>
        <TouchableOpacity style={styles.person} onPress={() => setPicking(true)}>
          <Text style={[styles.rowTitle, !person && { color: T.textMuted }]}>{person ? person.name : 'Выберите сотрудника из своей команды'}</Text>
        </TouchableOpacity>
        {!!preview.employeeName && (
          <Text style={styles.rowSub}>В файле: «{preview.employeeName}»{preview.suggestedUser ? '' : ' — не найден, выберите вручную'}.</Text>
        )}
        <Text style={[styles.label, { marginTop: 14 }]}>Месяц</Text>
        <View style={styles.monthRow}>
          <TouchableOpacity onPress={() => setMonth(shiftMonth(month, -1))} style={styles.iconBtn}><ChevronLeft size={20} color={T.textPrimary} /></TouchableOpacity>
          <Text style={styles.monthText}>{monthTitle(month)}</Text>
          <TouchableOpacity onPress={() => setMonth(shiftMonth(month, 1))} style={styles.iconBtn}><ChevronRight size={20} color={T.textPrimary} /></TouchableOpacity>
        </View>
        <Text style={styles.rowSub}>
          {preview.monthFromFile ? `Месяц из файла: ${monthTitle(preview.monthFromFile)}. ` : 'В файле нет даты — проверьте месяц. '}
          {preview.hasResults ? 'В файле есть итоги месяца.' : 'В файле только план.'} Показатели из файла KPI за этот месяц заменятся, цели, созданные вручную, останутся.
        </Text>
      </View>
      {preview.warnings.length > 0 && <Warn title="Проверьте файл" lines={preview.warnings} />}
      <View style={styles.list}>
        {preview.metrics.map((m, i) => (
          <View key={i} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>{kpiTitle({ product_name: m.name, kpi_kind: m.kind })}</Text>
              <Text style={styles.rowSub}>План {numberText(m.plan)}{m.bonus ? ` · бонус ${money(m.bonus)}` : ''} · {FACT_TEXT[m.factRule.type]}</Text>
              {!!m.rule && <Text style={styles.rowNote}>{m.rule}</Text>}
              {m.items.length > 0 && <Text style={styles.rowNote}>{m.items.map((it) => `${it.name} — ${it.need} ТТ`).join('; ')}</Text>}
            </View>
          </View>
        ))}
      </View>
      <TouchableOpacity style={[styles.primary, (!person || busy) && { opacity: 0.5 }]} disabled={!person || busy} onPress={save}>
        {busy ? <ActivityIndicator color={T.onAccent} /> : <Upload size={18} color={T.onAccent} />}
        <Text style={styles.primaryText}>Загрузить KPI</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.secondary, { marginTop: 10 }]} onPress={() => { setPreview(null); setFile(null); }}>
        <Text style={styles.secondaryText}>Другой файл</Text>
      </TouchableOpacity>
      <TeamPickerModal visible={picking} onClose={() => setPicking(false)} onPick={(u) => { setPerson(u); setPicking(false); }} />
    </>
  );
}

// ---------- KPI по листам ----------

function SheetsImport() {
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<{ employee: string; user?: string; month?: string; created?: number; updated?: number; error?: string }[] | null>(null);
  const upload = async () => {
    const f = await pickSheet();
    if (!f) return;
    setBusy(true);
    try {
      setRows((await kpiApi.importKpiSheets(f)).results);
    } catch (e) {
      Alert.alert('Файл не загружен', errorText(e, 'Не удалось обработать файл'));
    } finally {
      setBusy(false);
    }
  };
  if (rows) {
    return (
      <>
        <View style={styles.list}>
          {rows.map((r, i) => (
            <View key={i} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{r.employee}{r.user && r.user !== r.employee ? ` → ${r.user}` : ''}</Text>
                <Text style={[styles.rowSub, { color: r.error ? T.danger : T.accent }]}>
                  {r.error || `${r.month ? `${monthTitle(r.month)}: ` : ''}показателей ${r.created ?? 0}${r.updated ? `, заменено ${r.updated}` : ''}`}
                </Text>
              </View>
            </View>
          ))}
        </View>
        <TouchableOpacity style={styles.secondary} onPress={() => setRows(null)}><Text style={styles.secondaryText}>Загрузить ещё</Text></TouchableOpacity>
      </>
    );
  }
  return <PickCard busy={busy} onPick={upload} text="Каждый лист — файл KPI сотрудника: имя, месяц и показатели. Только ваша команда." />;
}

const font = Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium';

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  scroll: { paddingHorizontal: 20, paddingTop: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: T.card, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: T.textPrimary, fontFamily: font },
  mode: { width: 170, padding: 14, borderRadius: 18, backgroundColor: T.card, borderWidth: 1.5, borderColor: 'transparent', gap: 4 },
  modeOn: { borderColor: T.accent, backgroundColor: T.accentMuted },
  modeTitle: { fontSize: 14, fontWeight: '700', color: T.textPrimary, marginTop: 4 },
  modeText: { fontSize: 11.5, color: T.textSecondary, lineHeight: 15 },
  link: { color: T.accent, fontWeight: '600', fontSize: 13 },
  card: {
    backgroundColor: T.card, borderRadius: 22, padding: 20, marginBottom: 14, alignItems: 'center',
    shadowColor: T.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  pickIcon: { width: 76, height: 76, borderRadius: 22, backgroundColor: T.accentMuted, justifyContent: 'center', alignItems: 'center', marginBottom: 14 },
  cardTitle: { fontSize: 17, fontWeight: '700', color: T.textPrimary, textAlign: 'center', fontFamily: font },
  cardText: { fontSize: 13, color: T.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  primary: {
    flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch',
    marginTop: 16, paddingVertical: 14, borderRadius: 16, backgroundColor: T.accent,
  },
  primaryText: { color: T.onAccent, fontWeight: '700', fontSize: 15 },
  secondary: { paddingVertical: 13, borderRadius: 16, backgroundColor: T.accentMuted, alignItems: 'center' },
  secondaryText: { color: T.accent, fontWeight: '700', fontSize: 14 },
  warn: { backgroundColor: T.warningSoft, borderRadius: 16, padding: 14, marginBottom: 14, gap: 4 },
  warnTitle: { color: T.warning, fontWeight: '700', fontSize: 14 },
  warnLine: { color: T.textPrimary, fontSize: 12.5, lineHeight: 17 },
  section: { fontSize: 18, fontWeight: '800', color: T.textPrimary, marginTop: 8, marginBottom: 10, fontFamily: font },
  list: { backgroundColor: T.card, borderRadius: 20, paddingHorizontal: 14, marginBottom: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: T.border },
  rowTitle: { fontSize: 14, fontWeight: '700', color: T.textPrimary },
  rowSub: { fontSize: 12, color: T.textSecondary, marginTop: 2, lineHeight: 17 },
  rowNote: { fontSize: 11, color: T.textMuted, marginTop: 2, lineHeight: 15 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: T.accentMuted },
  smallBtnText: { color: T.accent, fontWeight: '700', fontSize: 13 },
  iconBtn: { width: 36, height: 36, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: T.textSecondary, marginBottom: 6 },
  person: { backgroundColor: T.inputBg, borderRadius: 14, padding: 14, marginBottom: 6 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: T.inputBg, borderRadius: 14, marginBottom: 6 },
  monthText: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '700', color: T.textPrimary },
}));
