import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ArrowRight, Sparkles } from 'lucide-react-native';
import { api } from '../../services/api';

import { T, themed } from '../../theme/runtime';
const fmtMoney = (n: number) =>
  new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
const fmtNum = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n));

// Генератор цитат: выбирает шаблон по % выполнения плана
// и подставляет реальные цифры сотрудника. Цитата меняется раз в день.
function buildQuote(progress: number, revenue: number, deals: number): string {
  const day = Math.floor(Date.now() / 86400000);
  let list: string[];

  if (progress >= 100) {
    list = [
      `План выполнен на ${Math.round(progress)}% — это мощно! ${fmtMoney(revenue)} выручки говорят сами за себя.`,
      `${fmtNum(deals)} сделок и ${fmtMoney(revenue)} — ты пробил план. Не останавливайся!`,
      `Больше ста процентов — уровень мастера. Твои ${fmtMoney(revenue)} — подтверждение.`,
    ];
  } else if (progress >= 70) {
    list = [
      `Уже ${Math.round(progress)}% плана. Осталось совсем немного — финишный рывок!`,
      `${fmtMoney(revenue)} уже в копилке. Цель близко — один хороший день и ты у цели!`,
      `${fmtNum(deals)} сделок позади. Ещё пара уверенных шагов — и сотка!`,
    ];
  } else if (progress >= 30) {
    list = [
      `${Math.round(progress)}% плана — середина пути. Темп хороший, продолжай!`,
      `${fmtMoney(revenue)} выручки — крепкая база. Каждая сделка приближает цель!`,
      `${fmtNum(deals)} сделок — отличный задел. Дальше — только вперёд!`,
    ];
  } else {
    list = [
      `${fmtNum(deals)} сделок уже есть. Начало положено — главный рывок впереди!`,
      `${fmtMoney(revenue)} выручки — это фундамент. Умножь его новой сделкой сегодня!`,
      `Большие цели состоят из маленьких шагов. Твой шаг сегодня — плюс одна сделка!`,
    ];
  }
  return list[day % list.length];
}

export default function DailyMotivationScreen({ navigation }: any) {
  const [name, setName] = useState('');
  const [revenue, setRevenue] = useState(0);
  const [deals, setDeals] = useState(0);
  const [avg, setAvg] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    (async () => {
      try {
        const [user, summary, kpi] = await Promise.all([
          api.getCurrentUser().catch(() => null),
          api.getSalesSummary('month').catch(() => null),
          api.getMyKpi().catch(() => null),
        ]);
        if (user) setName(user.display_name || user.username || '');
        if (summary && summary.fact) {
          const r = Number(summary.fact.total_amount) || 0;
          const t = Number(summary.fact.total_transactions) || 0;
          setRevenue(r);
          setDeals(t);
          setAvg(t > 0 ? r / t : 0);
        }
        if (kpi) setProgress(Math.min(150, Number(kpi.progress_percent || kpi.progress) || 0));
      } catch (e) {}
    })();
  }, []);

  const monthName = new Date().toLocaleDateString('ru-RU', { month: 'long' });
  const quote = buildQuote(progress, revenue, deals);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle={T.statusBar} backgroundColor="transparent" translucent />
      <View style={styles.content}>
        <Text style={styles.dateLine}>
          {new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
        </Text>
        <Text style={styles.title}>{name ? name.split(' ')[0] + ', вперёд!' : 'Вперёд!'}</Text>
        <Text style={styles.subtitle}>Твои показатели за {monthName}</Text>

        <View style={styles.hero}>
          <Text style={styles.heroValue}>{Math.round(progress)}%</Text>
          <Text style={styles.heroLabel}>выполнение плана</Text>
          <View style={styles.barBg}>
            <View style={[styles.barFill, { width: `${Math.min(100, progress)}%` }]} />
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmtMoney(revenue)}</Text>
            <Text style={styles.statLabel}>выручка</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmtNum(deals)}</Text>
            <Text style={styles.statLabel}>сделки</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{fmtMoney(avg)}</Text>
            <Text style={styles.statLabel}>средний чек</Text>
          </View>
        </View>

        <View style={styles.quoteBox}>
          <View style={styles.quoteHead}>
            <Sparkles size={16} color={T.accent} />
            <Text style={styles.quoteHeadText}>цитата дня · по твоим показателям</Text>
          </View>
          <Text style={styles.quote}>«{quote}»</Text>
        </View>

        <TouchableOpacity style={styles.btn} onPress={() => navigation.goBack()}>
          <Text style={styles.btnText}>Начать день</Text>
          <ArrowRight size={18} color={T.onAccent} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = themed(() => ({
  container: { flex: 1, backgroundColor: T.background },
  content: { flex: 1, paddingHorizontal: 28, justifyContent: 'center' },
  dateLine: { fontSize: 13, color: T.textMuted, marginBottom: 8 },
  title: { fontSize: 34, fontWeight: '800', color: T.textPrimary, marginBottom: 4 },
  subtitle: { fontSize: 14, color: T.textSecondary, marginBottom: 28 },
  hero: { marginBottom: 24 },
  heroValue: { fontSize: 56, fontWeight: '800', color: T.accent },
  heroLabel: { fontSize: 13, color: T.textSecondary, marginBottom: 10 },
  barBg: { height: 6, backgroundColor: T.surfaceActive, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: T.accent, borderRadius: 3 },
  row: { flexDirection: 'row', marginBottom: 28 },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700', color: T.textPrimary },
  statLabel: { fontSize: 11, color: T.textMuted, marginTop: 2 },
  divider: { width: 1, backgroundColor: T.surfaceActive },
  quoteBox: {
    borderLeftWidth: 3, borderLeftColor: T.accent, paddingLeft: 14,
    marginBottom: 32, backgroundColor: T.card, padding: 16, borderRadius: 14,
  },
  quoteHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  quoteHeadText: { fontSize: 11, color: T.textSecondary, marginLeft: 6 },
  quote: { fontSize: 15, color: T.textPrimary, lineHeight: 22, fontStyle: 'italic' },
  btn: {
    flexDirection: 'row', backgroundColor: T.accent, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: T.onAccent, fontSize: 16, fontWeight: '700', marginRight: 8 }
}));
