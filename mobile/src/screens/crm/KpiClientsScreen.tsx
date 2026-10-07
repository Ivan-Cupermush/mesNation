import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Alert, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { pick } from '@react-native-documents/picker';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, FileSpreadsheet, Plus, Sparkles, Trash2 } from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import { ClientLists, errorText, kpiApi, moneyShort, monthKey, monthTitle, ReportClient, shiftMonth } from '../../services/kpi';

type Kind = 'ep' | 'akb_merge';

const ABOUT: Record<Kind, string> = {
  ep:
    'Выручка этих клиентов идёт в «Продажи Есть повод», а не в «План продаж без ЕП», и не считается в АКБ. ' +
    'Можно указать часть названия: «ИП Соколов Д.И.» — все его точки.',
  akb_merge: 'Клиенты, записанные в 1С несколько раз. В АКБ все клиенты с таким названием считаются одной точкой.',
};

/**
 * Списки клиентов для KPI (как на сайте): сеть «Есть повод» и задвоенные.
 * После правки KPI команды пересчитываются по загруженным отчётам.
 */
export default function KpiClientsScreen({ navigation }: any) {
  const [kind, setKind] = useState<Kind>('ep');
  const [lists, setLists] = useState<ClientLists | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [month, setMonth] = useState(monthKey());
  const [q, setQ] = useState('');
  const [onlyHints, setOnlyHints] = useState(false);
  const [clients, setClients] = useState<ReportClient[] | null>(null);

  const loadClients = useCallback(() => {
    kpiApi.reportClients(month, q.trim()).then(setClients).catch(() => setClients([]));
  }, [month, q]);

  useEffect(() => { kpiApi.lists().then(setLists).catch(() => setLists({ ep: [], akb_merge: [] })); }, []);
  useEffect(() => {
    const t = setTimeout(loadClients, 300);
    return () => clearTimeout(t);
  }, [loadClients]);

  const add = async (names: string[]) => {
    if (!names.length) return;
    setBusy(true);
    try {
      const r = await kpiApi.addToList(kind, names);
      setLists(r.lists);
      setText('');
      loadClients();
      Alert.alert('Готово', r.added ? `Добавлено: ${r.added}. KPI пересчитан.` : 'Эти клиенты уже в списке');
    } catch (e) {
      Alert.alert('Ошибка', errorText(e, 'Не удалось добавить'));
    } finally {
      setBusy(false);
    }
  };

  const fromFile = async () => {
    try {
      const [f] = await pick({ allowMultiSelection: false });
      if (!f) return;
      setBusy(true);
      const r = await kpiApi.importList(kind, { uri: f.uri, name: f.name || 'list.xlsx', type: f.type || 'application/octet-stream' });
      setLists(r.lists);
      loadClients();
      Alert.alert('Готово', `В файле названий: ${r.found}, добавлено: ${r.added}. KPI пересчитан.`);
    } catch (e: any) {
      if (e?.code !== 'DOCUMENT_PICKER_CANCELED' && e?.code !== 'OPERATION_CANCELED') Alert.alert('Ошибка', errorText(e, 'Не удалось загрузить список'));
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: number, pattern: string) =>
    Alert.alert(`Убрать «${pattern}»?`, 'KPI команды пересчитаются по загруженным отчётам.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Убрать', style: 'destructive', onPress: async () => {
          try { setLists((await kpiApi.removeFromList(id)).lists); loadClients(); } catch (e) { Alert.alert('Ошибка', errorText(e, 'Не удалось убрать')); }
        },
      },
    ]);

  const entries = lists?.[kind] ?? [];
  const shown = (clients ?? []).filter((c) => !onlyHints || (c.ep_hint && !c.ep));

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={T.statusBar} backgroundColor="transparent" translucent />
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={T.textPrimary} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Клиенты для KPI</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.segments}>
          {(['ep', 'akb_merge'] as Kind[]).map((k) => (
            <TouchableOpacity key={k} style={[styles.segment, kind === k && styles.segmentOn]} onPress={() => { setKind(k); setOnlyHints(false); }}>
              <Text style={[styles.segmentText, kind === k && styles.segmentTextOn]}>
                {k === 'ep' ? 'Есть повод' : 'Задвоенные'}{lists ? ` · ${lists[k].length}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.muted}>{ABOUT[kind]}</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Названия клиентов — по одному на строку</Text>
          <TextInput
            style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
            multiline
            value={text}
            onChangeText={setText}
            placeholder={kind === 'ep' ? 'ИП Соколов Д.И.\nИП Воронцова В.Ю.' : 'Егорова\nМорозов'}
            placeholderTextColor={T.textMuted}
          />
          <View style={styles.inline}>
            <TouchableOpacity style={[styles.primary, { flex: 1 }, (!text.trim() || busy) && { opacity: 0.5 }]} disabled={!text.trim() || busy} onPress={() => add(text.split('\n').map((x) => x.trim()).filter(Boolean))}>
              <Plus size={16} color={T.onAccent} />
              <Text style={styles.primaryText}>Добавить</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondary, { flex: 1 }]} disabled={busy} onPress={fromFile}>
              {busy ? <ActivityIndicator color={T.accent} /> : <FileSpreadsheet size={16} color={T.accent} />}
              <Text style={styles.secondaryText}>Из файла</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.section}>В списке · {entries.length}</Text>
        {lists === null ? (
          <ActivityIndicator color={T.accent} />
        ) : entries.length ? (
          <View style={styles.list}>
            {entries.map((e) => (
              <View key={e.id} style={styles.row}>
                <Text style={[styles.rowTitle, { flex: 1 }]}>{e.pattern}</Text>
                <TouchableOpacity onPress={() => remove(e.id, e.pattern)} style={styles.iconBtn} accessibilityLabel="Убрать">
                  <Trash2 size={18} color={T.danger} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.muted}>Список пуст.{kind === 'ep' ? ' Пока он пуст, вся выручка считается в «без ЕП».' : ''}</Text>
        )}

        <View style={[styles.inline, { justifyContent: 'space-between', marginTop: 8 }]}>
          <Text style={styles.section}>Клиенты из отчётов</Text>
          <View style={styles.inline}>
            <TouchableOpacity onPress={() => setMonth(shiftMonth(month, -1))} style={styles.iconBtn}><ChevronLeft size={18} color={T.textPrimary} /></TouchableOpacity>
            <Text style={styles.monthText}>{monthTitle(month)}</Text>
            <TouchableOpacity onPress={() => setMonth(shiftMonth(month, 1))} disabled={month >= monthKey()} style={[styles.iconBtn, month >= monthKey() && { opacity: 0.3 }]}>
              <ChevronRight size={18} color={T.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>
        <TextInput style={styles.input} value={q} onChangeText={setQ} placeholder="Найти клиента" placeholderTextColor={T.textMuted} />
        {kind === 'ep' && (
          <TouchableOpacity style={[styles.chip, onlyHints && styles.chipOn]} onPress={() => setOnlyHints(!onlyHints)}>
            <Sparkles size={14} color={onlyHints ? T.onAccent : T.violet} />
            <Text style={[styles.chipText, onlyHints && { color: T.onAccent }]}>Похожи на «Есть повод»</Text>
          </TouchableOpacity>
        )}
        {clients === null ? (
          <ActivityIndicator color={T.accent} />
        ) : shown.length ? (
          <View style={styles.list}>
            {shown.slice(0, 200).map((c) => {
              const listed = kind === 'ep' ? c.ep : c.merge;
              return (
                <View key={c.name} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    <Text style={styles.rowSub}>
                      {c.revenue != null ? moneyShort(c.revenue) : '—'} · {c.managers.join(', ')}
                    </Text>
                    {c.ep_hint && <Text style={[styles.rowSub, { color: T.violet, fontWeight: '600' }]}>покупал товары «ЕстьПовод»</Text>}
                  </View>
                  {listed ? (
                    <View style={styles.listed}><Check size={14} color={T.accent} /><Text style={styles.listedText}>в списке</Text></View>
                  ) : (
                    <TouchableOpacity style={styles.smallBtn} disabled={busy} onPress={() => add([c.name])}>
                      <Text style={styles.smallBtnText}>В список</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.muted}>{q ? 'Никого не нашли.' : `За ${monthTitle(month)} отчётов о продажах нет.`}</Text>
        )}
        <View style={{ height: 60 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const font = Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium';

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  scroll: { paddingHorizontal: 20, paddingTop: 4, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  backBtn: { width: 44, height: 44, borderRadius: 14, backgroundColor: T.card, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700', color: T.textPrimary, fontFamily: font },
  segments: { flexDirection: 'row', backgroundColor: T.card, borderRadius: 14, padding: 3 },
  segment: { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: 'center' },
  segmentOn: { backgroundColor: T.accent },
  segmentText: { fontSize: 13.5, fontWeight: '600', color: T.textSecondary },
  segmentTextOn: { color: T.onAccent },
  muted: { fontSize: 12.5, color: T.textMuted, lineHeight: 17 },
  card: { backgroundColor: T.card, borderRadius: 20, padding: 14, gap: 10 },
  label: { fontSize: 12, fontWeight: '700', color: T.textSecondary },
  input: { backgroundColor: T.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: T.textPrimary },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  primary: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: T.accent },
  primaryText: { color: T.onAccent, fontWeight: '700', fontSize: 14 },
  secondary: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: T.accentMuted },
  secondaryText: { color: T.accent, fontWeight: '700', fontSize: 14 },
  section: { fontSize: 18, fontWeight: '800', color: T.textPrimary, fontFamily: font },
  list: { backgroundColor: T.card, borderRadius: 20, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: T.border },
  rowTitle: { fontSize: 14, fontWeight: '600', color: T.textPrimary },
  rowSub: { fontSize: 12, color: T.textSecondary, marginTop: 2 },
  iconBtn: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  monthText: { fontSize: 13.5, fontWeight: '700', color: T.textPrimary },
  chip: { flexDirection: 'row', alignSelf: 'flex-start', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: T.violetSoft },
  chipOn: { backgroundColor: T.violet },
  chipText: { fontSize: 13, fontWeight: '600', color: T.violet },
  listed: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: T.successSoft },
  listedText: { color: T.accent, fontWeight: '700', fontSize: 12 },
  smallBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: T.accentMuted },
  smallBtnText: { color: T.accent, fontWeight: '700', fontSize: 13 },
}));
