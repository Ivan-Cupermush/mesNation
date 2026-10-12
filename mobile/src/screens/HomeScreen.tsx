import React, { useCallback, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StatusBar, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertCircle, CalendarClock, ChevronRight, Quote, Target, TrendingUp } from 'lucide-react-native';
import { T, themed } from '../theme/runtime';
import SalesTiles, { statsCaption } from '../components/kpi/SalesTiles';
import { statusMeta } from '../components/tasks/taskStatus';
import { errorText, HomeData, kpiApi, kpiTitle, money } from '../services/kpi';

const PHRASE_KEY = 'offix.home.phrase';

/** Имя для приветствия: «Анна Смирнова» → «Анна». */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** «Понедельник, 12 октября». */
const today = () => {
  const text = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
/** Цвет важности задачи (цвета темы читаются при отрисовке — тема может смениться). */
const importanceColor = (i: string) => (i === 'red' ? T.danger : i === 'green' ? T.success : T.warning);

/**
 * Стартовый экран (как на сайте): приветствие и напутствие — каждый раз новое,
 * продажи за месяц (те же 4 квадратика, что в статистике), KPI, на которые
 * стоит обратить внимание, и задачи на сегодня и в работе.
 */
export default function HomeScreen({ navigation }: any) {
  const [data, setData] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loading = useRef(false);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      // Напутствие меняется при каждом заходе: прошлое передаём, чтобы не повторилось.
      const prev = Number(await AsyncStorage.getItem(PHRASE_KEY).catch(() => null));
      const d = await kpiApi.home(Number.isInteger(prev) && prev >= 0 ? prev : undefined);
      setData(d);
      setFailed(null);
      AsyncStorage.setItem(PHRASE_KEY, String(d.phrase.id)).catch(() => undefined);
    } catch (e) {
      setFailed(errorText(e, 'Не удалось загрузить главную'));
    } finally {
      loading.current = false;
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openTask = (taskId: number) => navigation.getParent()?.navigate('TasksTab', { screen: 'TaskDetail', params: { taskId } });
  const openStats = () => navigation.getParent()?.navigate('KpiTab', { screen: 'KpiHome' });
  const openTasks = () => navigation.getParent()?.navigate('TasksTab', { screen: 'TasksHome' });

  if (!data) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        {failed ? (
          <TouchableOpacity onPress={load} style={styles.empty}>
            <Text style={styles.emptyText}>{failed}. Нажмите, чтобы повторить.</Text>
          </TouchableOpacity>
        ) : (
          <ActivityIndicator color={T.accent} size="large" />
        )}
      </SafeAreaView>
    );
  }

  const overdue = data.tasks.filter((t) => t.is_overdue).length;
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={T.statusBar} backgroundColor="transparent" translucent />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={T.accent} />}
      >
        <View style={styles.hero}>
          <Text style={styles.date}>{today()}</Text>
          <Text style={styles.greeting}>
            {data.greeting}, {firstName(data.name)}!
          </Text>
          <View style={styles.phrase}>
            <Quote size={18} color={T.accent} />
            <Text style={styles.phraseText}>{data.phrase.text}</Text>
          </View>
        </View>

        <View style={styles.head}>
          <Text style={styles.sectionTitle}>Продажи за месяц</Text>
          <TouchableOpacity onPress={openStats} hitSlop={8}>
            <Text style={styles.link}>Статистика</Text>
          </TouchableOpacity>
        </View>
        <SalesTiles stats={data.stats} />
        <Text style={styles.note}>{statsCaption(data.stats, data.month)}</Text>

        <View style={styles.head}>
          <Text style={styles.sectionTitle}>Обратите внимание</Text>
        </View>
        {data.kpi.totals && (
          <Text style={styles.earned}>
            Заработано по KPI {money(data.kpi.totals.now)} из {money(data.kpi.totals.max)}
          </Text>
        )}
        {data.kpi.focus.length ? (
          <View style={styles.list}>
            {data.kpi.focus.map((t, i) => (
              <TouchableOpacity key={t.id} style={[styles.row, i > 0 && styles.rowBorder]} onPress={openStats} activeOpacity={0.7}>
                <View style={[styles.rowIcon, { backgroundColor: T.warningSoft }]}>
                  <Target size={18} color={T.warning} />
                </View>
                <View style={{ flex: 1, gap: 5 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{kpiTitle(t)}</Text>
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.max(2, Math.min(100, t.calc.percent))}%` }]} />
                  </View>
                  {t.calc.hint ? (
                    <View style={styles.hint}>
                      <TrendingUp size={13} color={T.accent} />
                      <Text style={styles.hintText}>{t.calc.hint}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.pct}>{Math.round(t.calc.percent)}%</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Target size={22} color={T.accent} />
            <Text style={styles.emptyText}>
              {data.kpi.count ? 'Все показатели KPI выполнены — так держать!' : 'KPI за этот месяц пока нет — его загружает руководитель.'}
            </Text>
          </View>
        )}

        <View style={styles.head}>
          <Text style={styles.sectionTitle}>Задачи на сегодня</Text>
          <TouchableOpacity onPress={openTasks} hitSlop={8}>
            <Text style={styles.link}>Все задачи</Text>
          </TouchableOpacity>
        </View>
        {overdue > 0 && (
          <View style={styles.alert}>
            <AlertCircle size={16} color={T.danger} />
            <Text style={styles.alertText}>Просрочено: {overdue}</Text>
          </View>
        )}
        {data.tasks.length ? (
          <View style={styles.list}>
            {data.tasks.map((t, i) => {
              const meta = statusMeta(t.status);
              const Icon = meta.icon;
              return (
                <TouchableOpacity key={t.id} style={[styles.row, i > 0 && styles.rowBorder]} onPress={() => openTask(t.id)} activeOpacity={0.7}>
                  <View style={[styles.rowIcon, { backgroundColor: meta.soft }]}>
                    <Icon size={16} color={meta.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle} numberOfLines={2}>{t.title}</Text>
                    <Text style={[styles.rowSub, !!t.is_overdue && styles.late]}>
                      {meta.label}
                      {t.deadline ? (t.is_overdue ? ' · просрочена' : t.due_today ? ` · сегодня до ${time(t.deadline)}` : '') : ''}
                    </Text>
                  </View>
                  <View style={[styles.dot, { backgroundColor: importanceColor(t.importance) }]} />
                  <ChevronRight size={16} color={T.textMuted} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <View style={styles.empty}>
            <CalendarClock size={22} color={T.accent} />
            <Text style={styles.emptyText}>На сегодня задач нет, в работе тоже ничего. Хороший момент взяться за новое!</Text>
          </View>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const font = Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium';

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  scroll: { paddingHorizontal: 20, paddingTop: 12 },
  hero: { backgroundColor: T.accentMuted, borderRadius: 24, padding: 18, gap: 8, marginBottom: 22 },
  date: { fontSize: 13, fontWeight: '600', color: T.textSecondary },
  greeting: { fontSize: 24, fontWeight: '800', color: T.textPrimary, fontFamily: font },
  phrase: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  phraseText: { flex: 1, fontSize: 15, lineHeight: 21, color: T.textPrimary },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: T.textPrimary, fontFamily: font },
  link: { fontSize: 13.5, fontWeight: '700', color: T.accent },
  note: { fontSize: 11.5, color: T.textMuted, lineHeight: 16, marginBottom: 18 },
  earned: { fontSize: 12.5, fontWeight: '600', color: T.textSecondary, marginTop: -6, marginBottom: 10 },
  list: {
    backgroundColor: T.card, borderRadius: 22, marginBottom: 18, overflow: 'hidden',
    shadowColor: T.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 24, elevation: 4,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowBorder: { borderTopWidth: 1, borderTopColor: T.border },
  rowIcon: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: T.textPrimary },
  rowSub: { fontSize: 12, color: T.textSecondary, marginTop: 2 },
  late: { color: T.danger, fontWeight: '700' },
  bar: { height: 6, backgroundColor: T.inputBg, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: T.warning, borderRadius: 3 },
  hint: { flexDirection: 'row', gap: 5, alignItems: 'flex-start' },
  hintText: { flex: 1, fontSize: 12, color: T.textSecondary, lineHeight: 16 },
  pct: { minWidth: 44, textAlign: 'right', fontSize: 15, fontWeight: '800', color: T.textPrimary },
  dot: { width: 8, height: 8, borderRadius: 4 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  alertText: { fontSize: 13, fontWeight: '700', color: T.danger },
  empty: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: T.card, borderRadius: 22, padding: 16, marginBottom: 18,
  },
  emptyText: { flex: 1, fontSize: 14, lineHeight: 20, color: T.textSecondary },
}));
