import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, TextInput, Switch, Alert, ActivityIndicator, StatusBar, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react-native';
import { T, themed } from '../../theme/runtime';
import {
  errorText, FactRule, kpiApi, KpiTarget, kpiTitle, moneyShort, parseNumber, PayoutRule, ReportGroup,
} from '../../services/kpi';

type FactType = FactRule['type'];
type PayType = PayoutRule['type'];

const FACT_TYPES: { key: FactType; label: string }[] = [
  { key: 'revenue', label: 'Продажи' },
  { key: 'clients', label: 'Точки' },
  { key: 'items', label: 'Позиции' },
  { key: 'manual', label: 'Вручную' },
];
const PAY_TYPES: { key: PayType; label: string }[] = [
  { key: 'threshold', label: 'Пороги' },
  { key: 'rate', label: '% продаж' },
  { key: 'items', label: 'Позиции' },
  { key: 'fixed', label: 'Фикс' },
  { key: 'none', label: 'Нет' },
];
const str = (n: number) => String(n).replace('.', ',');

function Segments<K extends string>({ options, value, onChange }: { options: { key: K; label: string }[]; value: K; onChange: (k: K) => void }) {
  return (
    <View style={styles.segments}>
      {options.map((o) => (
        <TouchableOpacity key={o.key} style={[styles.segment, value === o.key && styles.segmentOn]} onPress={() => onChange(o.key)}>
          <Text style={[styles.segmentText, value === o.key && styles.segmentTextOn]} numberOfLines={1}>{o.label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/**
 * Правило показателя (как на сайте): как считать факт по отчётам о продажах
 * и сколько платить. После сохранения KPI пересчитывается.
 */
export default function KpiRuleScreen({ navigation, route }: any) {
  const t: KpiTarget = route.params.target;
  const month: string = route.params.month;
  const f = t.fact_rule;
  const p = t.payout_rule;
  const [factType, setFactType] = useState<FactType>(f.type);
  const [groups, setGroups] = useState<string[]>(f.type === 'revenue' || f.type === 'clients' ? f.groups : []);
  const [clients, setClients] = useState<'all' | 'ep' | 'non_ep'>(f.type === 'revenue' ? f.clients : 'all');
  const [measure, setMeasure] = useState<'revenue' | 'quantity'>(f.type === 'revenue' ? f.measure ?? 'revenue' : 'revenue');
  const [excludeEp, setExcludeEp] = useState(f.type === 'clients' ? f.excludeEp : true);
  const [merge, setMerge] = useState(f.type === 'clients' ? f.merge.join('\n') : '');
  const [items, setItems] = useState(f.type === 'items' ? f.items.map((i) => ({ name: i.name, need: String(i.need) })) : [{ name: '', need: '1' }]);
  const [payType, setPayType] = useState<PayType>(p.type);
  const [bonus, setBonus] = useState(str(Number(t.bonus_amount) || 0));
  const [steps, setSteps] = useState(p.type === 'threshold' ? p.steps.map((x) => ({ from: str(x.from), k: str(x.k) })) : [{ from: '100', k: '1' }]);
  const [over, setOver] = useState(p.type === 'threshold' ? p.over === 'proportional' : false);
  const [rate, setRate] = useState(p.type === 'rate' ? str(Math.round(p.rate * 10000) / 100) : '');
  const [min, setMin] = useState(p.type === 'rate' ? str(p.min) : '0');
  const [keyword, setKeyword] = useState('');
  const [q, setQ] = useState('');
  const [reportGroups, setReportGroups] = useState<ReportGroup[] | null>(null);
  const [saving, setSaving] = useState(false);
  const byGroups = factType === 'revenue' || factType === 'clients';

  useEffect(() => {
    if (byGroups && !reportGroups) kpiApi.reportGroups(month).then(setReportGroups).catch(() => setReportGroups([]));
  }, [byGroups, reportGroups, month]);

  const toggle = (path: string) => setGroups((gs) => (gs.includes(path) ? gs.filter((g) => g !== path) : [...gs, path]));
  const addKeyword = () => {
    const k = keyword.trim();
    if (k && !groups.includes(k)) setGroups([...groups, k]);
    setKeyword('');
  };

  const build = (): { fact: FactRule; payout: PayoutRule; bonus: number } | string => {
    let fact: FactRule;
    if (factType === 'revenue') fact = { type: 'revenue', groups, clients, measure };
    else if (factType === 'clients') fact = { type: 'clients', groups, excludeEp, merge: merge.split('\n').map((x) => x.trim()).filter(Boolean) };
    else if (factType === 'items') {
      const list = items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), need: Math.round(parseNumber(i.need)) }));
      if (!list.length) return 'Добавьте хотя бы одну позицию';
      if (list.some((i) => !(i.need >= 1))) return 'Число точек у позиции — от 1';
      fact = { type: 'items', items: list };
    } else fact = { type: 'manual' };
    const b = parseNumber(bonus || '0');
    if (!(b >= 0)) return 'Бонус — число не меньше 0';
    let payout: PayoutRule;
    if (payType === 'threshold') {
      const list = steps.map((x) => ({ from: parseNumber(x.from), k: parseNumber(x.k) }));
      if (!list.length || list.some((x) => !(x.from >= 0) || !(x.k >= 0))) return 'Пороги: процент и коэффициент — числа';
      payout = { type: 'threshold', steps: list.sort((a, c) => c.from - a.from), over: over ? 'proportional' : 'cap' };
    } else if (payType === 'rate') {
      const r = parseNumber(rate);
      const m = parseNumber(min || '0');
      if (!(r > 0 && r <= 100)) return 'Процент от продаж — от 0 до 100';
      if (!(m >= 0)) return 'Порог продаж — число не меньше 0';
      payout = { type: 'rate', rate: r / 100, min: m };
    } else payout = { type: payType } as PayoutRule;
    return { fact, payout, bonus: b };
  };

  const save = async () => {
    const r = build();
    if (typeof r === 'string') {
      Alert.alert('Проверьте правило', r);
      return;
    }
    setSaving(true);
    try {
      await kpiApi.saveRules(t.id, { fact_rule: r.fact, payout_rule: r.payout, bonus_amount: r.bonus });
      navigation.goBack();
    } catch (e) {
      Alert.alert('Ошибка', errorText(e, 'Не удалось сохранить правило'));
    } finally {
      setSaving(false);
    }
  };

  const shownGroups = (reportGroups ?? []).filter((g) => !q.trim() || g.path.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 150);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={T.statusBar} backgroundColor="transparent" translucent />
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ArrowLeft size={22} color={T.textPrimary} strokeWidth={2.2} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Правило расчёта</Text>
        <View style={{ width: 44 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.target}>{kpiTitle(t)}</Text>
        <Text style={styles.muted}>{t.product_name}</Text>

        <Text style={styles.legend}>КАК СЧИТАТЬ ФАКТ</Text>
        <Segments options={FACT_TYPES} value={factType} onChange={setFactType} />
        {factType === 'revenue' && (
          <>
            <Segments
              options={[{ key: 'all', label: 'Все клиенты' }, { key: 'non_ep', label: 'Без ЕП' }, { key: 'ep', label: 'Только ЕП' }]}
              value={clients}
              onChange={setClients}
            />
            <Segments options={[{ key: 'revenue', label: 'Выручка, ₽' }, { key: 'quantity', label: 'Количество, шт' }]} value={measure} onChange={setMeasure} />
          </>
        )}
        {factType === 'clients' && (
          <>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Не считать точки «Есть повод»</Text>
              <Switch value={excludeEp} onValueChange={setExcludeEp} trackColor={{ true: T.accent }} />
            </View>
            <Text style={styles.label}>Задвоенные клиенты — одна точка (по одному на строку)</Text>
            <TextInput style={[styles.input, { minHeight: 70 }]} multiline value={merge} onChangeText={setMerge} placeholder="Егорова" placeholderTextColor={T.textMuted} />
          </>
        )}
        {byGroups && (
          <View style={{ gap: 8 }}>
            <Text style={styles.label}>{groups.length ? 'Только эти группы товаров' : 'Все товары (группы не выбраны)'}</Text>
            {groups.length > 0 && (
              <View style={styles.tags}>
                {groups.map((g) => (
                  <TouchableOpacity key={g} style={styles.tag} onPress={() => toggle(g)}>
                    <Text style={styles.tagText}>{g.split(' › ').pop()}</Text>
                    <X size={14} color={T.accent} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
            <View style={styles.inline}>
              <TextInput style={[styles.input, { flex: 1 }]} value={keyword} onChangeText={setKeyword} onSubmitEditing={addKeyword} placeholder="Слово, например «Балтика»" placeholderTextColor={T.textMuted} />
              <TouchableOpacity style={styles.smallBtn} onPress={addKeyword}><Plus size={18} color={T.accent} /></TouchableOpacity>
            </View>
            {reportGroups === null ? (
              <ActivityIndicator color={T.accent} />
            ) : reportGroups.length ? (
              <>
                <TextInput style={styles.input} value={q} onChangeText={setQ} placeholder="Группы из отчётов за месяц" placeholderTextColor={T.textMuted} />
                <View style={styles.groupList}>
                  {shownGroups.map((g) => (
                    <TouchableOpacity key={g.path} style={[styles.groupRow, { paddingLeft: 10 + (g.depth - 1) * 14 }]} onPress={() => toggle(g.path)}>
                      <View style={[styles.check, groups.includes(g.path) && styles.checkOn]} />
                      <Text style={styles.groupName} numberOfLines={1}>{g.name}</Text>
                      <Text style={styles.groupSum}>{moneyShort(g.revenue)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.muted}>Группы товаров появятся после загрузки отчёта о продажах за этот месяц.</Text>
            )}
          </View>
        )}
        {factType === 'items' && (
          <View style={{ gap: 8 }}>
            {items.map((it, i) => (
              <View key={i} style={styles.inline}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={it.name}
                  onChangeText={(v) => setItems(items.map((x, j) => (j === i ? { ...x, name: v } : x)))}
                  placeholder="Товар, например «Балтика Стаут кег»"
                  placeholderTextColor={T.textMuted}
                />
                <TextInput
                  style={[styles.input, { width: 64, textAlign: 'center' }]}
                  keyboardType="numeric"
                  value={it.need}
                  onChangeText={(v) => setItems(items.map((x, j) => (j === i ? { ...x, need: v } : x)))}
                />
                <TouchableOpacity style={styles.smallBtn} disabled={items.length === 1} onPress={() => setItems(items.filter((_, j) => j !== i))}>
                  <Trash2 size={16} color={T.danger} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={() => setItems([...items, { name: '', need: '1' }])}><Text style={styles.link}>+ Позиция</Text></TouchableOpacity>
            <Text style={styles.muted}>Позиция выполнена, когда её купили столько разных точек (ТТ). «Стаут» = «Stout».</Text>
          </View>
        )}
        {factType === 'manual' && <Text style={styles.muted}>Факт не берётся из отчётов — вручную или из файла KPI.</Text>}

        <Text style={styles.legend}>ВЫПЛАТА</Text>
        <Segments options={PAY_TYPES} value={payType} onChange={setPayType} />
        {(payType === 'threshold' || payType === 'items' || payType === 'fixed') && (
          <>
            <Text style={styles.label}>{payType === 'fixed' ? 'Сумма, ₽' : 'Бонус при выполнении плана, ₽'}</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={bonus} onChangeText={setBonus} />
          </>
        )}
        {payType === 'threshold' && (
          <View style={{ gap: 8, marginTop: 8 }}>
            {steps.map((st, i) => (
              <View key={i} style={styles.inline}>
                <Text style={styles.muted}>от</Text>
                <TextInput style={[styles.input, { width: 70, textAlign: 'center' }]} keyboardType="numeric" value={st.from} onChangeText={(v) => setSteps(steps.map((x, j) => (j === i ? { ...x, from: v } : x)))} />
                <Text style={styles.muted}>% — бонус ×</Text>
                <TextInput style={[styles.input, { width: 64, textAlign: 'center' }]} keyboardType="numeric" value={st.k} onChangeText={(v) => setSteps(steps.map((x, j) => (j === i ? { ...x, k: v } : x)))} />
                <TouchableOpacity style={styles.smallBtn} disabled={steps.length === 1} onPress={() => setSteps(steps.filter((_, j) => j !== i))}>
                  <Trash2 size={16} color={T.danger} />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={() => setSteps([...steps, { from: '80', k: '0,5' }])}><Text style={styles.link}>+ Порог</Text></TouchableOpacity>
            <View style={styles.switchRow}>
              <Text style={styles.switchText}>Сверх плана — бонус растёт пропорционально</Text>
              <Switch value={over} onValueChange={setOver} trackColor={{ true: T.accent }} />
            </View>
          </View>
        )}
        {payType === 'rate' && (
          <View style={styles.inline}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Процент от продаж</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={rate} onChangeText={setRate} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Если продано от, ₽</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={min} onChangeText={setMin} />
            </View>
          </View>
        )}
        {payType === 'items' && <Text style={styles.muted}>Бонус делится поровну между позициями.</Text>}

        <TouchableOpacity style={[styles.primary, saving && { opacity: 0.6 }]} disabled={saving} onPress={save}>
          {saving ? <ActivityIndicator color={T.onAccent} /> : <Text style={styles.primaryText}>Сохранить и пересчитать</Text>}
        </TouchableOpacity>
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
  target: { fontSize: 18, fontWeight: '800', color: T.textPrimary, fontFamily: font },
  legend: { marginTop: 14, fontSize: 12, fontWeight: '800', color: T.textSecondary, letterSpacing: 0.4 },
  segments: { flexDirection: 'row', backgroundColor: T.card, borderRadius: 14, padding: 3 },
  segment: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  segmentOn: { backgroundColor: T.accent },
  segmentText: { fontSize: 12.5, fontWeight: '600', color: T.textSecondary },
  segmentTextOn: { color: T.onAccent },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 4 },
  switchText: { flex: 1, fontSize: 14, color: T.textPrimary },
  label: { fontSize: 12, fontWeight: '700', color: T.textSecondary, marginBottom: 4 },
  input: { backgroundColor: T.inputBg, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: T.textPrimary },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  smallBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: T.accentMuted, justifyContent: 'center', alignItems: 'center' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, backgroundColor: T.accentMuted },
  tagText: { color: T.accent, fontWeight: '600', fontSize: 13 },
  groupList: { backgroundColor: T.card, borderRadius: 14, paddingVertical: 4 },
  groupRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingRight: 12 },
  check: { width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: T.border },
  checkOn: { backgroundColor: T.accent, borderColor: T.accent },
  groupName: { flex: 1, fontSize: 13.5, color: T.textPrimary },
  groupSum: { fontSize: 12, color: T.textMuted },
  muted: { fontSize: 12.5, color: T.textMuted, lineHeight: 17 },
  link: { color: T.accent, fontWeight: '700', fontSize: 14 },
  primary: { marginTop: 18, paddingVertical: 15, borderRadius: 16, backgroundColor: T.accent, alignItems: 'center' },
  primaryText: { color: T.onAccent, fontWeight: '700', fontSize: 15 },
}));
