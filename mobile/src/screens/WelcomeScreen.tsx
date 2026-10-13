import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, StatusBar, ActivityIndicator, Platform, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AlertCircle,
  CalendarClock,
  ChevronRight,
  HandHeart,
  ListTodo,
  Moon,
  Quote,
  Sun,
  Sunrise,
  Sunset,
  Target,
  TrendingUp,
  Trophy,
  UsersRound,
} from 'lucide-react-native';
import { T, themed } from '../theme/runtime';
import SalesTiles, { statsCaption } from '../components/kpi/SalesTiles';
import HeaderBell from '../components/HeaderBell';
import { statusMeta } from '../components/tasks/taskStatus';
import { plural } from '../components/chat/chatUtils';
import { errorText, HomeData, kpiApi, kpiTitle, money } from '../services/kpi';
import { firstNameOf } from '../utils/names';

const PHRASE_KEY = 'offix.home.phrase';

/** «Понедельник, 12 октября». */
const today = () => {
  const text = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
  return text.charAt(0).toUpperCase() + text.slice(1);
};

const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
/** Цвет важности задачи (цвета темы читаются при отрисовке — тема может смениться). */
const importanceColor = (i: string) => (i === 'red' ? T.danger : i === 'green' ? T.success : T.warning);

/** Значок времени суток рядом с датой. */
function DayIcon({ greeting }: { greeting: string }) {
  const Icon = /утро/i.test(greeting) ? Sunrise : /день/i.test(greeting) ? Sun : /вечер/i.test(greeting) ? Sunset : Moon;
  return (
    <View style={styles.dayIcon}>
      <Icon size={17} color={T.accent} strokeWidth={2.2} />
    </View>
  );
}

/** Плавное появление блоков сверху вниз — один раз при открытии. */
function useEntrance(count: number) {
  const values = useRef(Array.from({ length: count }, () => new Animated.Value(0))).current;
  const start = useCallback(() => {
    Animated.stagger(
      70,
      values.map((v) => Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true })),
    ).start();
  }, [values]);
  const style = (i: number) => ({
    opacity: values[i],
    transform: [{ translateY: values[i].interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  });
  return { start, style };
}

/**
 * Приветственная страница — встречает при входе в приложение, а после перехода
 * в любой раздел исчезает (отдельной вкладки у неё нет). Элементы — как
 * предложил заказчик: приветствие и напутствие (каждый раз новое), продажи за
 * месяц (те же 4 квадратика, что в статистике), KPI, на которые стоит обратить
 * внимание, и задачи на сегодня. У директора продажи и KPI — по всей компании.
 */
export default function WelcomeScreen({ navigation }: any) {
  const [data, setData] = useState<HomeData | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const loading = useRef(false);
  const entrance = useEntrance(4);

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
      setFailed(errorText(e, 'Не удалось загрузить приветствие'));
    } finally {
      loading.current = false;
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const ready = !!data;
  const startEntrance = entrance.start;
  useEffect(() => {
    if (ready) startEntrance();
  }, [ready, startEntrance]);

  const openTask = (taskId: number) => navigation.navigate('TasksTab', { screen: 'TaskDetail', params: { taskId } });
  const openStats = () => navigation.navigate('KpiTab', { screen: 'KpiHome' });
  const openTasks = () => navigation.navigate('TasksTab', { screen: 'TasksHome' });

  if (!data) {
    return (
      <SafeAreaView style={[styles.container, styles.center]}>
        {failed ? (
          <TouchableOpacity onPress={load} style={styles.empty} activeOpacity={0.8}>
            <AlertCircle size={22} color={T.danger} />
            <Text style={styles.emptyText}>{failed}. Нажмите, чтобы повторить.</Text>
          </TouchableOpacity>
        ) : (
          <ActivityIndicator color={T.accent} size="large" />
        )}
      </SafeAreaView>
    );
  }

  const company = data.scope === 'company';
  const overdue = data.tasks.filter((t) => t.is_overdue).length;
  const dueToday = data.tasks.filter((t) => t.due_today).length;
  const totals = data.kpi.totals;
  const kpiPct = totals && totals.max > 0 ? Math.min(100, Math.round((totals.now / totals.max) * 100)) : null;
  const people = data.stats?.people ?? data.kpi.people ?? 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle={T.statusBar} backgroundColor="transparent" translucent />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={T.accent} />}
      >
        {/* ===== Приветствие ===== */}
        <Animated.View style={[styles.hero, entrance.style(0)]}>
          <View style={styles.heroTop}>
            <DayIcon greeting={data.greeting} />
            <Text style={styles.date}>{today()}</Text>
            <HeaderBell style={styles.heroBell} />
          </View>
          <Text style={styles.greeting}>
            {data.greeting},{'\n'}
            <Text style={styles.greetingName}>{data.first_name || firstNameOf(data.name)}!</Text>
          </Text>
          <View style={styles.phrase}>
            <Quote size={16} color={T.accent} fill={T.accent} />
            <Text style={styles.phraseText}>{data.phrase.text}</Text>
          </View>
          <View style={styles.chips}>
            <TouchableOpacity style={styles.chip} onPress={openTasks} activeOpacity={0.75}>
              <ListTodo size={14} color={T.accent} />
              <Text style={styles.chipText}>
                {dueToday ? `${dueToday} ${plural(dueToday, ['задача', 'задачи', 'задач'])} на сегодня` : 'На сегодня свободно'}
              </Text>
            </TouchableOpacity>
            {overdue > 0 && (
              <TouchableOpacity style={[styles.chip, styles.chipDanger]} onPress={openTasks} activeOpacity={0.75}>
                <AlertCircle size={14} color={T.danger} />
                <Text style={[styles.chipText, { color: T.danger }]}>
                  {overdue} {plural(overdue, ['просрочена', 'просрочены', 'просрочено'])}
                </Text>
              </TouchableOpacity>
            )}
            {kpiPct != null && (
              <TouchableOpacity style={styles.chip} onPress={openStats} activeOpacity={0.75}>
                <Trophy size={14} color={T.warning} />
                <Text style={styles.chipText}>KPI {kpiPct}%</Text>
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* ===== Продажи ===== */}
        <Animated.View style={entrance.style(1)}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{company ? 'Продажи компании' : 'Продажи за месяц'}</Text>
              {company && people > 0 ? (
                <View style={styles.sectionSubRow}>
                  <UsersRound size={13} color={T.textSecondary} />
                  <Text style={styles.sectionSub}>
                    сумма по {people} {plural(people, ['сотруднику', 'сотрудникам', 'сотрудникам'])}
                  </Text>
                </View>
              ) : null}
            </View>
            <TouchableOpacity onPress={openStats} hitSlop={8} style={styles.linkBtn}>
              <Text style={styles.link}>Статистика</Text>
              <ChevronRight size={15} color={T.accent} />
            </TouchableOpacity>
          </View>
          <SalesTiles stats={data.stats} />
          <Text style={styles.note}>{statsCaption(data.stats, data.month)}</Text>
        </Animated.View>

        {/* ===== KPI ===== */}
        <Animated.View style={entrance.style(2)}>
          <View style={styles.head}>
            <Text style={[styles.sectionTitle, { flex: 1 }]}>Обратите внимание</Text>
          </View>
          {totals && (
            <TouchableOpacity style={styles.earnedCard} onPress={openStats} activeOpacity={0.8}>
              <View style={[styles.rowIcon, { backgroundColor: T.successSoft }]}>
                <Trophy size={18} color={T.success} />
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.earnedLabel}>{company ? 'KPI компании: начислено' : 'Заработано по KPI'}</Text>
                <Text style={styles.earnedValue}>
                  {money(totals.now)} <Text style={styles.earnedOf}>из {money(totals.max)}</Text>
                </Text>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${Math.max(2, kpiPct ?? 0)}%`, backgroundColor: T.success }]} />
                </View>
              </View>
            </TouchableOpacity>
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
                    {company && t.user_name ? <Text style={styles.rowWho} numberOfLines={1}>{t.user_name}</Text> : null}
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
                {data.kpi.count
                  ? company
                    ? 'Все показатели KPI в компании выполнены — отличная работа команды!'
                    : 'Все показатели KPI выполнены — так держать!'
                  : company
                    ? 'KPI на этот месяц ещё не загружены.'
                    : 'KPI за этот месяц пока нет — его загружает руководитель.'}
              </Text>
            </View>
          )}
        </Animated.View>

        {/* ===== Задачи ===== */}
        <Animated.View style={entrance.style(3)}>
          <View style={styles.head}>
            <Text style={[styles.sectionTitle, { flex: 1 }]}>Задачи на сегодня</Text>
            <TouchableOpacity onPress={openTasks} hitSlop={8} style={styles.linkBtn}>
              <Text style={styles.link}>Все задачи</Text>
              <ChevronRight size={15} color={T.accent} />
            </TouchableOpacity>
          </View>
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
                    {t.kind === 'request' ? (
                      <HandHeart size={15} color={T.violet} />
                    ) : (
                      <View style={[styles.dot, { backgroundColor: importanceColor(t.importance) }]} />
                    )}
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
        </Animated.View>
        <View style={{ height: 28 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const font = Platform.OS === 'ios' ? 'Montserrat' : 'sans-serif-medium';
const card = () => ({
  backgroundColor: T.card,
  borderRadius: 22,
  shadowColor: T.shadow,
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.05,
  shadowRadius: 24,
  elevation: 3,
});

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  center: { justifyContent: 'center', alignItems: 'center', padding: 24 },
  scroll: { paddingHorizontal: 18, paddingTop: 10 },
  hero: { backgroundColor: T.accentMuted, borderRadius: 28, padding: 18, paddingTop: 14, gap: 12, marginBottom: 24 },
  heroTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginRight: -6 },
  dayIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: T.card, alignItems: 'center', justifyContent: 'center' },
  heroBell: { backgroundColor: T.card },
  date: { flex: 1, fontSize: 13.5, fontWeight: '600', color: T.textSecondary },
  greeting: { fontSize: 22, lineHeight: 29, fontWeight: '700', color: T.textSecondary, fontFamily: font },
  greetingName: { fontSize: 30, lineHeight: 37, fontWeight: '800', color: T.textPrimary },
  phrase: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: T.card, borderRadius: 16, padding: 12 },
  phraseText: { flex: 1, fontSize: 14.5, lineHeight: 21, color: T.textPrimary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 14, backgroundColor: T.card },
  chipDanger: { backgroundColor: T.dangerSoft },
  chipText: { fontSize: 12.5, fontWeight: '700', color: T.textPrimary },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 2, gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: T.textPrimary, fontFamily: font },
  sectionSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  sectionSub: { fontSize: 12.5, color: T.textSecondary, fontWeight: '600' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  link: { fontSize: 13.5, fontWeight: '700', color: T.accent },
  note: { fontSize: 11.5, color: T.textMuted, lineHeight: 16, marginBottom: 22 },
  earnedCard: { ...card(), flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10 },
  earnedLabel: { fontSize: 12.5, fontWeight: '600', color: T.textSecondary },
  earnedValue: { fontSize: 18, fontWeight: '800', color: T.textPrimary, fontFamily: font },
  earnedOf: { fontSize: 13.5, fontWeight: '600', color: T.textSecondary },
  list: { ...card(), marginBottom: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  rowBorder: { borderTopWidth: 1, borderTopColor: T.border },
  rowIcon: { width: 36, height: 36, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  rowTitle: { fontSize: 14.5, fontWeight: '700', color: T.textPrimary },
  rowWho: { fontSize: 12, fontWeight: '600', color: T.textSecondary, marginTop: -3 },
  rowSub: { fontSize: 12, color: T.textSecondary, marginTop: 2 },
  late: { color: T.danger, fontWeight: '700' },
  bar: { height: 6, backgroundColor: T.inputBg, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: T.warning, borderRadius: 3 },
  hint: { flexDirection: 'row', gap: 5, alignItems: 'flex-start' },
  hintText: { flex: 1, fontSize: 12, color: T.textSecondary, lineHeight: 16 },
  pct: { minWidth: 44, textAlign: 'right', fontSize: 15, fontWeight: '800', color: T.textPrimary },
  dot: { width: 8, height: 8, borderRadius: 4 },
  empty: { ...card(), flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, marginBottom: 22, shadowOpacity: 0.03 },
  emptyText: { flex: 1, fontSize: 14, lineHeight: 20, color: T.textSecondary },
}));
